/**
 * Fachada del motor adaptativo (HabitQuest Coach).
 *
 * Uso previsto desde React: mantener un CoachState en localStorage (v2) y
 * llamar a funciones puras que devuelven un estado nuevo + eventos.
 */

import type {
  BehaviorLogEntry,
  CoachCounters,
  CoachState,
  DayCheckIn,
  DayPlan,
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
