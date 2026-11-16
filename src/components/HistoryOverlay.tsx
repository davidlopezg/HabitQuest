/**
 * Bitácora del Coach: calendario de lo que se hizo cada día + comentario del día.
 *
 * El registro ya existe en el estado (`logs`); aquí solo se consulta.
 * El comentario (`notes`) se edita y se guarda vía `onSaveNote`.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { daySummary, noteOn, NOTE_MAX_LENGTH } from '../engine/history.ts';
import { REASON_LABEL } from '../engine/replanner.ts';
import type {
  Behavior,
  BehaviorLogEntry,
  DayNote,
  Goal,
  LogKind,
} from '../engine/types.ts';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const KIND_CHIP: Record<LogKind, { icon: string; label: string; cls: string }> = {
  full: { icon: '✅', label: 'Completo', cls: 'bg-green-500/20 text-green-300' },
  minimal: { icon: '🟡', label: 'Mínimo', cls: 'bg-yellow-500/20 text-yellow-300' },
  excused: { icon: '💤', label: 'Excusado', cls: 'bg-blue-500/20 text-blue-300' },
  miss: { icon: '❌', label: 'No hecho', cls: 'bg-white/5 text-rpg-text-secondary' },
};

function keyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseKey(date: string): { year: number; month: number; day: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

export interface HistoryOverlayProps {
  logs: BehaviorLogEntry[];
  behaviors: Behavior[];
  goals: Goal[];
  notes: DayNote[];
  today: string;
  onClose: () => void;
  onSaveNote: (date: string, text: string) => void;
}

export function HistoryOverlay(props: HistoryOverlayProps) {
  const { logs, behaviors, goals, notes, today, onClose, onSaveNote } = props;
  const todayParts = parseKey(today);
  const [cursor, setCursor] = useState({ year: todayParts.year, month: todayParts.month });
  const [selected, setSelected] = useState<string>(today);
  const [draft, setDraft] = useState<string>(() => noteOn(notes, today)?.text ?? '');
  const [saved, setSaved] = useState(false);

  // Días con registro (para pintar el calendario sin recalcular en cada celda).
  const daysWithLogs = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.date);
    return set;
  }, [logs]);

  const daysWithNotes = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) if (n.text.trim()) set.add(n.date);
    return set;
  }, [notes]);

  const summary = useMemo(
    () => daySummary(logs, behaviors, goals, selected),
    [logs, behaviors, goals, selected],
  );

  // El mes siguiente no se abre si ya no hay días que ver.
  const nextMonthStart = new Date(cursor.year, cursor.month + 1, 1);
  const nextMonthKey = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, '0')}-01`;
  const canGoNext = nextMonthKey <= today;

  const selectedNote = noteOn(notes, selected);

  function selectDate(date: string) {
    setSelected(date);
    setDraft(noteOn(notes, date)?.text ?? '');
    setSaved(false);
  }

  function save() {
    onSaveNote(selected, draft);
    setSaved(true);
  }

  const firstDay = new Date(cursor.year, cursor.month, 1);
  const lastDay = new Date(cursor.year, cursor.month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // lunes primero
  const monthLabel = firstDay.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const cells: ReactNode[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(<div key={`empty-${i}`} />);
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = keyOf(cursor.year, cursor.month, day);
    const isFuture = date > today;
    const isToday = date === today;
    const isSelected = date === selected;
    const hasLogs = daysWithLogs.has(date);
    const hasNote = daysWithNotes.has(date);
    cells.push(
      <button
        key={date}
        onClick={() => selectDate(date)}
        disabled={isFuture}
        aria-label={`${date}${hasLogs ? ', con registros' : ', sin registros'}${hasNote ? ', con comentario' : ''}`}
        aria-pressed={isSelected}
        className={`aspect-square min-h-11 rounded-lg text-sm flex flex-col items-center justify-center relative transition ${
          isSelected
            ? 'bg-cyan-500/25 ring-2 ring-cyan-400 text-white'
            : hasLogs
              ? 'bg-white/10 hover:bg-white/15'
              : 'bg-white/5 hover:bg-white/10'
        } ${isFuture ? 'opacity-25 cursor-not-allowed' : ''} ${isToday && !isSelected ? 'ring-1 ring-cyan-400/60' : ''}`}
      >
        <span>{day}</span>
        {hasLogs && <span className="text-[8px] leading-none mt-0.5 text-green-300">●</span>}
        {hasNote && <span className="absolute top-0.5 right-1 text-[9px] leading-none">📝</span>}
      </button>,
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[112] bg-black/85 flex items-end sm:items-center justify-center"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="rpg-card w-full max-w-lg max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Bitácora del coach"
      >
        {/* Cabecera */}
        <div className="p-5 pb-3 border-b border-white/10 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">📅 Bitácora</p>
            <h2 className="font-heading font-bold text-2xl mt-0.5">Tu registro por días</h2>
            <p className="text-xs text-rpg-text-secondary mt-1">
              Qué hiciste cada día y qué te pasó. Toca un día para verlo.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-rpg-text-secondary shrink-0" aria-label="Cerrar la bitácora">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Calendario */}
          <section className="rpg-card p-4 bg-black/20">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setCursor((c) => {
                  const d = new Date(c.year, c.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="p-2 min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-white/10"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <h3 className="font-bold capitalize">{monthLabel}</h3>
              <button
                onClick={() => setCursor((c) => {
                  const d = new Date(c.year, c.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                disabled={!canGoNext}
                className="p-2 min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed"
                aria-label="Mes siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[10px] text-rpg-text-secondary py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">{cells}</div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-rpg-text-secondary">
              <span className="flex items-center gap-1"><span className="text-green-300">●</span> con registros</span>
              <span className="flex items-center gap-1">📝 con comentario</span>
              <span className="flex items-center gap-1">🔵 hoy</span>
            </div>
          </section>

          {/* Detalle del día */}
          <section className="rpg-card p-4 bg-black/20 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {selected === today ? 'Hoy' : selected.split('-').reverse().join('/')}
              </h3>
              {summary.total > 0 && (
                <span className="text-[11px] font-bold text-green-300">
                  {summary.done}/{summary.total} hábitos
                </span>
              )}
            </div>

            {summary.items.length === 0 ? (
              <p className="text-xs text-rpg-text-secondary">
                No hay registros de hábitos este día.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {summary.items.map((it, idx) => {
                  const chip = KIND_CHIP[it.kind];
                  return (
                    <li key={`${it.behaviorId}-${idx}`} className="flex items-center gap-2 text-xs">
                      <span aria-hidden="true">{it.icon}</span>
                      <span className="flex-1 min-w-0 truncate">{it.name}</span>
                      {it.reasonCode && (
                        <span className="text-[10px] text-rpg-text-secondary truncate">
                          {REASON_LABEL[it.reasonCode] ?? it.reasonCode}
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${chip.cls}`}>
                        {chip.icon} {chip.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {summary.goals.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-1.5">
                {summary.goals.map((g) => (
                  <div key={g.goalId} className="flex items-center gap-2 text-xs">
                    <span aria-hidden="true">🎯</span>
                    <span className="flex-1 min-w-0 truncate">{g.title}</span>
                    <span className={`text-[11px] font-bold ${g.done === g.total ? 'text-green-300' : 'text-rpg-text-secondary'}`}>
                      {g.done}/{g.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Comentario del día */}
          <section className="rpg-card p-4 bg-black/20 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">📝 Comentario del día</h3>
              {selectedNote && (
                <span className="text-[10px] text-rpg-text-secondary">
                  guardado {new Date(selectedNote.updatedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
            </div>
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH)); setSaved(false); }}
              maxLength={NOTE_MAX_LENGTH}
              rows={3}
              placeholder="¿Qué pasó hoy? (una lesión, un viaje, un día raro…)"
              aria-label={`Comentario del día ${selected}`}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-xs outline-none focus:border-cyan-400/60 resize-y"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-rpg-text-secondary">{draft.length}/{NOTE_MAX_LENGTH}</span>
              <div className="flex items-center gap-2">
                {saved && <span className="text-[10px] text-green-300">Guardado ✓</span>}
                <button
                  onClick={save}
                  className="px-4 py-2 min-h-11 rounded-xl text-xs font-bold rpg-gradient text-white"
                >
                  Guardar comentario
                </button>
              </div>
            </div>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default HistoryOverlay;
