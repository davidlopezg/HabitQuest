/**
 * GuideView — Guía de HabitQuest: el flujo completo explicado, estructurado
 * y simple. Accesible desde Héroe y desde el onboarding del Coach.
 */

import { motion } from 'motion/react';
import { X } from 'lucide-react';

interface Section {
  id: string;
  icon: string;
  title: string;
  /** Párrafos simples. */
  paragraphs?: string[];
  /** Viñetas: "texto" o ["negrita", "texto"]. */
  bullets?: (string | [string, string])[];
  /** Pequeño ejemplo con fondo. */
  example?: string;
}

const SECTIONS: Section[] = [
  {
    id: 'idea',
    icon: '💡',
    title: 'La idea en 1 frase',
    paragraphs: [
      'HabitQuest es un coach personal de hábitos: tú dices QUÉ quieres conseguir y la app decide CÓMO, adaptándose cada día a cómo estás.',
      'Regla de oro: el objetivo nunca se abandona, se adapta el camino (duración, intensidad, horario).',
    ],
  },
  {
    id: 'ciclo',
    icon: '🔄',
    title: 'Tu ciclo diario (5 pasos)',
    bullets: [
      ['1 · Objetivo', 'Le dices qué quieres conseguir, con tus palabras ("Quiero ponerme en forma"). La app lo descompone en hábitos pequeños.'],
      ['2 · Check-in (20 s)', 'Por la mañana: energía, ánimo, concentración, estrés, tiempo disponible e intención del día.'],
      ['3 · Plan del día', 'La app genera AHORA (lo siguiente que toca), Después (el resto con su hora) y HOY (tu progreso).'],
      ['4 · Hazlo', 'EMPEZAR para ver las opciones: ✅ completo, ⏱️ solo la versión mínima, 🙅 “no puedo” (replanificar hoy o dejarlo para mañana).'],
      ['5 · Al día siguiente', 'Se cierra el día anterior solo y el plan se regenera con tu nuevo check-in.'],
    ],
  },
  {
    id: 'objetivos',
    icon: '🎯',
    title: 'Objetivos (de 1 a 3)',
    bullets: [
      ['Uno para empezar', 'Cada objetivo se descompone en hábitos que se introducen de uno en uno, cuando el anterior se consolida. Sin saturar.'],
      ['Hasta 3 en curso', 'Puedes añadir más con "＋ Añadir objetivo". El plan de HOY reparte el tiempo entre todos según tu energía.'],
      ['Ver sus fases', 'Toca tu objetivo en "🎯 Tus objetivos" para ver niveles, progreso, adherencia y la cola de próximos hábitos.'],
      ['Consejo', 'Si aún no has consolidado nada, el coach te sugiere concentrarte en uno antes de añadir otro.'],
    ],
  },
  {
    id: 'niveles',
    icon: '📈',
    title: 'Niveles y adaptación',
    paragraphs: [
      'Cada hábito tiene niveles (1→7). El nivel 1 es ridículamente fácil a propósito (ej: "abrir el libro").',
      'Para subir de nivel necesitas ~5 días completos de los últimos 7 intentos. Si fallas repetidamente, la app te BAJA a un nivel sostenible y te lo dice con calma: no es un fracaso.',
      'Un día con poco tiempo o energía NO se castiga: se hace la versión mínima (≈20 % del objetivo).',
    ],
    bullets: [
      ['Modo progreso', 'Buena energía: objetivos completos.'],
      ['Modo normal', 'Plan estándar.'],
      ['Modo mantenimiento', 'Solo versiones mínimas.'],
      ['Modo recuperación', 'Día difícil: solo lo esencial, en mínimo.'],
    ],
    example: 'Día con reuniones → "Me ha surgido una reunión". El coach traslada la tarea a un hueco libre o la reduce a 2 min. Nunca un "fracaso".',
  },
  {
    id: 'nopuedo',
    icon: '🙅',
    title: '"No puedo" → dos caminos',
    paragraphs: [
      'Si algo se tuerce, explícale al coach por qué (botón NO PUEDO o en el chat). Interpreta el motivo y te da dos caminos:',
    ],
    bullets: [
      ['🙅 Replanificar HOY', 'Intenta que lo hagas hoy de forma adaptada: a otro hueco libre, en versión mínima o en modo mantenimiento. Ideal si “ahora no” pero el día aún puede.'],
      ['⏭️ Dejarlo para MAÑANA', 'Excusa solo ese hábito hoy: tu racha NO se rompe, hoy no cuenta como fallo, y mañana vuelve a estar en tu plan automáticamente. Ideal si hoy no hay manera.'],
      ['Agotado / enfermo', 'El coach pasa el día a modo mantenimiento. Recuperarte también forma parte del plan.'],
      ['Fuera de casa', 'Te sugiere la versión mínima o una alternativa sin material.'],
    ],
    example: '“Me ha surgido una reunión” → si hay hueco, te lo propone (“¿Lo trasladamos a las 19:30?”); si no, lo dejáis para mañana. Nunca un “fracaso”.',
  },
  {
    id: 'horarios',
    icon: '🕐',
    title: 'Horarios',
    paragraphs: [
      'Cada hábito tiene una franja por defecto (mañana/mediodía/tarde/noche) elegida por el coach según su tipo.',
      'Para cambiarla: abre tu objetivo (🎯 Tus objetivos) y en cada hábito usa los chips de franja o el selector de hora exacta. El cambio se aplica hoy mismo y se guarda.',
      'Con el tiempo, el coach detecta patrones ("los martes casi nunca completas X") y te sugerirá reajustes.',
    ],
  },
  {
    id: 'jugando',
    icon: '⭐',
    title: 'Gamificación (calmada)',
    bullets: [
      ['XP y nivel', 'Cada acción completada suma XP. El nivel sube cada 100 XP.'],
      ['⭐ Victoria de resiliencia', 'Completar un hábito en un día difícil vale más que un día perfecto.'],
      ['🌱 Hábito consolidado', 'Cuando un hábito alcanza nivel 5: ya aguanta solo. Es el momento de subir dificultad o introducir el siguiente.'],
      ['🔥 Racha y consistencia', 'La racha no se rompe si un día lo excusas con motivo. La métrica que importa es la consistencia (7/30 días), no una racha perfecta.'],
    ],
  },
  {
    id: 'manual',
    icon: '🧰',
    title: 'Coach vs. misiones manuales',
    paragraphs: [
      'Inicio (modo manual): listas que tú creas y marcas. No se adaptan. Útil para tareas libres o repasos puntuales.',
      'Coach: hábitos con objetivo, nivel y plan diario que se adapta a tu energía. Es tu sistema principal.',
      'Las misiones manuales aparecen también al final del día del Coach ("🧰 Misiones manuales") para que no tengas que cambiar de pestaña.',
    ],
  },
  {
    id: 'chat',
    icon: '💬',
    title: 'Chat e insights',
    paragraphs: [
      'El botón de chat (esquina inferior) abre tu coach conversacional. Le puedes decir "no puedo hoy", "¿por qué sigo fallando?" o "¿qué has aprendido sobre mí?".',
      'También puede EJECUTAR acciones: pídele "añade un hábito de meditación a las 7:30" (o de leer, caminar, fuerza…) y lo crea con su nivel 1 y su hora.',
      'Con la API key de MiniMax configurada responde con IA y contexto real. Sin key, responde en modo local con el motor de reglas.',
      'El botón "🧠 Insights" muestra lo que la app ha aprendido: adherencia por hábito, patrones y obstáculos repetidos.',
    ],
  },
  {
    id: 'avisos',
    icon: '🔔',
    title: 'Avisos',
    paragraphs: [
      'Actívalos con "🔔 Avisos" en la cabecera del plan: cuando llega la hora de un hábito, avisa una sola vez e incluye la salida de la versión mínima.',
      'Con la app abierta funcionan en cualquier navegador. Para recibirlos con la app CERRADA se necesita el push de Firebase + Worker de Cloudflare (config opcional, ver README).',
    ],
  },
  {
    id: 'datos',
    icon: '🔒',
    title: 'Tus datos',
    bullets: [
      ['Dónde se guardan', 'En tu propio navegador (localStorage). No hay cuenta ni servidor.'],
      ['Exportar / importar', 'En Héroe puedes exportar tus datos (Coach y modo manual) para copias de seguridad o cambiar de dispositivo.'],
      ['Borrar', 'Reiniciar Coach o Reiniciar Progreso borran sus datos respectivos.'],
    ],
  },
  {
    id: 'consejo',
    icon: '🌱',
    title: 'El consejo final',
    paragraphs: [
      'No hagas la app perfecta: hazla constante. Una cosa a la vez, versión mínima en los días malos, y deja que el coach ajuste la dificultad.',
      'En ~2 semanas tendrás patrones reales sobre ti y el coach empezará a afinar horarios y retos.',
    ],
  },
];

export default function GuideView({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const go = (id: string) => {
    document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[125] bg-black/90 flex items-center justify-center"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="rpg-card w-full max-w-lg h-full sm:h-[92vh] flex flex-col"
      >
        {/* Cabecera */}
        <div className="p-5 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">HabitQuest</p>
              <h2 className="font-heading font-bold text-2xl mt-0.5">Guía: cómo funciona</h2>
              <p className="text-xs text-rpg-text-secondary mt-1">
                El flujo completo, explicado sin tecnicismos.
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-rpg-text-secondary shrink-0" aria-label="Cerrar guía">
              <X size={22} />
            </button>
          </div>
          {/* Índice */}
          <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => go(s.id)}
                className="shrink-0 text-[10px] px-2.5 py-1.5 rounded-full bg-white/5 text-rpg-text-secondary"
              >
                {s.icon} {s.title}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-5 pt-3 space-y-4">
          {SECTIONS.map((s) => (
            <section key={s.id} id={`guide-${s.id}`} className="rpg-card p-4 scroll-mt-24">
              <h3 className="font-heading font-bold text-base mb-2">
                {s.icon} {s.title}
              </h3>
              {s.paragraphs?.map((p, i) => (
                <p key={i} className="text-[13px] text-rpg-text-secondary leading-relaxed mb-2">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="space-y-2">
                  {s.bullets.map((b, i) =>
                    typeof b === 'string' ? (
                      <li key={i} className="text-[13px] text-rpg-text-secondary leading-relaxed list-disc ml-4">
                        {b}
                      </li>
                    ) : (
                      <li key={i} className="text-[13px] leading-relaxed">
                        <span className="font-bold text-white/90">{b[0]}</span>
                        <span className="text-rpg-text-secondary"> — {b[1]}</span>
                      </li>
                    ),
                  )}
                </ul>
              )}
              {s.example && (
                <div className="mt-3 bg-black/25 rounded-xl px-3 py-2.5 text-[12px] text-cyan-100/90 leading-relaxed">
                  {s.example}
                </div>
              )}
            </section>
          ))}
          <p className="text-center text-[10px] text-rpg-text-secondary pb-4">
            El objetivo no cambia · se adapta el camino.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
