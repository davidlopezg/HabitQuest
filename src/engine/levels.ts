/**
 * Catálogo de comportamientos con sus curvas de progresión (Habit Installation).
 *
 * Cada plantilla define una curva de niveles. El nivel 1 es SIEMPRE ridículamente
 * fácil (acción mínima viable). El sistema NO usa la regla rígida de "21 días":
 * cada nivel tiene criterio de consolidación (ej: 5 éxitos en 7 intentos) y de
 * regresión.
 */

import type { Behavior, BehaviorCategory, BehaviorKind, BehaviorLevelDef, DaySlot } from './types.ts';

export interface BehaviorTemplate {
  id: string;
  name: string;
  icon: string;
  category: BehaviorCategory;
  kind?: BehaviorKind; // 'volume' por defecto
  /** Micro-pasos de arranque (romper la resistencia inicial al empezar). */
  startRitual?: string[];
  slots: DaySlot[];
  levels: BehaviorLevelDef[];
  purpose: string; // texto del coach al presentarlo
}

export const DEFAULT_NEED = 5;
export const DEFAULT_WINDOW = 7;
export const FIRST_NEED = 3;
export const FIRST_WINDOW = 5;

export const CATALOG: BehaviorTemplate[] = [
  {
    id: 'walk',
    name: 'Caminar',
    icon: '🚶',
    category: 'movement',
    slots: ['morning', 'midday'],
    purpose: 'Empezaremos caminando. Es la base que menos fricción tiene.',
    levels: [
      { level: 1, minutes: 5, label: 'Sal 5 min a la hora que elijas (solo importa salir).', need: 3, window: 5 },
      { level: 2, minutes: 8, label: 'Camina 8 min después de comer o al volver del trabajo.' },
      { level: 3, minutes: 10, label: 'Camina 10 min a ritmo tranquilo.' },
      { level: 4, minutes: 15, label: 'Camina 15 min al menos 4 días por semana.' },
      { level: 5, minutes: 20, label: '20 min, 5 días: ya cuenta como ejercicio aeróbico mínimo.' },
      { level: 6, minutes: 25, label: '25 min, añade algún desnivel o cuesta suave.' },
      { level: 7, minutes: 30, label: '30 min integrado en tu rutina semanal.' },
    ],
  },
  {
    id: 'strength',
    name: 'Fuerza',
    icon: '🏋️',
    category: 'strength',
    slots: ['afternoon', 'night'],
    purpose: 'Cuando caminar esté consolidado, añadiremos fuerza con poco volumen.',
    levels: [
      { level: 1, minutes: 5, label: '2 series fáciles con peso ligero o peso corporal.', need: 3, window: 5 },
      { level: 2, minutes: 10, label: '3 series aumentando ligeramente la carga.' },
      { level: 3, minutes: 15, label: '4 series completas, foco en técnica.' },
      { level: 4, minutes: 20, label: '5 series sin saltarte el calentamiento.' },
      { level: 5, minutes: 25, label: 'Sesión de 25 min; mide progresos cada 2 semanas.' },
      { level: 6, minutes: 30, label: '30 min mezclando básico y accesorios.' },
      { level: 7, minutes: 40, label: '40 min con un plan semanal de fuerza.' },
    ],
  },
  {
    id: 'mobility',
    name: 'Movilidad',
    icon: '🧘',
    category: 'mobility',
    slots: ['afternoon'],
    purpose: 'Movilidad articular para cuidar el cuerpo mientras avanzas.',
    levels: [
      { level: 1, minutes: 5, label: '5 min de movilidad articular básica (cuello, hombros).', need: 3, window: 5 },
      { level: 2, minutes: 10, label: '10 min añadiendo columna y caderas.' },
      { level: 3, minutes: 10, label: '10 min fortaleciendo core suave.' },
      { level: 4, minutes: 15, label: '15 min tras tu entreno principal.' },
      { level: 5, minutes: 15, label: '15 min yoga suave diario.' },
      { level: 6, minutes: 20, label: '20 min rutina de movilidad completa.' },
      { level: 7, minutes: 20, label: '20 min rutina diaria asentada.' },
    ],
  },
  {
    id: 'read',
    name: 'Lectura',
    icon: '📚',
    category: 'reading',
    slots: ['morning', 'night'],
    purpose: 'Empezaremos abriendo el libro. Nada más. El hábito se construye después.',
    levels: [
      { level: 1, minutes: 1, label: 'Abrir el libro o la app, sin más.', need: 3, window: 5 },
      { level: 2, minutes: 1, label: 'Leer 1 minuto, sin presión.' },
      { level: 3, minutes: 5, label: 'Leer 5 minutos completos.' },
      { level: 4, minutes: 10, label: 'Leer 10 min al día.' },
      { level: 5, minutes: 15, label: 'Leer 15 min con un apunte breve al final.' },
      { level: 6, minutes: 20, label: 'Leer 20 min; ya es hábito.' },
      { level: 7, minutes: 30, label: 'Leer 30 min diarios.' },
    ],
  },
  {
    id: 'study',
    name: 'Estudio',
    icon: '🎓',
    category: 'learning',
    slots: ['midday', 'night'],
    purpose: 'Empezaremos con 1 minuto diario en la app o el material. Sin más.',
    startRitual: ['Abrir la app o el material', 'Hacer 1 ejercicio o leer 1 frase', 'Cerrar el móvil durante esos minutos'],
    levels: [
      { level: 1, minutes: 1, label: 'Abrir la app o el material y hacer 1 ejercicio.', need: 3, window: 5 },
      { level: 2, minutes: 2, label: 'Hacer 2 minutos del temario.' },
      { level: 3, minutes: 5, label: 'Estudiar 5 min completos.' },
      { level: 4, minutes: 10, label: 'Estudiar 10 min con foco.' },
      { level: 5, minutes: 15, label: 'Estudiar 15 min y repasar al día siguiente.' },
      { level: 6, minutes: 20, label: 'Estudiar 20 min con rutina clara.' },
      { level: 7, minutes: 30, label: 'Estudiar 30 min 5 días por semana.' },
    ],
  },
  {
    id: 'mindfulness',
    name: 'Respiración / Meditación',
    icon: '🫁',
    category: 'mindfulness',
    slots: ['morning'],
    purpose: 'Dos minutos de respiración por la mañana para asentar el día.',
    levels: [
      { level: 1, minutes: 2, label: '2 min de respiración consciente.', need: 3, window: 5 },
      { level: 2, minutes: 3, label: '3 min notando el cuerpo.' },
      { level: 3, minutes: 5, label: '5 min sentado, sin móvil.' },
      { level: 4, minutes: 8, label: '8 min con foco en la respiración.' },
      { level: 5, minutes: 10, label: '10 min, ya es práctica.' },
      { level: 6, minutes: 12, label: '12 min con atención abierta.' },
      { level: 7, minutes: 15, label: '15 min diarios.' },
    ],
  },
  {
    id: 'sleep_routine',
    name: 'Rutina de sueño',
    icon: '🌙',
    category: 'sleep',
    slots: ['night'],
    purpose: 'Crearemos una rutina de desconexión para que el sueño llegue solo.',
    levels: [
      { level: 1, minutes: 5, label: '5 min sin pantallas antes de dormir.', need: 3, window: 5 },
      { level: 2, minutes: 10, label: '10 min: lectura ligera + apagar luces.' },
      { level: 3, minutes: 15, label: '15 min con ritual fijo cada noche.' },
      { level: 4, minutes: 15, label: '15 min añadiendo estiramientos suaves.' },
      { level: 5, minutes: 20, label: '20 min completas: móvil fuera del dormitorio.' },
      { level: 6, minutes: 20, label: '20 min cada noche: ya asentado.' },
      { level: 7, minutes: 30, label: '30 min con baño o meditación.' },
    ],
  },
  {
    id: 'tidy',
    name: 'Orden',
    icon: '🧹',
    category: 'order',
    slots: ['midday', 'afternoon'],
    purpose: 'Micro-sesiones de orden. Cinco minutos dejan huella.',
    levels: [
      { level: 1, minutes: 5, label: '5 min: una sola superficie.', need: 3, window: 5 },
      { level: 2, minutes: 10, label: '10 min: dos superficies.' },
      { level: 3, minutes: 15, label: '15 min: cada día algo.' },
      { level: 4, minutes: 15, label: '15 min con método (caja / regla / sitio fijo).' },
      { level: 5, minutes: 20, label: '20 min más centradas, sin dispersión.' },
      { level: 6, minutes: 20, label: '20 min con foco en cocina y baño.' },
      { level: 7, minutes: 25, label: '25 min en sesión semanal profunda.' },
    ],
  },
  {
    id: 'cook',
    name: 'Cocina saludable',
    icon: '🥗',
    category: 'nutrition',
    slots: ['midday'],
    purpose: 'Preparar una comida más saludable de lo habitual, sin dietas extremas.',
    levels: [
      { level: 1, minutes: 10, label: '10 min: incluir 1 verdura en la comida.', need: 3, window: 5 },
      { level: 2, minutes: 10, label: '10 min: cortar fruta por adelantado.' },
      { level: 3, minutes: 15, label: '15 min: 1 comida completa sana.' },
      { level: 4, minutes: 15, label: '15 min: planificación semanal.' },
      { level: 5, minutes: 20, label: '20 min: cocinar 3 veces/semana.' },
      { level: 6, minutes: 25, label: '25 min: dominar una receta base.' },
      { level: 7, minutes: 30, label: '30 min: sesión batch dominical.' },
    ],
  },
  {
    id: 'focus',
    name: 'Trabajo profundo',
    icon: '🧠',
    category: 'productivity',
    slots: ['morning', 'midday', 'afternoon'],
    purpose: 'Bloques de concentración con un único objetivo. Sin multitarea.',
    startRitual: ['Elegir UNA sola tarea', 'Apagar notificaciones / modo avión', 'Trabajar 2 minutos seguidos'],
    levels: [
      { level: 1, minutes: 10, label: '10 min de tarea única sin móvil.', need: 3, window: 5 },
      { level: 2, minutes: 15, label: '15 min con temporizador.' },
      { level: 3, minutes: 20, label: '20 min en flujo.' },
      { level: 4, minutes: 25, label: '25 min con descansos programados.' },
      { level: 5, minutes: 30, label: '30 min de bloques diarios.' },
      { level: 6, minutes: 40, label: '40 min en la mañana profunda.' },
      { level: 7, minutes: 50, label: '50 min bloques avanzados.' },
    ],
  },
  {
    id: 'write',
    name: 'Escribir',
    icon: '✍️',
    category: 'productivity',
    slots: ['morning', 'afternoon'],
    purpose: 'Escribir genera mucha resistencia: el truco es romper el hielo con micro-pasos.',
    startRitual: ['Abrir el documento', 'Escribir 1 frase sin borrarla', 'Continuar 2 minutos seguidos'],
    levels: [
      { level: 1, minutes: 5, label: 'Abrir el documento y escribir 1 frase.', need: 3, window: 5 },
      { level: 2, minutes: 10, label: '10 min escribiendo sin borrar.' },
      { level: 3, minutes: 15, label: '15 min con un objetivo diario.' },
      { level: 4, minutes: 20, label: '20 min con estructura clara.' },
      { level: 5, minutes: 25, label: '25 min diarios.' },
      { level: 6, minutes: 30, label: '30 min en flujo.' },
      { level: 7, minutes: 40, label: '40 min de escritura profunda.' },
    ],
  },
  {
    id: 'supplements',
    name: 'Vitaminas / suplementos',
    icon: '💊',
    category: 'nutrition',
    kind: 'binary',
    slots: ['morning'],
    purpose: 'Es un hábito de sí/no: se toma o no se toma, sin medir volumen.',
    levels: [{ level: 1, minutes: 1, label: 'Tomar vitaminas', need: 5, window: 7 }],
  },
];

export function templateOf(id: string): BehaviorTemplate | undefined {
  return CATALOG.find((t) => t.id === id);
}

/**
 * Estrategia recomendada por el coach para cada tipo de hábito.
 * El coach solo sugiere la SEÑAL (hazlo obvio) — el resto del bucle ya lo cubrimos
 * nosotros: micro-pasos y UX (anhelo/respuesta) y XP/estrellas/consolidación (recompensa).
 */
export const STRATEGY_TIPS: Partial<
  Record<string, { key: 'cue' | 'craving' | 'response' | 'reward'; text: string }>
> = {
  walk: { key: 'cue', text: 'Deja las zapatillas a la vista: señal para salir en cuanto te levantes.' },
  strength: { key: 'cue', text: 'Deja el material de pesas o la mochila preparada y a la vista la noche anterior.' },
  mobility: { key: 'cue', text: 'Pon la esterilla o el vídeo de estiramientos a la vista.' },
  read: { key: 'cue', text: 'Deja el libro abierto encima de la mesa o en la mesilla de noche.' },
  study: { key: 'cue', text: 'Abre la app o el material y déjalos abiertos en la pantalla de inicio.' },
  mindfulness: { key: 'cue', text: 'Justo después de despertar, antes de tocar el móvil.' },
  sleep_routine: { key: 'cue', text: 'Carga el móvil fuera del dormitorio (fuera de vista).' },
  tidy: { key: 'cue', text: 'Pon un temporizador a la vista (encimera o nota en el móvil).' },
  cook: { key: 'cue', text: 'Pon las recetas o el menú de la semana a la vista en la nevera.' },
  focus: { key: 'cue', text: 'Anota UNA sola tarea en un pósit y déjalo a la vista del escritorio.' },
  write: { key: 'cue', text: 'Deja el documento abierto con el cursor en la primera frase.' },
  supplements: { key: 'cue', text: 'Pon el bote junto al cepillo de dientes: no podrás olvidarlo.' },
};

/** Niveles resueltos de un comportamiento (plantilla o curva personalizada). */
export function resolveLevels(b: Behavior): BehaviorLevelDef[] {
  const src = b.customLevels && b.customLevels.length > 0 ? b.customLevels : templateOf(b.templateId)?.levels ?? [];
  const need = (l: number, x?: number) => x ?? (l === 1 ? FIRST_NEED : DEFAULT_NEED);
  const window = (l: number, x?: number) => x ?? (l === 1 ? FIRST_WINDOW : DEFAULT_WINDOW);
  return src.map((lv) => ({
    level: lv.level,
    minutes: lv.minutes,
    label: lv.label,
    minimal: lv.minimal ?? Math.max(1, Math.round(lv.minutes * 0.2)),
    need: need(lv.level, lv.need),
    window: window(lv.level, lv.window),
  }));
}

export function levelDef(b: Behavior, lv: number = b.currentLevel): BehaviorLevelDef | undefined {
  const defs = resolveLevels(b);
  return defs[lv - 1];
}

/** Texto del objetivo completo del nivel ("Lectura — 10 min"). */
export function levelLabel(b: Behavior, lv: number = b.currentLevel): string {
  const def = levelDef(b, lv);
  if (!def) return b.name;
  return def.label ?? `${b.name} — ${def.minutes} min`;
}

/** Texto del objetivo mínimo de mantenimiento. */
export function minimalLabel(b: Behavior, lv: number = b.currentLevel): string {
  const def = levelDef(b, lv);
  const mins = def ? def.minimal ?? 1 : 1;
  return `${b.name} — ${mins} min (mínimo)`;
}

export function maxLevel(b: Behavior): number {
  return resolveLevels(b).length;
}
