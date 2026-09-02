/**
 * Coach de IA (proveedor: MiniMax, endpoint compatible con OpenAI).
 *
 * Regla de oro (ver docs/COACH-ADAPTATIVO.md): el LLM NUNCA decide por sí solo
 * subir/bajar niveles ni genera planes imposibles. El motor determinista
 * (src/engine) es la fuente de verdad; el LLM conversa con contexto real del
 * usuario. Sin API key, el coach responde con reglas (offline).
 */

import type { CoachState } from '../../engine/index.ts';
import { analyzePatterns, classifyReason } from '../../engine/index.ts';
import { adherence, reasonDistribution } from '../../engine/index.ts';
import { levelDef } from '../../engine/index.ts';
import { todayKey, toHHMM, WEEKDAY_ES, weekdayOf } from '../../engine/index.ts';
import type { AIConfig } from './config.ts';
import { getAIConfig } from './config.ts';

const SLOT_ES: Record<string, string> = { morning: 'mañana', midday: 'mediodía', afternoon: 'tarde', night: 'noche' };

/** Prompt de sistema: principios del coach (§25 del prompt maestro). */
export const SYSTEM_PROMPT = `Eres el coach personal de hábitos de HabitQuest, integrado en una app de hábitos adaptativos.

Principios inquebrantables:
- Sé práctico, directo y empático. Nada de moralina ni frases vacías tipo "¡tú puedes!". Si no aporta datos o una acción, no lo digas.
- El objetivo del usuario nunca se abandona: se adapta el camino (duración, intensidad, momento, dificultad).
- Un día malo NUNCA es un fracaso. Si el usuario no puede hacer algo, guíale a: (1) replanificar a otro hueco, (2) hacer la versión mínima, (3) entrar en modo mantenimiento.
- Cuando hables de datos usa lenguaje cauto: "parece existir una relación", nunca afirmes causalidad.
- Propón SIEMPRE una única siguiente acción concreta y accionable.
- Responde en español, breve (máx. 4 frases o viñetas). No repitas lo que el usuario ya sabe de su plan.
- Si necesitas replanificar el día real del usuario, indícale que use el botón NO PUEDO del plan y qué motivo elegir.`;

export interface ChatCtx {
  state: CoachState;
  date: string;
}

/** Resumen del estado del usuario que el LLM recibe como contexto. */
export function summarizeState(state: CoachState, date: string): string {
  const lines: string[] = [];
  const goal = state.goals[0];
  if (!goal) {
    lines.push('El usuario aún no tiene objetivo. Debe empezar escribiendo qué quiere conseguir.');
    return lines.join('\n');
  }
  lines.push(`Objetivo: "${goal.title}" (dicho por el usuario: "${goal.raw}"). Área: ${goal.area}.`);
  if (goal.pipeline.length > 0) {
    lines.push(`Comportamientos en espera (no introducir aún): ${goal.pipeline.join(', ')}.`);
  }
  const bList = state.behaviors.filter((b) => b.enabled && b.goalId === goal.id);
  for (const b of bList) {
    const def = levelDef(b);
    const a7 = adherence(state.logs, b, date, 7);
    lines.push(
      `Hábito "${b.name}" (${b.icon}): nivel ${b.currentLevel}, objetivo ${def?.minutes ?? '?'} min, ` +
        `versión mínima ${def?.minimal ?? 1} min. Adherencia 7d: ${Math.round(a7.rate * 100)}%. ` +
        `Consolidado: ${state.counters.consolidated.includes(b.id) ? 'sí' : 'no'}.`,
    );
  }
  const plan = state.plans[date];
  const weekday = WEEKDAY_ES[weekdayOf(date)];
  if (plan) {
    lines.push(`Hoy (${weekday}): modo ${plan.mode}.`);
    for (const it of plan.items) {
      lines.push(
        `- ${it.label} a las ${toHHMM(it.startMinute)} (${SLOT_ES[it.slot] ?? it.slot}) [${it.status}]`,
      );
    }
  } else {
    lines.push(`Hoy (${weekday}): sin plan aún (pendiente de check-in).`);
  }
  const reasons = reasonDistribution(state.logs, date, 14);
  const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  if (topReason) lines.push(`Motivo más frecuente de "no puedo" (últimos 14 días): ${topReason[0]} (${topReason[1]} veces).`);
  if (state.counters.resilienceWins > 0) lines.push(`Victorias de resiliencia totales: ${state.counters.resilienceWins}.`);
  lines.push(`XP total del coach: ${state.counters.xp ?? 0}.`);
  return lines.join('\n');
}

/** ¿El mensaje indica que no puede hacer algo hoy? (para respuesta determinista). */
const CANNOT_HINTS = [
  'no puedo', 'no tengo tiempo', 'no me apetece', 'estoy agotad', 'no he podido',
  'me ha surgido', 'no voy a poder', 'me es imposible', 'no me da', 'estoy muy cansado',
  'estoy enferm', 'tengo que llevar', 'no estoy en casa', 'fuera de casa', 'estoy de viaje',
];
export function looksLikeCannot(text: string): boolean {
  const t = text.toLowerCase();
  return CANNOT_HINTS.some((h) => t.includes(h));
}

/** Respuesta offline determinista cuando no hay API key o falla la red. */
export function offlineCoachReply(state: CoachState, text: string): string {
  const goal = state.goals[0];
  const b = state.behaviors.find((x) => x.enabled && x.goalId === goal?.id);
  const def = b ? levelDef(b) : undefined;
  const name = b ? b.name.toLowerCase() : 'el hábito';
  const minimal = def?.minimal ?? 2;
  const t = text.toLowerCase();

  if (t.includes('aprendid') || t.includes('conoces') || t.includes('qué sabes')) {
    return learnedInsights(state);
  }
  if (t.includes('por qué') && (t.includes('fall') || t.includes('fracas') || t.includes('no consigo'))) {
    const a = b ? adherence(state.logs, b, todayKey(), 7) : undefined;
    const pct = a ? Math.round(a.rate * 100) : 0;
    return b
      ? `Miremos datos, no culpa: tu adherencia de los últimos 7 días es del ${pct}%. ${pct >= 60 ? 'La base está bien: toca pulir el momento o reducir un pelín la dificultad para que sea sostenible.' : 'El objetivo actual probablemente es demasiado exigente. Propongo bajar a la versión mínima (${minimal} min) unos días y consolidar antes de subir.'} Pulsa NO PUEDO cuando toque y cuéntame el motivo: el plan se adapta.`
      : 'Todavía no tengo suficientes datos. Dame unos días de uso y podré decirte qué ajustar.';
  }
  if (t.includes('objetivo') && t.includes('antes') || t.includes('más rápido')) {
    return `Acelerar tiene un riesgo: sobrecargar y abandonar. La vía más rápida sostenible es mantener ${minimal + 1}–${def?.minutes ?? 5} min diarios sin huecos. Cuando tu adherencia de 7 días supere el 85 %, subiremos de nivel automáticamente.`;
  }
  if (t.includes('horario') || t.includes('cuándo') || t.includes('momento')) {
    return b
      ? `Tu horario preferido para ${name} es ${(b.preferredSlots[0] ? SLOT_ES[b.preferredSlots[0]] : 'por la mañana')}. Si un día no te encaja, usa NO PUEDO y lo trasladaré a un hueco libre del día.`
      : 'Dime tu objetivo y te diré qué horario encaja mejor.';
  }
  if (t.includes('cambiar') && t.includes('hábito')) {
    return 'Puedo cambiar el hábito, su dificultad o su horario desde el plan. Dime qué quieres ajustar exactamente y con qué objetivo.';
  }

  // Cualquier forma de "no puedo" → guía accionable.
  const code = classifyReason(text);
  switch (code) {
    case 'work':
    case 'no_time':
    case 'family':
    case 'distraction':
      return `Entendido. En el plan pulsa NO PUEDO en ${name} y escribe lo que ha pasado: si hay un hueco libre más tarde lo trasladaré; si no, bajamos hoy a la versión mínima (${minimal} min) para no perder el hábito.`;
    case 'tired':
    case 'illness':
      return `Hoy no vamos a intentar progresar. Pulsa NO PUEDO y elige "estoy agotado" (o cuéntamelo): todo el día pasa a modo mantenimiento con la versión mínima. Recuperarte también es parte del plan.`;
    case 'outside':
      return `Sin problema: fuera de casa se hace la versión mínima (${minimal} min) cuando puedas, o la sustituimos por una variante que no requiera material. No pierdes el hábito por eso.`;
    case 'no_motivation':
      return `La motivación no es el motor: la constancia sí. Hoy haz solo la versión mínima (${minimal} min) y se acabó. Mañana será más fácil porque no habrás roto la cadena.`;
    default:
      return b
        ? `Cuéntame más y adaptaré ${name}. Mientras tanto, si hoy no puedes con el objetivo completo, la versión mínima (${minimal} min) mantiene vivo el hábito.`
        : 'Dime qué quieres conseguir y empezaremos por el primer paso, pequeño de verdad.';
  }
}

/** "¿Qué has aprendido sobre mis hábitos?" — resumen determinista. */
export function learnedInsights(state: CoachState): string {
  const goal = state.goals[0];
  if (!goal || state.logs.length === 0) {
    return 'Aún tengo muy pocos datos. Dame al menos 5–7 días de uso (completa el check-in y los hábitos) y empezaré a decirte qué horarios y dificultades te funcionan de verdad.';
  }
  const out: string[] = [];
  const insights = analyzePatterns(state, { sinceDays: 28 }).slice(0, 3);
  for (const ins of insights) out.push(`• ${ins.message}`);
  const reasons = reasonDistribution(state.logs, todayKey(), 30);
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    out.push(`• Tu obstáculo más repetido es "${top[0]}" (${top[1]} veces). Es información útil: lo hablamos para diseñarlo mejor.`);
  }
  if (state.counters.consolidated.length > 0) {
    const names = state.counters.consolidated
      .map((id) => state.behaviors.find((b) => b.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    out.push(`• Hábitos consolidados: ${names}. Ya aguantan solos: podemos aumentar dificultad o introducir el siguiente.`);
  }
  if (state.counters.resilienceWins > 0) {
    out.push(`• Has completado ${state.counters.resilienceWins} día(s) en modo difícil. Eso predice mejor que cualquier racha: la constancia bajo condiciones adversas.`);
  }
  if (out.length === 0) {
    out.push('Todavía no veo patrones claros. Sigue unos días y te contaré qué observo.');
  }
  return 'Esto es lo que he aprendido hasta ahora:\n' + out.join('\n');
}

/** Llamada real al modelo (MiniMax, API compatible con OpenAI). */
export async function chatWithCoach(
  state: CoachState,
  history: { role: 'user' | 'assistant'; content: string }[],
  userText: string,
  cfg: AIConfig = getAIConfig(),
): Promise<string> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + '\n\nContexto actual del usuario:\n' + summarizeState(state, todayKey()) },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userText },
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`MiniMax respondió ${res.status}: ${body.slice(0, 160)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Respuesta vacía del modelo.');
    return content;
  } finally {
    clearTimeout(timer);
  }
}
