/**
 * Micro-pasos del hábito (startRitual).
 *
 * Cada nivel del hábito tiene asociado un micro-paso concreto del ritual:
 * - nivel 1 → ritual[0]
 * - nivel 2 → ritual[1]
 * - nivel 3 → ritual[2]
 * - nivel 4 → ritual[0] (cicla)
 * - nivel 5 → ritual[1]
 * ...
 *
 * Si el hábito no tiene `startRitual`, se devuelve `null` y el hábito se
 * muestra/trabaja como bloque único (volumen o binario).
 */

import type { Behavior } from './types.ts';

/** Micro-paso activo para el nivel actual del hábito (null si no hay ritual). */
export function ritualStepFor(b: Behavior, level?: number): string | null {
  const ritual = b.startRitual;
  if (!ritual || ritual.length === 0) return null;
  const lv = level ?? b.currentLevel;
  const i = ((lv - 1) % ritual.length + ritual.length) % ritual.length;
  return ritual[i] ?? null;
}

/** Lista completa del ritual (para mostrar en el detalle del objetivo). */
export function ritualOf(b: Behavior): string[] | null {
  const r = b.startRitual;
  return r && r.length > 0 ? r : null;
}
