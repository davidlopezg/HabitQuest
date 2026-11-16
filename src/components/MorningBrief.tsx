/**
 * Tarjeta del briefing matutino: la evaluación de ayer + lo que toca hoy.
 *
 * El texto llega ya redactado (motor o IA); la tarjeta solo lo presenta con
 * los hechos en piezas: lo pendiente de ayer, las rachas en juego y las
 * acciones de hoy.
 */

import { CalendarDays, Flame, Target } from 'lucide-react';
import type { MorningBrief } from '../engine/briefing.ts';

export interface MorningBriefProps {
  brief: MorningBrief;
  /** Texto final a mostrar (motor o IA). */
  text: string;
  /** Mientras llega la versión con IA. */
  pending?: boolean;
}

export function MorningBriefCard({ brief, text, pending }: MorningBriefProps) {
  return (
    <section
      className="rpg-card p-5 border-l-4 border-l-amber-400"
      aria-label={`Briefing matutino del ${brief.date}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1">
            <CalendarDays size={12} /> Briefing de hoy
          </p>
          <h2 className="font-heading font-bold text-lg mt-0.5">Antes de empezar</h2>
        </div>
        {pending && (
          <span className="text-[10px] text-rpg-text-secondary shrink-0">✍️ redactando…</span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{text}</p>

      {/* Lo que quedó pendiente ayer */}
      {brief.missed.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-widest text-rpg-text-secondary font-bold mb-1.5">
            Ayer quedó pendiente
          </p>
          <ul className="space-y-1">
            {brief.missed.map((m) => (
              <li key={m.name} className="text-xs flex items-center gap-2">
                <span aria-hidden="true">{m.icon}</span>
                <span className="flex-1 min-w-0 truncate">{m.name}</span>
                {m.reason && (
                  <span className="text-[10px] text-rpg-text-secondary shrink-0">{m.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rachas en juego */}
      {brief.streaks.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-widest text-rpg-text-secondary font-bold mb-1.5 flex items-center gap-1">
            <Flame size={11} className="text-amber-400" /> En juego
          </p>
          <div className="flex flex-wrap gap-1.5">
            {brief.streaks.map((s) => (
              <span
                key={s.name}
                className="text-[11px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 font-semibold"
              >
                {s.icon} {s.name} · {s.days} días
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lo primero de hoy */}
      {brief.actions.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-widest text-rpg-text-secondary font-bold mb-1.5 flex items-center gap-1">
            <Target size={11} className="text-cyan-400" /> Lo primero de hoy
          </p>
          <ul className="space-y-1">
            {brief.actions.map((a) => (
              <li key={a.behaviorId} className="text-xs flex items-center gap-2">
                <span aria-hidden="true">{a.icon}</span>
                <span className="flex-1 min-w-0 truncate">{a.name}</span>
                <span className="text-[10px] text-cyan-300 shrink-0">{a.hour}</span>
                <span className="text-[10px] text-rpg-text-secondary shrink-0">
                  {a.minutes} min
                  {a.minimalMinutes < a.minutes ? ` (mín. ${a.minimalMinutes})` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default MorningBriefCard;
