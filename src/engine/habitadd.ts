/**
 * El coach puede AÑADIR hábitos desde la conversación, cuando el humano lo pide.
 *
 * Ejemplos que entiende (determinista, sin LLM):
 *   - "añade un hábito de meditación a las 7:30"
 *   - "quiero un hábito para caminar por la mañana"
 *   - "ponme un hábito de leer"
 *   - "necesito un hábito de estiramientos"
 *
 * El resultado SIEMPRE pasa por el catálogo (plantillas con curva de niveles):
 * nunca se crea un hábito "libre" sin progresión.
 */

import type { Behavior, CoachState, DaySlot } from './types.ts';
import { templateOf } from './levels.ts';

export interface AddHabitRequest {
  templateId: string;
  slot?: DaySlot;
  time?: number; // minutos desde medianoche
}

const TRIGGERS = [
  /añade?/i, /añadir/i, /añadime/i, /crea/i, /crear/i, /agrega/i, /agregar/i,
  /incluye/i, /pon(?:me)?\s+un/i, /nuev[oa]\s*h[áa]bito/i,
  /quiero\s+(?:un|una|tener\s+un|empezar\s+un)\s*h[áa]bito/i,
  /necesito\s+(?:un|una)\s*h[áa]bito/i,
  /h[áa]bito\s+de/i, /h[áa]bitos?\s+para/i,
];

const KEYWORD_MAP: { templateId: string; keywords: string[] }[] = [
  { templateId: 'walk', keywords: ['caminar', 'andar', 'paseo', 'caminatas'] },
  { templateId: 'strength', keywords: ['fuerza', 'pesas', 'gimnasio', 'músculo', 'musculación', 'tonificar'] },
  { templateId: 'mobility', keywords: ['movilidad', 'estiramiento', 'estirar', 'flexibilidad', 'caderas', 'espalda'] },
  { templateId: 'read', keywords: ['leer', 'lectura', 'libro', 'kindle'] },
  { templateId: 'study', keywords: ['estudiar', 'idioma', 'inglés', 'examen', 'curso', 'aprender'] },
  { templateId: 'mindfulness', keywords: ['meditar', 'meditación', 'respirar', 'respiración', 'mindfulness', 'calma', 'relajación', 'estrés'] },
  { templateId: 'sleep_routine', keywords: ['dormir', 'sueño', 'acostar', 'descansar'] },
  { templateId: 'tidy', keywords: ['ordenar', 'orden', 'limpiar', 'desorden', 'escritorio', 'casa'] },
  { templateId: 'cook', keywords: ['cocinar', 'cocina', 'comida', 'saludable', 'verduras', 'dieta'] },
  { templateId: 'focus', keywords: ['foco', 'concentración', 'trabajo profundo', 'productividad', 'bloque de trabajo', 'procastinar'] },
];

/** Área del objetivo con la que encaja cada plantilla (para elegir objetivo). */
export const TEMPLATE_AREA: Record<string, string[]> = {
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
};

/** Detecta la petición "añade un hábito de X (a las H o por la H)". */
export function parseAddHabitRequest(text: string): AddHabitRequest | null {
  const t = text.toLowerCase();
  if (!TRIGGERS.some((re) => re.test(t))) return null;

  const matched = KEYWORD_MAP.find((k) => k.keywords.some((w) => t.includes(w)));
  if (!matched) return null;

  const req: AddHabitRequest = { templateId: matched.templateId };

  const clock = t.match(/(?:a\s+las|alrededor de las|@)\s*(\d{1,2})(?::(\d{2}))?\b/);
  if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2] ?? 0);
    if (h <= 24 && m < 60) req.time = ((h % 24) * 60) + m;
  } else if (/por la mañana|a la mañana|a primera hora/.test(t)) {
    req.slot = 'morning';
  } else if (/al mediodía|mediodía/.test(t)) {
    req.slot = 'midday';
  } else if (/por la tarde|a la tarde/.test(t)) {
    req.slot = 'afternoon';
  } else if (/por la noche|a la noche|antes de acostar|antes de dormir/.test(t)) {
    req.slot = 'night';
  }

  return req;
}

/**
 * Crea el comportamiento pedido dentro de un objetivo activo y devuelve el
 * estado actualizado (los planes existentes NO se tocan: llámalo después con
 * rebuildPlan si quieres regenerar el día conservando lo hecho).
 */
export function addBehaviorToState(
  state: CoachState,
  goalId: string,
  today: string,
  req: AddHabitRequest,
): CoachState {
  const g = state.goals.find((x) => x.id === goalId && x.status === 'active');
  const tpl = templateOf(req.templateId);
  if (!g || !tpl) return state;

  const count = state.behaviors.filter((b) => b.goalId === goalId).length;
  const base = `${goalId}__${req.templateId}`;
  const id = state.behaviors.some((b) => b.id === base)
    ? `${base}_${count + 1}`
    : base;

  const behavior: Behavior = {
    id,
    goalId,
    templateId: tpl.id,
    name: tpl.name,
    icon: tpl.icon,
    category: tpl.category,
    enabled: true,
    order: count,
    introducedAt: today,
    currentLevel: 1,
    preferredSlots: req.slot ? [req.slot, ...tpl.slots.filter((s) => s !== req.slot)] : tpl.slots,
    startMinute: req.time,
  };

  return { ...state, behaviors: [...state.behaviors, behavior] };
}
