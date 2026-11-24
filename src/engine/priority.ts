/**
 * La prioridad del día (UNA sola cosa).
 *
 * Por qué: un plan con 8 ítems y 3 objetivos diluye la atención. Monkway
 * resuelve esto con una regla simple — "Define 1 priority for the day" y una
 * pregunta que evita la.autoestima: "qué cuenta como suficiente".
 *
 * Aquí es determinista: el motor propone la prioridad a partir del plan
 * (el primer pendiente importante), el usuario la confirma o la reescribe.
 * Sin IA, sin fricción.
 */

import type { CoachState, DayPriority, PlanItem } from './types.ts';

/** Orden de prioridad del plan: lo esencial va primero. */
const PRIORITY_RANK: Record<PlanItem['priority'], number> = {
  essential: 0,
  important: 1,
  optional: 2,
};

/** Prioridad de una fecha (undefined si ese día no tiene). */
export function priorityOn(state: CoachState, date: string): DayPriority | undefined {
  return state.priorities?.[date];
}

/** Fija (o actualiza) la prioridad del día. */
export function setPriority(
  state: CoachState,
  date: string,
  patch: Partial<Omit<DayPriority, 'date'>>,
): CoachState {
  const prev = state.priorities?.[date];
  const text = (patch.text ?? prev?.text ?? '').trim().slice(0, 120);
  const next: DayPriority = {
    date,
    text,
    done: patch.done ?? prev?.done ?? false,
    behaviorId: patch.behaviorId ?? prev?.behaviorId,
    enough: patch.enough ?? prev?.enough,
    updatedAt: new Date().toISOString(),
  };
  if (!next.text) return clearPriority(state, date);
  return { ...state, priorities: { ...(state.priorities ?? {}), [date]: next } };
}

/** Quita la prioridad del día (vuelve a estar sin decidir). */
export function clearPriority(state: CoachState, date: string): CoachState {
  if (!state.priorities?.[date]) return state;
  const priorities = { ...state.priorities };
  delete priorities[date];
  return { ...state, priorities };
}

/** Marca (o desmarca) la prioridad del día como hecha. */
export function completePriority(
  state: CoachState,
  date: string,
  done = true,
): CoachState {
  const p = priorityOn(state, date);
  if (!p) return state;
  return setPriority(state, date, { done });
}

/**
 * Propone la prioridad del día a partir del plan: el pendiente más
 * importante y más temprano. Si el día ya tiene prioridad, la devuelve.
 */
export function suggestPriority(
  state: CoachState,
  date: string,
): { text: string; behaviorId?: string } | undefined {
  const existing = priorityOn(state, date);
  if (existing) return { text: existing.text, behaviorId: existing.behaviorId };

  const plan = state.plans?.[date];
  if (!plan || plan.items.length === 0) return undefined;

  const pending = plan.items.filter((i) => i.status === 'pending');
  const pool = pending.length > 0 ? pending : plan.items;
  const sorted = [...pool].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.startMinute - b.startMinute,
  );
  const best = sorted[0];
  if (!best) return undefined;
  return { text: best.label, behaviorId: best.behaviorId };
}

/**
 * Elige el comportamiento que debería ser la prioridad de MAÑANA:
 * el que más racha tiene (o, si no hay racha, el más frecuente en el plan).
 * Devuelve undefined si no hay nada que proponer.
 */
export function suggestTomorrowPriority(
  state: CoachState,
  date: string,
): { text: string; behaviorId?: string } | undefined {
  const plan = state.plans?.[date];
  if (!plan || plan.items.length === 0) return undefined;
  const pending = plan.items.filter((i) => i.status === 'pending');
  if (pending.length === 0) return undefined;
  const sorted = [...pending].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.startMinute - b.startMinute,
  );
  const best = sorted[0];
  if (!best) return undefined;
  return { text: best.label, behaviorId: best.behaviorId };
}
