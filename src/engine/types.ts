/**
 * Modelo de dominio del "coach adaptativo" (HabitQuest v2).
 *
 * Filosofía: "Nunca abandones el objetivo. Adapta el camino."
 * El objetivo es estable; cambian duración, intensidad, momento y dificultad.
 *
 * Este módulo es 100 % puro (sin React, sin DOM) para poder testearlo en Node.
 */

export type DaySlot = 'morning' | 'midday' | 'afternoon' | 'night';

export type DayIntention = 'advance' | 'maintain' | 'recover';
export type TimeAvailable = 'little' | 'normal' | 'plenty';

/** Check-in matutino ultrarrápido (máx. 20–30 s). */
export interface DayCheckIn {
  date: string; // YYYY-MM-DD
  energy: number; // 1..10
  mood: number; // 1..10
  focus: number; // 1..10
  stress: number; // 1..10
  timeAvailable: TimeAvailable;
  intention: DayIntention;
  submittedAt?: string; // ISO
}

/** Modo del día que decide la dificultad del plan. */
export type DayMode = 'recovery' | 'minimal' | 'normal' | 'progress';

export type BehaviorCategory =
  | 'movement'
  | 'strength'
  | 'mobility'
  | 'reading'
  | 'learning'
  | 'mindfulness'
  | 'sleep'
  | 'nutrition'
  | 'order'
  | 'productivity'
  | 'other';

/** Un escalón de un comportamiento (Habit Installation). */
export interface BehaviorLevelDef {
  level: number; // 1-based
  minutes: number; // objetivo completo en minutos
  label?: string; // texto si no es genérico ("Abrir el libro")
  minimal?: number; // versión mínima de mantenimiento en minutos
  need?: number; // éxitos completos necesarios para consolidar (default 5)
  window?: number; // ventana de intentos (default 7)
}

/** Comportamiento concreto derivado de un objetivo (ej: "Caminar"). */
export interface Behavior {
  id: string;
  goalId: string;
  templateId: string; // plantilla del catálogo que define su curva
  name: string;
  icon: string;
  category: BehaviorCategory;
  enabled: boolean; // true = ya introducido en el plan diario
  order: number; // orden de introducción
  introducedAt: string; // fecha de alta (YYYY-MM-DD)
  currentLevel: number; // nivel actual (1-based)
  preferredSlots: DaySlot[];
  /** Hora exacta preferida (minutos desde medianoche, ej: 540 = 09:00). Si no está definida, el plan usa la hora por defecto de la franja. */
  startMinute?: number;
  customLevels?: BehaviorLevelDef[]; // curva personalizada (opcional)
}

/** Objetivo del usuario en lenguaje natural ya estructurado. */
export interface Goal {
  id: string;
  raw: string; // "Quiero ponerme en forma"
  title: string; // "Ponerse en forma"
  area: string; // área canónica
  createdAt: string;
  status: 'active' | 'paused' | 'achieved';
  pipeline: string[]; // templateIds pendientes de introducir (¡no saturar!)
}

export type ReasonCode =
  | 'work'
  | 'tired'
  | 'no_time'
  | 'outside'
  | 'family'
  | 'illness'
  | 'no_motivation'
  | 'distraction'
  | 'postpone' // elección explícita: dejarlo para mañana
  | 'other';

export type LogKind = 'full' | 'minimal' | 'excused' | 'miss';

/** Registro diario por comportamiento. */
export interface BehaviorLogEntry {
  date: string;
  behaviorId: string;
  kind: LogKind;
  minutes: number; // minutos reales (0 si no se hizo)
  dayMode: DayMode; // modo del plan ese día
  reasonCode?: ReasonCode;
  resilience?: boolean; // se completó pese a condiciones adversas
  plannedMinutes: number; // objetivo planificado ese día
}

export type PlanPriority = 'essential' | 'important' | 'optional';
export type PlanItemStatus =
  | 'pending'
  | 'done_full'
  | 'done_minimal'
  | 'skipped'
  | 'rescheduled'
  | 'excused';

/** Elemento del plan diario. */
export interface PlanItem {
  id: string;
  behaviorId: string;
  goalId?: string;
  slot: DaySlot;
  startMinute: number; // minutos desde medianoche
  label: string; // "Lectura — 10 min"
  version: 'full' | 'minimal';
  minutes: number; // minutos planificados (full o mínimo)
  priority: PlanPriority;
  status: PlanItemStatus;
  reasonCode?: ReasonCode;
}

export interface DayPlan {
  date: string;
  mode: DayMode;
  headline: string;
  items: PlanItem[];
  coachNote?: string;
  updatedAt: string; // ISO
}

export type ProgressionAction = 'advance' | 'maintain' | 'reduce' | 'not_enough_data';

export interface LevelRecommendation {
  behaviorId: string;
  action: ProgressionAction;
  fromLevel: number;
  toLevel: number; // = fromLevel si no cambia
  fromMinutes: number;
  toMinutes: number;
  reason: string;
  message: string; // mensaje de coach (español, sin frases vacías)
}

export interface CoachCounters {
  resilienceWins: number;
  totalDone: number;
  totalMinimal: number;
  replans: number;
  consolidated: string[]; // behaviorIds consolidados
  xp: number; // XP acumulada del coach (para nivel/panel HOY)
}

/** Memoria del usuario que la app construye con el tiempo. */
export interface UserMemory {
  reasonCounts: Partial<Record<ReasonCode, number>>;
  weakWeekdays: string[]; // claves '3' (0=domingo) detectadas como débiles
  lastInsights: string[];
  bestSlotByBehavior: Record<string, DaySlot>;
}

/** Estado completo y persistible del motor adaptativo. */
export interface CoachState {
  version: number;
  goals: Goal[];
  behaviors: Behavior[];
  logs: BehaviorLogEntry[];
  checkins: DayCheckIn[];
  plans: Record<string, DayPlan>; // por fecha
  counters: CoachCounters;
  memory: UserMemory;
  chat: ChatMessage[]; // conversación con el coach (se conserva en memoria de usuario)
}

/** Eventos de gamificación generados por el motor (para integrar con XP actual). */
export interface CoachEvent {
  type: 'done' | 'resilience' | 'consolidated' | 'consistency_week' | 'replan';
  xp: number;
  gems: number;
  icon: string;
  title: string;
  message: string;
}

export type CoachInsightType = 'schedule_change' | 'reason_pattern' | 'sleep_relation';

export interface CoachInsight {
  type: CoachInsightType;
  severity: 'info' | 'suggestion';
  message: string;
  data?: Record<string, unknown>;
}

export interface CoachReply {
  action: 'rescheduled' | 'reduced' | 'excused' | 'kept_minimal' | 'mode_change';
  message: string;
  plan: DayPlan;
  events: CoachEvent[];
}

/** Mensaje de la conversación con el coach. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string; // ISO
}
