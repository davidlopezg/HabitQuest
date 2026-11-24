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

import type { Behavior, BehaviorLogEntry, BehaviorSchedule, CoachState } from './types.ts';
import { addDays, diffDays, weekdayOf } from './time.ts';

/** Códigos cortos de día (0=domingo … 6=sábado) en español. */
export const DAY_CODE = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function isDaily(b: Behavior): boolean {
  return !b.schedule || !b.schedule.type;
}

/** Lunes de la semana de la fecha dada. */
export function weekStartKey(key: string): string {
  const wd = weekdayOf(key);
  const back = wd === 0 ? 6 : wd - 1; // hasta el lunes
  return addDays(key, -back);
}

/**
 * Reparte un hábito "x veces por semana" en N días de la semana, espaciados
 * de forma uniforme ystarting por `anchor` (0=domingo). Determinista: el
 * mismo hábito siempre cae en los mismos días.
 *
 * 3×/semana con anchor=lunes → lunes, miércoles, sábado.
 */
export function weeklyDays(timesPerWeek: number, anchor = 0): number[] {
  const n = Math.max(0, Math.min(7, Math.round(timesPerWeek)));
  if (n === 0) return [];
  if (n >= 7) return [0, 1, 2, 3, 4, 5, 6];
  const step = 7 / n;
  const days: number[] = [];
  for (let i = 0; i < n; i++) {
    // floor (no round) para no empujar el último día al sábado: así siempre
    // queda al menos un día de recuperación al final de la semana.
    const d = Math.floor(anchor + i * step) % 7;
    if (!days.includes(d)) days.push(d);
  }
  return days.sort((a, b) => a - b);
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
    const quota = weeklyQuota(logs, behavior, date);
    const done = doneThisWeek(logs, behavior.id, date);
    // Si ya cumplió la cuota semanal, el hábito desaparece del plan.
    if (done >= quota) return false;
    // Días de reparto: solo aparece en los que el coach le asignó.
    if (weeklySpread(behavior).includes(weekdayOf(date))) return true;
    // Días de recuperación (al final de la semana): aparecen SOLO el último
    // día en el que todavía es matemáticamente posible cumplir la cuota
    // (días restantes =Tcitas pendientes). Así no se pierde, pero tampoco
    // martillea: te avisa el último día útil, no todos.
    const remaining = quota - done;
    const daysLeft = daysLeftInWeek(date);
    return weeklyRecoveryDays(behavior).includes(weekdayOf(date)) && daysLeft === remaining;
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

/** Etiqueta legible de la frecuencia ("Cada día", "L · X · V", "3×/semana"). */
export function frequencyLabel(b: Behavior): string {
  const s = b.schedule;
  if (!s || !s.type) return 'Cada día';
  if (s.type === 'days') {
    const codes = (s.days ?? []).slice().sort((a, x) => a - x).map((d) => DAY_CODE[d] ?? '');
    return codes.length > 0 ? codes.join(' · ') : 'Cada día';
  }
  return `${s.timesPerWeek ?? 3}×/semana`;
}

/**
 * Cambia la frecuencia de un hábito.
 * - 'daily' → todos los días (schedule = undefined).
 * - 'days' → días concretos de la semana (0=domingo … 6=sábado).
 * - 'weekly' → N veces por semana, sin fijar qué días (lo reparte el coach).
 */
export function updateFrequency(
  state: CoachState,
  behaviorId: string,
  mode: 'daily' | 'days' | 'weekly',
  opts: { days?: number[]; timesPerWeek?: number } = {},
): CoachState {
  let schedule: BehaviorSchedule | undefined;
  if (mode === 'days') {
    const days = (opts.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    schedule = days.length > 0 ? { type: 'days', days } : undefined;
  } else if (mode === 'weekly') {
    const n = Math.max(1, Math.min(7, Math.round(opts.timesPerWeek ?? 3)));
    schedule = { type: 'weekly', timesPerWeek: n };
  }
  return {
    ...state,
    behaviors: state.behaviors.map((b) => (b.id === behaviorId ? { ...b, schedule } : b)),
  };
}

/** Días de la semana en los que se reparte un hábito "x veces por semana". */
export function weeklySpread(b: Behavior): number[] {
  const s = b.schedule;
  if (!s || s.type !== 'weekly') return [];
  return weeklyDays(s.timesPerWeek ?? 3, weekdayOf(b.introducedAt));
}

/**
 * Días de RECUPERACIÓN: los que quedan después del último día de reparto
 * hasta el domingo. Sirven para no perder la cuota si se te pasó un día
 * (solo aparecen si aún es posible cumplirla).
 */
export function weeklyRecoveryDays(b: Behavior): number[] {
  const spread = weeklySpread(b);
  if (spread.length === 0) return [];
  // Orden real de la semana (la semana empieza en lunes): L M X J V S D.
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];
  const lastPos = Math.max(...spread.map((d) => weekOrder.indexOf(d)));
  return weekOrder.slice(lastPos + 1);
}

/** Días que quedan en la semana (incluido hoy). */
export function daysLeftInWeek(date: string): number {
  const sunday = addDays(weekStartKey(date), 6);
  return diffDays(date, sunday) + 1;
}

/** Veces completadas entre dos fechas (ambos inclusive). */
export function doneBetween(
  logs: BehaviorLogEntry[],
  behaviorId: string,
  from: string,
  to: string,
): number {
  let n = 0;
  for (const l of logs) {
    if (l.behaviorId !== behaviorId) continue;
    if (l.date < from || l.date > to) continue;
    if (l.kind === 'full' || l.kind === 'minimal') n++;
  }
  return n;
}

/**
 * Cuota semanal REAL de un hábito, con lo pendiente arrastrado:
 * si la semana pasada no llegaste a la cuota, esta semana se pide una más
 * (tope: los días de recuperación disponibles, para que siempre sea
 * alcanzable). Lo que no se puede arrastrar se perdona — cero culpa.
 */
export function weeklyQuota(
  logs: BehaviorLogEntry[],
  behavior: Behavior,
  date: string,
): number {
  const s = behavior.schedule;
  if (!s || s.type !== 'weekly') return 0;
  const base = s.timesPerWeek ?? 3;
  const carryCap = Math.min(2, weeklyRecoveryDays(behavior).length); // tope de lo arrastrable
  let carry = 0;
  let monday = weekStartKey(date);
  let prevQuota = base;
  for (let i = 0; i < 4 && carry < carryCap; i++) {
    const prevMonday = addDays(monday, -7);
    const prevSunday = addDays(prevMonday, 6);
    // Semanas anteriores a que el hábito existiera: nada que arrastrar.
    if (prevSunday < behavior.introducedAt) break;
    const done = doneBetween(logs, behavior.id, prevMonday, prevSunday);
    const deficit = Math.max(0, prevQuota - done);
    if (deficit === 0) break;
    carry = Math.min(carryCap, carry + deficit);
    prevQuota = base + carry;
    monday = prevMonday;
  }
  return base + carry;
}
