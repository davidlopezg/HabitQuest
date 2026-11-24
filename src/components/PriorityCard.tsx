/**
 * La prioridad del día (UNA cosa) + la tira de ánimo.
 *
 * Por qué una sola: con 3 objetivos y un plan de 8 ítems, el usuario no
 * decide nada. Monkway fuerza una prioridad única y además pregunta qué
 * cuenta como "suficiente" para que no se convierta en una meta inalcanzable.
 *
 * El motor propone (el pendiente más importante del plan); el usuario
 * confirma o reescribe. Sin fricción y sin IA.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Target } from 'lucide-react';

import type { DayPriority } from '../engine/types.ts';
import type { MoodTrend } from '../engine/mood.ts';

export interface PriorityCardProps {
  priority?: DayPriority;
  /** Propuesta del motor (el pendiente más importante del plan). */
  suggestion?: { text: string; behaviorId?: string };
  mood: MoodTrend;
  onSet: (text: string, behaviorId?: string) => void;
  onToggle: () => void;
  onClear: () => void;
}

export function PriorityCard(props: PriorityCardProps) {
  const { priority, suggestion, mood, onSet, onToggle, onClear } = props;
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(priority?.text ?? '');
    setEditing(false);
  }, [priority?.text, priority?.date]);

  return (
    <section className="rpg-card p-4 border-l-4 border-l-cyan-400">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold flex items-center gap-1">
          <Target size={12} /> Prioridad del día
        </p>
        {mood.avg !== null && (
          <span className="text-[10px] text-rpg-text-secondary">
            ánimo {mood.avg} · {mood.label.toLowerCase()}
          </span>
        )}
      </div>

      {priority ? (
        <div className="flex items-start gap-3">
          <button
            onClick={onToggle}
            className="shrink-0 p-1"
            aria-label={priority.done ? 'Desmarcar la prioridad' : 'Marcar la prioridad como hecha'}
          >
            {priority.done ? (
              <CheckCircle2 size={22} className="text-green-400" />
            ) : (
              <Circle size={22} className="text-rpg-text-secondary" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${priority.done ? 'line-through text-rpg-text-secondary' : ''}`}>
              {priority.text}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => setEditing((v) => !v)}
                className="text-[11px] px-2.5 py-1 rounded-full font-semibold bg-white/5 text-rpg-text-secondary"
              >
                {editing ? 'Cancelar' : 'Cambiar'}
              </button>
              <button
                onClick={onClear}
                className="text-[11px] px-2.5 py-1 rounded-full font-semibold bg-white/5 text-rpg-text-secondary"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-rpg-text-secondary leading-relaxed">
            Una sola cosa que haga que hoy valga. El resto del plan es apoyo.
          </p>
          {suggestion && (
            <button
              onClick={() => onSet(suggestion.text, suggestion.behaviorId)}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-sm font-bold"
            >
              ⭐ {suggestion.text}
            </button>
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 120))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) onSet(draft.trim());
              }}
              placeholder="O escribe la tuya…"
              className="flex-1 bg-black/30 rounded-xl px-3 py-2 text-sm"
              aria-label="Escribir la prioridad del día"
            />
            <button
              onClick={() => draft.trim() && onSet(draft.trim())}
              disabled={!draft.trim()}
              className="px-3 py-2 rounded-xl text-sm font-bold bg-cyan-500/30 text-cyan-200 disabled:opacity-30"
            >
              Poner
            </button>
          </div>
        </div>
      )}

      {editing && priority && (
        <div className="flex gap-2 mt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 120))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                onSet(draft.trim(), priority.behaviorId);
                setEditing(false);
              }
            }}
            className="flex-1 bg-black/30 rounded-xl px-3 py-2 text-sm"
            aria-label="Editar la prioridad del día"
          />
          <button
            onClick={() => {
              if (draft.trim()) {
                onSet(draft.trim(), priority.behaviorId);
                setEditing(false);
              }
            }}
            className="px-3 py-2 rounded-xl text-sm font-bold bg-cyan-500/30 text-cyan-200"
          >
            Guardar
          </button>
        </div>
      )}
    </section>
  );
}
