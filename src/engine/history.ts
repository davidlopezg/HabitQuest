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
import { addDays, diffDays } from './time.ts';

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
 * Adherencia en una ventana de N días naturales terminando en `end`.
 * Los días anteriores a la introducción del comportamiento no cuentan.
 */
export function adherence(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  end: string,
  days: number,
): AdherenceSlice {
  const from = addDays(end, -(days - 1));
  const start = behavior.introducedAt > from ? behavior.introducedAt : from;
  const entries = logsBetween(logs, behavior.id, start, end);
  const eligible = Math.max(0, diffDays(start, end) + 1);

  let full = 0, minimal = 0, excused = 0, missed = 0;
  for (const e of entries) {
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
 * Racha actual hasta `end` (inclusive).
 * - full/minimal: continúa.
 * - excused: no rompe (neutral), con un tope de 3 seguidos para no abusar.
 * - miss o día sin registro (siendo elegible): rompe.
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
    const e = logOn(logs, behavior.id, key);
    if (e && (e.kind === 'full' || e.kind === 'minimal')) {
      streak++;
      neutral = 0;
    } else if (e && e.kind === 'excused') {
      if (neutral >= 3) break;
      neutral++;
    } else {
      break; // miss o sin registro
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
