/**
 * Agenda de un hábito: en qué días aplica.
 *
 * - Diario (sin schedule): todos los días.
 * - 'days': solo los días marcados (ej. L–V).
 * - 'weekly': N veces por semana; el coach reparte a lo largo de la semana y el
 *   hábito "desaparece" del plan cuando ya se alcanzó la cuota esa semana.
 *
 * Las métricas (adherencia/racha) solo cuentan los días en los que el hábito
 * estaba programado: no penaliza el sábado de un hábito de L–V.
 */

import type { Behavior, BehaviorLogEntry } from './types.ts';
import { addDays, weekdayOf } from './time.ts';

/** Códigos cortos de día (0=domingo … 6=sábado) en español. */
export const DAY_CODE = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function isDaily(b: Behavior): boolean {
  return !b.schedule || !b.schedule.type;
}

/** Lunes de la semana de la fecha dada. */
function weekStartKey(key: string): string {
  const wd = weekdayOf(key);
  const back = wd === 0 ? 6 : wd - 1; // hasta el lunes
  return addDays(key, -back);
}

/** Veces completadas esta semana (desde el lunes) hasta `date`. */
export function doneThisWeek(
  logs: BehaviorLogEntry[],
  behaviorId: string,
  date: string,
): number {
  const start = weekStartKey(date);
  let n = 0;
  for (const l of logs) {
    if (l.behaviorId === behaviorId && l.date >= start && l.date <= date) {
      if (l.kind === 'full' || l.kind === 'minimal') n++;
    }
  }
  return n;
}

/** ¿Este hábito está programado para `date`? (tiene en cuenta la cuota semanal). */
export function scheduledOn(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  date: string,
): boolean {
  if (date < behavior.introducedAt) return false;
  const s = behavior.schedule;
  if (isDaily(behavior)) return true;
  if (s?.type === 'days') {
    return (s.days ?? []).includes(weekdayOf(date));
  }
  if (s?.type === 'weekly') {
    const quota = s.timesPerWeek ?? 3;
    return doneThisWeek(logs, behavior.id, date) < quota;
  }
  return true;
}

/** Etiqueta corta de la agenda para la UI (null = cada día). */
export function scheduleLabel(b: Behavior): string | null {
  const s = b.schedule;
  if (!s || !s.type) return null;
  if (s.type === 'days') {
    const codes = (s.days ?? []).slice().sort((a, x) => a - x).map((d) => DAY_CODE[d] ?? '');
    if (codes.length === 5 && s.days?.length === 5) {
      // ¿L–V? (1,2,3,4,5) o similar → mostrar simplemente los códigos
    }
    return codes.join(' ');
  }
  return `${s.timesPerWeek ?? 3}×/semana`;
}
