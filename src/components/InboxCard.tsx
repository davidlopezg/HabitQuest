/**
 * El cajón: soltar hábitos candidatos sin decidir.
 *
 * "Decides después, no ahora." Todo lo que entra es un HÁBITO (algo que
 * quieres repetir), nunca una tarea. Al promocionarlo a un objetivo entra en
 * el plan con su curva de niveles y su micro ritual.
 */

import { useState } from 'react';
import { Inbox, Plus, X } from 'lucide-react';

import type { Goal, InboxItem } from '../engine/types.ts';

export interface InboxCardProps {
  items: InboxItem[];
  goals: Goal[];
  onAdd: (text: string) => void;
  onPromote: (itemId: string, goalId: string) => void;
  onDrop: (itemId: string) => void;
  /** Objetivo por defecto (el único activo, si solo hay uno). */
  defaultGoalId?: string;
}

export function InboxCard(props: InboxCardProps) {
  const { items, goals, onAdd, onPromote, onDrop, defaultGoalId } = props;
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState<string | null>(null);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
  };

  return (
    <section className="rpg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest text-rpg-text-secondary font-bold flex items-center gap-1">
          <Inbox size={12} /> Cajón · hábitos candidatos
        </p>
        {items.length > 0 && (
          <span className="text-[10px] text-rpg-text-secondary">{items.length} sin decidir</span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 80))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="Suelta un hábito que te resuene…"
          className="flex-1 bg-black/30 rounded-xl px-3 py-2 text-sm"
          aria-label="Añadir un hábito candidato al cajón"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="px-3 py-2 rounded-xl text-sm font-bold bg-white/10 text-white disabled:opacity-30 flex items-center gap-1"
          aria-label="Añadir al cajón"
        >
          <Plus size={14} />
        </button>
      </div>
      <p className="text-[10px] text-rpg-text-secondary mt-1.5">
        No decides nada aquí: solo lo sueltas. Luego lo promovemos a un objetivo.
      </p>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="bg-black/20 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">{it.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{it.name}</span>
                  <span className="block text-[10px] text-rpg-text-secondary truncate">{it.text}</span>
                </span>
                <button
                  onClick={() => onDrop(it.id)}
                  className="p-1 text-rpg-text-secondary"
                  aria-label={`Descartar ${it.name}`}
                >
                  <X size={14} />
                </button>
              </div>

              {picking === it.id ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {goals.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setPicking(null);
                        onPromote(it.id, g.id);
                      }}
                      className="text-[10px] px-2 py-1 rounded-full font-semibold bg-cyan-500/20 text-cyan-200"
                    >
                      → {g.title}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (goals.length === 1 && defaultGoalId) onPromote(it.id, defaultGoalId);
                    else setPicking(it.id);
                  }}
                  className="mt-2 text-[10px] px-2.5 py-1 rounded-full font-semibold bg-white/5 text-rpg-text-secondary"
                >
                  Añadir a un objetivo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
