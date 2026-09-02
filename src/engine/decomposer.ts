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
import { CATALOG, templateOf } from './levels.ts';
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
    area: 'reading',
    title: 'Leer más',
    keywords: ['leer', 'lectura', 'libro', 'libros', 'kindle', 'novela'],
    starters: ['read'],
    pipeline: [],
  },
  {
    area: 'learning',
    title: 'Aprender un idioma',
    keywords: ['inglés', 'ingles', 'francés', 'frances', 'alemán', 'italiano', 'portugués', 'idioma', 'aprender', 'estudiar', 'examen', 'curso', 'oposición'],
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
  for (const p of PRESETS) {
    if (p.keywords.some((k) => text.includes(k))) return p;
  }
  return {
    area: 'other',
    title: raw.replace(/^quiero\s+/i, '').replace(/^ser\s+/i, ''),
    keywords: [],
    starters: ['walk'],
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
    return {
      id: `${goalId}__${templateId}`,
      goalId,
      templateId,
      name: t.name,
      icon: t.icon,
      category: t.category,
      enabled: true,
      order: i,
      introducedAt: today,
      currentLevel: 1,
      preferredSlots: t.slots,
    };
  });

  const starterNames = behaviors.map((b) => b.name.toLowerCase());
  const pipelineNames = preset.pipeline.map((id) => templateOf(id)!.name);
  const first = starterNames[0] ?? 'el primer hábito';
  const message =
    preset.area === 'other'
      ? `Vamos a descomponer tu objetivo en pasos pequeños. Empezaremos con ${first}.`
      : `Objetivo: ${goal.title}. Empezaremos ${first === 'caminar' ? 'caminando' : 'con ' + first}. Cuando ese comportamiento esté consolidado introduciremos el siguiente.`;

  return { goal, behaviors, pipelineNames, message };
}

/** El siguiente comportamiento del pipeline que toca introducir. */
export function nextPipelineTemplate(goal: Goal): string | undefined {
  return goal.pipeline[0];
}

export type { BehaviorCategory };
