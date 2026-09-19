/**
 * Modal diario de motivación + editor del pool en Ajustes.
 *
 * - MotivationModal: pantalla completa antes de entrar a la app, con un mensaje
 *   aleatorio por día y botón "Empezar el día".
 * - MotivationSettings: tarjeta en la pestaña Héroe para editar el pool, toggle
 *   on/off y botón "Vista previa".
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { DEFAULT_MOTIVATIONS } from '../services/motivations.ts';

export function MotivationModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-gradient-to-br from-rpg-bg/95 to-black/95 backdrop-blur-md flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 22, stiffness: 220 }}
        className="rpg-card p-8 text-center max-w-md w-full"
      >
        <div className="text-6xl mb-5" aria-hidden="true">✨</div>
        <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-3">
          Mensaje del día
        </p>
        <p className="text-lg font-heading font-bold leading-relaxed mb-7">{message}</p>
        <button
          onClick={onClose}
          className="w-full py-3.5 rpg-gradient rounded-xl font-bold text-white text-base"
        >
          Empezar el día →
        </button>
        <p className="mt-4 text-[10px] text-rpg-text-secondary">
          Cambia cada día natural · configúralo en Héroe → Mensajes de motivación
        </p>
      </motion.div>
    </motion.div>
  );
}

export function MotivationSettings({
  pool,
  enabled,
  onUpdatePool,
  onToggleEnabled,
}: {
  pool: string[];
  enabled: boolean;
  onUpdatePool: (next: string[]) => void;
  onToggleEnabled: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<string[]>(pool);

  function commit(next: string[]) {
    setDraft(next);
    onUpdatePool(next);
  }
  function update(i: number, value: string) {
    commit(draft.map((s, idx) => (idx === i ? value : s)));
  }
  function remove(i: number) {
    if (draft.length <= 1) return;
    commit(draft.filter((_, idx) => idx !== i));
  }
  function add() {
    commit([...draft, '']);
  }
  function resetDefault() {
    if (!confirm('¿Restaurar los mensajes por defecto? Se borrará tu lista actual.')) return;
    commit([...DEFAULT_MOTIVATIONS]);
  }

  return (
    <div className="rpg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-sm">💬 Mensajes de motivación</p>
          <p className="text-[10px] text-rpg-text-secondary mt-0.5">
            Uno al azar cada día, antes de entrar a la app
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <span className="text-rpg-text-secondary">Mostrar</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="w-4 h-4 accent-cyan-400"
          />
        </label>
      </div>
      <div className="space-y-2">
        {draft.map((msg, i) => (
          <div key={i} className="flex gap-2 items-start">
            <textarea
              value={msg}
              onChange={(e) => update(i, e.target.value)}
              placeholder="Escribe un mensaje…"
              rows={2}
              className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs resize-none outline-none focus:border-cyan-400/50"
            />
            <button
              onClick={() => remove(i)}
              disabled={draft.length <= 1}
              aria-label={`Eliminar mensaje ${i + 1}`}
              className="p-2 text-red-400/80 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={add}
          className="flex-1 py-2 rounded-xl text-[11px] font-semibold bg-cyan-500/15 text-cyan-300"
        >
          ＋ Añadir mensaje
        </button>
        <button
          onClick={resetDefault}
          className="py-2 px-3 rounded-xl text-[11px] font-semibold bg-white/5 text-rpg-text-secondary"
          title="Volver a los mensajes por defecto"
        >
          ↺ por defecto
        </button>
      </div>
    </div>
  );
}
