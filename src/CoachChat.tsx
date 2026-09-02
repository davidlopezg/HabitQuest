/**
 * CoachChat — conversación con el coach (Fase 3).
 *
 * - Con API key (MiniMax): conversación con contexto real del usuario.
 * - Sin API key o sin red: respuestas deterministas del motor (offline).
 * - Cuando el mensaje indica que "no puede" hacer algo HOY, la acción se
 *   resuelve con el motor (replanificación real del día), no solo con texto.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Trash2, X, Bot, User } from 'lucide-react';
import type { ChatMessage, CoachState, PlanItem } from './engine/index.ts';
import {
  applyCoachReply,
  classifyReason,
  handleCannot,
} from './engine/index.ts';
import {
  chatWithCoach,
  learnedInsights,
  looksLikeCannot,
  offlineCoachReply,
} from './services/ai/coach.ts';
import { getAIConfig } from './services/ai/config.ts';

const CHIPS = [
  '🙅 No puedo hacerlo hoy',
  '📉 ¿Por qué sigo fallando?',
  '🧠 ¿Qué has aprendido sobre mis hábitos?',
  '🕐 ¿Cuál es mi mejor horario?',
  '🚀 Quiero llegar antes a mi objetivo',
];

interface Props {
  open: boolean;
  onClose: () => void;
  state: CoachState;
  setState: (fn: (p: CoachState) => CoachState) => void;
  today: string;
}

export default function CoachChat({ open, onClose, state, setState, today }: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cfg = useMemo(() => getAIConfig(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chat.length, busy, open]);

  function setFinal(next: CoachState, assistant: string) {
    const msg: ChatMessage = { role: 'assistant', content: assistant, ts: new Date().toISOString() };
    setState(() => ({ ...next, chat: [...next.chat, msg] }));
  }

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);

    const userMsg: ChatMessage = { role: 'user', content: text, ts: new Date().toISOString() };
    // Estado de trabajo: incluye el mensaje del usuario recién escrito.
    const s: CoachState = { ...state, chat: [...state.chat, userMsg] };
    const plan = s.plans[today];
    const pending: PlanItem[] = plan
      ? plan.items.filter((i) => i.status === 'pending').sort((a, b) => a.startMinute - b.startMinute)
      : [];
    const allDone = !!plan && plan.items.length > 0 && pending.length === 0;

    try {
      // 1) Acciones REALES: el coach ejecuta (replanifica el día), no solo aconseja.
      if (looksLikeCannot(text) && pending.length > 0) {
        const target = pending[0];
        const code = classifyReason(text);
        const reply = handleCannot({
          state: s,
          date: today,
          behaviorId: target.behaviorId,
          reasonText: text,
          nowMinutes: new Date().getHours() * 60 + new Date().getMinutes(),
        });
        const final = applyCoachReply(s, today, reply, target.behaviorId, target.minutes, code);
        setFinal(final, reply.message);
      } else if (
        text.toLowerCase().includes('aprendid') ||
        text.toLowerCase().includes('qué sabes') ||
        text.toLowerCase().includes('qué has aprendido')
      ) {
        setFinal(s, learnedInsights(s));
      } else if (allDone) {
        setFinal(s, 'Hoy ya has completado todo lo pendiente. Si quieres, me cuentas qué te gustaría ajustar para mañana o cómo te ha ido el día.');
      } else if (cfg.enabled) {
        try {
          // El historial enviado excluye el último turno (chatWithCoach lo añade).
          const content = await chatWithCoach(s, s.chat.slice(0, -1), text);
          setFinal(s, content);
        } catch (err) {
          setFinal(
            s,
            `⚠️ No he podido contactar con MiniMax (${err instanceof Error ? err.message : 'error'}). Te respondo con mi modo local:\n\n` +
              offlineCoachReply(s, text),
          );
        }
      } else {
        setFinal(s, offlineCoachReply(s, text));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-black/80 flex items-end sm:items-center justify-center"
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="w-full max-w-lg h-[85vh] sm:h-[80vh] rpg-card m-0 sm:m-4 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full rpg-gradient flex items-center justify-center text-lg">🤖</div>
                <div>
                  <h3 className="font-heading font-bold">Tu coach</h3>
                  <p className="text-[10px] text-rpg-text-secondary">
                    {cfg.enabled
                      ? `MiniMax online · ${cfg.model}`
                      : 'Modo local · añade tu API key para el coach con IA'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {state.chat.length > 0 && (
                  <button
                    onClick={() => setState((p) => ({ ...p, chat: [] }))}
                    className="p-2 text-rpg-text-secondary hover:text-red-400"
                    title="Vaciar conversación"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
                <button onClick={onClose} className="p-2 text-rpg-text-secondary">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {state.chat.length === 0 && (
                <div className="text-center pt-8 space-y-3">
                  <p className="text-sm text-rpg-text-secondary leading-relaxed">
                    Háblame con naturalidad. Puedo replanificar tu día, ajustar la
                    dificultad o explicarte tus patrones.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto">
                    {CHIPS.map((c) => (
                      <button
                        key={c}
                        onClick={() => send(c.replace(/^[^ ]+ /, ''))}
                        className="text-[11px] bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-rpg-text-secondary hover:bg-white/10"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {state.chat.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-cyan-500/20 text-cyan-100 rounded-br-sm'
                        : 'bg-white/5 rounded-bl-sm'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 opacity-70">
                      {m.role === 'assistant' ? <Bot size={11} /> : <User size={11} />}
                      <span className="text-[9px] uppercase tracking-wider">
                        {m.role === 'assistant' ? 'Coach' : 'Tú'}
                      </span>
                    </div>
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="bg-white/5 px-4 py-3 rounded-2xl flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Escríbele a tu coach…"
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-rpg-text-secondary resize-none outline-none focus:border-cyan-400/50 max-h-28"
                />
                <button
                  onClick={() => void send()}
                  disabled={busy || !input.trim()}
                  className="w-11 h-11 rpg-gradient rounded-xl flex items-center justify-center disabled:opacity-40"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
