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
