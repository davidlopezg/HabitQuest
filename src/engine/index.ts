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
  Conversation,
  DayCheckIn,
  DayPlan,
  LogKind,
  PlanItemStatus,
  ReasonCode,
} from './types.ts';
import { planDay } from './planner.ts';
import { classifyReason } from './replanner.ts';

export * from './types.ts';
export * from './habitadd.ts';
export * from './schedule.ts';
export * from './ritual.ts';
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
    conversations: [],
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
  // ----- Validación defensiva -----
  if (!input || typeof input !== 'object') return state;
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return state;
  if (typeof input.behaviorId !== 'string' || input.behaviorId.length === 0) return state;
  const minutes = Number.isFinite(input.minutes) ? Math.max(0, Math.round(input.minutes ?? 0)) : 0;
  if (minutes > 24 * 60) return state; // más de 24 h es claramente un bug

  const b = state.behaviors.find((x) => x.id === input.behaviorId);
  if (!b) return state;

  const plan = state.plans[input.date];
  const dayMode = input.dayMode ?? plan?.mode ?? 'normal';
  const planned = Math.max(
    0,
    Number(input.plannedMinutes ?? plan?.items.find((i) => i.behaviorId === b.id)?.minutes ?? 0) || 0,
  );

  // ----- Clasificación: full | minimal | excused | miss -----
  let kind: LogKind;
  if (minutes > 0) {
    kind = minutes >= planned * 0.75 ? 'full' : 'minimal';
  } else if (input.reasonCode) {
    kind = 'excused';
  } else {
    kind = 'miss';
  }

  const log: BehaviorLogEntry = {
    date: input.date,
    behaviorId: b.id,
    kind,
    minutes,
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

  // Marcar el elemento del plan como resuelto (solo si sigue pendiente).
  if (plan) {
    const items = plan.items.map((i) =>
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
      [input.date]: { ...plan, items, updatedAt: new Date().toISOString() },
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

/**
 * Elimina un objetivo y TODO lo asociado: comportamientos, registros, plan del
 * día y marcadores de consolidación. Los demás objetivos no se ven afectados.
 */
export function removeGoal(state: CoachState, goalId: string): CoachState {
  const doomed = new Set(state.behaviors.filter((b) => b.goalId === goalId).map((b) => b.id));
  const plans: Record<string, DayPlan> = {};
  for (const [date, p] of Object.entries(state.plans)) {
    plans[date] = { ...p, items: p.items.filter((i) => !doomed.has(i.behaviorId)) };
  }
  return {
    ...state,
    goals: state.goals.filter((g) => g.id !== goalId),
    behaviors: state.behaviors.filter((b) => b.goalId !== goalId),
    logs: state.logs.filter((l) => !doomed.has(l.behaviorId)),
    plans,
    counters: {
      ...state.counters,
      consolidated: state.counters.consolidated.filter((id) => !doomed.has(id)),
    },
  };
}

/**
 * "Lo dejo para mañana": excusa SOLO este hábito hoy (no rompe racha, cuenta
 * como excusado en adherencia) y deja el resto del día igual. Mañana el plan
 * se regenera y el hábito vuelve a estar programado.
 */
export function postponeItem(
  state: CoachState,
  date: string,
  behaviorId: string,
): CoachState {
  const plan = state.plans[date];
  if (!plan) return state;
  const item = plan.items.find((i) => i.behaviorId === behaviorId && i.status === 'pending');
  if (!item) return state;
  const updatedPlan: DayPlan = {
    ...plan,
    items: plan.items.map((i) =>
      i.id === item.id
        ? { ...i, status: 'excused' as const, reasonCode: 'postpone' as const }
        : i,
    ),
    updatedAt: new Date().toISOString(),
  };
  let s: CoachState = { ...state, plans: { ...state.plans, [date]: updatedPlan } };
  s = recordCompletion(s, {
    date,
    behaviorId,
    minutes: 0,
    reasonCode: 'postpone',
    dayMode: plan.mode,
    plannedMinutes: item.minutes,
  });
  return s;
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

// ---------------------------------------------------------------------------
// Conversaciones: archivo + análisis ligero
// ---------------------------------------------------------------------------

/** Máximo de conversaciones cerradas que guardamos para alimentar al LLM. */
const MAX_CONVERSATIONS = 30;

/** Heurística ligera de ánimo a partir del texto del usuario. No es análisis
 *  de sentimiento real: mira palabras clave. Sirve para que el coach pueda
 *  detectar "te veo cansado" o "estás desmoralizado" en sesiones futuras. */
export function detectMood(text: string): Conversation['mood'] {
  const t = text.toLowerCase();
  if (/(\bgenial\b|\bcontento|\bhecho\b|\bcumplido|\bsuperad|\bc\u00e9ntrate\b|\blograd)/.test(t)) return 'positive';
  if (/(\bcansad|agotad|exhaust|\bdormid)/.test(t)) return 'tired';
  if (/(\bfrustrad|rabia|hart[oa]|desmotiv|no\s+puedo\s+m\u00e1s|dejad)/.test(t)) return 'frustrated';
  if (/(\bhe\s+podido|\blo\s+he\s+conseguid|\bcost\u00f3|\bpero\s+lo\s+hice)/.test(t)) return 'proud';
  return 'neutral';
}

/** Mueve la conversación activa (state.chat) al histórico de conversaciones
 *  cerradas. Devuelve el estado sin cambios si la conversación está vacía.
 *  Calcula metadata ligera (ánimo, motivo más repetido) para que el LLM
 *  pueda referenciar sesiones pasadas sin tener que releer todo el JSON.
 *  El array `conversations` queda limitado a las últimas MAX_CONVERSATIONS. */
export function archiveConversation(state: CoachState, endedAt?: string): CoachState {
  const chat = state.chat;
  if (!chat || chat.length === 0) return state;
  const firstUser = chat.find((m) => m.role === 'user')?.content?.trim() ?? '';
  if (!firstUser) return state; // solo respuestas del bot → no archivamos
  const userTexts = chat.filter((m) => m.role === 'user').map((m) => m.content);
  const joined = userTexts.join(' \n ');
  const topReason = topReasonInText(joined);
  // Ánimo: combinamos señales de todos los turnos del usuario (moda simple).
  const moods = userTexts.map(detectMood).filter((m): m is NonNullable<Conversation['mood']> => Boolean(m));
  const mood = pickDominantMood(moods);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const conv: Conversation = {
    id,
    startedAt: chat[0]?.ts ?? new Date().toISOString(),
    endedAt: endedAt ?? new Date().toISOString(),
    messageCount: chat.length,
    firstUserMessage: firstUser.slice(0, 240),
    topReason,
    mood,
    messages: chat.slice(), // copia defensiva
  };
  const merged = [...(state.conversations ?? []), conv].slice(-MAX_CONVERSATIONS);
  return {
    ...state,
    conversations: merged,
    chat: [], // limpiamos la activa
  };
}

/** Encuentra el motivo más repetido clasificando cada texto de "no puedo".
 *  Usa classifyReason del replanner; si ninguno matchea → undefined. */
function topReasonInText(joined: string): ReasonCode | undefined {
  // Dividimos por frases para no mal-contar motivos repetidos en la misma frase.
  const sentences = joined.split(/[\n.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return undefined;
  const counts: Partial<Record<ReasonCode, number>> = {};
  for (const s of sentences) {
    const r = classifyReason(s);
    if (r === 'other') continue;
    counts[r] = (counts[r] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] as ReasonCode | undefined;
}

function pickDominantMood(
  moods: NonNullable<Conversation['mood']>[],
): Conversation['mood'] | undefined {
  if (moods.length === 0) return undefined;
  type Mood = NonNullable<Conversation['mood']>;
  const counts: Partial<Record<Mood, number>> = {};
  for (const m of moods) counts[m] = (counts[m] ?? 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0];
  return top as Mood | undefined;
}

/** Versión compacta de las conversaciones recientes para incluir en el prompt
 *  del LLM. No incluye los mensajes completos (sería demasiado); solo
 *  metadata + primer mensaje del usuario + razón principal + ánimo. */
export function summarizeConversations(
  conversations: Conversation[] | undefined,
  limit = 5,
): string {
  if (!conversations || conversations.length === 0) return '';
  const recent = conversations.slice(-limit);
  const lines = recent.map((c) => {
    const d = c.endedAt.slice(0, 10);
    const mood = c.mood ? `, ánimo=${c.mood}` : '';
    const reason = c.topReason ? `, motivo=${c.topReason}` : '';
    const first = c.firstUserMessage.replace(/\s+/g, ' ').slice(0, 120);
    return `• ${d} (${c.messageCount} msgs${mood}${reason}): "${first}${first.length >= 120 ? '…' : ''}"`;
  });
  return `Conversaciones recientes con el coach (resumen, las más nuevas primero):\n${lines.join('\n')}`;
}
