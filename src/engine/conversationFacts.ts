/**
 * Extracción DETERMINISTA de hechos relevantes sobre el usuario a partir de
 * los mensajes del coach.
 *
 * Cada conversación cerrada (`state.conversations[i]`) ya contiene:
 *   - mood (ánimo predominante)
 *   - topReason (motivo más repetido de "no puedo")
 *   - firstUserMessage (primer mensaje)
 *
 * Esto añade una capa más rica: HECHOS extraídos del texto libre del usuario.
 * Son etiquetas pequeñas (categoría + frase corta) que el coach puede usar
 * como contexto en futuras sesiones y que se muestran al usuario en el panel
 * Insights como tags ("Lo que retengo de ti").
 *
 * Categorías (todas relevantes para adaptar hábitos):
 *   - work:        contexto laboral (oficina, turnos, reuniones, remoto...)
 *   - family:      núcleo familiar (hijos, pareja, personas a cargo)
 *   - health:      salud / lesiones / sueño / energía
 *   - travel:      viajes / estar fuera de casa
 *   - time_pref:   preferencia de horario (rinde mejor por la mañana, etc.)
 *   - place:       lugar principal donde hace el hábito (casa, gym, parque)
 *   - activity_pref: preferencia de actividad (no le gusta correr, prefiere X)
 *   - obstacle:    obstáculo recurrente mencionado ("siempre me pasa...")
 *
 * Por diseño es CONSERVADOR: preferimos pocos hechos seguros a muchos falsos.
 * Solo emitimos un hecho si el patrón es claro (regex con anclaje) y NO si
 * la palabra aparece suelta (p.ej. "trabajo" como verbo no genera hecho).
 */

import type { ChatMessage, Conversation } from './types.ts';

/** Categorías válidas de hechos. Estable: añadir nuevas requiere migración. */
export type FactCategory =
  | 'work'
  | 'family'
  | 'health'
  | 'travel'
  | 'time_pref'
  | 'place'
  | 'activity_pref'
  | 'obstacle';

/** Un hecho relevante extraído del texto del usuario. */
export interface ExtractedFact {
  category: FactCategory;
  /** Frase corta legible ("Trabaja en oficina con reuniones por la tarde"). */
  text: string;
  /** Fecha de la conversación de la que salió (ISO date). */
  sourceDate: string;
}

// ---------------------------------------------------------------------------
// Reglas de extracción: cada una con una regex robusta + plantilla legible.
// Se evalúan sobre el TEXTO COMPLETO del usuario en una conversación.
// ---------------------------------------------------------------------------

interface FactRule {
  category: FactCategory;
  /** Regex case-insensitive. Si matchea, se emite el hecho. */
  pattern: RegExp;
  /** Frase legible que resume el hecho. */
  template: string;
}

const RULES: FactRule[] = [
  // ── trabajo ────────────────────────────────────────────────────────────
  {
    category: 'work',
    pattern: /\b(turno(?:s)?\s+(?:de\s+)?noche|trabajo(?:r)?\s+(?:por|en)\s+turnos|trabajo\s+nocturno|trabajo\s+de\s+noche|noche\s+trabaj[ao])\b/i,
    template: 'Trabaja por turnos / con noches',
  },
  {
    category: 'work',
    pattern: /\b(teletrabaj|trabajo\s+(?:en\s+)?(?:remoto|casa)|trabaj(o|ar)\s+desde\s+casa|work\s+from\s+home)\b/i,
    template: 'Trabaja en remoto / desde casa',
  },
  {
    category: 'work',
    pattern: /\b(reuniones?\s+(?:por\s+la|las|a\s+la)\s+(?:tarde|mañana|ma\u00f1ana)|reuni(?:o|ó)n\s+fija)\b/i,
    template: 'Tiene reuniones fijas / bloquean parte del día',
  },
  {
    category: 'work',
    pattern: /\b(exam[eo]n(?:es)?|estudios?\s+(?:a\s+)?(?:tiempo\s+completo|intensivo)|oposici(?:o|ó)n(?:es)?|selectividad|eva[ou]\b|trabajo\s+de\s+fin\s+de\s+(?:grado|master|máster))\b/i,
    template: 'Está en época de exámenes / estudios intensivos',
  },

  // ── familia ────────────────────────────────────────────────────────────
  {
    category: 'family',
    pattern: /\b(tengo\s+(?:un|una|dos|tres|\d+)?\s*(?:hijo|hija|hijos|ni\u00f1[oa]s|beb\u00e9)|con\s+(?:un|una|dos|\d+)\s+(?:hijo|hija|hijos|beb\u00e9))\b/i,
    template: 'Tiene hijos / criaturas a cargo',
  },
  {
    category: 'family',
    pattern: /\b(casad[oa]|pareja|mi\s+marido|mi\s+esposa|mi\s+novia|mi\s+novio|convivo\s+con)\b/i,
    template: 'Vive en pareja',
  },
  {
    category: 'family',
    pattern: /\b(cuid(ar|o)\s+(?:de|a)\s+(?:mi\s+)?(madre|padre|abuel[oa]|suegr[oa]|familiar)|dependen?\s+de\s+m[ií])\b/i,
    template: 'Cuida a un familiar dependiente',
  },

  // ── salud ──────────────────────────────────────────────────────────────
  {
    category: 'health',
    pattern: /\b(me\s+duele|me\s+molesta|tengo\s+dolor|lesi[oó]n|enferm[oa]|gripe|resfriad|covid|estoy\s+de\s+baja|rehabilitaci(?:o|ó)n|fisioterapia)\b/i,
    template: 'Tiene una molestia / lesión / enfermedad activa',
  },
  {
    category: 'health',
    pattern: /\b(duermo\s+mal|insomnio|no\s+puedo\s+dormir|me\s+despierto\s+(?:mucho|a\s+media)|poco\s+sue\u00f1o|horas\s+de\s+sue\u00f1o)\b/i,
    template: 'Duerme mal / poco',
  },
  {
    category: 'health',
    pattern: /\b(ansiedad|ansios[oa]|estr\u00e9s|burnout|agotad[oa]\s+mental|trastorn|deprimid)\b/i,
    template: 'Momento emocional delicado (ansiedad / estrés / burnout)',
  },

  // ── viajes ─────────────────────────────────────────────────────────────
  {
    category: 'travel',
    pattern: /\b(viaj(?:o|ar|e)|de\s+viaje|fuera\s+(?:de\s+(?:casa|la\s+ciudad)|por\s+trabajo)|estoy\s+de\s+viaje|esta\s+semana\s+(?:estoy\s+)?fuera)\b/i,
    template: 'Viaja con frecuencia / pasa temporadas fuera',
  },

  // ── preferencias de horario ────────────────────────────────────────────
  // ORDEN IMPORTANTE: las negativas van ANTES de las positivas, porque ambas
  // pueden compartir el sintagma "por la mañana + verbo". Si llegan en otro
  // orden, un "por la mañana estoy muerto" podría matchear la regla positiva.
  // Aceptamos los dos órdenes de palabras ("por la mañana rindo mejor" /
  // "rindo mejor por la mañana").
  {
    category: 'time_pref',
    pattern:
      /\b(?:por\s+la\s+(?:ma\u00f1ana|mañana)\s+(?:no\s+(?:puedo|me\s+apetece|rindo)|estoy\s+(?:muerto|hecho|hecho\s+polvo|cansad[oa]|agotad[oa])|me\s+(?:cuesta|agota))|(?:no\s+(?:puedo|me\s+apetece|rindo)|estoy\s+(?:muerto|hecho|cansad[oa]|agotad[oa])|me\s+(?:cuesta|agota))\s+por\s+la\s+(?:ma\u00f1ana|mañana))\b/i,
    template: 'Por la mañana no rinde / le cuesta',
  },
  {
    category: 'time_pref',
    pattern:
      /\b(?:por\s+la\s+(?:ma\u00f1ana|mañana)\s+(?:rindo|rend[oa]|estoy\s+(?:fresco|m[áa]s\s+activo)|soy\s+mejor|me\s+siento\s+(?:mejor|fresco))|(?:rindo|rend[oa]|estoy\s+(?:fresco|m[áa]s\s+activo)|me\s+siento\s+(?:mejor|fresco))(?:\s+(?:fresco|mejor|m[áa]s\s+activo|mucho|much[ií]simo|bastante|realmente|un\s+poco))*\s+por\s+la\s+(?:ma\u00f1ana|mañana))\b/i,
    template: 'Rinde mejor por la mañana',
  },
  {
    category: 'time_pref',
    pattern:
      /\b(?:por\s+la\s+(?:tarde|noche)\s+(?:rindo|rend[oa]|estoy\s+(?:fresco|m[áa]s\s+activo)|soy\s+mejor|me\s+siento\s+(?:mejor|fresco))|(?:rindo|rend[oa]|estoy\s+(?:fresco|m[áa]s\s+activo)|me\s+siento\s+(?:mejor|fresco))(?:\s+(?:fresco|mejor|m[áa]s\s+activo|mucho|much[ií]simo|bastante|realmente|un\s+poco))*\s+por\s+la\s+(?:tarde|noche))\b/i,
    template: 'Rinde mejor por la tarde / noche',
  },
  {
    category: 'time_pref',
    pattern: /\b(antes\s+de\s+(?:acostar|dormir)|antes\s+de\s+la\s+cena|al\s+finalizar\s+el\s+d[ií]a)\b/i,
    template: 'Prefiere hábitos al final del día',
  },

  // ── lugar principal ────────────────────────────────────────────────────
  {
    category: 'place',
    pattern: /\b(en\s+casa\s+(?:tengo|tiene|no\s+tengo)|trabajo\s+desde\s+casa)\b/i,
    template: 'Hace los hábitos en casa',
  },
  {
    category: 'place',
    pattern: /\b(al\s+gimnasio|ir\s+al\s+gimnasio|al\s+(?:parque|aire\s+libre)|a\s+la\s+calle|salgo\s+a)\b/i,
    template: 'Sale de casa para hacer los hábitos (gym / calle)',
  },

  // ── preferencia de actividad ───────────────────────────────────────────
  {
    category: 'activity_pref',
    pattern: /\b(no\s+me\s+(?:gusta|apetece|atrae|mola)\s+(?:nada\s+)?(?:correr|saltar|el\s+gimnasio|las?\s+pesas|nadar|la\s+bici))|prefiero\s+(?:caminar|andar|leer|estirar|nadar)\b/i,
    template: 'Tiene preferencias claras de actividad',
  },

  // ── obstáculo recurrente ───────────────────────────────────────────────
  {
    category: 'obstacle',
    pattern: /\b(siempre\s+(?:me|lo)\s+(?:pasa|cuesta|cuesta\s+mucho|nunca\s+(?:puedo|consigo))|cada\s+vez\s+que|cada\s+d[ií]a\s+(?:me|lo)|nunca\s+(?:puedo|me\s+apetece))\b/i,
    template: 'Hay algo que "siempre" le pasa',
  },
  {
    category: 'obstacle',
    pattern: /\b(el\s+fin\s+de\s+semana|los\s+findes|los\s+sábado|los\s+domingo(?:s)?)\s+(?:no\s+(?:puedo|me\s+apetece|consigo)|me\s+cuesta)\b/i,
    template: 'El fin de semana le cuesta especialmente',
  },
];

/** Etiqueta humana + emoji por categoría (para UI y para el prompt del LLM). */
export const FACT_CATEGORY_META: Record<
  FactCategory,
  { label: string; emoji: string; color: string }
> = {
  work: { label: 'Trabajo', emoji: '💼', color: 'bg-sky-500/20 text-sky-300' },
  family: { label: 'Familia', emoji: '👨‍👩‍👧', color: 'bg-pink-500/20 text-pink-300' },
  health: { label: 'Salud', emoji: '🩹', color: 'bg-rose-500/20 text-rose-300' },
  travel: { label: 'Viajes', emoji: '✈️', color: 'bg-indigo-500/20 text-indigo-300' },
  time_pref: { label: 'Horario', emoji: '🕐', color: 'bg-amber-500/20 text-amber-300' },
  place: { label: 'Lugar', emoji: '📍', color: 'bg-emerald-500/20 text-emerald-300' },
  activity_pref: { label: 'Preferencia', emoji: '❤️', color: 'bg-fuchsia-500/20 text-fuchsia-300' },
  obstacle: { label: 'Obstáculo', emoji: '⚠️', color: 'bg-orange-500/20 text-orange-300' },
};

/** Texto que une los mensajes del usuario en una conversación. */
function joinUserTexts(messages: ChatMessage[] | undefined): string {
  if (!messages || messages.length === 0) return '';
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n')
    .trim();
}

/** Extrae los hechos de UNA conversación. No deduplica entre conversaciones. */
export function extractFactsFromConversation(conv: Conversation): ExtractedFact[] {
  const joined = joinUserTexts(conv.messages);
  if (!joined) return [];
  const date = (conv.endedAt ?? conv.startedAt ?? '').slice(0, 10);
  const facts: ExtractedFact[] = [];
  // Una regla puede matchear varias frases: emitimos UNA vez por conversación
  // y por categoría (así los tags no se repiten si el usuario menciona "trabajo"
  // 5 veces en la misma conversación).
  const seenCat = new Set<FactCategory>();
  for (const rule of RULES) {
    if (seenCat.has(rule.category)) continue;
    if (rule.pattern.test(joined)) {
      seenCat.add(rule.category);
      facts.push({ category: rule.category, text: rule.template, sourceDate: date });
    }
  }
  return facts;
}

/**
 * Junta los hechos de TODAS las conversaciones y deduplica por (categoría, texto).
 * Mantiene el orden: más reciente primero; si hay duplicados, conserva la fecha
 * más reciente (así sabemos "este hecho sigue vigente").
 */
export function collectAllFacts(conversations: Conversation[] | undefined): ExtractedFact[] {
  if (!conversations || conversations.length === 0) return [];
  const key = (f: ExtractedFact) => `${f.category}::${f.text}`;
  const byKey = new Map<string, ExtractedFact>();
  // Recorremos de más reciente a más antiguo para que sourceDate sea la última vez.
  for (let i = conversations.length - 1; i >= 0; i--) {
    const c = conversations[i];
    // Si la conversación ya trae facts pre-extraídos (formato nuevo) los usamos
    // directamente; si no, los extraemos al vuelo (backwards-compat).
    const facts = c.facts && c.facts.length > 0 ? c.facts : extractFactsFromConversation(c);
    for (const f of facts) {
      const k = key(f);
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, { ...f, sourceDate: f.sourceDate || c.endedAt.slice(0, 10) });
      } else if (f.sourceDate && (!prev.sourceDate || f.sourceDate > prev.sourceDate)) {
        byKey.set(k, f);
      }
    }
  }
  // Orden: más recientes primero; dentro del mismo día, orden estable por categoría.
  return [...byKey.values()].sort((a, b) => {
    if (b.sourceDate !== a.sourceDate) return b.sourceDate < a.sourceDate ? -1 : 1;
    return a.category.localeCompare(b.category);
  });
}

/** Resumen compacto para el SYSTEM_PROMPT del LLM (≤ ~600 chars). */
export function summarizeFacts(conversations: Conversation[] | undefined, maxFacts = 20): string {
  const facts = collectAllFacts(conversations).slice(0, maxFacts);
  if (facts.length === 0) return '';
  const lines = facts.map((f) => {
    const meta = FACT_CATEGORY_META[f.category];
    return `• [${meta.label}] ${f.text}`;
  });
  return `Lo que el coach retiene del usuario (extraído de conversaciones pasadas):\n${lines.join('\n')}`;
}
