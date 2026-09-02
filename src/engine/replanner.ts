/**
 * Interacción "NO PUEDO" → replanificación en tiempo real.
 *
 * El usuario explica libremente qué ha pasado. Clasificamos el motivo con
 * reglas deterministas y respondemos como un coach:
 * - Sin tiempo ahora pero con hueco luego → replanificar a ese hueco.
 * - Agotado → modo mantenimiento (nunca "has perdido tu racha").
 * - Fuera de casa → sustituir por alternativa viable o versión mínima.
 * - Sin motivación → versión mínima, sin moralina.
 */

import type {
  CoachReply,
  CoachState,
  DayPlan,
  DaySlot,
  PlanItem,
  ReasonCode,
} from './types.ts';
import { SLOT_DEFAULT_MIN, SLOT_LABEL, planDay } from './planner.ts';
import { levelDef, minimalLabel } from './levels.ts';
import { toHHMM } from './time.ts';

const REASON_KEYWORDS: Record<ReasonCode, string[]> = {
  work: ['reuni', 'trabaj', 'laburo', 'oficina', 'proyecto', 'deadline', 'cliente', 'jef'],
  no_time: ['no tengo tiempo', 'sin tiempo', 'tiempo', 'apretado', 'agenda', 'liad', 'no me da', 'mucho trabajo', 'ocupado'],
  tired: ['cansad', 'agotad', 'dormid', 'fatiga', 'sin energ', 'agotamiento', 'exhaust', 'no he dormido', 'poco sueño'],
  outside: ['fuera de casa', 'viaje', 'viajando', 'calle', 'aeropuerto', 'coche', 'no estoy en casa', 'desplazamiento', 'fuera'],
  family: ['hij', 'niñ', 'médico', 'doctor', 'familia', 'padres', 'recoger', 'llevar', 'hija'],
  illness: ['enferm', 'dolor', 'gripe', 'resfriad', 'fiebre', 'migraña', 'malestar', 'cabeza', 'estómago', 'vómit'],
  no_motivation: ['no me apetece', 'perez', 'motiv', 'no me sale', 'ganas', 'aburrid', 'no quiero'],
  distraction: ['móvil', 'distra', 'pierdo', 'internet', 'series', 'youtube', 'aplaz', 'redes', 'scroll'],
  other: [],
};

export function classifyReason(text: string): ReasonCode {
  const t = text.toLowerCase();
  for (const code of Object.keys(REASON_KEYWORDS) as ReasonCode[]) {
    if (code === 'other') continue;
    if (REASON_KEYWORDS[code].some((k) => t.includes(k))) return code;
  }
  return 'other';
}

export const REASON_LABEL: Record<ReasonCode, string> = {
  work: 'trabajo',
  no_time: 'falta de tiempo',
  tired: 'cansancio',
  outside: 'fuera de casa',
  family: 'compromiso familiar',
  illness: 'malestar físico',
  no_motivation: 'falta de motivación',
  distraction: 'distracción',
  other: 'otro motivo',
};

export interface CannotInput {
  state: CoachState;
  date: string;
  behaviorId: string;
  reasonText: string;
  nowMinutes: number;
}

function clonePlan(p: DayPlan): DayPlan {
  return { ...p, items: p.items.map((i) => ({ ...i })), updatedAt: new Date().toISOString() };
}

function ensurePlan(state: CoachState, date: string, behaviorId: string): DayPlan {
  const existing = state.plans[date];
  if (existing) return existing;
  const checkin =
    state.checkins.find((c) => c.date === date) ??
    ({
      date,
      energy: 6,
      mood: 6,
      focus: 6,
      stress: 4,
      timeAvailable: 'normal',
      intention: 'maintain',
    } as const);
  return planDay({ state, checkin });
}

export function handleCannot(input: CannotInput): CoachReply {
  const { state, date, behaviorId, reasonText, nowMinutes } = input;
  const code = classifyReason(reasonText);
  const plan = clonePlan(ensurePlan(state, date, behaviorId));
  const item = plan.items.find((i) => i.behaviorId === behaviorId && i.status === 'pending');
  const behavior = state.behaviors.find((b) => b.id === behaviorId);

  if (!item) {
    return {
      action: 'kept_minimal',
      message: 'Ese hábito ya está resuelto hoy. Si necesitas cambiar algo más, dime qué ha pasado.',
      plan,
      events: [],
    };
  }

  if (!behavior) {
    return {
      action: 'kept_minimal',
      message: 'No encuentro ese hábito. ¿Quieres contarme qué ha pasado?',
      plan,
      events: [],
    };
  }

  const def = levelDef(behavior)!;
  const laterMinutes = (SLOT_ORDER_MIN_PLUS(nowMinutes) as number[]) ?? [];

  switch (code) {
    case 'work':
    case 'no_time':
    case 'family':
    case 'distraction': {
      const target = laterMinutes[0];
      if (target !== undefined) {
        const slot = (Object.keys(SLOT_DEFAULT_MIN) as DaySlot[]).find(
          (s) => SLOT_DEFAULT_MIN[s] === target,
        )!;
        item.slot = slot;
        item.startMinute = target;
        return {
          action: 'rescheduled',
          message: `Ahora no tienes tiempo, pero tienes un hueco a las ${toHHMM(target)}. ¿Lo trasladamos a ${SLOT_LABEL[slot].toLowerCase()}?`,
          plan,
          events: [],
        };
      }
      item.version = 'minimal';
      item.minutes = def.minimal!;
      item.label = minimalLabel(behavior);
      return {
        action: 'reduced',
        message: `Perfecto. Reducimos hoy el objetivo a ${def.minimal} min para mantener el hábito sin agobios.`,
        plan,
        events: [],
      };
    }
    case 'tired':
    case 'illness': {
      item.status = 'excused';
      item.reasonCode = code;
      // El resto del día baja a mantenimiento (nunca un día = fracaso).
      for (const other of plan.items) {
        if (other.status !== 'pending') continue;
        const ob = state.behaviors.find((x) => x.id === other.behaviorId);
        const odef = ob ? levelDef(ob)! : undefined;
        other.version = 'minimal';
        if (odef) {
          other.minutes = odef.minimal!;
          other.label = minimalLabel(ob!);
        }
      }
      plan.mode = 'minimal';
      plan.coachNote =
        code === 'illness'
          ? 'Hoy no vamos a intentar progresar. Tu cuerpo está pidiendo pausa.'
          : 'Hoy no vamos a intentar progresar. Entramos en modo mantenimiento.';
      return {
        action: 'mode_change',
        message:
          code === 'illness'
            ? `Deja ${behavior.name} para mañana. Lo importante ahora es recuperarte.`
            : `Hoy no vamos a intentar progresar. Reducimos todo a la versión mínima y mantenemos la continuidad.`,
        plan,
        events: [],
      };
    }
    case 'outside': {
      // ¿Hay un sustituto del mismo objetivo en otra franja?
      const substitute = state.behaviors.find(
        (b) => b.enabled && b.goalId === behavior.goalId && b.id !== behaviorId,
      );
      if (substitute) {
        item.behaviorId = substitute.id;
        item.label = `${substitute.name} — ${def.minutes} min`;
        item.id = `${date}__${substitute.id}`;
        return {
          action: 'rescheduled',
          message: `Sin problema. Hoy hacemos ${substitute.name.toLowerCase()} en su lugar y mantenemos el objetivo.`,
          plan,
          events: [],
        };
      }
      item.version = 'minimal';
      item.minutes = def.minimal!;
      item.label = minimalLabel(behavior);
      return {
        action: 'reduced',
        message: `Haz solo la versión mínima (${def.minimal} min) cuando puedas. Con mantener el comportamiento basta hoy.`,
        plan,
        events: [],
      };
    }
    case 'no_motivation': {
      item.version = 'minimal';
      item.minutes = def.minimal!;
      item.label = minimalLabel(behavior);
      return {
        action: 'kept_minimal',
        message: `Haz solo la versión mínima: ${def.minimal} min. Si después no sale, lo dejamos. Mantener el comportamiento es lo que importa.`,
        plan,
        events: [],
      };
    }
    default: {
      item.version = 'minimal';
      item.minutes = def.minimal!;
      item.label = minimalLabel(behavior);
      return {
        action: 'reduced',
        message: `Entendido. Hoy bajamos ${behavior.name} a ${def.minimal} min para no perder el hábito.`,
        plan,
        events: [],
      };
    }
  }
}

/** Franjas horarias restantes del día con margen, de menor a mayor. */
function SLOT_ORDER_MIN_PLUS(nowMinutes: number): number[] {
  return Object.values(SLOT_DEFAULT_MIN)
    .filter((m) => m >= nowMinutes + 20)
    .sort((a, b) => a - b);
}
