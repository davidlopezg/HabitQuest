/**
 * Historial, adherencia y consistencia.
 *
 * - Adherencia: % de días con comportamiento completado (full o mínimo)
 *   en una ventana. Un 'excused' (saltado con motivo a través del coach)
 *   cuenta al 50 %: no se castiga como fallo puro ni se regala.
 * - Consistencia: 7 / 30 / 90 días (más importante que la racha perfecta).
 * - Racha: días consecutivos; un día 'excused' NO rompe la racha (evita el
 *   efecto "he fallado un día, lo he perdido todo").
 */

import type { Behavior, BehaviorLogEntry, DayMode, DayNote, Goal, LogKind, ReasonCode } from './types.ts';
import { addDays } from './time.ts';
import { scheduledOn, weekStartKey, weeklyQuota } from './schedule.ts';

export interface AdherenceSlice {
  eligible: number; // días elegibles (desde la introducción) en la ventana
  done: number; // full + minimal
  full: number;
  minimal: number;
  excused: number;
  missed: number;
  rate: number; // adherencia ponderada 0..1
}

/** Entradas de un comportamiento entre dos fechas (inclusive). */
export function logsBetween(
  logs: BehaviorLogEntry[],
  behaviorId: string,
  from: string,
  to: string,
): BehaviorLogEntry[] {
  return logs.filter(
    (l) => l.behaviorId === behaviorId && l.date >= from && l.date <= to,
  );
}

/** Registro de un día concreto (o undefined). */
export function logOn(
  logs: BehaviorLogEntry[],
  behaviorId: string,
  date: string,
): BehaviorLogEntry | undefined {
  return logs.find((l) => l.behaviorId === behaviorId && l.date === date);
}

/**
 * Adherencia en una ventana de N días terminando en `end`.
 * Solo cuentan los días en los que el hábito estaba programado (agenda):
 * un día sin programar no se castiga ni se premia.
 */
export function adherence(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  end: string,
  days: number,
): AdherenceSlice {
  const from = addDays(end, -(days - 1));
  const start = behavior.introducedAt > from ? behavior.introducedAt : from;

  let eligible = 0, full = 0, minimal = 0, excused = 0, missed = 0;
  // Ascendente para que la cuota semanal se evalúe correctamente.
  for (let key = start; key <= end; key = addDays(key, 1)) {
    if (!scheduledOn(logs, behavior, key)) continue;
    eligible++;
    const e = logOn(logs, behavior.id, key);
    if (!e) { missed++; continue; }
    if (e.kind === 'full') full++;
    else if (e.kind === 'minimal') minimal++;
    else if (e.kind === 'excused') excused++;
    else missed++;
  }
  const done = full + minimal;
  const rate = eligible > 0 ? (done + 0.5 * excused) / eligible : 0;
  return { eligible, done, full, minimal, excused, missed, rate };
}

/** Consistencia 7 / 30 / 90 días. */
export function consistency(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  end: string,
): { d7: number; d30: number; d90: number } {
  return {
    d7: adherence(logs, behavior, end, 7).rate,
    d30: adherence(logs, behavior, end, 30).rate,
    d90: adherence(logs, behavior, end, 90).rate,
  };
}

/**
 * Reglas de la racha (aprendidas de Monkway — "cero culpa"):
 *
 * - GRACE: un día fallado NO rompe la racha si está "aislado" (al día
 *   siguiente sí se hizo) y todavía queda margen de gracia (1 cada 30 días).
 *   El día en curso (hoy) tampoco la rompe: hoy aún cuenta.
 * - MESETA (plateau): a partir de PLATEAU_DAYS la racha se congela: ya no
 *   crece, pero tampoco se pierde. El contador se queda en la meseta.
 *
 * Motivo: castigar un fallo aislado destruye la racha y con ella la
 * motivation. La adherencia (7/30/90 días) sigue siendo la métrica seria.
 */

/** Días de racha a partir de los cuales entra la meseta. */
export const PLATEAU_DAYS = 66;

/** Cada cuántos días de racha se gana un día de gracia. */
export const GRACE_WINDOW_DAYS = 30;

export interface StreakInfo {
  /** Días de racha (con gracias y meseta aplicados). */
  days: number;
  /** True si la racha alcanzó la meseta (ya no crece, pero se mantiene). */
  plateau: boolean;
  /** Días de gracia consumidos dentro de esta racha. */
  graceDays: number;
  /** True si el último día programado falló sin margen de gracia. */
  broken: boolean;
  /** True si el día en curso (end) está pendiente: la racha sigue viva. */
  pendingToday: boolean;
}

/**
 * Racha actual hasta `end` (inclusive) con la regla de gracia y meseta.
 * Respeta la agenda: los días no programados se saltan (no rompen ni suman).
 */
export function streakInfo(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  end: string,
): StreakInfo {
  let days = 0;
  let neutral = 0;
  let graceDays = 0;
  let broken = false;
  let pendingToday = false;
  // ¿El día inmediatamente posterior (en el tiempo) al que estamos mirando
  // se completó? Para que un fallo "aislado" pueda ser perdonado.
  let nextDayDone = false;
  const since = behavior.introducedAt;

  for (let d = 0; ; d++) {
    const key = addDays(end, -d);
    if (key < since) break;
    if (!scheduledOn(logs, behavior, key)) continue;
    const e = logOn(logs, behavior.id, key);
    if (e && (e.kind === 'full' || e.kind === 'minimal')) {
      days++;
      neutral = 0;
      nextDayDone = true;
      if (days >= PLATEAU_DAYS) {
        // Meseta: la racha se congela aquí (no crece, no se rompe).
        return { days: PLATEAU_DAYS, plateau: true, graceDays, broken: false, pendingToday };
      }
      continue;
    }
    if (e && e.kind === 'excused') {
      // Neutral: no suma, no rompe (tope de 3 seguidos para no abusar).
      if (neutral >= 3) break;
      neutral++;
      nextDayDone = false;
      continue;
    }
    // Fallo (miss) o día sin registro en un día programado.
    if (d === 0) {
      if (!e) {
        // El día de HOY sigue abierto: la racha sigue viva ("hoy aún cuenta").
        pendingToday = true;
        nextDayDone = false;
        continue;
      }
      // Miss explícito de HOY: el día está decidido y la racha se rompe.
      broken = true;
      break;
    }
    const graceBudget = 1 + Math.floor(days / GRACE_WINDOW_DAYS);
    if (nextDayDone && graceDays < graceBudget) {
      graceDays++; // hoy falla, pero ayer no: no rompe la racha
      nextDayDone = false;
      continue;
    }
    broken = true;
    break;
  }
  return { days, plateau: false, graceDays, broken, pendingToday };
}

/**
 * Racha actual (días). Es el accessor simple; usa `streakInfo` para el
 * detalle (meseta, gracia, día pendiente).
 */
export function streakDays(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  end: string,
): number {
  return streakInfo(logs, behavior, end).days;
}

/** Distribución de motivos ("no puedo") recientes. */
export function reasonDistribution(
  logs: BehaviorLogEntry[],
  end: string,
  days = 30,
): Partial<Record<ReasonCode, number>> {
  const from = addDays(end, -(days - 1));
  const out: Partial<Record<ReasonCode, number>> = {};
  for (const l of logs) {
    if (l.date < from || l.date > end || !l.reasonCode) continue;
    out[l.reasonCode] = (out[l.reasonCode] ?? 0) + 1;
  }
  return out;
}

/** Número de replanificaciones registradas como logs excused. */
export function excusedCount(logs: BehaviorLogEntry[], behaviorId: string): number {
  return logs.filter((l) => l.behaviorId === behaviorId && l.kind === 'excused').length;
}

/* ── Bitácora: qué se hizo cada día ───────────────────────────────────────── */

/** Un hábito dentro del resumen de un día. */
export interface DayItemSummary {
  behaviorId: string;
  goalId: string; // '' si el hábito ya no existe
  name: string;
  icon: string;
  kind: LogKind;
  minutes: number;
  plannedMinutes: number;
  reasonCode?: ReasonCode;
}

/** Progreso de un objetivo ese día. */
export interface GoalDaySummary {
  goalId: string;
  title: string;
  done: number; // hábitos completados (full + minimal)
  total: number; // hábitos con registro ese día
}

/** Resumen completo de un día. */
export interface DaySummary {
  date: string;
  items: DayItemSummary[];
  goals: GoalDaySummary[];
  done: number; // hábitos completados del día
  total: number; // hábitos registrados del día
}

/**
 * Resumen de un día: qué hábitos se hicieron y cómo va cada objetivo.
 *
 * El objetivo NO tiene log propio: se deriva de sus hábitos (`Behavior.goalId`),
 * así el dato de objetivo no puede desincronizarse del registro real.
 */
export function daySummary(
  logs: BehaviorLogEntry[],
  behaviors: Behavior[],
  goals: Goal[],
  date: string,
): DaySummary {
  const byId = new Map(behaviors.map((b) => [b.id, b]));
  // Un hábito = un estado por día: si hay varios registros del mismo
  // comportamiento (p. ej. replanificar y volver a marcarlo), gana el último.
  const byBehavior = new Map<string, BehaviorLogEntry>();
  for (const l of logs) {
    if (l.date !== date) continue;
    byBehavior.set(l.behaviorId, l);
  }
  const items: DayItemSummary[] = [];
  for (const l of byBehavior.values()) {
    const b = byId.get(l.behaviorId);
    items.push({
      behaviorId: l.behaviorId,
      goalId: b?.goalId ?? '',
      name: b?.name ?? 'Hábito eliminado',
      icon: b?.icon ?? '•',
      kind: l.kind,
      minutes: l.minutes,
      plannedMinutes: l.plannedMinutes,
      reasonCode: l.reasonCode,
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const goalsSummary: GoalDaySummary[] = [];
  for (const g of goals) {
    const gItems = items.filter((i) => i.goalId === g.id);
    if (gItems.length === 0) continue;
    goalsSummary.push({
      goalId: g.id,
      title: g.title,
      done: gItems.filter((i) => i.kind === 'full' || i.kind === 'minimal').length,
      total: gItems.length,
    });
  }

  return {
    date,
    items,
    goals: goalsSummary,
    done: items.filter((i) => i.kind === 'full' || i.kind === 'minimal').length,
    total: items.length,
  };
}

/* ── Comentarios del día ──────────────────────────────────────────────────── */

/** Tope de caracteres del comentario de un día. */
export const NOTE_MAX_LENGTH = 500;

/** Comentario de un día (undefined si no hay). */
export function noteOn(notes: DayNote[], date: string): DayNote | undefined {
  return notes.find((n) => n.date === date);
}

/**
 * Guarda el comentario de un día, sobrescribiendo el anterior si existía.
 * Texto vacío = se borra la nota.
 */
export function upsertNote(
  notes: DayNote[],
  date: string,
  text: string,
  updatedAt: string = new Date().toISOString(),
): DayNote[] {
  const clean = text.trim().slice(0, NOTE_MAX_LENGTH);
  const rest = notes.filter((n) => n.date !== date);
  if (!clean) return rest;
  return [...rest, { date, text: clean, updatedAt }];
}

/**
 * Racha en SEMANAS de un hábito "x veces por semana": cuántas semanas
 * seguidas ha cumplido la cuota. Para un hábito diario no tiene sentido
 * (ahí manda la racha de días), así que devuelve 0.
 */
export function weeklyStreakWeeks(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  end: string,
): number {
  const s = behavior.schedule;
  if (!s || s.type !== 'weekly') return 0;
  let weeks = 0;
  let monday = weekStartKey(end);
  for (let i = 0; i < 120; i++) {
    const sunday = addDays(monday, 6);
    const upto = sunday > end ? end : sunday;
    // La cuota de cada semana es la real (incluye lo arrastrado).
    const quota = weeklyQuota(logs, behavior, upto);
    let done = 0;
    for (const l of logs) {
      if (l.behaviorId !== behavior.id) continue;
      if (l.date < monday || l.date > upto) continue;
      if (l.kind === 'full' || l.kind === 'minimal') done++;
    }
    if (done >= quota) {
      weeks++;
      monday = addDays(monday, -7);
    } else {
      break;
    }
  }
  return weeks;
}
