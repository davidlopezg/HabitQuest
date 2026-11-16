/**
 * Briefing matutino en modo IA.
 *
 * El motor (`src/engine/briefing.ts`) calcula los hechos y ya tiene un texto
 * propio que funciona sin red, sin key y sin coste. La IA solo puede
 * **reformular** ese texto con los MISMOS hechos: no puede cambiar cifras,
 * hábitos ni motivos. Si no hay IA configurada, o si falla o tarda, se
 * devuelve el texto del motor (fallback silencioso: el briefing nunca es un
 * error, solo cambia quién lo escribió).
 */

import type { CoachState } from '../../engine/index.ts';
import { briefFacts, type MorningBrief } from '../../engine/briefing.ts';
import { askModel, SYSTEM_PROMPT, summarizeState } from './coach.ts';
import { getAIConfig, type AIConfig } from './config.ts';

const BRIEF_RULES = `Eres el coach personal de hábitos de HabitQuest. Ahora redactas el BRIEFING MATUTINO: lo que pasó ayer y qué hacer hoy.

Reglas estrictas:
- USA SOLO los hechos que te dan. No inventes cifras, hábitos, horarios ni motivos.
- No cambies los números: si dicen "1 de 2 hábitos", escribe eso.
- Nunca culpabilices: nada de "fallaste", "fracasaste", "no cumpliste", "incumpliste". Es un coach que ayuda, no un juez. Un día flojo es un día que se adapta.
- Empieza por ayer (lo que se hizo y lo que quedó pendiente), sigue con lo que está en juego (rachas) y termina con la acción concreta de hoy.
- Tono cercano, en español de España, directo.
- Máximo 90 palabras. Sin listas con viñetas, sin emojis, sin títulos ni markdown. Un solo párrafo.`;

const BRIEF_PROMPT = 'Redacta el briefing matutino con estos hechos.';

/**
 * Devuelve el briefing en prosa de IA, o el texto del motor si no se puede.
 * Nunca lanza: un fallo de red es un briefing del motor, no un error.
 */
export async function aiBrief(
  state: CoachState,
  brief: MorningBrief,
  cfg: AIConfig = getAIConfig(),
): Promise<string> {
  if (!cfg.enabled) return brief.message;
  const messages = [
    {
      role: 'system',
      content:
        SYSTEM_PROMPT +
        '\n\n' +
        BRIEF_RULES +
        '\n\nContexto actual del usuario:\n' +
        summarizeState(state, brief.date) +
        '\n\nHechos de ayer y de hoy (NO los cambies):\n' +
        briefFacts(brief),
    },
    { role: 'user', content: BRIEF_PROMPT },
  ];
  try {
    const content = await askModel(messages, cfg, 15000);
    return content || brief.message;
  } catch {
    return brief.message;
  }
}
