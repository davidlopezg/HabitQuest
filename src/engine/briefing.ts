/**
 * Briefing matutino: qué se hizo ayer y qué toca hoy.
 *
 * Determinista y puro: el motor calcula los hechos (ayer, rachas en juego,
 * acciones de hoy) y redacta un texto propio. La IA opcional solo puede
 * reformular ese texto (ver `src/services/ai/brief.ts`): nunca cambia los
 * hechos, solo la prosa.
 *
 * Tono: la app tiene una regla ("un mal día nunca se un fracaso"). Aquí no se
 * culpa ni se regaña: se cuenta lo que pasó y se apunta a lo que toca.
 */

import type { CoachState } from './types.ts';
import { addDays, toHHMM } from './time.ts';
import { daySummary, streakDays } from './history.ts';
import { scheduledOn } from './schedule.ts';
import { levelDef } from './levels.ts';
import { SLOT_DEFAULT_MIN } from './planner.ts';
import { REASON_LABEL } from './replanner.ts';

/** Una acción de hoy: un hábito por hacer. */
export interface BriefAction {
  behaviorId: string;
  name: string;
  icon: string;
  minutes: number; // versión completa
  minimalMinutes: number; // versión mínima de mantenimiento
  hour: string; // "09:00"
}

/** Algo que ayer no se completó (con el motivo, si lo hubo). */
export interface BriefMissed {
  name: string;
  icon: string;
  reason?: string;
}

/** Una racha que está en juego hoy. */
export interface BriefStreak {
  name: string;
  icon: string;
  days: number;
}

/** El briefing de un día. */
export interface MorningBrief {
  date: string; // hoy (YYYY-MM-DD)
  yesterday: string;
  done: number; // hábitos completados ayer
  total: number; // hábitos registrados ayer
  missed: BriefMissed[];
  streaks: BriefStreak[];
  actions: BriefAction[];
  message: string; // texto determinista
}

/** Mínimo de días para que una racha merezca mención. */
const STREAK_WORTH = 3;
/** Máximo de acciones que se mencionan en el briefing. */
const MAX_ACTIONS = 3;

/**
 * Briefing matutino del día `today`.
 * `null` si el usuario no tiene historial (usuario nuevo): sin datos no hay
 * nada que evaluar, y una evaluación inventada sería peor que ninguna.
 */
export function morningBrief(state: CoachState, today: string): MorningBrief | null {
  if (state.logs.length === 0) return null;

  const yesterday = addDays(today, -1);
  const summary = daySummary(state.logs, state.behaviors, state.goals, yesterday);

  // Lo que quedó pendiente ayer (excusado o no hecho), con su motivo.
  const missed: BriefMissed[] = summary.items
    .filter((i) => i.kind === 'miss' || i.kind === 'excused')
    .map((i) => ({
      name: i.name,
      icon: i.icon,
      reason: i.reasonCode ? REASON_LABEL[i.reasonCode] : undefined,
    }));

  // Rachas en juego: hábitos con 3+ días seguidos hasta ayer.
  const streaks: BriefStreak[] = [];
  for (const b of state.behaviors) {
    if (!b.enabled) continue;
    const days = streakDays(state.logs, b, yesterday);
    if (days >= STREAK_WORTH) streaks.push({ name: b.name, icon: b.icon, days });
  }
  streaks.sort((a, b) => b.days - a.days);

  // Lo primero de hoy: hábitos programados para hoy, sin hacer, por hora.
  const activeGoals = new Set(
    state.goals.filter((g) => g.status === 'active').map((g) => g.id),
  );
  const doneToday = new Set(
    state.logs.filter((l) => l.date === today).map((l) => l.behaviorId),
  );
  const actions: BriefAction[] = [];
  for (const b of state.behaviors) {
    if (!b.enabled || !activeGoals.has(b.goalId)) continue;
    if (doneToday.has(b.id)) continue;
    if (!scheduledOn(state.logs, b, today)) continue;
    const def = levelDef(b);
    const minutes = def?.minutes ?? 10;
    actions.push({
      behaviorId: b.id,
      name: b.name,
      icon: b.icon,
      minutes,
      minimalMinutes: def?.minimal ?? Math.max(1, Math.round(minutes / 2)),
      hour: toHHMM(b.startMinute ?? SLOT_DEFAULT_MIN[b.preferredSlots[0] ?? 'morning']),
    });
  }
  actions.sort((a, b) => a.hour.localeCompare(b.hour) || a.name.localeCompare(b.name, 'es'));
  const top = actions.slice(0, MAX_ACTIONS);

  const brief: MorningBrief = {
    date: today,
    yesterday,
    done: summary.done,
    total: summary.total,
    missed,
    streaks,
    actions: top,
    message: '',
  };
  brief.message = buildMessage(brief);
  return brief;
}

/** Redacta el texto del briefing (determinista, sin IA). */
function buildMessage(brief: MorningBrief): string {
  const lines: string[] = [];

  // 1 · Ayer.
  if (brief.total === 0) {
    lines.push(
      'Ayer no quedó nada registrado. Si fue un día difícil, lo bajamos a la versión mínima y seguimos.',
    );
  } else if (brief.done === brief.total) {
    lines.push(`Ayer completaste los ${brief.total} hábitos del día. Buen día.`);
  } else {
    const m = brief.missed[0];
    lines.push(
      m
        ? `Ayer hiciste ${brief.done} de ${brief.total} hábitos. Lo que quedó pendiente: ${m.icon} ${m.name}${m.reason ? ` (${m.reason})` : ''}.`
        : `Ayer hiciste ${brief.done} de ${brief.total} hábitos.`,
    );
  }

  // 2 · Lo que está en juego.
  if (brief.streaks.length > 0) {
    const s = brief.streaks[0];
    lines.push(
      `Vas por ${s.days} días seguidos con ${s.icon} ${s.name}: hoy lo mantienes.`,
    );
  }

  // 3 · Lo primero de hoy.
  if (brief.actions.length > 0) {
    const a = brief.actions[0];
    const minimal =
      a.minimalMinutes < a.minutes ? `, o ${a.minimalMinutes} min si vas con poca energía` : '';
    const rest = brief.actions.slice(1);
    const after = rest.length
      ? ` Después: ${rest.map((x) => `${x.icon} ${x.name}`).join(', ')}.`
      : '';
    lines.push(`Lo primero de hoy: ${a.icon} ${a.name} (${a.minutes} min${minimal}).${after}`);
  } else {
    lines.push('Hoy no tienes hábitos programados: si quieres, dime y ajustamos la agenda.');
  }

  // 4 · Salida (conecta con el "NO PUEDO" del plan).
  lines.push('Si hoy no puedes con todo, dímelo y lo bajamos a la versión mínima.');

  return lines.join('\n');
}

/**
 * Los hechos del briefing en texto plano: es lo que se le pasa al LLM para
 * que lo reformule. Solo hechos, sin interpretación.
 */
export function briefFacts(brief: MorningBrief): string {
  const lines: string[] = [];
  lines.push(`Fecha: hoy es ${brief.date}; ayer fue ${brief.yesterday}.`);
  lines.push(
    brief.total > 0
      ? `Ayer: ${brief.done} de ${brief.total} hábitos completados.`
      : 'Ayer: no hay registros de hábitos.',
  );
  for (const m of brief.missed) {
    lines.push(`Ayer quedó pendiente: ${m.name}${m.reason ? ` (motivo: ${m.reason})` : ''}.`);
  }
  for (const s of brief.streaks) {
    lines.push(`Racha en juego: ${s.name}, ${s.days} días seguidos.`);
  }
  for (const a of brief.actions) {
    lines.push(
      `Hoy: ${a.name} — ${a.minutes} min (versión mínima ${a.minimalMinutes} min), alrededor de las ${a.hour}.`,
    );
  }
  return lines.join('\n');
}
