/**
 * Generación del plan diario a partir de: objetivo + niveles actuales +
 * check-in matutino + modo del día.
 *
 * Prioridades 🔴🟡🟢 y presupuesto de tiempo: NUNCA se genera un plan imposible.
 * En un día malo solo se conservan los hábitos esenciales en versión mínima.
 */

import type {
  Behavior,
  CoachState,
  DayCheckIn,
  DayMode,
  DayPlan,
  DaySlot,
  PlanItem,
  PlanPriority,
} from './types.ts';
import { dailyBudgetMinutes, MODE_COACH_NOTE, MODE_HEADLINE, modeForCheckin } from './checkin.ts';
import { levelDef, minimalLabel, resolveLevels } from './levels.ts';
import { scheduledOn } from './schedule.ts';
import { ritualStepFor } from './ritual.ts';
import { toHHMM } from './time.ts';

export const SLOT_ORDER: DaySlot[] = ['morning', 'midday', 'afternoon', 'night'];

export const SLOT_DEFAULT_MIN: Record<DaySlot, number> = {
  morning: 540, // 09:00
  midday: 780, // 13:00
  afternoon: 1050, // 17:30
  night: 1290, // 21:30
};

export const SLOT_LABEL: Record<DaySlot, string> = {
  morning: 'Mañana',
  midday: 'Mediodía',
  afternoon: 'Tarde',
  night: 'Noche',
};

export function priorityOf(b: Behavior): PlanPriority {
  if (b.currentLevel <= 2) return 'essential';
  if (b.currentLevel <= 4) return 'important';
  return 'optional';
}

export interface PlanInput {
  state: CoachState;
  checkin: DayCheckIn;
  forceMode?: DayMode;
}

export function planDay({ state, checkin, forceMode }: PlanInput): DayPlan {
  const mode: DayMode = forceMode ?? modeForCheckin(checkin);
  const budget = dailyBudgetMinutes(mode, checkin);
  const date = checkin.date;

  const activeGoals = state.goals.filter((g) => g.status === 'active');
  const candidates = state.behaviors
    .filter(
      (b) =>
        b.enabled &&
        activeGoals.some((g) => g.id === b.goalId) &&
        scheduledOn(state.logs, b, date),
    )
    .sort(
      (a, b) =>
        activeGoals.findIndex((g) => g.id === a.goalId) -
          activeGoals.findIndex((g) => g.id === b.goalId) ||
        a.order - b.order ||
        a.introducedAt.localeCompare(b.introducedAt),
    );

  if (candidates.length === 0) {
    return {
      date,
      mode,
      headline: 'Cuéntame qué quieres conseguir',
      items: [],
      coachNote: 'Escribe tu objetivo (ej: "Quiero ponerme en forma") y construiré tu primer plan.',
      updatedAt: new Date().toISOString(),
    };
  }

  const keepPriority: Record<DayMode, PlanPriority[]> = {
    recovery: ['essential'],
    minimal: ['essential', 'important'],
    normal: ['essential', 'important', 'optional'],
    progress: ['essential', 'important', 'optional'],
  };

  const versionFor = (b: Behavior, prio: PlanPriority): 'full' | 'minimal' => {
    if (mode === 'recovery' || mode === 'minimal') return 'minimal';
    if (mode === 'progress') return 'full';
    return prio === 'optional' ? 'minimal' : 'full';
  };

  // Borradores ordenados por prioridad para el reparto del presupuesto.
  const prioRank: Record<PlanPriority, number> = { essential: 0, important: 1, optional: 2 };
  const drafts = candidates
    .map((b) => {
      const prio = priorityOf(b);
      return { b, prio };
    })
    .sort((x, y) => prioRank[x.prio] - prioRank[y.prio] || x.b.order - y.b.order);

  const items: PlanItem[] = [];
  let used = 0;
  const slotCounters: Record<DaySlot, number> = { morning: 0, midday: 0, afternoon: 0, night: 0 };

  for (const { b, prio } of drafts) {
    if (!keepPriority[mode].includes(prio)) continue;
    const def = levelDef(b)!;
    const isBinary = (b.kind ?? 'volume') === 'binary';
    const version = (isBinary ? 'full' : versionFor(b, prio)) as 'full' | 'minimal';
    // Binarios: se marcan o no; usan 1 min nominal para el presupuesto del plan.
    const minutes = isBinary ? 1 : version === 'full' ? def.minutes : def.minimal!;
    if (used + minutes + 2 > budget) continue; // nunca planes imposibles
    const slot = b.preferredSlots[0] ?? 'morning';
    slotCounters[slot]++;
    const startMinute =
      b.startMinute !== undefined
        ? Math.min(Math.max(0, Math.round(b.startMinute)), 1420)
        : Math.min(SLOT_DEFAULT_MIN[slot] + (slotCounters[slot] - 1) * 25, 1420);
    items.push({
      id: `${date}__${b.id}`,
      behaviorId: b.id,
      goalId: b.goalId,
      slot,
      startMinute: Math.min(startMinute, 1420),
      label: (() => {
        const step = ritualStepFor(b);
        if (step) return step;
        if (isBinary) return b.name;
        // Volumen: prioridad al label del nivel actual (qué hacer), si existe.
        const lv = resolveLevels(b)[b.currentLevel - 1];
        return lv?.label ?? (version === 'full' ? `${b.name} — ${minutes} min` : minimalLabel(b));
      })(),
      version,
      minutes,
      priority: prio,
      status: 'pending',
    });
    used += minutes + 2;
    if (items.length >= 12) break;
  }

  // Presentación ordenada por franja horaria.
  const orderMap: Record<DaySlot, number> = { morning: 0, midday: 1, afternoon: 2, night: 3 };
  const sorted = items.sort((a, b) => orderMap[a.slot] - orderMap[b.slot] || a.startMinute - b.startMinute);

  const planned = sorted.map((i) => `${SLOT_LABEL[i.slot]} ${toHHMM(i.startMinute)} · ${i.label}`).join('\n');
  const optionalDropped = drafts.filter((d) => !keepPriority[mode].includes(d.prio)).map((d) => d.b.name);

  return {
    date,
    mode,
    headline: MODE_HEADLINE[mode],
    items: sorted,
    coachNote:
      MODE_COACH_NOTE[mode] +
      (optionalDropped.length > 0
        ? ` Hoy dejamos fuera: ${optionalDropped.join(', ')}.`
        : ''),
    updatedAt: new Date().toISOString(),
  };
}
