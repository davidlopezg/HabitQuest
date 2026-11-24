/**
 * Ánimo como serie (no como dato de entrada del plan).
 *
 * El check-in ya recoge energía/ánimo/foco/estrés cada día, pero se usaba
 * solo para decidir el modo del plan. Aquí lo convertimos en una SERIE con
 * tendencia: "Mi ánimo estos días" (Monkway) — el usuario ve que su estado
 * sube o baja y eso cambia cómo usa la app.
 */

import type { DayCheckIn } from './types.ts';
import { addDays, todayKey } from './time.ts';

export interface MoodPoint {
  date: string;
  mood: number; // 1..10
  energy: number; // 1..10
  focus: number; // 1..10
  stress: number; // 1..10
}

export interface MoodTrend {
  points: MoodPoint[]; // últimos `days` días con check-in (ascendente)
  avg: number | null; // media de ánimo del periodo
  delta: number | null; // última mitad vs primera mitad
  label: string; // frase corta y calmada
  enough: boolean; // ¿hay datos suficientes para hablar de tendencia?
}

/** Serie de check-ins de los últimos `days` días (terminando en `end`). */
export function moodSeries(
  checkins: DayCheckIn[],
  days = 30,
  end: string = todayKey(),
): MoodPoint[] {
  const from = addDays(end, -(days - 1));
  const byDate = new Map(checkins.map((c) => [c.date, c]));
  const out: MoodPoint[] = [];
  for (let d = 0; d < days; d++) {
    const key = addDays(end, -d);
    if (key < from) break;
    const c = byDate.get(key);
    if (!c) continue;
    out.push({
      date: key,
      mood: clamp10(c.mood),
      energy: clamp10(c.energy),
      focus: clamp10(c.focus),
      stress: clamp10(c.stress),
    });
  }
  return out.reverse();
}

function clamp10(v: number): number {
  if (!Number.isFinite(v)) return 5;
  return Math.max(1, Math.min(10, Math.round(v)));
}

/** Tendencia del ánimo: media del periodo y comparación entre mitades. */
export function moodTrend(
  checkins: DayCheckIn[],
  days = 14,
  end: string = todayKey(),
): MoodTrend {
  const points = moodSeries(checkins, days, end);
  if (points.length === 0) {
    return { points, avg: null, delta: null, label: 'Sin datos de ánimo todavía', enough: false };
  }
  const avg = points.reduce((s, p) => s + p.mood, 0) / points.length;
  let delta: number | null = null;
  if (points.length >= 4) {
    const mid = Math.floor(points.length / 2);
    const first = points.slice(0, mid);
    const second = points.slice(mid);
    const a = first.reduce((s, p) => s + p.mood, 0) / first.length;
    const b = second.reduce((s, p) => s + p.mood, 0) / second.length;
    delta = b - a;
  }
  const enough = points.length >= 4;
  let label = 'Tu ánimo se mantiene estable';
  if (!enough) label = 'Pocos días aún: registrar el ánimo unos días más y lo veo';
  else if (delta !== null && delta >= 0.8) label = 'Tu ánimo ha subido estas fechas';
  else if (delta !== null && delta <= -0.8) label = 'Tu ánimo ha bajado estas fechas';
  return {
    points,
    avg: Math.round(avg * 10) / 10,
    delta: delta === null ? null : Math.round(delta * 10) / 10,
    label,
    enough,
  };
}
