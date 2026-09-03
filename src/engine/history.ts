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

import type { Behavior, BehaviorLogEntry, DayMode, ReasonCode } from './types.ts';
import { addDays } from './time.ts';
import { scheduledOn } from './schedule.ts';

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
 * Racha actual hasta `end` (inclusive). Respeta la agenda: los días no
 * programados se saltan (no rompen ni suman).
 * - full/minimal: continúa.
 * - excused: no rompe (neutral), con un tope de 3 seguidos para no abusar.
 * - miss o día sin registro (siendo programado): rompe.
 */
export function streakDays(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  end: string,
): number {
  let streak = 0;
  let neutral = 0;
  const since = behavior.introducedAt;
  for (let d = 0; ; d++) {
    const key = addDays(end, -d);
    if (key < since) break;
    if (!scheduledOn(logs, behavior, key)) continue;
    const e = logOn(logs, behavior.id, key);
    if (e && (e.kind === 'full' || e.kind === 'minimal')) {
      streak++;
      neutral = 0;
    } else if (e && e.kind === 'excused') {
      if (neutral >= 3) break;
      neutral++;
    } else {
      break; // miss o sin registro en un día programado
    }
  }
  return streak;
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
