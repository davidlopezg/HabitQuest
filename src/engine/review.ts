/**
 * Revisión semanal (ritual de 5 minutos).
 *
 * Monkway: "Revisar tareas abiertas (5 min)" + "Planificar el día de mañana
 * (3 min)". Aquí la revisión es determinista y dura lo mismo:
 *  - qué se hizo de verdad (no la sensación),
 *  - qué racha está en juego,
 *  - el único hábito que hay que vigilar,
 *  - y una propuesta concreta para la semana que viene.
 */

import type { Behavior, CoachState } from './types.ts';
import { addDays, WEEKDAY_ES, weekdayOf } from './time.ts';
import { adherence, streakDays } from './history.ts';
import { moodTrend } from './mood.ts';

export interface WeeklyReview {
  from: string;
  to: string;
  daysWithData: number; // días con registros
  planned: number; // ítems planificados en la semana
  completed: number; // ítems completados (full + minimal)
  missed: number;
  rate: number; // 0..1
  bestStreak?: { name: string; icon: string; days: number };
  worstHabit?: { name: string; icon: string; rate: number };
  moodAvg: number | null;
  moodLabel: string;
  notes: number; // días con comentario escrito
  highlights: string[]; // 2–3 frases de los hechos
  suggestions: string[]; // acciones concretas para la semana que viene
  tomorrowFocus: { text: string; behaviorId?: string }[]; // "plan de mañana (3 min)"
}

/** Revisión de los `days` días que terminan en `end` (inclusive). */
export function weeklyReview(
  state: CoachState,
  end: string,
  days = 7,
): WeeklyReview {
  const from = addDays(end, -(days - 1));

  let planned = 0;
  let completed = 0;
  let missed = 0;
  let daysWithData = 0;
  for (let d = 0; d < days; d++) {
    const key = addDays(end, -d);
    if (key < from) break;
    const plan = state.plans?.[key];
    if (plan && plan.items.length > 0) daysWithData++;
    for (const l of state.logs) {
      if (l.date !== key) continue;
      planned++;
      if (l.kind === 'full' || l.kind === 'minimal') completed++;
      else if (l.kind === 'miss') missed++;
    }
  }
  const rate = planned > 0 ? completed / planned : 0;

  // Racha y adherencia por comportamiento.
  const scored = state.behaviors
    .filter((b) => b.enabled !== false)
    .map((b) => ({
      b,
      adh: adherence(state.logs, b, end, days),
      streak: streakDays(state.logs, b, end),
    }))
    .filter((x) => x.adh.eligible > 0);

  const best = scored.length
    ? [...scored].sort((a, b) => b.streak - a.streak || b.adh.rate - a.adh.rate)[0]
    : undefined;
  const worst = scored.length
    ? [...scored].sort((a, b) => a.adh.rate - b.adh.rate)[0]
    : undefined;

  const mood = moodTrend(state.checkins, days, end);
  const notes = state.notes.filter((n) => n.date >= from && n.date <= end).length;

  // ---------- Frases ----------
  const highlights: string[] = [];
  if (planned > 0) {
    highlights.push(
      `Esta semana cerraste ${completed} de ${planned} cosas (${Math.round(rate * 100)} %).`,
    );
  } else {
    highlights.push('Aún no hay plan registrado para esta semana.');
  }
  if (best && best.streak > 0) {
    highlights.push(`Tu mejor racha es ${best.streak} días con ${best.b.icon} ${best.b.name.toLowerCase()}.`);
  }
  if (notes > 0) {
    highlights.push(`Escribiste ${notes} ${notes === 1 ? 'comentario' : 'comentarios'} en la bitácora.`);
  }

  // ---------- Sugerencias ----------
  const suggestions: string[] = [];
  if (worst && worst.adh.rate < 0.6 && worst.adh.eligible >= 3) {
    suggestions.push(
      `${worst.b.icon} ${worst.b.name} solo se cumple un ${Math.round(worst.adh.rate * 100)} %. Bájale un nivel esta semana: es más fácil que se mantenga.`,
    );
  }
  if (mood.delta !== null && mood.delta <= -1) {
    suggestions.push('Tu ánimo ha bajado: baja la exigencia del plan antes que la motivación.');
  }
  if (mood.delta !== null && mood.delta >= 1) {
    suggestions.push('Tu ánimo ha subido: buen momento para subir un nivel en el hábito que más te importa.');
  }
  if (planned > 0 && completed === 0) {
    suggestions.push('Esta semana no cerraste nada. No pasa nada: mañana empieza con UN solo pendiente.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Todo encaja: mantén el plan tal cual la semana que viene.');
  }

  // ---------- Plan de mañana (3 min) ----------
  const tomorrowFocus = tomorrowFocusOf(state, end);

  return {
    from,
    to: end,
    daysWithData,
    planned,
    completed,
    missed,
    rate,
    bestStreak: best ? { name: best.b.name, icon: best.b.icon, days: best.streak } : undefined,
    worstHabit: worst
      ? { name: worst.b.name, icon: worst.b.icon, rate: Math.round(worst.adh.rate * 100) }
      : undefined,
    moodAvg: mood.avg,
    moodLabel: mood.label,
    notes,
    highlights,
    suggestions,
    tomorrowFocus,
  };
}

/**
 * Propuesta de "mañana (3 min)": hasta 3 comportamientos, empezando por el
 * más importante (nivel más alto = más exigente) y terminando por el que
 * menos cumples (para que no se te escapes).
 */
function tomorrowFocusOf(state: CoachState, end: string): { text: string; behaviorId?: string }[] {
  const pool = state.behaviors.filter((b) => b.enabled !== false);
  if (pool.length === 0) return [];
  const scored = pool.map((b) => ({
    b,
    adh: adherence(state.logs, b, end, 7).rate,
    level: b.currentLevel,
  }));
  const hardest = [...scored].sort((a, b) => b.level - a.level || b.adh - a.adh)[0];
  const weakest = [...scored].sort((a, b) => a.adh - b.adh || b.level - a.level)[0];
  const out: { text: string; behaviorId?: string }[] = [];
  const push = (x: (typeof scored)[number] | undefined) => {
    if (!x) return;
    if (out.some((o) => o.behaviorId === x.b.id)) return;
    out.push({ text: `${x.b.icon} ${x.b.name}`, behaviorId: x.b.id });
  };
  push(hardest);
  push(weakest);
  for (const x of [...scored].sort((a, b) => b.adh - a.adh)) {
    if (out.length >= 3) break;
    push(x);
  }
  return out.slice(0, 3);
}

/** Etiqueta del día de la semana para cabeceras ("lunes 10/06"). */
export function weekdayLabel(key: string): string {
  const wd = weekdayOf(key);
  return `${WEEKDAY_ES[wd]} ${key.split('-').reverse().join('/')}`;
}

/** Nombre del comportamiento por id (para textos). */
export function behaviorName(behaviors: Behavior[], id?: string): string {
  if (!id) return '';
  return behaviors.find((b) => b.id === id)?.name ?? '';
}
