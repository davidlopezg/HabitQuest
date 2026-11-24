/**
 * El cajón: hábitos candidatos que el usuario suelta SIN decidir.
 *
 * Por qué ( Monkway ): capturar sin fricción y decidir después. "Decides
 * después, no ahora." Es el antídoto contra la app que te exige decidir 5
 * hábitos antes de poder empezar.
 *
 * Diferencia con las tareas de Monkway: aquí TODO lo que entra es un HÁBITO
 * (algo que quieres repetir). Cuando lo promocionamos a un objetivo, el
 * motor le pone su curva de niveles y su micro ritual.
 */

import type { Behavior, CoachState, InboxItem } from './types.ts';
import { CATALOG, templateOf } from './levels.ts';
import { STRATEGY_TIPS } from './levels.ts';
import { matchTemplateByText } from './habitadd.ts';

let counter = 0;

/** Crea un identificador estable para un elemento del cajón. */
function newId(): string {
  counter += 1;
  return `inbox_${Date.now().toString(36)}_${counter}`;
}

/** Añade un hábito candidato al cajón (texto libre del usuario). */
export function addToInbox(state: CoachState, text: string): CoachState {
  const clean = text.trim().slice(0, 80);
  if (!clean) return state;
  const match = matchTemplateByText(clean);
  const tpl = match ? templateOf(match.templateId) : undefined;
  const item: InboxItem = {
    id: newId(),
    text: clean,
    templateId: match?.templateId,
    name: tpl?.name ?? titleCase(clean),
    icon: tpl?.icon ?? '✨',
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  return { ...state, inbox: [item, ...(state.inbox ?? [])] };
}

/** Elementos del cajón que siguen sin decidir. */
export function pendingInbox(state: CoachState): InboxItem[] {
  return (state.inbox ?? []).filter((i) => i.status === 'pending');
}

/** Descarta un elemento del cajón. */
export function dropInboxItem(state: CoachState, itemId: string): CoachState {
  return {
    ...state,
    inbox: (state.inbox ?? []).map((i) =>
      i.id === itemId ? { ...i, status: 'dropped' as const } : i,
    ),
  };
}

/**
 * Promociona un elemento del cajón a hábito real de un objetivo: entra en el
 * plan con su curva de niveles (nivel 1) y su micro ritual.
 */
export function promoteInboxItem(
  state: CoachState,
  itemId: string,
  goalId: string,
  today: string,
): CoachState {
  const item = (state.inbox ?? []).find((i) => i.id === itemId);
  const goal = state.goals.find((g) => g.id === goalId && g.status === 'active');
  if (!item || !goal || item.status !== 'pending') return state;

  const tpl = item.templateId ? templateOf(item.templateId) : undefined;
  const id = `${goalId}__inbox_${item.id}`;
  const count = state.behaviors.filter((b) => b.goalId === goalId).length;
  const behavior: Behavior = {
    id,
    goalId,
    templateId: tpl?.id ?? 'custom',
    name: tpl?.name ?? item.name,
    icon: tpl?.icon ?? item.icon,
    category: tpl?.category ?? 'other',
    enabled: true,
    order: count,
    introducedAt: today,
    currentLevel: 1,
    preferredSlots: tpl?.slots ?? ['morning', 'afternoon', 'night'],
    kind: tpl?.kind,
    startRitual: tpl?.startRitual,
    strategies: STRATEGY_TIPS[tpl?.id ?? '']
      ? { [STRATEGY_TIPS[tpl!.id]!.key]: STRATEGY_TIPS[tpl!.id]!.text }
      : undefined,
  };

  return {
    ...state,
    behaviors: [...state.behaviors, behavior],
    inbox: (state.inbox ?? []).map((i) =>
      i.id === itemId ? { ...i, status: 'promoted' as const, goalId } : i,
    ),
  };
}

/**
 * Objetivos donde encaja un elemento del cajón (por área del template).
 * Si no hay coincidencia, devuelve todos los objetivos activos.
 */
export function goalsForInboxItem(state: CoachState, item: InboxItem): string[] {
  const active = state.goals.filter((g) => g.status === 'active');
  if (!item.templateId) return active.map((g) => g.id);
  const areas = TEMPLATE_AREA_OF[item.templateId] ?? [];
  const matching = active.filter((g) => areas.includes(g.area));
  return (matching.length > 0 ? matching : active).map((g) => g.id);
}

/** Áreas compatibles por plantilla (copia local para no acoplar). */
const TEMPLATE_AREA_OF: Record<string, string[]> = {
  walk: ['fitness'],
  strength: ['fitness'],
  mobility: ['fitness'],
  read: ['reading'],
  study: ['learning'],
  mindfulness: ['mindfulness', 'sleep'],
  sleep_routine: ['sleep', 'mindfulness'],
  tidy: ['order'],
  cook: ['nutrition'],
  focus: ['productivity'],
  write: ['productivity'],
  supplements: ['nutrition'],
};

/** Plantillas del catálogo que el usuario puede elegir a mano en el cajón. */
export function catalogOptions(): { id: string; name: string; icon: string }[] {
  return CATALOG.filter((t) => t.id !== 'custom' && t.id !== 'reduce').map((t) => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
  }));
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
