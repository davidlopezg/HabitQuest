/**
 * CoachView — flujo del coach adaptativo (Fase 2).
 *
 * Onboarding "¿Qué quieres conseguir?" → Check-in matutino → Plan diario
 * (AHORA / PRÓXIMO / HOY) → completar / "NO PUEDO" / posponer.
 *
 * Estado persistido en localStorage bajo `habitquest_coach` (motor puro).
 * Estilo visual consistente con la app RPG existente.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Circle, Clock, Flame, MessageCircle, Send, X, Zap } from 'lucide-react';
import type {
  Behavior,
  BehaviorLogEntry,
  CoachCounters,
  CoachState,
  DayCheckIn,
  DayIntention,
  DayMode,
  DaySlot,
  Goal,
  PlanItem,
  TimeAvailable,
} from './engine/index.ts';
import {
  addDays,
  adherence,
  analyzePatterns,
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
  REASON_LABEL,
  reasonDistribution,
  recommendLevel,
  rebuildPlan,
  recordCompletion,
  resolveLevels,
  SLOT_DEFAULT_MIN,
  SLOT_LABEL,
  streakDays,
  todayKey,
  toHHMM,
  WEEKDAY_ES,
  weekdayOf,
} from './engine/index.ts';
import CoachChat from './CoachChat.tsx';
import { computeLegacySeed, migrationMessage } from './migration.ts';
import { pushAvailable, setupPush, syncPlanPush } from './push.ts';

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
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CoachState>;
      const base = emptyState();
      return {
        ...base,
        ...parsed,
        counters: { ...base.counters, ...(parsed.counters ?? {}) },
        memory: { ...base.memory, ...(parsed.memory ?? {}) },
        chat: parsed.chat ?? [],
      } as CoachState;
    }
  } catch {
    /* ignore */
  }
  return emptyState();
}

function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Etiqueta de tiempo relativa y calmada para el plan. */
function relTimeLabel(start: number, now: number): string {
  const diff = start - now;
  if (diff >= 0) {
    if (diff === 0) return 'ahora';
    if (diff < 60) return `en ${diff} min`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    if (h < 3) return m > 0 ? `en ${h} h ${m}` : `en ${h} h`;
    return ''; // muy lejano: sin ruido
  }
  const past = -diff;
  if (past < 75) return 'ahora';
  return `hace ${Math.floor(past / 60)} h`;
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

export interface ManualMissionItem {
  id: string;
  name: string;
  icon: string;
  done: boolean;
}

export interface ManualMissionsProps {
  items: ManualMissionItem[];
  onToggle: (id: string) => void;
}

interface CoachViewProps {
  onGoManual?: () => void;
  /** Abre la guía completa de la app (desde onboarding). */
  onOpenGuide?: () => void;
  /** Misiones manuales del modo libre (v1) para mostrarlas dentro del día del coach. */
  manualMissions?: ManualMissionsProps;
}

export default function CoachView({ onGoManual, onOpenGuide, manualMissions }: CoachViewProps) {
  const [cs, setCs] = useState<CoachState>(loadState);
  const [objective, setObjective] = useState('');
  const [notice, setNotice] = useState<{ icon: string; text: string } | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null); // EMPEZAR expandido
  const [cannotItem, setCannotItem] = useState<string | null>(null); // modal NO PUEDO
  const [cannotText, setCannotText] = useState('');
  const [showIntro, setShowIntro] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [newGoalText, setNewGoalText] = useState('');
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insightDismissed, setInsightDismissed] = useState(false);
  // --- Notificaciones (recordatorios contextuales) ---
  const [remindEnabled, setRemindEnabled] = useState(() => {
    try {
      return localStorage.getItem('habitquest_reminders') !== '0';
    } catch {
      return true;
    }
  });
  const [notifState, setNotifState] = useState<'undecided' | 'granted' | 'denied' | 'unsupported'>('undecided');

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

  const activeGoals = cs.goals.filter((g) => g.status === 'active');
  const checkinToday = cs.checkins.find((c) => c.date === today);
  const plan = cs.plans[today];

  const allBehaviors = useMemo(
    () => cs.behaviors.filter((b) => b.enabled && activeGoals.some((g) => g.id === b.goalId)),
    [cs.behaviors, activeGoals],
  );
  const anyConsolidated = allBehaviors.some((b) => cs.counters.consolidated.includes(b.id));
  const detailGoal = activeGoals.find((g) => g.id === detailGoalId) ?? null;

  // Insights deterministas del coach (se actualizan con cada día de uso).
  const insightsNow = useMemo(() => analyzePatterns(cs, { sinceDays: 28 }), [cs]);
  const insightCard = insightsNow[0] ?? null;
  const insightSeenDate = (() => {
    try {
      return localStorage.getItem('habitquest_insight_seen') ?? '';
    } catch {
      return '';
    }
  })();
  const showInsightCard =
    !insightDismissed && !!insightCard && insightSeenDate !== today && cs.logs.length >= 5;


  const phase: 'onboarding' | 'checkin' | 'plan' =
    activeGoals.length === 0 ? 'onboarding' : !checkinToday ? 'checkin' : 'plan';

  const xp = cs.counters.xp ?? 0;
  const coachLevel = Math.floor(xp / 100) + 1;

  // ---------- notificaciones ----------

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setNotifState('unsupported');
      return;
    }
    setNotifState(Notification.permission as 'granted' | 'denied' | 'default');
  }, []);

  async function enableReminders() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        const r = await Notification.requestPermission();
        setNotifState(r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'undecided');
      } catch {
        /* ignore */
      }
    }
    const next = !remindEnabled;
    setRemindEnabled(next);
    try {
      localStorage.setItem('habitquest_reminders', next ? '1' : '0');
    } catch {
      /* ignore */
    }
    // Push reales (app cerrada): registrar token FCM si está configurado.
    if (next && notifState === 'granted' && pushAvailable()) {
      const r = await setupPush();
      if (r === 'ok') {
        setNotice({
          icon: '🔔',
          text: 'Avisos push activados: llegarán incluso con la app cerrada.',
        });
      } else if (r === 'denied') {
        setNotifState('denied');
      }
    }
  }

  // Sincroniza el plan con el Worker de push (fire-and-forget; sin config = no-op).
  useEffect(() => {
    void syncPlanPush(plan ?? null);
  }, [plan]);

  /** Recordatorio único por elemento del plan cuando llega (o ha pasado poco de) su hora. */
  function maybeRemind() {
    if (!remindEnabled || phase !== 'plan' || !plan) return;
    const now = nowMin();
    const pending = plan.items.filter((i) => i.status === 'pending');
    if (pending.length === 0) return;
    const storeKey = `habitquest_reminded_${today}`;
    let done: Set<string>;
    try {
      done = new Set(JSON.parse(localStorage.getItem(storeKey) ?? '[]'));
    } catch {
      done = new Set();
    }
    for (const it of pending) {
      if (done.has(it.id)) continue;
      // Ventana: 5 min antes de la hora hasta 90 min después. Una sola vez.
      if (it.startMinute - now <= 5 && it.startMinute - now >= -90) {
        done.add(it.id);
        try {
          localStorage.setItem(storeKey, JSON.stringify([...done]));
        } catch {
          /* ignore */
        }
        const b = allBehaviors.find((x) => x.id === it.behaviorId);
        const def = b ? levelDef(b) : undefined;
        const shortLabel = it.label.replace(/\s*\(mínimo\)/, '');
        const body =
          plan.mode === 'recovery' || plan.mode === 'minimal' || it.version === 'minimal'
            ? `${shortLabel}. Es la versión mínima: con mantener el hábito basta hoy.`
            : `${shortLabel}. Si hoy no tienes energía, podemos hacer la versión mínima de ${def?.minimal ?? 1} min.`;
        if (notifState === 'granted') {
          try {
            new Notification(`${b?.icon ?? '⏰'} ${it.label}`, {
              body,
              tag: it.id,
              data: { url: window.location.href },
            });
          } catch {
            /* ignore */
          }
        }
        setNotice({ icon: b?.icon ?? '⏰', text: body });
        break; // un aviso por ronda
      }
    }
  }
  const remindRef = useRef(maybeRemind);
  remindRef.current = maybeRemind;
  useEffect(() => {
    const run = () => remindRef.current();
    run();
    const id = setInterval(run, 45000);
    return () => clearInterval(id);
  }, []);

  // ---------- acciones ----------

  function createObjective(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const outcome = decompose(text, today);
    let next = applyDecomposed(cs, outcome);
    next = { ...next, plans: {} };

    // Migración única: sumar el progreso del modo manual (v1) al coach.
    let msg = outcome.message;
    let icon = '🧠';
    try {
      const migrated = localStorage.getItem('habitquest_migrated');
      if (!migrated && cs.counters.xp === 0) {
        const legacyRaw = localStorage.getItem('habitquest_data');
        if (legacyRaw) {
          const seed = computeLegacySeed(JSON.parse(legacyRaw));
          if (seed.hasLegacy) {
            next = {
              ...next,
              counters: { ...next.counters, xp: seed.seedXp },
            };
            localStorage.setItem('habitquest_migrated', '1');
            msg = migrationMessage(seed) + '\n\n' + outcome.message;
            icon = '🎁';
          }
        }
      }
    } catch {
      /* si no hay datos v1 o son inválidos, se ignora */
    }

    setCs(next);
    setShowIntro(true);
    setNotice({ icon, text: msg });
  }

  /** Añade un objetivo adicional (máx. 3) y replanifica el día de hoy conservando lo hecho. */
  function addGoal(raw: string) {
    const text = raw.trim();
    if (!text || activeGoals.length >= 3) return;
    const outcome = decompose(text, today);
    let next = applyDecomposed(cs, outcome);
    if (checkinToday) {
      next = rebuildPlan(next, checkinToday);
    }
    setCs(next);
    setAddGoalOpen(false);
    setNewGoalText('');
    const advice = !anyConsolidated
      ? '\n\nConsejo: si es pronto, consolida el primer objetivo antes de dividir tu atención (puedes tener hasta 3).'
      : '';
    setNotice({ icon: '🎯', text: outcome.message + advice });
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

  /** Introduce el siguiente hábito de la cola de UN objetivo concreto. */
  function introduceNextBehavior(goalId: string) {
    const g = cs.goals.find((x) => x.id === goalId);
    if (!g || g.pipeline.length === 0) return;
    const tplId = g.pipeline[0];
    const t = CATALOG.find((x) => x.id === tplId);
    if (!t) return;
    const newB: Behavior = {
      id: `${g.id}__${tplId}`,
      goalId: g.id,
      templateId: t.id,
      name: t.name,
      icon: t.icon,
      category: t.category,
      enabled: true,
      order: cs.behaviors.filter((b) => b.goalId === g.id).length,
      introducedAt: today,
      currentLevel: 1,
      preferredSlots: t.slots,
    };
    let next: CoachState = {
      ...cs,
      behaviors: [...cs.behaviors, newB],
      goals: cs.goals.map((x) =>
        x.id === g.id ? { ...x, pipeline: x.pipeline.slice(1) } : x,
      ),
    };
    // Replanificar hoy conservando lo ya hecho si hay check-in.
    if (checkinToday) {
      next = rebuildPlan(next, checkinToday);
    }
    setCs(next);
    setNotice({ icon: '🌱', text: `Nuevo hábito: ${t.name}. Nivel 1 — objetivo mínimo. Sin prisa.` });
  }

  /** Cambia franja/hora de un comportamiento y replanifica HOY conservando lo hecho. */
  function updateBehaviorTime(id: string, patch: { slot?: DaySlot; startMinute?: number }) {
    setCs((prev) => {
      let s: CoachState = {
        ...prev,
        behaviors: prev.behaviors.map((b) =>
          b.id === id
            ? {
                ...b,
                preferredSlots: patch.slot
                  ? [patch.slot, ...b.preferredSlots.filter((x) => x !== patch.slot)]
                  : b.preferredSlots,
                startMinute:
                  patch.slot !== undefined
                    ? undefined
                    : patch.startMinute !== undefined
                      ? Math.round(patch.startMinute)
                      : b.startMinute,
              }
            : b,
        ),
      };
      const ck = s.checkins.find((c) => c.date === today);
      if (ck) s = rebuildPlan(s, ck);
      return s;
    });
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
        onOpenGuide={onOpenGuide}
      />
    );
  }

  if (phase === 'checkin') {
    return (
      <CheckinScreen
        goals={activeGoals}
        behaviors={allBehaviors}
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
            {activeGoals.length === 1 ? (
              <h1 className="font-heading font-bold text-xl">{activeGoals[0].title}</h1>
            ) : (
              <h1 className="font-heading font-bold text-xl">Tus objetivos</h1>
            )}
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

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => void enableReminders()}
            className={`text-[11px] px-3 py-1.5 rounded-full font-semibold ${remindEnabled ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-rpg-text-secondary'}`}
          >
            {remindEnabled ? '🔔 Avisos activados' : '🔕 Avisos desactivados'}
          </button>
          <button
            onClick={() => setInsightsOpen(true)}
            className="text-[11px] px-3 py-1.5 rounded-full font-semibold bg-white/5 text-rpg-text-secondary"
          >
            🧠 Insights
          </button>
        </div>
        {(notifState === 'denied' || notifState === 'unsupported') && (
          <p className="mt-1.5 text-[10px] text-rpg-text-secondary">
            {notifState === 'denied'
              ? 'permiso de avisos denegado en el navegador'
              : 'este navegador no permite avisos nativos (verás el aviso dentro de la app)'}
          </p>
        )}
      </header>

      {/* Insight del día (auto) */}
      {showInsightCard && insightCard && (
        <section className="rpg-card p-4 border-l-4 border-l-amber-400 relative">
          <button
            onClick={() => {
              setInsightDismissed(true);
              try {
                localStorage.setItem('habitquest_insight_seen', today);
              } catch {
                /* ignore */
              }
            }}
            className="absolute top-2 right-2 text-rpg-text-secondary text-xs px-1"
            aria-label="Ocultar insight"
          >
            ✕
          </button>
          <p className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-1">
            🧠 Lo que observo
          </p>
          <p className="text-xs text-rpg-text-secondary leading-relaxed pr-4">{insightCard.message}</p>
          <button
            onClick={() => setInsightsOpen(true)}
            className="mt-2 text-[11px] font-semibold text-cyan-300"
          >
            Ver todo lo aprendido →
          </button>
        </section>
      )}

      {/* Tus objetivos — acceso a las fases de cada uno */}
      <section className="rpg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading font-bold text-sm">🎯 Tus objetivos</h3>
          <span className="text-[10px] text-rpg-text-secondary">{activeGoals.length}/3 en curso</span>
        </div>
        <div className="space-y-2">
          {activeGoals.map((g) => {
            const gb = allBehaviors.filter((b) => b.goalId === g.id);
            const gConsolidated = gb.some((b) => cs.counters.consolidated.includes(b.id));
            return (
              <button
                key={g.id}
                onClick={() => setDetailGoalId(g.id)}
                className="w-full flex items-center gap-3 bg-black/20 rounded-xl px-3 py-3 text-left hover:bg-black/30 transition"
              >
                <span className="text-2xl">🎯</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">
                    {g.title}
                    {gConsolidated && <span className="ml-1.5 text-[10px] text-green-400">🌱 base consolidada</span>}
                  </span>
                  <span className="block text-[10px] text-rpg-text-secondary truncate mt-0.5">
                    {gb.length > 0
                      ? gb.map((b) => `${b.icon} ${b.name} · Nv${b.currentLevel}`).join('   ')
                      : 'sin hábitos aún'}
                    {g.pipeline.length > 0 ? `   +${g.pipeline.length} en cola` : ''}
                  </span>
                </span>
                <span className="text-cyan-400 text-xl font-bold">›</span>
              </button>
            );
          })}
        </div>
        {activeGoals.length < 3 && (
          <button
            onClick={() => setAddGoalOpen(true)}
            className="mt-2 w-full py-2 rounded-xl text-sm font-semibold text-cyan-300 bg-white/5 border border-dashed border-cyan-400/40"
          >
            ＋ Añadir objetivo
          </button>
        )}
        <p className="mt-2 text-[10px] text-rpg-text-secondary">
          Toca un objetivo para ver sus fases, niveles y adherencia.
        </p>
      </section>

      <PlanBody
        plan={plan}
        behaviors={allBehaviors}
        goalTitleOf={
          activeGoals.length > 1
            ? (id: string) => activeGoals.find((g) => g.id === id)?.title
            : undefined
        }
        now={nowMin()}
        doneToday={countDone(plan)}
        openItem={openItem}
        setOpenItem={setOpenItem}
        onFinish={finishItem}
        onCannot={setCannotItem}
        streakMax={Math.max(0, ...allBehaviors.map((b) => streakDays(cs.logs, b, today)))}
        xp={xp}
        manualMissions={manualMissions}
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

      {/* Modal añadir objetivo */}
      <AnimatePresence>
        {addGoalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAddGoalOpen(false)}
            className="fixed inset-0 z-[105] bg-black/80 flex items-center justify-center p-5"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="rpg-card p-5 w-full max-w-sm"
            >
              <h3 className="font-heading font-bold text-lg mb-1">🎯 Añadir objetivo</h3>
              <p className="text-xs text-rpg-text-secondary mb-3">
                ¿Qué más quieres conseguir? (hasta 3 objetivos en curso)
              </p>
              <textarea
                autoFocus
                value={newGoalText}
                onChange={(e) => setNewGoalText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addGoal(newGoalText);
                  }
                }}
                placeholder="Ej: Quiero dormir mejor…"
                rows={2}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 placeholder:text-rpg-text-secondary resize-none outline-none focus:border-cyan-400/50 text-sm"
              />
              {!anyConsolidated && (
                <p className="mt-2 text-[10px] text-amber-400/90 leading-relaxed">
                  💡 Aún no has consolidado ningún hábito. Puedes añadirlo, pero concentrarte en uno
                  primero suele dar mejores resultados.
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setAddGoalOpen(false)}
                  className="flex-1 py-2.5 bg-white/5 rounded-xl text-sm font-semibold text-rpg-text-secondary"
                >
                  Cancelar
                </button>
                <button
                  disabled={!newGoalText.trim()}
                  onClick={() => addGoal(newGoalText)}
                  className="flex-1 py-2.5 rpg-gradient rounded-xl text-sm font-bold text-white disabled:opacity-40"
                >
                  Añadir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detalle de objetivo: fases y hábitos */}
      <AnimatePresence>
        {detailGoal && (
          <GoalDetailOverlay
            goal={detailGoal}
            behaviors={cs.behaviors.filter((b) => b.enabled && b.goalId === detailGoal.id)}
            logs={cs.logs}
            counters={cs.counters}
            today={today}
            onClose={() => setDetailGoalId(null)}
            onEditBehavior={updateBehaviorTime}
            onIntroduce={(goalId) => {
              introduceNextBehavior(goalId);
              setDetailGoalId(null);
            }}
            canIntroduce={
              detailGoal.pipeline.length > 0 &&
              cs.behaviors.some(
                (b) => b.goalId === detailGoal.id && cs.counters.consolidated.includes(b.id),
              )
            }
          />
        )}
      </AnimatePresence>

      {/* Insights: lo que el coach ha aprendido */}
      <AnimatePresence>
        {insightsOpen && (
          <InsightsOverlay
            state={cs}
            behaviors={allBehaviors}
            today={today}
            onClose={() => setInsightsOpen(false)}
            onAskChat={() => {
              setInsightsOpen(false);
              setChatOpen(true);
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

      {/* Botón de chat con el coach */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-28 right-5 w-14 h-14 rpg-gradient rounded-full shadow-lg flex items-center justify-center z-40"
        aria-label="Hablar con tu coach"
      >
        <MessageCircle size={28} />
      </button>
      <CoachChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        state={cs}
        setState={setCs}
        today={today}
      />
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
  manualMissions?: ManualMissionsProps;
  /** Solo con varios objetivos: devuelve el título del objetivo de un item. */
  goalTitleOf?: (goalId: string) => string | undefined;
}

function PlanBody(props: PlanBodyProps) {
  const { plan, behaviors, now, openItem, setOpenItem, onFinish, onCannot, manualMissions, goalTitleOf } = props;
  const goalTag = (goalId?: string) => {
    if (!goalTitleOf || !goalId) return null;
    const t = goalTitleOf(goalId);
    return t ? (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-semibold">{t}</span>
    ) : null;
  };
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
  const nowRel = nowItem ? relTimeLabel(nowItem.startMinute, now) : '';
  const allClear = doneCount > 0 && pending.length === 0;

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
                <h3 className="font-heading font-bold text-lg leading-tight flex items-center gap-2">
                  {nowItem.label}
                  {goalTag(nowItem.goalId)}
                </h3>
                <p className="text-xs text-rpg-text-secondary mt-0.5 flex items-center gap-1.5">
                  <Clock size={11} className="inline" />
                  {toHHMM(nowItem.startMinute)}
                  {nowRel && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-semibold">
                      {nowRel}
                    </span>
                  )}
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
                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                  {it.label}
                  {goalTag(it.goalId)}
                </p>
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

      {/* Día completo: cierre calmado */}
      {allClear && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rpg-card p-5 text-center border-l-4 border-l-green-400"
        >
          <div className="text-3xl mb-1">🌿</div>
          <p className="font-heading font-bold">
            {doneCount === total ? 'Día completo' : 'Día resuelto'}
          </p>
          <p className="text-xs text-rpg-text-secondary mt-1 leading-relaxed">
            {doneCount === total
              ? 'Todo lo previsto está hecho. Mañana el plan se adaptará a cómo estés.'
              : `${doneCount} de ${total} hechos y el resto gestionado sin drama. La constancia gana.`}
          </p>
        </motion.section>
      )}

      {/* Misiones manuales (modo libre) integradas en el día */}
      {manualMissions && manualMissions.items.length > 0 && (
        <section className="rpg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-heading font-bold text-sm">🧰 Misiones manuales</h4>
            <span className="text-[9px] uppercase tracking-wider text-rpg-text-secondary">modo libre</span>
          </div>
          <div className="space-y-1.5">
            {manualMissions.items.map((it) => (
              <button
                key={it.id}
                onClick={() => manualMissions.onToggle(it.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left ${it.done ? 'bg-white/5 opacity-60' : 'bg-black/20'}`}
              >
                <span className="text-lg">{it.icon}</span>
                <span className={`flex-1 text-xs ${it.done ? 'line-through opacity-70' : ''}`}>{it.name}</span>
                {it.done ? (
                  <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                ) : (
                  <Circle size={16} className="text-white/20 shrink-0" />
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-rpg-text-secondary">
            Van a tu modo manual (Inicio). Los hábitos del coach arriba sí se adaptan a ti.
          </p>
        </section>
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
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={onToggle}
        className="text-[11px] bg-white/5 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap"
      >
        EMPEZAR
      </motion.button>
    );
  }
  const def = behavior ? levelDef(behavior) : undefined;
  const minimal = def?.minimal ?? Math.max(1, Math.round(item.minutes * 0.2));
  const canMinimal = item.version === 'full' && minimal < item.minutes;

  return (
    <div className={open ? 'mt-3' : ''}>
      {!open && (
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onToggle}
            className="flex-1 py-2.5 rpg-gradient rounded-xl font-bold text-white text-sm"
          >
            EMPEZAR
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onCannot}
            className="py-2.5 px-3 bg-white/5 rounded-xl text-sm font-semibold text-rpg-text-secondary"
          >
            NO PUEDO
          </motion.button>
        </div>
      )}
      {open && (
        <div className="grid gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onFinish(item, item.minutes)}
            className="py-2.5 bg-green-500/20 text-green-300 rounded-xl font-semibold text-sm"
          >
            ✅ Lo he hecho · {item.minutes} min
          </motion.button>
          {canMinimal && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onFinish(item, minimal)}
              className="py-2.5 bg-amber-500/15 text-amber-300 rounded-xl font-semibold text-sm"
            >
              ⏱️ Solo el mínimo · {minimal} min
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onCannot}
            className="py-2.5 bg-white/5 text-rpg-text-secondary rounded-xl font-semibold text-sm"
          >
            🙅 No puedo (explico por qué)
          </motion.button>
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
  onOpenGuide,
}: {
  objective: string;
  setObjective: (v: string) => void;
  onCreate: (raw: string) => void;
  examples: string[];
  onGoManual?: () => void;
  onOpenGuide?: () => void;
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
      {onOpenGuide && (
        <button
          onClick={onOpenGuide}
          className="block mx-auto mt-2 text-xs text-cyan-300 underline"
        >
          📖 ¿Cómo funciona? Ver la guía
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
  goals,
  behaviors,
  showIntro,
  onSubmitted,
}: {
  goals: Goal[];
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
          <p className="font-heading font-bold text-lg">
            {goals.length === 1 ? `Objetivo: ${goals[0].title}` : `Tus objetivos (${goals.length})`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {behaviors.map((b) => (
              <span key={b.id} className="text-xs bg-white/5 px-3 py-1.5 rounded-full">
                {b.icon} {b.name} · nivel {b.currentLevel}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-rpg-text-secondary leading-relaxed">
            {goals.length > 1
              ? 'Cada objetivo avanza a su ritmo: el plan de hoy reparte tiempo entre todos según tu energía.'
              : 'Solo empezamos con lo esencial. Cuando se consolide, añadiremos el siguiente paso.'}
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

// ---------- Detalle de objetivo: fases, niveles y adherencia ----------

interface GoalDetailProps {
  goal: Goal;
  behaviors: Behavior[];
  logs: BehaviorLogEntry[];
  counters: CoachCounters;
  today: string;
  onClose: () => void;
  onIntroduce: (goalId: string) => void;
  onEditBehavior: (id: string, patch: { slot?: DaySlot; startMinute?: number }) => void;
  canIntroduce: boolean;
}

/** Progreso dentro del nivel actual: éxitos completos en la ventana. */
function levelProgress(b: Behavior, logs: BehaviorLogEntry[], today: string) {
  const def = levelDef(b)!;
  const win = def.window ?? 7;
  const from = addDays(today, -(win - 1));
  const attempts = logs.filter(
    (l) =>
      l.behaviorId === b.id &&
      l.date >= from &&
      l.date <= today &&
      l.plannedMinutes >= 0.75 * def.minutes,
  );
  const done = attempts.filter((l) => l.minutes >= 0.75 * def.minutes).length;
  return { done, need: def.need ?? 5, window: win };
}

function GoalDetailOverlay({
  goal,
  behaviors,
  logs,
  counters,
  today,
  onClose,
  onIntroduce,
  onEditBehavior,
  canIntroduce,
}: GoalDetailProps) {
  const pipelineTemplates = goal.pipeline
    .map((id) => CATALOG.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

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
        className="rpg-card w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        {/* Cabecera del objetivo */}
        <div className="p-5 pb-3 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Objetivo</p>
              <h2 className="font-heading font-bold text-2xl leading-tight mt-0.5">{goal.title}</h2>
              <p className="text-xs text-rpg-text-secondary mt-1 italic truncate">“{goal.raw}”</p>
            </div>
            <button onClick={onClose} className="p-2 text-rpg-text-secondary shrink-0">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {behaviors.length === 0 && (
            <p className="text-sm text-rpg-text-secondary text-center py-6">
              Este objetivo aún no tiene hábitos activos.
            </p>
          )}

          {behaviors.map((b) => {
            const def = levelDef(b)!;
            const nextDef = resolveLevels(b)[b.currentLevel]; // índice 0-based → nivel+1
            const ladder = resolveLevels(b);
            const a7 = Math.round(adherence(logs, b, today, 7).rate * 100);
            const a30 = Math.round(adherence(logs, b, today, 30).rate * 100);
            const streak = streakDays(logs, b, today);
            const { done, need } = levelProgress(b, logs, today);
            const consolidated = counters.consolidated.includes(b.id);
            const pct = Math.min(100, Math.round((done / need) * 100));

            return (
              <div key={b.id} className="rpg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{b.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-heading font-bold text-lg">{b.name}</h4>
                      {consolidated && (
                        <span className="text-[9px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-bold uppercase">
                          🌱 consolidado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-rpg-text-secondary">
                      Nivel {b.currentLevel} · objetivo {def.label ?? `${def.minutes} min`} · mín. {def.minimal} min
                    </p>
                  </div>
                </div>

                {/* Progreso hacia el siguiente nivel */}
                {!consolidated ? (
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-rpg-text-secondary mb-1">
                      <span>
                        Para subir a nivel {b.currentLevel + 1}
                        {nextDef ? ` (${nextDef.minutes} min)` : ''}: {done}/{need} días completos
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full rpg-gradient" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-green-300/80">
                    Base consolidada: puedes subir de dificultad o introducir el siguiente hábito.
                  </p>
                )}

                {/* Métricas */}
                <div className="mt-3 flex gap-4 text-center">
                  <div>
                    <p className="text-sm font-bold text-orange-400">🔥{streak}</p>
                    <p className="text-[9px] text-rpg-text-secondary uppercase">racha</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-cyan-400">{a7}%</p>
                    <p className="text-[9px] text-rpg-text-secondary uppercase">adherencia 7d</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-cyan-400">{a30}%</p>
                    <p className="text-[9px] text-rpg-text-secondary uppercase">30d</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-400">⭐{counters.resilienceWins}</p>
                    <p className="text-[9px] text-rpg-text-secondary uppercase">resiliencia</p>
                  </div>
                </div>

                {/* Escalera de niveles */}
                <p className="mt-4 mb-1.5 text-[10px] uppercase tracking-wider text-rpg-text-secondary">
                  Fases ({ladder.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ladder.map((lv) => {
                    const passed = lv.level < b.currentLevel;
                    const current = lv.level === b.currentLevel;
                    return (
                      <span
                        key={lv.level}
                        className={`text-[10px] px-2 py-1 rounded-lg ${
                          current
                            ? 'bg-cyan-500/25 ring-1 ring-cyan-400 text-cyan-100 font-bold'
                            : passed
                              ? 'bg-green-500/10 text-green-300/70'
                              : 'bg-white/5 text-rpg-text-secondary'
                        }`}
                        title={lv.label ?? `${lv.minutes} min`}
                      >
                        {passed ? '✓' : current ? '●' : '·'} {lv.minutes} min
                      </span>
                    );
                  })}
                </div>

                {/* Horario: franja + hora exacta */}
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-rpg-text-secondary">🕐 Horario</span>
                    <label className="flex items-center gap-1.5 text-[11px] text-rpg-text-secondary">
                      a las
                      <input
                        type="time"
                        value={toHHMM(b.startMinute ?? SLOT_DEFAULT_MIN[b.preferredSlots[0] ?? 'morning'])}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          const [hh, mm] = v.split(':').map(Number);
                          if (Number.isFinite(hh) && Number.isFinite(mm)) {
                            onEditBehavior(b.id, { startMinute: hh * 60 + mm });
                          }
                        }}
                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-cyan-200 outline-none text-sm"
                      />
                    </label>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(['morning', 'midday', 'afternoon', 'night'] as DaySlot[]).map((sl) => {
                      const active = b.preferredSlots[0] === sl && b.startMinute === undefined;
                      return (
                        <button
                          key={sl}
                          onClick={() => onEditBehavior(b.id, { slot: sl })}
                          className={`text-[10px] px-2 py-1 rounded-lg ${
                            active
                              ? 'bg-cyan-500/25 text-cyan-200 font-bold ring-1 ring-cyan-400/60'
                              : 'bg-white/5 text-rpg-text-secondary'
                          }`}
                        >
                          {SLOT_LABEL[sl]} {toHHMM(SLOT_DEFAULT_MIN[sl])}
                        </button>
                      );
                    })}
                    {b.startMinute !== undefined && (
                      <span className="text-[10px] px-2 py-1 rounded-lg bg-white/5 text-rpg-text-secondary">
                        hora personalizada
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] text-rpg-text-secondary">
                    Cambios de horario se aplican hoy mismo (y de ahora en adelante).
                  </p>
                </div>
              </div>
            );
          })}

          {/* Cola de próximos hábitos */}
          {pipelineTemplates.length > 0 && (
            <div className="rpg-card p-4 bg-black/20">
              <p className="text-[10px] uppercase tracking-wider text-rpg-text-secondary mb-2">
                Próximos pasos de este objetivo (en cola)
              </p>
              <div className="space-y-1.5">
                {pipelineTemplates.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs opacity-80">
                    <span>{t.icon}</span>
                    <span>{t.name}</span>
                    <span className="ml-auto text-rpg-text-secondary text-[10px]">espera su turno</span>
                  </div>
                ))}
              </div>
              {canIntroduce && (
                <button
                  onClick={() => onIntroduce(goal.id)}
                  className="mt-3 w-full py-2.5 bg-cyan-500/20 text-cyan-300 rounded-xl text-sm font-bold"
                >
                  🌱 Base consolidada → introducir el siguiente ahora
                </button>
              )}
              {!canIntroduce && pipelineTemplates.length > 0 && (
                <p className="mt-2 text-[10px] text-rpg-text-secondary leading-relaxed">
                  El siguiente se desbloquea cuando un hábito se consolide (nivel ≥ 5): no saturar es parte del método.
                </p>
              )}
            </div>
          )}

          <p className="text-center text-[10px] text-rpg-text-secondary pb-2">
            La dificultad sube y baja sola según tu adherencia real.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------- Insights: lo que el coach ha aprendido de ti ----------

const INSIGHT_ICON: Record<string, string> = {
  schedule_change: '🕐',
  reason_pattern: '🔁',
  sleep_relation: '😴',
};

interface InsightsProps {
  state: CoachState;
  behaviors: Behavior[];
  today: string;
  onClose: () => void;
  onAskChat: () => void;
}

function InsightsOverlay({ state, behaviors, today, onClose, onAskChat }: InsightsProps) {
  const insights = analyzePatterns(state, { sinceDays: 28 });
  const days = new Set(state.logs.map((l) => l.date)).size;
  const reasons = reasonDistribution(state.logs, today, 30);
  const topReasons = Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n >= 2)
    .slice(0, 3);
  const consolidatedNames = state.counters.consolidated
    .map((id) => state.behaviors.find((b) => b.id === id)?.name)
    .filter(Boolean);

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
        className="rpg-card w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        <div className="p-5 pb-3 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">🧠 Coach</p>
              <h2 className="font-heading font-bold text-2xl mt-0.5">Lo que he aprendido de ti</h2>
              <p className="text-xs text-rpg-text-secondary mt-1">
                {days > 0 ? `${days} días de historia · se actualiza con cada día de uso` : 'Aún estoy conociéndote'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-rpg-text-secondary shrink-0">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {days < 3 && (
            <div className="rpg-card p-4 bg-black/20 text-center">
              <div className="text-3xl mb-2">🔭</div>
              <p className="text-sm text-rpg-text-secondary leading-relaxed">
                Todavía tengo pocos datos. Los patrones aparecen a partir de ~7 días reales
                (check-in + completar hábitos). Lo que ya puedo medir está abajo.
              </p>
            </div>
          )}

          {/* Métricas generales */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-white/5 rounded-xl py-2">
              <p className="text-base font-bold">{state.counters.totalDone}</p>
              <p className="text-[9px] text-rpg-text-secondary uppercase">hechos</p>
            </div>
            <div className="bg-white/5 rounded-xl py-2">
              <p className="text-base font-bold text-amber-400">⭐{state.counters.resilienceWins}</p>
              <p className="text-[9px] text-rpg-text-secondary uppercase">resiliencia</p>
            </div>
            <div className="bg-white/5 rounded-xl py-2">
              <p className="text-base font-bold text-green-400">{consolidatedNames.length}</p>
              <p className="text-[9px] text-rpg-text-secondary uppercase">consolidados</p>
            </div>
            <div className="bg-white/5 rounded-xl py-2">
              <p className="text-base font-bold">{state.counters.replans}</p>
              <p className="text-[9px] text-rpg-text-secondary uppercase">replanes</p>
            </div>
          </div>

          {/* Adherencia por hábito */}
          {behaviors.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-rpg-text-secondary mb-2">Adherencia real</p>
              <div className="space-y-2">
                {behaviors.map((b) => {
                  const a7 = Math.round(adherence(state.logs, b, today, 7).rate * 100);
                  const a30 = Math.round(adherence(state.logs, b, today, 30).rate * 100);
                  const st = streakDays(state.logs, b, today);
                  const consolidated = state.counters.consolidated.includes(b.id);
                  return (
                    <div key={b.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2">
                      <span className="text-xl">{b.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">
                          {b.name}
                          {consolidated && <span className="ml-1 text-[9px] text-green-300">🌱</span>}
                        </p>
                        <div className="w-full h-1.5 bg-black/30 rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, Math.min(100, a30))}%`,
                              background: a30 >= 60 ? 'linear-gradient(90deg,#22d3ee,#34d399)' : a30 >= 35 ? '#fbbf24' : '#f87171',
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-orange-400 font-semibold">🔥{st}</p>
                        <p className="text-[10px] text-cyan-400 font-semibold">7d {a7}%</p>
                        <p className="text-[9px] text-rpg-text-secondary">30d {a30}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Patrones detectados */}
          {insights.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-rpg-text-secondary mb-2">
                Patrones detectados
              </p>
              <div className="space-y-2">
                {insights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                    <span className="text-lg">{INSIGHT_ICON[ins.type] ?? '🔎'}</span>
                    <p className="text-xs text-rpg-text-secondary leading-relaxed">{ins.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insights.length === 0 && days >= 3 && (
            <p className="text-xs text-rpg-text-secondary leading-relaxed">
              De momento no detecto patrones claros ni obstáculos repetidos: buena señal.
              Seguiré observando horarios, motivos de "no puedo" y días de la semana.
            </p>
          )}

          {/* Obstáculos repetidos */}
          {topReasons.length > 0 && (
            <div className="rpg-card p-4 bg-black/20">
              <p className="text-[10px] uppercase tracking-wider text-rpg-text-secondary mb-2">
                Obstáculos que más se repiten
              </p>
              <div className="space-y-1.5">
                {topReasons.map(([code, n]) => (
                  <div key={code} className="flex items-center gap-2 text-xs">
                    <span>🔁</span>
                    <span className="flex-1">{REASON_LABEL[code as keyof typeof REASON_LABEL] ?? code}</span>
                    <span className="text-rpg-text-secondary">{n} veces</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {consolidatedNames.length > 0 && (
            <div className="rpg-card p-4 bg-black/20">
              <p className="text-[10px] uppercase tracking-wider text-rpg-text-secondary mb-1.5">
                Hábitos consolidados
              </p>
              <p className="text-xs leading-relaxed">
                {consolidatedNames.join(' · ')} ya aguantan solos: la dificultad puede subir o toca
                introducir el siguiente paso.
              </p>
            </div>
          )}

          <p className="text-center text-[10px] text-rpg-text-secondary pb-1">
            Observaciones con lenguaje cauto: correlación ≠ causa. Para profundizar, pregunta en el chat.
          </p>
          <button
            onClick={onAskChat}
            className="w-full py-2.5 bg-cyan-500/20 text-cyan-300 rounded-xl text-sm font-bold"
          >
            💬 Preguntarle al coach por esto
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
