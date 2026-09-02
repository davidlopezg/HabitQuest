/**
 * Gamificación adaptativa.
 *
 * No se premia solo la intensidad: la consistencia y las "victorias difíciles"
 * (completar la versión mínima en un día adverso) valen especialmente.
 */

import type {
  Behavior,
  BehaviorLogEntry,
  CoachCounters,
  CoachEvent,
  DayMode,
} from './types.ts';
import { streakDays } from './history.ts';

/** Sugerencia de XP bruto (para integrar con el sistema RPG actual). */
export function xpFor(kind: BehaviorLogEntry['kind'], minutes: number, mode: DayMode): number {
  if (kind === 'full') return Math.max(10, Math.round(minutes / 2) + 10);
  if (kind === 'minimal') return 10; // valorar el mantener por encima del tamaño
  return 0;
}

export function gemsFor(mode: DayMode): number {
  return mode === 'recovery' || mode === 'minimal' ? 8 : 5;
}

export interface CompletionResult {
  counters: CoachCounters;
  events: CoachEvent[];
}

/** Shape mínimo necesario para evaluar gamificación (evita acoplar a CoachState). */
interface EvalCtx {
  counters: CoachCounters;
  logs: BehaviorLogEntry[];
}

/**
 * Evalúa una acción completada y devuelve eventos de gamificación + contadores.
 * No muta `state`.
 */
export function evaluateCompletion(
  ctx: EvalCtx,
  behavior: Behavior,
  date: string,
  minutes: number,
  plannedMinutes: number,
  dayMode: DayMode,
): CompletionResult {
  const events: CoachEvent[] = [];
  const counters: CoachCounters = { ...ctx.counters, consolidated: [...ctx.counters.consolidated] };
  const done = minutes > 0;
  const isFull = done && minutes >= plannedMinutes * 0.75;
  const adverse = dayMode === 'recovery' || dayMode === 'minimal';
  const resilience = adverse && done && !isFull;

  if (done) counters.totalDone++;
  if (done && !isFull) counters.totalMinimal++;
  if (resilience) {
    counters.resilienceWins++;
    events.push({
      type: 'resilience',
      xp: 20,
      gems: 10,
      icon: '⭐',
      title: 'Victoria de resiliencia',
      message: `Completaste ${behavior.name.toLowerCase()} en modo ${dayMode === 'recovery' ? 'recuperación' : 'mantenimiento'}. Esto vale más que un día perfecto.`,
    });
  } else if (done) {
    events.push({
      type: 'done',
      xp: xpFor(isFull ? 'full' : 'minimal', minutes, dayMode),
      gems: gemsFor(dayMode),
      icon: '✅',
      title: behavior.name,
      message: `${behavior.name} completado.`,
    });
  }

  // Racha de 7 días (consistencia semanal).
  const streak = streakDays([...ctx.logs, { date, behaviorId: behavior.id } as BehaviorLogEntry], behavior, date);
  if (streak > 0 && streak % 7 === 0) {
    events.push({
      type: 'consistency_week',
      xp: 30,
      gems: 0,
      icon: '🔥',
      title: `${streak} días seguidos`,
      message: `Llevas ${streak} días con ${behavior.name.toLowerCase()}. La constancia está haciendo su trabajo.`,
    });
  }

  return { counters, events };
}

/** ¿Este hábito acaba de consolidarse (≥nivel 5 → objetivo ≥10–15 min)? */
export function consolidationEvent(
  counters: CoachCounters,
  behavior: Behavior,
): CoachEvent | null {
  if (behavior.currentLevel >= 5 && !counters.consolidated.includes(behavior.id)) {
    counters.consolidated.push(behavior.id);
    return {
      type: 'consolidated',
      xp: 100,
      gems: 25,
      icon: '🌱',
      title: 'Hábito consolidado',
      message: `${behavior.name} ya aguanta solo (nivel ${behavior.currentLevel}). Puedes afrontar retos mayores o introducir el siguiente hábito.`,
    };
  }
  return null;
}
