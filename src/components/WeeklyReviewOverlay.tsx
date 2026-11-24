/**
 * Revisión semanal (ritual de 5 min) + "plan de mañana (3 min)".
 *
 * Datos deterministas: lo que se hizo, qué racha está en juego, el único
 * hábito que hay que vigilar y una propuesta concreta para mañana.
 * El ritual tiene duración FIJA ("3 min", "5 min"): el usuario sabe cuánto
 * va a tardar y no se resiste (regla de Monkway que funciona).
 */

import { X } from 'lucide-react';

import type { WeeklyReview } from '../engine/review.ts';

export interface WeeklyReviewOverlayProps {
  review: WeeklyReview;
  onClose: () => void;
  /** Elige una propuesta como prioridad de mañana. */
  onPickTomorrow: (text: string, behaviorId?: string) => void;
  /** Ya hay prioridad de mañana puesta. */
  tomorrowPriority?: string;
}

export function WeeklyReviewOverlay(props: WeeklyReviewOverlayProps) {
  const { review, onClose, onPickTomorrow, tomorrowPriority } = props;
  const pct = Math.round(review.rate * 100);

  return (
    <div className="fixed inset-0 z-[20000] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full md:max-w-lg max-h-[88vh] bg-rpg-card rounded-t-2xl md:rounded-2xl flex flex-col border border-white/10">
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">🗓️ Revisión semanal</p>
            <h2 className="font-heading font-bold text-xl mt-0.5">Esta semana</h2>
            <p className="text-xs text-rpg-text-secondary mt-1">
              5 minutos: lo que pasó de verdad y qué cambias.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-rpg-text-secondary shrink-0" aria-label="Cerrar la revisión semanal">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* Cifras */}
          <section className="rpg-card p-4 bg-black/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-rpg-text-secondary">Cumplimiento</span>
              <span className="text-2xl font-heading font-bold text-cyan-300">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 mt-2 overflow-hidden">
              <div className="h-full bg-cyan-400" style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div>
                <p className="text-lg font-bold">{review.completed}</p>
                <p className="text-[10px] text-rpg-text-secondary">cerrados</p>
              </div>
              <div>
                <p className="text-lg font-bold">{review.planned}</p>
                <p className="text-[10px] text-rpg-text-secondary">planificados</p>
              </div>
              <div>
                <p className="text-lg font-bold">{review.daysWithData}</p>
                <p className="text-[10px] text-rpg-text-secondary">días con plan</p>
              </div>
            </div>
          </section>

          {/* Hechos */}
          {review.highlights.length > 0 && (
            <section className="rpg-card p-4 bg-black/20 space-y-1.5">
              <h3 className="text-[10px] uppercase tracking-widest text-rpg-text-secondary font-bold mb-1">Lo que pasó</h3>
              {review.highlights.map((h, i) => (
                <p key={i} className="text-xs text-rpg-text-secondary leading-relaxed">• {h}</p>
              ))}
              {review.bestStreak && review.bestStreak.days > 0 && (
                <p className="text-xs text-amber-300 font-semibold mt-1">
                  🔥 {review.bestStreak.icon} {review.bestStreak.name}: {review.bestStreak.days} días de racha
                </p>
              )}
            </section>
          )}

          {/* Sugerencias */}
          {review.suggestions.length > 0 && (
            <section className="rpg-card p-4 bg-black/20 space-y-1.5">
              <h3 className="text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-1">Qué cambiar</h3>
              {review.suggestions.map((s, i) => (
                <p key={i} className="text-xs text-rpg-text-secondary leading-relaxed">→ {s}</p>
              ))}
            </section>
          )}

          {/* Plan de mañana (3 min) */}
          <section className="rpg-card p-4 bg-black/20 space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold">Mañana (3 min)</h3>
            {tomorrowPriority ? (
              <p className="text-xs text-rpg-text-secondary">
                Prioridad de mañana: <span className="font-bold text-cyan-200">{tomorrowPriority}</span>
              </p>
            ) : review.tomorrowFocus.length > 0 ? (
              <ul className="space-y-1.5">
                {review.tomorrowFocus.map((f, i) => (
                  <li key={f.behaviorId ?? i}>
                    <button
                      onClick={() => onPickTomorrow(f.text, f.behaviorId)}
                      className="w-full text-left px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold hover:bg-white/10"
                    >
                      ⭐ {f.text}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-rpg-text-secondary">Nada propuesto: mañana empieza con lo que ya tienes.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
