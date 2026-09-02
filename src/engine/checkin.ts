/**
 * Check-in matutino → capacidad percibida → modo del día.
 *
 * Determinista y sin LLM. Reglas claras: un mal día NUNCA se convierte en
 * fracaso; se convierte en modo mantenimiento o recuperación.
 */

import type { DayCheckIn, DayMode } from './types.ts';
import { clamp } from './time.ts';

/** 0..1 Capacidad percibida a partir del check-in de 4 preguntas. */
export function capacityScore(c: DayCheckIn): number {
  const raw =
    c.energy * 0.35 + c.mood * 0.2 + c.focus * 0.25 + (11 - c.stress) * 0.2;
  return clamp(raw / 10, 0.05, 1);
}

export function timeFactor(t: DayCheckIn['timeAvailable']): number {
  switch (t) {
    case 'little': return 0.5;
    case 'plenty': return 1.6;
    default: return 1;
  }
}

/** Modo del día elegido por reglas (el usuario siempre puede forzarlo después). */
export function modeForCheckin(c: DayCheckIn): DayMode {
  if (c.intention === 'recover') return 'recovery';
  const s = capacityScore(c);
  if (s < 0.38 || c.stress >= 9 || c.energy <= 2) return 'recovery';
  if (s < 0.6 || c.timeAvailable === 'little') return 'minimal';
  if (s >= 0.8 && c.intention === 'advance') return 'progress';
  return 'normal';
}

/**
 * Presupuesto aproximado de minutos útiles del día.
 * El objetivo del plan NO es llenar el día: es caber holgadamente.
 */
export function dailyBudgetMinutes(mode: DayMode, c: DayCheckIn): number {
  const base = 90;
  const modeFactor: Record<DayMode, number> = {
    recovery: 0.35,
    minimal: 0.6,
    normal: 1,
    progress: 1.15,
  };
  const f = timeFactor(c.timeAvailable);
  const energyDamp = 0.65 + 0.35 * capacityScore(c);
  return clamp(Math.round(base * f * modeFactor[mode] * energyDamp), 10, 200);
}

export const MODE_HEADLINE: Record<DayMode, string> = {
  recovery: 'Hoy priorizamos la recuperación',
  minimal: 'Modo mantenimiento',
  normal: 'Tu plan de hoy',
  progress: 'Tu plan de hoy — modo progreso',
};

export const MODE_COACH_NOTE: Record<DayMode, string> = {
  recovery:
    'No vamos a intentar progresar hoy. Solo mantenemos lo esencial en su versión mínima para no perder el hábito.',
  minimal:
    'Día de mantenimiento: versiones mínimas de los hábitos. La constancia vale más que la intensidad.',
  normal: 'Plan estándar. Escucha a tu cuerpo: si algo no sale, lo adaptamos.',
  progress:
    'Tienes buena capacidad hoy. Mantenemos el objetivo completo para consolidar.',
};
