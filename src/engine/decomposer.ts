/**
 * Descomposición automática de objetivos (sin LLM por defecto).
 *
 * "Quiero ponerme en forma" → Objetivo + Área + Comportamientos.
 * Principio clave: NO introducir todo a la vez. Se materializan 1–2
 * comportamientos prioritarios; el resto queda en `pipeline` esperando a que
 * el primero se consolide (evita la sobrecarga).
 *
 * La capa LLM (ver arquitectura) puede enriquecer este resultado, pero NUNCA
 * reemplaza las reglas deterministas de aquí.
 */

import type { Behavior, BehaviorCategory, Goal } from './types.ts';
import { CATALOG, STRATEGY_TIPS, templateOf } from './levels.ts';
import { todayKey } from './time.ts';

export interface DecomposedOutcome {
  goal: Goal;
  behaviors: Behavior[]; // materializados ahora (1–2)
  pipelineNames: string[]; // nombres de lo que llegará después
  message: string; // mensaje del coach al usuario
}

interface Preset {
  area: string;
  title: string;
  keywords: string[];
  starters: string[]; // templateIds iniciales
  pipeline: string[]; // templateIds posteriores
}

const PRESETS: Preset[] = [
  {
    area: 'fitness',
    title: 'Ponerse en forma',
    keywords: ['forma', 'ejercicio', 'gimnasio', 'gym', 'músculo', 'musculación', 'deporte', 'fitness', 'cardio', 'pesas', 'entrenamiento', 'tonificar', 'caminar'],
    starters: ['walk'],
    pipeline: ['strength', 'mobility'],
  },
  {
    area: 'weight',
    title: 'Adelgazar',
    keywords: ['adelgazar', 'adelgaza', 'perder peso', 'bajar peso', 'bajar de peso', 'dieta', 'kilos'],
    starters: ['weight'],
    pipeline: ['walk', 'cook'],
  },
  {
    area: 'reading',
    title: 'Leer más',
    keywords: ['leer', 'lectura', 'libro', 'libros', 'kindle', 'novela'],
    starters: ['read'],
    pipeline: [],
  },
  {
    area: 'learning',
    title: 'Aprender un idioma',
    // Solo idiomas específicos: evita que "Quiero aprender a tocar la guitarra"
    // se clasifique como idioma.
    keywords: ['inglés', 'ingles', 'francés', 'frances', 'alemán', 'italiano', 'portugués', 'chino', 'japonés', 'coreano', 'idioma', 'oposición', 'opositar'],
    starters: ['study'],
    pipeline: ['read'],
  },
  {
    area: 'sleep',
    title: 'Dormir mejor',
    keywords: ['dormir', 'sueño', 'dormirme', 'acostar', 'descanso', 'insomnio', 'madrugar'],
    starters: ['sleep_routine'],
    pipeline: ['mindfulness'],
  },
  {
    area: 'mindfulness',
    title: 'Reducir el estrés',
    keywords: ['estrés', 'estres', 'ansiedad', 'calma', 'meditar', 'meditación', 'mindfulness', 'relajar', 'tranquil', 'respirar', 'paz'],
    starters: ['mindfulness'],
    pipeline: ['walk'],
  },
  {
    area: 'nutrition',
    title: 'Comer mejor',
    keywords: ['alimentación', 'comer', 'dieta', 'nutrición', 'saludable', 'cocinar', 'verdura', 'azúcar', 'agua', 'ultraprocesado'],
    starters: ['cook'],
    pipeline: ['walk'],
  },
  {
    area: 'order',
    title: 'Ser más ordenado',
    keywords: ['ordenado', 'orden', 'limpieza', 'desorden', 'organizar', 'casa', 'escritorio', 'minimalista'],
    starters: ['tidy'],
    pipeline: ['mindfulness'],
  },
  {
    area: 'productivity',
    title: 'Ser más productivo',
    keywords: ['productivo', 'productividad', 'concentración', 'procrastinar', 'foco', 'enfocar', 'trabajo', 'estudiar mejor'],
    starters: ['focus'],
    pipeline: ['walk'],
  },
];

const LANGUAGE_WORDS = ['inglés', 'ingles', 'francés', 'frances', 'alemán', 'italiano', 'portugués', 'chino', 'japonés', 'coreano'];

function findPreset(raw: string): Preset {
  const text = raw.toLowerCase();
  // Primero detectar objetivos de tipo "dejar de / ser menos / reducir"
  // (deben tener prioridad sobre los presets por keywords para que un objetivo
  // como "Quiero ser menos desordenado" use el plan reduce, no el de orden).
  if (/^quiero\s+(dejar\s+de\s+|ser\s+menos\s+|no\s+|reducir\s+)/i.test(text)) {
    return {
      area: 'reduce',
      title: raw.replace(/^quiero\s+/i, '').replace(/^dejar\s+de\s+/i, 'Dejar de ').replace(/^ser\s+/i, ''),
      keywords: [],
      starters: ['reduce'],
      pipeline: [],
    };
  }
  for (const p of PRESETS) {
    if (p.keywords.some((k) => text.includes(k))) return p;
  }
  return {
    area: 'other',
    title: raw.replace(/^quiero\s+/i, '').replace(/^ser\s+/i, ''),
    keywords: [],
    starters: ['custom'],
    pipeline: [],
  };
}

function canonicalTitle(raw: string, preset: Preset): string {
  const text = raw.toLowerCase();
  if (preset.area === 'learning') {
    const lang = LANGUAGE_WORDS.find((w) => text.includes(w));
    if (lang) return `Aprender ${lang.charAt(0).toUpperCase() + lang.slice(1)}`;
  }
  return preset.title;
}

/** Convierte el objetivo del usuario en Goal + comportamientos iniciales. */
export function decompose(raw: string, today: string = todayKey()): DecomposedOutcome {
  const preset = findPreset(raw);
  const goalId = `goal_${today.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 7)}`;
  const goal: Goal = {
    id: goalId,
    raw: raw.trim(),
    title: canonicalTitle(raw, preset),
    area: preset.area,
    createdAt: today,
    status: 'active',
    pipeline: preset.pipeline,
  };

  const behaviors: Behavior[] = preset.starters.map((templateId, i) => {
    const t = templateOf(templateId)!;
    const text = raw.toLowerCase();
    // Plan específico de idiomas: el comportamiento se llama igual que el idioma
    // (ej: "Quiero aprender inglés" → hábito "Estudiar inglés").
    const isLearningLanguage = preset.area === 'learning' && LANGUAGE_WORDS.some((w) => text.includes(w));
    const langWord = LANGUAGE_WORDS.find((w) => text.includes(w));
    // Nombre del hábito: usar el título del objetivo si es 'other' o 'reduce'
    // ("Quiero aprender a tocar la guitarra" → "Aprender a tocar la guitarra").
    const isOtherLike = preset.area === 'other' || preset.area === 'reduce';
    const otherName = (raw: string) => {
      let s = raw.trim()
        .replace(/^quiero\s+/i, '')
        .replace(/^ser\s+/i, '')
        .replace(/^dejar\s+de\s+/i, 'Dejar de ')
        .replace(/^aprender\s+a\s+/i, 'Aprender a ');
      s = s.charAt(0).toUpperCase() + s.slice(1);
      return s;
    };
    const name = isLearningLanguage && langWord
      ? `Estudiar ${langWord.charAt(0).toUpperCase() + langWord.slice(1)}`
      : isOtherLike
        ? otherName(raw)
        : t.name;
    return {
      id: `${goalId}__${templateId}`,
      goalId,
      templateId,
      name,
      icon: isLearningLanguage && langWord ? '📱' : t.icon,
      category: t.category,
      enabled: true,
      order: i,
      introducedAt: today,
      currentLevel: 1,
      preferredSlots: t.slots,
      kind: t.kind,
      startRitual: t.startRitual,
      strategies: STRATEGY_TIPS[t.id] ? { [STRATEGY_TIPS[t.id]!.key]: STRATEGY_TIPS[t.id]!.text } : undefined,
    };
  });

  const starterNames = behaviors.map((b) => b.name.toLowerCase());
  const pipelineNames = preset.pipeline.map((id) => templateOf(id)!.name);
  const first = starterNames[0] ?? 'el primer hábito';
  let message =
    preset.area === 'other'
      ? `Nuevo objetivo: ${goal.title}. Empezaremos solo 1 minuto para romper la inercia, sin agobios. Si consolidas este primer micro-paso, subiremos a 5 min y luego a 15 min.`
      : preset.area === 'reduce'
        ? `Objetivo: ${goal.title}. El truco es tomar conciencia primero: cada vez que caigas, apúntalo sin juzgarte. Después, sustitúyelo por una alternativa de 1 min. Si reduces las caídas a la mitad en 2 semanas, ya vas ganando.`
        : `Objetivo: ${goal.title}. Empezaremos ${first === 'caminar' ? 'caminando' : 'con ' + first}. Cuando ese comportamiento esté consolidado introduciremos el siguiente.`;
  // Primer plan concreto para idiomas (estilo Duolingo): una semana ridículamente fácil.
  if (preset.area === 'learning' && LANGUAGE_WORDS.some((w) => raw.toLowerCase().includes(w))) {
    message +=
      '\n\nPlan de la primera semana: solo abre la app o el material y completa 1 ejercicio al día. ' +
      'Sin más. Cuando se consolide subiremos a 5 minutos y así hasta llegar a 30.';
  }

  return { goal, behaviors, pipelineNames, message };
}

/** El siguiente comportamiento del pipeline que toca introducir. */
export function nextPipelineTemplate(goal: Goal): string | undefined {
  return goal.pipeline[0];
}

export type { BehaviorCategory };
