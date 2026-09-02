/**
 * Progresión adaptativa (Habit Installation).
 *
 * Decide, por comportamiento: AVANZAR de nivel, MANTENER o REDUCIR.
 * - Avanzar: N éxitos completos en los últimos M intentos a objetivo completo.
 * - Mantener: se está consolidando (no castigar días mínimos).
 * - Reducir: la tasa de éxito cae por debajo de lo sostenible → bajar al nivel
 *   más alto que SÍ se sostiene. Nunca es "has perdido tu racha".
 *
 * Regla determinista, sin LLM. Solo se evalúan días que intentaban el objetivo
 * completo (los días de mantenimiento por diseño no penalizan).
 */

import type {
  Behavior,
  BehaviorLogEntry,
  LevelRecommendation,
  ProgressionAction,
} from './types.ts';
import { levelDef, maxLevel, resolveLevels } from './levels.ts';
import { addDays } from './time.ts';

export const FULL_RATIO = 0.75; // éxito = ≥75 % del objetivo
/** Por debajo de esta tasa de días completos se plantea reducir (decisión). */
export const REDUCE_RATE = 0.5;
/**
 * Tasa mínima del candidato al que bajamos. No pedimos perfección: buscamos el
 * nivel más alto que el usuario pueda sostener ~la mitad de los días mientras
 * se recupera (ejemplo del prompt: reducir de 20 a 10 min).
 */
export const CANDIDATE_RATE = 0.5;
const MAX_EVAL_ATTEMPTS = 14;

const success = (mins: number, target: number) => mins >= FULL_RATIO * target;

/** Días que realmente intentaban el objetivo completo del nivel. */
function attemptsAtFull(
  logs: BehaviorLogEntry[],
  behaviorId: string,
  end: string,
  fromDays: number,
): BehaviorLogEntry[] {
  const from = addDays(end, -(fromDays - 1));
  return logs
    .filter((l) => l.behaviorId === behaviorId && l.date >= from && l.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface ProgressionOpts {
  /** Evita reducir por debajo de este nivel (para test). */
  floorLevel?: number;
}

export function recommendLevel(
  behavior: Behavior,
  logs: BehaviorLogEntry[],
  end: string,
  opts: ProgressionOpts = {},
): LevelRecommendation {
  const def = levelDef(behavior)!;
  const fromLevel = behavior.currentLevel;
  const fromMinutes = def.minutes;
  const targetMinutes = def.minutes;
  const need = def.need;
  const window = def.window;
  const base: LevelRecommendation = {
    behaviorId: behavior.id,
    action: 'maintain',
    fromLevel,
    toLevel: fromLevel,
    fromMinutes,
    toMinutes: fromMinutes,
    reason: 'consolidando',
    message: `Mantén ${behavior.name} en ${fromMinutes} min. La constancia ahora vale más que la intensidad.`,
  };

  // Intentos a objetivo completo en los últimos `window` días.
  const attempts = attemptsAtFull(logs, behavior.id, end, Math.max(window, MAX_EVAL_ATTEMPTS))
    .filter((l) => l.plannedMinutes >= FULL_RATIO * targetMinutes);
  if (attempts.length < Math.min(5, window)) {
    return {
      ...base,
      action: 'not_enough_data',
      reason: 'datos insuficientes',
      message: `Llevamos pocos días con ${behavior.name}. Sigamos con ${fromMinutes} min y lo revisamos pronto.`,
    };
  }

  // Ventana de decisión: intentos recientes (hasta 14) ordenados por fecha.
  const lastN = attempts.slice(-Math.min(attempts.length, MAX_EVAL_ATTEMPTS));
  const n = lastN.length;
  const successAt = (mins: number) => lastN.filter((l) => success(l.minutes, mins)).length;

  // 1) ¿Consolidado? → subir.
  if (n >= window) {
    const lastWindow = lastN.slice(-window);
    const wins = lastWindow.filter((l) => success(l.minutes, targetMinutes)).length;
    if (wins >= need && fromLevel < maxLevel(behavior)) {
      const next = levelDef(behavior, fromLevel + 1)!;
      return {
        behaviorId: behavior.id,
        action: 'advance',
        fromLevel,
        toLevel: fromLevel + 1,
        fromMinutes,
        toMinutes: next.minutes,
        reason: `${wins} éxitos en ${window} intentos`,
        message: `El hábito se está instalando (${wins} de ${window}). Subimos ${behavior.name} a ${next.minutes} min.`,
      };
    }
  }

  // 2) ¿Se está sosteniendo? → mantener.
  const rateNow = successAt(targetMinutes) / n;
  if (rateNow >= REDUCE_RATE) return base;

  // 3) Tasa baja → reducir al nivel más alto que SÍ se sostenga.
  const levels = resolveLevels(behavior);
  const floor = opts.floorLevel ?? 1;
  const candidates = levels
    .filter((lv) => lv.level >= floor && lv.level < fromLevel)
    .sort((a, b) => b.level - a.level);
  let candidate: { level: number; minutes: number } | null = null;
  for (const lv of candidates) {
    if (successAt(lv.minutes) / n >= CANDIDATE_RATE) {
      candidate = { level: lv.level, minutes: lv.minutes };
      break;
    }
  }
  if (candidate) {
    return {
      behaviorId: behavior.id,
      action: 'reduce',
      fromLevel,
      toLevel: candidate.level,
      fromMinutes,
      toMinutes: candidate.minutes,
      reason: `solo ${Math.round(rateNow * 100)} % de días completos recientes`,
      message: `${fromMinutes} min parece demasiado exigente ahora mismo. Vamos a consolidar ${behavior.name} en ${candidate.minutes} min antes de volver a aumentar.`,
    };
  }

  return base;
}
