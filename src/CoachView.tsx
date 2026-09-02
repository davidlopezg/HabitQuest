/**
 * CoachView — flujo del coach adaptativo (Fase 2).
 *
 * Onboarding "¿Qué quieres conseguir?" → Check-in matutino → Plan diario
 * (AHORA / PRÓXIMO / HOY) → completar / "NO PUEDO" / posponer.
 *
 * Estado persistido en localStorage bajo `habitquest_coach` (motor puro).
 * Estilo visual consistente con la app RPG existente.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Clock, Flame, Send, X, Zap } from 'lucide-react';
import type {
  Behavior,
  CoachState,
  DayCheckIn,
  DayIntention,
  DayMode,
  PlanItem,
  TimeAvailable,
} from './engine/index.ts';
import {
  applyDecomposed,
  CATALOG,
  classifyReason,
  consolidationEvent,
  decompose,
  emptyState,
  evaluateCompletion,
  getOrBuildPlan,
  handleCannot,
  levelDef,
  recommendLevel,
  recordCompletion,
  streakDays,
  todayKey,
  toHHMM,
  WEEKDAY_ES,
  weekdayOf,
} from './engine/index.ts';

const STORAGE_KEY = 'habitquest_coach';
const EXAMPLES = [
  'Quiero ponerme en forma',
  'Quiero leer más',
  'Quiero aprender inglés',
  'Quiero dormir mejor',
  'Quiero ser más ordenado',
];

function loadState(): CoachState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CoachState;
  } catch {
    /* ignore */
  }
  return emptyState();
}

function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Cierra días anteriores: los pendientes sin resolver se registran como 'miss'. */
function closePreviousDays(state: CoachState, today: string): CoachState {
  let changed = false;
  const plans = { ...state.plans };
  const logs = [...state.logs];
  for (const [date, plan] of Object.entries(plans)) {
    if (date >= today) continue;
    const pending = plan.items.filter((i) => i.status === 'pending');
    if (pending.length === 0) continue;
    for (const it of pending) {
      logs.push({
        date,
        behaviorId: it.behaviorId,
        kind: 'miss',
        minutes: 0,
        dayMode: plan.mode,
        plannedMinutes: it.minutes,
      });
    }
    plans[date] = {
      ...plan,
      items: plan.items.map((i) => (i.status === 'pending' ? { ...i, status: 'skipped' as const } : i)),
    };
    changed = true;
  }
  return changed ? { ...state, plans, logs } : state;
}

// ---------- Componente ----------

export default function CoachView({ onGoManual }: { onGoManual?: () => void }) {
  const [cs, setCs] = useState<CoachState>(loadState);
  const [objective, setObjective] = useState('');
  const [notice, setNotice] = useState<{ icon: string; text: string } | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null); // EMPEZAR expandido
  const [cannotItem, setCannotItem] = useState<string | null>(null); // modal NO PUEDO
  const [cannotText, setCannotText] = useState('');
  const [showIntro, setShowIntro] = useState(false);

  const today = todayKey();

  // Cerrar días anteriores una sola vez (al montar o cambiar de fecha).
  useEffect(() => {
    setCs((prev) => {
      const next = closePreviousDays(prev, today);
      return next === prev ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cs));
  }, [cs]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const goal = cs.goals[0];
  const checkinToday = cs.checkins.find((c) => c.date === today);
  const plan = cs.plans[today];

  const phase: 'onboarding' | 'checkin' | 'plan' = !goal
    ? 'onboarding'
    : !checkinToday
      ? 'checkin'
      : 'plan';

  const behaviors = useMemo(
    () => cs.behaviors.filter((b) => b.enabled && b.goalId === goal?.id),
    [cs.behaviors, goal],
  );

  const xp = cs.counters.xp ?? 0;
  const coachLevel = Math.floor(xp / 100) + 1;

  // ---------- acciones ----------

  function createObjective(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const outcome = decompose(text, today);
    let next = applyDecomposed(cs, outcome);
    next = { ...next, plans: {} };
    setCs(next);
    setShowIntro(true);
    setNotice({ icon: '🧠', text: outcome.message });
  }

  function submitCheckin(c: DayCheckIn) {
    const checkins = cs.checkins.filter((x) => x.date !== today).concat(c);
    const withCheckin = { ...cs, checkins };
    const { state, plan: p } = getOrBuildPlan(withCheckin, c);
    setCs(state);
    setOpenItem(null);
    setShowIntro(false);
    setNotice({ icon: p.items.length ? '🗓️' : '💡', text: p.headline });
  }

  function finishItem(item: PlanItem, minutes: number) {
    const b = cs.behaviors.find((x) => x.id === item.behaviorId);
    if (!b || !plan) return;
    // 1) registrar
    let s = recordCompletion(cs, {
      date: today,
      behaviorId: b.id,
      minutes,
      plannedMinutes: item.minutes,
      dayMode: plan.mode,
    });
    // 2) gamificación
    const bAfter = s.behaviors.find((x) => x.id === b.id)!;
    const { counters, events } = evaluateCompletion(
      { counters: s.counters, logs: s.logs },
      bAfter,
      today,
      minutes,
      item.minutes,
      plan.mode,
    );
    const consolidated = consolidationEvent(counters, bAfter);
    const allEvents = consolidated ? [...events, consolidated] : events;
    counters.xp = (s.counters.xp ?? 0) + allEvents.reduce((acc, e) => acc + e.xp, 0);
    s = { ...s, counters };

    // 3) progresión (avanzar / mantener / reducir)
    const rec = recommendLevel(bAfter, s.logs, today);
    if ((rec.action === 'advance' || rec.action === 'reduce') && rec.toLevel !== bAfter.currentLevel) {
      s = {
        ...s,
        behaviors: s.behaviors.map((x) =>
          x.id === b.id ? { ...x, currentLevel: rec.toLevel } : x,
        ),
      };
      const ev = {
        icon: rec.action === 'advance' ? '⬆️' : '⬇️',
        text: rec.message,
      };
      setNotice(allEvents[0] ? { icon: allEvents[0].icon, text: `${allEvents[0].message} ${ev.text}` } : ev);
    } else {
      const ev = allEvents[allEvents.length - 1];
      setNotice(ev ? { icon: ev.icon, text: ev.message } : { icon: '✅', text: 'Hecho.' });
    }
    setOpenItem(null);
    setCs(s);
  }

  function sendCannot(item: PlanItem) {
    const text = cannotText.trim() || 'No puedo hacerlo ahora';
    const code = classifyReason(text);
    const reply = handleCannot({
      state: cs,
      date: today,
      behaviorId: item.behaviorId,
      reasonText: text,
      nowMinutes: nowMin(),
    });
    let s: CoachState = { ...cs, plans: { ...cs.plans, [today]: reply.plan } };
    // Si la acción lo deja excusado, registramos el log (aprende el patrón).
    if (reply.action === 'mode_change') {
      s = recordCompletion(s, {
        date: today,
        behaviorId: item.behaviorId,
        minutes: 0,
        reasonCode: code,
        dayMode: reply.plan.mode,
        plannedMinutes: item.minutes,
      });
    }
    setCs(s);
    setCannotItem(null);
    setCannotText('');
    setNotice({ icon: '🤝', text: reply.message });
  }

  function introduceNextBehavior() {
    if (!goal || goal.pipeline.length === 0) return;
    const tplId = goal.pipeline[0];
    const t = CATALOG.find((x) => x.id === tplId);
    if (!t) return;
    const newB: Behavior = {
      id: `${goal.id}__${tplId}`,
      goalId: goal.id,
      templateId: t.id,
      name: t.name,
      icon: t.icon,
      category: t.category,
      enabled: true,
      order: cs.behaviors.filter((b) => b.goalId === goal.id).length,
      introducedAt: today,
      currentLevel: 1,
      preferredSlots: t.slots,
    };
    const next: CoachState = {
      ...cs,
      behaviors: [...cs.behaviors, newB],
      goals: cs.goals.map((g) =>
        g.id === goal.id ? { ...g, pipeline: g.pipeline.slice(1) } : g,
      ),
    };
    // Replanificar hoy con el nuevo hábito si ya hay check-in.
    if (checkinToday) {
      const { state } = getOrBuildPlan(next, checkinToday);
      setCs(state);
    } else {
      setCs(next);
    }
    setNotice({ icon: '🌱', text: `Nuevo hábito: ${t.name}. Nivel 1 — objetivo mínimo. Sin prisa.` });
  }

  // ---------- render por fase ----------

  if (phase === 'onboarding') {
    return (
      <Onboarding
        objective={objective}
        setObjective={setObjective}
        onCreate={createObjective}
        examples={EXAMPLES}
        onGoManual={onGoManual}
      />
    );
  }

  if (phase === 'checkin') {
    return (
      <CheckinScreen
        goalTitle={goal!.title}
        raw={goal!.raw}
        behaviors={behaviors}
        showIntro={showIntro}
        onSubmitted={submitCheckin}
      />
    );
  }

  return (
    <div className="space-y-5">
      <NoticeBanner notice={notice} />

      {/* Cabecera del día */}
      <header className="rpg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-rpg-text-secondary">
              {WEEKDAY_ES[weekdayOf(today)]} · {today.split('-').reverse().join('/')}
            </p>
            <h1 className="font-heading font-bold text-xl">{goal!.title}</h1>
          </div>
          <div className="flex gap-2">
            <span className="bg-black/30 px-2.5 py-1 rounded-full text-[11px] font-bold">
              <Zap size={11} className="inline -mt-0.5 mr-0.5 text-amber-400" /> Lvl {coachLevel}
            </span>
            <span className="bg-black/30 px-2.5 py-1 rounded-full text-[11px] font-bold text-amber-400">
              ⭐ {cs.counters.resilienceWins}
            </span>
          </div>
        </div>
        {plan && (
          <p className="mt-3 text-sm font-semibold rpg-gradient-text">{plan.headline}</p>
        )}
        {plan?.coachNote && <p className="mt-2 text-xs text-rpg-text-secondary leading-relaxed">{plan.coachNote}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {behaviors.map((b) => {
            const def = levelDef(b);
            return (
              <span key={b.id} className="text-[11px] bg-white/5 px-2.5 py-1 rounded-full">
                {b.icon} {b.name} · Nv {b.currentLevel}
                {def ? ` (${def.minutes} min)` : ''}
              </span>
            );
          })}
        </div>
      </header>

      <PlanBody
        plan={plan}
        behaviors={behaviors}
        now={nowMin()}
        doneToday={countDone(plan)}
        openItem={openItem}
        setOpenItem={setOpenItem}
        onFinish={finishItem}
        onCannot={setCannotItem}
        streakMax={Math.max(0, ...behaviors.map((b) => streakDays(cs.logs, b, today)))}
        xp={xp}
        pipelineLength={goal!.pipeline.length}
        onIntroduceNext={behaviors.some((b) => cs.counters.consolidated.includes(b.id)) ? introduceNextBehavior : undefined}
      />

      {/* Modal NO PUEDO */}
      <AnimatePresence>
        {cannotItem && (
          <CannotModal
            item={plan?.items.find((i) => i.id === cannotItem)}
            text={cannotText}
            setText={setCannotText}
            onClose={() => { setCannotItem(null); setCannotText(''); }}
            onSend={() => {
              const it = plan?.items.find((i) => i.id === cannotItem);
              if (it) sendCannot(it);
            }}
          />
        )}
      </AnimatePresence>

      <p className="text-center text-[10px] text-rpg-text-secondary pb-2">
        El objetivo no cambia · se adapta el camino.
        {onGoManual && (
          <button onClick={onGoManual} className="underline ml-1">
            ¿Misiones manuales? Ir a Inicio →
          </button>
        )}
      </p>
    </div>
  );
}

// ---------- sub-pantallas ----------

function countDone(plan?: DayPlanLike) {
  if (!plan) return { done: 0, total: 0 };
  const done = plan.items.filter((i) => i.status === 'done_full' || i.status === 'done_minimal').length;
  return { done, total: plan.items.length };
}
type DayPlanLike = CoachState['plans'][string];

interface PlanBodyProps {
  plan?: DayPlanLike;
  behaviors: Behavior[];
  now: number;
  doneToday: { done: number; total: number };
  openItem: string | null;
  setOpenItem: (id: string | null) => void;
  onFinish: (item: PlanItem, minutes: number) => void;
  onCannot: (id: string | null) => void;
  streakMax: number;
  xp: number;
  pipelineLength: number;
  onIntroduceNext?: () => void;
}

function PlanBody(props: PlanBodyProps) {
  const { plan, behaviors, now, openItem, setOpenItem, onFinish, onCannot } = props;
  if (!plan || plan.items.length === 0) {
    return (
      <section className="rpg-card p-6 text-center">
        <div className="text-5xl mb-3">🌱</div>
        <h3 className="font-heading font-bold text-lg mb-2">Aún no hay plan</h3>
        <p className="text-sm text-rpg-text-secondary">
          Completa el check-in matutino y generaré tu día en 20 segundos.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 w-full py-3 rpg-gradient rounded-xl font-bold text-white"
        >
          Hacer check-in
        </button>
      </section>
    );
  }

  const pending = plan.items
    .filter((i) => i.status === 'pending')
    .sort((a, b) => a.startMinute - b.startMinute);
  const nowItem = pending.find((i) => i.startMinute <= now) ?? pending[0];
  const rest = pending.filter((i) => i.id !== nowItem?.id);
  const doneCount = props.doneToday.done;
  const total = props.doneToday.total;

  const iconOf = (behaviorId: string) =>
    behaviors.find((b) => b.id === behaviorId)?.icon ?? '✨';
  const prioColor: Record<PlanItem['priority'], string> = {
    essential: 'bg-red-500',
    important: 'bg-amber-400',
    optional: 'bg-green-400',
  };

  return (
    <>
      {/* AHORA */}
      {nowItem && (
        <section className="rpg-card p-5 border-l-4 border-l-cyan-400">
          <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-1">⚡ Ahora</p>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{iconOf(nowItem.behaviorId)}</span>
              <div>
                <h3 className="font-heading font-bold text-lg leading-tight">{nowItem.label}</h3>
                <p className="text-xs text-rpg-text-secondary mt-0.5">
                  <Clock size={11} className="inline mr-1" />
                  {toHHMM(nowItem.startMinute)}
                </p>
              </div>
            </div>
          </div>
          <ItemActions
            item={nowItem}
            behavior={behaviors.find((b) => b.id === nowItem.behaviorId)}
            open={openItem === nowItem.id}
            onToggle={() => setOpenItem(openItem === nowItem.id ? null : nowItem.id)}
            onFinish={onFinish}
            onCannot={() => onCannot(nowItem.id)}
          />
        </section>
      )}

      {/* Después */}
      {rest.length > 0 && (
        <section className="space-y-2">
          <h4 className="font-heading font-bold text-sm uppercase tracking-wider text-rpg-text-secondary px-1">
            Después
          </h4>
          {rest.map((it) => (
            <div key={it.id} className="rpg-card px-4 py-3 flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${prioColor[it.priority]}`} />
              <span className="text-2xl">{iconOf(it.behaviorId)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{it.label}</p>
                <p className="text-[10px] text-rpg-text-secondary">{toHHMM(it.startMinute)}</p>
              </div>
              <ItemActions
                item={it}
                behavior={behaviors.find((b) => b.id === it.behaviorId)}
                open={openItem === it.id}
                onToggle={() => setOpenItem(openItem === it.id ? null : it.id)}
                onFinish={onFinish}
                onCannot={() => onCannot(it.id)}
                compact
              />
            </div>
          ))}
        </section>
      )}

      {/* HOY */}
      <section className="rpg-card p-4 grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-green-400">{doneCount}/{total}</p>
          <p className="text-[9px] text-rpg-text-secondary uppercase">Hoy</p>
        </div>
        <div>
          <p className="text-lg font-bold text-orange-400 flex items-center justify-center gap-1">
            <Flame size={14} /> {props.streakMax}
          </p>
          <p className="text-[9px] text-rpg-text-secondary uppercase">Racha</p>
        </div>
        <div>
          <p className="text-lg font-bold text-amber-400">⭐{props.xp}</p>
          <p className="text-[9px] text-rpg-text-secondary uppercase">XP</p>
        </div>
        <div>
          <p className="text-lg font-bold text-cyan-400">Lvl {Math.floor(props.xp / 100) + 1}</p>
          <p className="text-[9px] text-rpg-text-secondary uppercase">Coach</p>
        </div>
      </section>

      {/* Completados hoy */}
      {doneCount > 0 && (
        <section className="space-y-1.5">
          {plan.items
            .filter((i) => i.status === 'done_full' || i.status === 'done_minimal')
            .map((it) => (
              <div key={it.id} className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl opacity-80">
                <CheckCircle2 size={16} className="text-green-400" />
                <span className="text-xs line-through decoration-green-400/60">{it.label}</span>
              </div>
            ))}
        </section>
      )}

      {props.onIntroduceNext && props.pipelineLength > 0 && (
        <button
          onClick={props.onIntroduceNext}
          className="w-full py-3 bg-cyan-500/15 text-cyan-300 rounded-xl text-sm font-semibold"
        >
          🌱 Primer hábito consolidado → introducir el siguiente
        </button>
      )}
    </>
  );
}

interface ItemActionsProps {
  item: PlanItem;
  behavior?: Behavior;
  open: boolean;
  onToggle: () => void;
  onFinish: (item: PlanItem, minutes: number) => void;
  onCannot: () => void;
  compact?: boolean;
}

function ItemActions({ item, behavior, open, onToggle, onFinish, onCannot, compact }: ItemActionsProps) {
  if (compact && !open) {
    return (
      <button onClick={onToggle} className="text-[11px] bg-white/5 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap">
        EMPEZAR
      </button>
    );
  }
  const def = behavior ? levelDef(behavior) : undefined;
  const minimal = def?.minimal ?? Math.max(1, Math.round(item.minutes * 0.2));
  const canMinimal = item.version === 'full' && minimal < item.minutes;

  return (
    <div className={open ? 'mt-3' : ''}>
      {!open && (
        <div className="flex gap-2">
          <button
            onClick={onToggle}
            className="flex-1 py-2.5 rpg-gradient rounded-xl font-bold text-white text-sm"
          >
            EMPEZAR
          </button>
          <button
            onClick={onCannot}
            className="py-2.5 px-3 bg-white/5 rounded-xl text-sm font-semibold text-rpg-text-secondary"
          >
            NO PUEDO
          </button>
        </div>
      )}
      {open && (
        <div className="grid gap-2">
          <button
            onClick={() => onFinish(item, item.minutes)}
            className="py-2.5 bg-green-500/20 text-green-300 rounded-xl font-semibold text-sm"
          >
            ✅ Lo he hecho · {item.minutes} min
          </button>
          {canMinimal && (
            <button
              onClick={() => onFinish(item, minimal)}
              className="py-2.5 bg-amber-500/15 text-amber-300 rounded-xl font-semibold text-sm"
            >
              ⏱️ Solo el mínimo · {minimal} min
            </button>
          )}
          <button
            onClick={onCannot}
            className="py-2.5 bg-white/5 text-rpg-text-secondary rounded-xl font-semibold text-sm"
          >
            🙅 No puedo (explico por qué)
          </button>
          <button onClick={onToggle} className="py-1.5 text-[11px] text-rpg-text-secondary">
            cerrar
          </button>
        </div>
      )}
    </div>
  );
}

function NoticeBanner({ notice }: { notice: { icon: string; text: string } | null }) {
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="rpg-card p-4 flex items-start gap-3 border-l-4 border-l-cyan-400"
        >
          <span className="text-2xl">{notice.icon}</span>
          <p className="text-sm leading-relaxed flex-1">{notice.text}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Onboarding ----------

function Onboarding({
  objective,
  setObjective,
  onCreate,
  examples,
  onGoManual,
}: {
  objective: string;
  setObjective: (v: string) => void;
  onCreate: (raw: string) => void;
  examples: string[];
  onGoManual?: () => void;
}) {
  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rpg-card p-6">
        <div className="text-5xl mb-4">🧑‍🏫</div>
        <h2 className="font-heading font-bold text-2xl leading-tight">¿Qué quieres conseguir?</h2>
        <p className="text-sm text-rpg-text-secondary mt-2 leading-relaxed">
          Escríbelo con tus palabras. Yo lo descompongo en pasos pequeños y adapto el
          plan a cómo estés cada día.
        </p>
        <textarea
          autoFocus
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onCreate(objective);
            }
          }}
          placeholder="Ej: Quiero leer más…"
          rows={3}
          className="w-full mt-4 bg-black/40 border border-white/10 rounded-xl px-4 py-3 placeholder:text-rpg-text-secondary resize-none outline-none focus:border-cyan-400/50"
        />
        <button
          disabled={!objective.trim()}
          onClick={() => onCreate(objective)}
          className="w-full mt-3 py-3 rpg-gradient rounded-xl font-bold text-white disabled:opacity-40"
        >
          Crear mi objetivo
        </button>
        <div className="mt-4 flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setObjective(ex)}
              className="text-[11px] bg-white/5 px-3 py-1.5 rounded-full text-rpg-text-secondary"
            >
              {ex}
            </button>
          ))}
        </div>
      </motion.div>
      <p className="text-center text-[10px] text-rpg-text-secondary px-6 leading-relaxed">
        🔒 Tus datos se guardan en tu dispositivo. «El objetivo no cambia · se adapta el camino».
      </p>
      {onGoManual && (
        <button onClick={onGoManual} className="block mx-auto text-xs text-rpg-text-secondary underline">
          Ya tengo misiones manuales → Ir a Inicio
        </button>
      )}
    </div>
  );
}

// ---------- Check-in ----------

const FEELINGS: { key: 'energy' | 'mood' | 'focus' | 'stress'; icon: string; label: string }[] = [
  { key: 'energy', icon: '⚡', label: 'Energía' },
  { key: 'mood', icon: '😊', label: 'Ánimo' },
  { key: 'focus', icon: '🎯', label: 'Concentración' },
  { key: 'stress', icon: '🌊', label: 'Estrés' },
];

function CheckinScreen({
  goalTitle,
  raw,
  behaviors,
  showIntro,
  onSubmitted,
}: {
  goalTitle: string;
  raw: string;
  behaviors: Behavior[];
  showIntro: boolean;
  onSubmitted: (c: DayCheckIn) => void;
}) {
  const [energy, setEnergy] = useState(6);
  const [mood, setMood] = useState(6);
  const [focus, setFocus] = useState(6);
  const [stress, setStress] = useState(4);
  const [time, setTime] = useState<TimeAvailable>('normal');
  const [intention, setIntention] = useState<DayIntention>('maintain');

  const vals = { energy, mood, focus, stress } as const;

  const submit = () =>
    onSubmitted({
      date: todayKey(),
      energy,
      mood,
      focus,
      stress,
      timeAvailable: time,
      intention,
      submittedAt: new Date().toISOString(),
    });

  return (
    <div className="space-y-5">
      {showIntro && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rpg-card p-5 border-l-4 border-l-cyan-400">
          <p className="font-heading font-bold text-lg">Objetivo: {goalTitle}</p>
          <p className="text-xs text-rpg-text-secondary mt-1 italic">“{raw}”</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {behaviors.map((b) => (
              <span key={b.id} className="text-xs bg-white/5 px-3 py-1.5 rounded-full">
                {b.icon} {b.name} · nivel 1
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-rpg-text-secondary leading-relaxed">
            Solo empezamos con lo esencial. Cuando se consolide, añadiremos el siguiente paso.
          </p>
        </motion.div>
      )}

      <div className="rpg-card p-5">
        <h3 className="font-heading font-bold text-lg">¿Cómo estás hoy?</h3>
        <p className="text-xs text-rpg-text-secondary">20 segundos y tendrás tu plan del día.</p>
        <div className="mt-4 space-y-4">
          {FEELINGS.map((f) => (
            <div key={f.key}>
              <div className="flex justify-between text-xs mb-1">
                <span>{f.icon} {f.label}</span>
                <span className="font-bold text-cyan-400">{vals[f.key]}/10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={vals[f.key]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (f.key === 'energy') setEnergy(v);
                  if (f.key === 'mood') setMood(v);
                  if (f.key === 'focus') setFocus(v);
                  if (f.key === 'stress') setStress(v);
                }}
                className="w-full accent-cyan-400"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-rpg-text-secondary mt-5 mb-2">Tiempo disponible hoy</p>
        <div className="grid grid-cols-3 gap-2">
          {(['little', 'normal', 'plenty'] as TimeAvailable[]).map((t) => (
            <button
              key={t}
              onClick={() => setTime(t)}
              className={`py-2 rounded-xl text-xs font-semibold ${time === t ? 'bg-cyan-500/30 ring-2 ring-cyan-500' : 'bg-white/5'}`}
            >
              {t === 'little' ? '⏳ Poco' : t === 'normal' ? '⚖️ Normal' : '🌤️ Mucho'}
            </button>
          ))}
        </div>

        <p className="text-xs text-rpg-text-secondary mt-4 mb-2">Intención del día</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['advance', '🚀 Quiero avanzar'],
            ['maintain', '⚖️ Mantener'],
            ['recover', '🌱 Recuperarme'],
          ] as [DayIntention, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setIntention(k)}
              className={`py-2 rounded-xl text-xs font-semibold ${intention === k ? 'bg-cyan-500/30 ring-2 ring-cyan-500' : 'bg-white/5'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <button onClick={submit} className="w-full mt-5 py-3.5 rpg-gradient rounded-xl font-bold text-white">
          Generar mi día
        </button>
      </div>
    </div>
  );
}

// ---------- Modal NO PUEDO ----------

const QUICK_REASONS = [
  'Me ha surgido una reunión',
  'No tengo tiempo',
  'Estoy agotado',
  'Estoy fuera de casa',
  'Tengo que llevar a mi hija al médico',
  'No me apetece',
];

function CannotModal({
  item,
  text,
  setText,
  onClose,
  onSend,
}: {
  item?: PlanItem;
  text: string;
  setText: (v: string) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center p-4"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="rpg-card p-5 w-full max-w-md"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="font-heading font-bold text-lg">¿Qué ha ocurrido?</h4>
            {item && <p className="text-xs text-rpg-text-secondary mt-0.5">{item.label}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-rpg-text-secondary">
            <X size={18} />
          </button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Explícamelo con tus palabras. Adaptaré el plan, no te juzgaré."
          rows={3}
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-rpg-text-secondary resize-none outline-none focus:border-cyan-400/50"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setText(r)}
              className="text-[11px] bg-white/5 px-2.5 py-1.5 rounded-full text-rpg-text-secondary"
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={onSend}
          className="w-full mt-4 py-3 bg-cyan-500 rounded-xl font-bold flex items-center justify-center gap-2"
        >
          <Send size={15} /> Replanificar mi día
        </button>
      </motion.div>
    </motion.div>
  );
}
