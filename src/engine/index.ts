/**
 * Fachada del motor adaptativo (HabitQuest Coach).
 *
 * Uso previsto desde React: mantener un CoachState en localStorage (v2) y
 * llamar a funciones puras que devuelven un estado nuevo + eventos.
 */

import type {
  BehaviorLogEntry,
  CoachCounters,
  CoachReply,
  CoachState,
  DayCheckIn,
  DayPlan,
  PlanItemStatus,
  ReasonCode,
} from './types.ts';
import { planDay } from './planner.ts';

export * from './types.ts';
export * from './time.ts';
export * from './levels.ts';
export * from './checkin.ts';
export * from './history.ts';
export * from './progression.ts';
export * from './decomposer.ts';
export * from './planner.ts';
export * from './replanner.ts';
export * from './patterns.ts';
export * from './gamification.ts';

export function emptyCounters(): CoachCounters {
  return {
    resilienceWins: 0,
    totalDone: 0,
    totalMinimal: 0,
    replans: 0,
    consolidated: [],
    xp: 0,
  };
}

export function emptyState(): CoachState {
  return {
    version: 2,
    goals: [],
    behaviors: [],
    logs: [],
    checkins: [],
    plans: {},
    counters: emptyCounters(),
    memory: { reasonCounts: {}, weakWeekdays: [], lastInsights: [], bestSlotByBehavior: {} },
    chat: [],
  };
}

export interface CompletionInput {
  date: string;
  behaviorId: string;
  minutes: number; // minutos reales invertidos
  plannedMinutes?: number; // lo planificado (si se omite, se usa el item del plan)
  dayMode?: DayPlan['mode'];
  reasonCode?: BehaviorLogEntry['reasonCode'];
}

/**
 * Registra la realización de un hábito y devuelve el estado evolucionado:
 * log + plan actualizado + contadores de gamificación.
 */
export function recordCompletion(state: CoachState, input: CompletionInput): CoachState {
  const b = state.behaviors.find((x) => x.id === input.behaviorId);
  if (!b) return state;

  const plan = state.plans[input.date];
  const dayMode = input.dayMode ?? plan?.mode ?? 'normal';
  const planned =
    input.plannedMinutes ??
    plan?.items.find((i) => i.behaviorId === b.id)?.minutes ??
    0;
  const kind = input.minutes >= planned * 0.75
    ? 'full'
    : input.minutes > 0
      ? 'minimal'
      : input.reasonCode
        ? 'excused'
        : 'miss';

  const log: BehaviorLogEntry = {
    date: input.date,
    behaviorId: b.id,
    kind,
    minutes: input.minutes,
    dayMode,
    reasonCode: input.reasonCode,
    plannedMinutes: planned,
  };

  const newState: CoachState = {
    ...state,
    logs: [...state.logs, log],
    counters: { ...state.counters },
    memory: { ...state.memory, reasonCounts: { ...state.memory.reasonCounts } },
  };
  if (input.reasonCode) {
    newState.counters.replans++;
    newState.memory.reasonCounts[input.reasonCode] =
      (newState.memory.reasonCounts[input.reasonCode] ?? 0) + 1;
  }

  // Marcar el elemento del plan como resuelto.
  if (state.plans[input.date]) {
    const items = state.plans[input.date].items.map((i) =>
      i.behaviorId === b.id && i.status === 'pending'
        ? {
            ...i,
            status:
              kind === 'full'
                ? ('done_full' as const)
                : kind === 'minimal'
                  ? ('done_minimal' as const)
                  : ('excused' as const),
          }
        : i,
    );
    newState.plans = {
      ...state.plans,
      [input.date]: {
        ...state.plans[input.date],
        items,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  return newState;
}

/**
 * Aplica la respuesta de replanificación del coach al estado:
 * 1. sustituye el plan del día por el replanificado;
 * 2. si la acción dejó el hábito excusado, registra el log (para patrones).
 */
export function applyCoachReply(
  state: CoachState,
  date: string,
  reply: CoachReply,
  behaviorId: string,
  plannedMinutes: number,
  code?: ReasonCode,
): CoachState {
  let s: CoachState = { ...state, plans: { ...state.plans, [date]: reply.plan } };
  if (reply.action === 'mode_change' || reply.action === 'excused') {
    s = recordCompletion(s, {
      date,
      behaviorId,
      minutes: 0,
      reasonCode: code,
      dayMode: reply.plan.mode,
      plannedMinutes,
    });
  }
  return s;
}

/**
 * Regenera el plan de un día (p. ej. al añadir un objetivo/hábito a mitad de
 * jornada) PRESERVANDO lo que ya se hizo o se excusó: lo pendiente se replanifica
 * desde cero con los comportamientos actuales.
 */
export function rebuildPlan(state: CoachState, checkin: DayCheckIn): CoachState {
  const date = checkin.date;
  const prev = state.plans[date];
  const prevStatus = new Map<string, PlanItemStatus>();
  if (prev) {
    for (const it of prev.items) prevStatus.set(it.behaviorId, it.status);
  }
  const plan = planDay({ state, checkin });
  if (prev) {
    plan.items = plan.items.map((i) => {
      const s0 = prevStatus.get(i.behaviorId);
      if (s0 === 'done_full' || s0 === 'done_minimal' || s0 === 'excused') {
        return { ...i, status: s0 };
      }
      return i;
    });
  }
  return { ...state, plans: { ...state.plans, [date]: plan } };
}

/** Añade el resultado de la descomposición de un objetivo al estado. */
export function applyDecomposed(
  state: CoachState,
  outcome: { goal: CoachState['goals'][number]; behaviors: CoachState['behaviors'] },
): CoachState {
  return {
    ...state,
    goals: [...state.goals, outcome.goal],
    behaviors: [...state.behaviors, ...outcome.behaviors],
  };
}

/** Devuelve el plan de un día (lo genera si aún no existe). */
export function getOrBuildPlan(
  state: CoachState,
  checkin: DayCheckIn,
): { state: CoachState; plan: DayPlan } {
  if (state.plans[checkin.date]) {
    return { state, plan: state.plans[checkin.date] };
  }
  const plan = planDay({ state, checkin });
  return {
    state: { ...state, plans: { ...state.plans, [checkin.date]: plan } },
    plan,
  };
}
