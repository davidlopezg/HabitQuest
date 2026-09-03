/**
 * Tests del motor adaptativo. Escenarios exigidos por la especificación:
 * - "Quiero leer más" → hábitos razonables con progresión.
 * - Usuario agotado → reduce intensidad (modo recuperación/mantenimiento).
 * - Usuario sin tiempo → replanifica (nunca registra un "fracaso").
 * - Excusa recurrente → detecta patrón.
 * - Día saturado → prioriza (esenciales 🔴 sobre opcionales 🟢).
 * - Usuario que progresa → aumenta dificultad.
 * - Usuario que falla repetidamente → reduce dificultad.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  Behavior,
  BehaviorLogEntry,
  CoachState,
  DayCheckIn,
  DaySlot,
} from './types.ts';
import { templateOf, resolveLevels } from './levels.ts';
import { addDays, toHHMM, weekdayOf } from './time.ts';
import { decompose } from './decomposer.ts';
import { modeForCheckin, capacityScore, dailyBudgetMinutes } from './checkin.ts';
import { planDay } from './planner.ts';
import { recommendLevel } from './progression.ts';
import { handleCannot, classifyReason } from './replanner.ts';
import { analyzePatterns } from './patterns.ts';
import { evaluateCompletion, consolidationEvent } from './gamification.ts';
import { adherence, streakDays } from './history.ts';
import {
  applyDecomposed,
  emptyState,
  getOrBuildPlan,
  rebuildPlan,
  recordCompletion,
  removeGoal,
  postponeItem,
  parseAddHabitRequest,
  addBehaviorToState,
  ritualStepFor,
} from './index.ts';

// ---------- helpers ----------

function beh(
  id: string,
  goalId: string,
  templateId: string,
  level: number,
  introducedAt: string,
  slots?: DaySlot[],
): Behavior {
  const t = templateOf(templateId)!;
  return {
    id,
    goalId,
    templateId,
    name: t.name,
    icon: t.icon,
    category: t.category,
    enabled: true,
    order: 0,
    introducedAt,
    currentLevel: level,
    preferredSlots: slots ?? t.slots,
  };
}

function log(
  date: string,
  behaviorId: string,
  minutes: number,
  planned: number,
  extra: Partial<BehaviorLogEntry> = {},
): BehaviorLogEntry {
  return {
    date,
    behaviorId,
    kind: minutes >= planned * 0.75 ? 'full' : minutes > 0 ? 'minimal' : 'miss',
    minutes,
    dayMode: 'normal',
    plannedMinutes: planned,
    ...extra,
  };
}

function ci(p: Partial<DayCheckIn> & { date: string }): DayCheckIn {
  return {
    energy: 6,
    mood: 6,
    focus: 6,
    stress: 4,
    timeAvailable: 'normal',
    intention: 'maintain',
    ...p,
  };
}

function stateWithGoal(raw: string, today: string, level = 1): CoachState {
  const d = decompose(raw, today);
  const state = emptyState();
  state.goals.push(d.goal);
  d.behaviors.forEach((b, i) => state.behaviors.push({ ...b, currentLevel: level, order: i }));
  return state;
}

// ---------- 1. Descomposición de objetivos ----------

test('decompose: "Quiero ponerme en forma" genera Caminar primero y Fuerza en espera', () => {
  const d = decompose('Quiero ponerme en forma', '2025-06-01');
  assert.equal(d.goal.title, 'Ponerse en forma');
  assert.equal(d.goal.area, 'fitness');
  assert.equal(d.behaviors.length, 1);
  assert.equal(d.behaviors[0].templateId, 'walk');
  assert.deepEqual(d.goal.pipeline, ['strength', 'mobility']);
  assert.ok(d.message.includes('caminando'));
});

test('decompose: "Quiero leer más" → lectura con curva 1/5/10/15/20/30', () => {
  const d = decompose('Quiero leer más', '2025-06-01');
  assert.equal(d.behaviors[0].templateId, 'read');
  const lv = resolveLevels(d.behaviors[0]);
  assert.equal(lv[3].minutes, 10); // nivel 4
  assert.equal(lv[6].minutes, 30); // nivel 7
});

// ---------- 2. Check-in y modos ----------

test('checkin: intención recuperar → modo recovery', () => {
  const c = ci({ date: '2025-06-01', energy: 2, mood: 3, focus: 2, stress: 8, timeAvailable: 'little', intention: 'recover' });
  assert.equal(modeForCheckin(c), 'recovery');
  assert.ok(capacityScore(c) < 0.4);
});

test('checkin: energía alta + intención avanzar → modo progress', () => {
  const c = ci({ date: '2025-06-01', energy: 9, mood: 9, focus: 9, stress: 1, timeAvailable: 'plenty', intention: 'advance' });
  assert.equal(modeForCheckin(c), 'progress');
  assert.ok(capacityScore(c) >= 0.8);
});

test('checkin: capacidad media con poco tiempo → modo minimal', () => {
  const c = ci({ date: '2025-06-01', energy: 5, mood: 5, focus: 5, stress: 5, timeAvailable: 'little', intention: 'maintain' });
  assert.equal(modeForCheckin(c), 'minimal');
});

test('checkin: capacidad media-alta normal → modo normal; presupuesto acotado', () => {
  const c = ci({ date: '2025-06-01', energy: 7, mood: 7, focus: 7, stress: 3, timeAvailable: 'normal', intention: 'advance' });
  assert.equal(modeForCheckin(c), 'normal');
  const budget = dailyBudgetMinutes('normal', c);
  assert.ok(budget >= 30 && budget <= 200);
});

// ---------- 3. Plan diario ----------

test('plan: día de recuperación conserva solo esenciales en versión mínima', () => {
  const state = stateWithGoal('Quiero dormir mejor', '2025-06-01');
  // Añadir un 2º comportamiento consolidado (opcional) para comprobar que se descarta.
  const t = templateOf('strength')!;
  state.behaviors.push({
    ...beh('b2', state.goals[0].id, 'strength', 7, '2025-06-01'),
    currentLevel: 7,
  });
  const plan = planDay({
    state,
    checkin: ci({ date: '2025-06-01', energy: 2, mood: 3, focus: 2, stress: 8, timeAvailable: 'little', intention: 'recover' }),
  });
  assert.equal(plan.mode, 'recovery');
  assert.ok(plan.items.length > 0, 'debe conservar al menos el esencial');
  for (const it of plan.items) {
    assert.equal(it.priority, 'essential');
    assert.equal(it.version, 'minimal');
  }
  assert.ok(!plan.items.some((i) => i.behaviorId === 'b2'));
});

test('plan: modo minimal planifica esenciales+importantes en versión mínima', () => {
  const state = stateWithGoal('Quiero ponerme en forma', '2025-06-01');
  state.behaviors.push({ ...beh('s1', state.goals[0].id, 'strength', 4, '2025-06-01') }); // importante
  const plan = planDay({
    state,
    checkin: ci({ date: '2025-06-01', energy: 5, mood: 5, focus: 5, stress: 5, timeAvailable: 'little', intention: 'maintain' }),
  });
  assert.equal(plan.mode, 'minimal');
  assert.ok(plan.items.length >= 2);
  for (const it of plan.items) assert.equal(it.version, 'minimal');
});

test('plan: nunca excede el presupuesto (no hay planes imposibles)', () => {
  const state = stateWithGoal('Quiero ser más productivo', '2025-06-01');
  const c = ci({ date: '2025-06-01', energy: 2, mood: 2, focus: 2, stress: 9, timeAvailable: 'little', intention: 'recover' });
  const plan = planDay({ state, checkin: c });
  const total = plan.items.reduce((s, i) => s + i.minutes, 0);
  assert.ok(plan.items.length <= 2, 'día malísimo → máximo lo esencial');
  assert.ok(total <= 15, 'presupuesto de recuperación muy contenido');
});

// ---------- 4. Progresión ----------

test('progresión: 5+ éxitos en 7 intentos → subir de nivel', () => {
  const state = stateWithGoal('Quiero leer más', '2025-06-01', 4); // nivel 4 = 10 min
  const b = state.behaviors[0];
  const end = '2025-06-10';
  for (let i = 0; i < 7; i++) {
    const d = addDays(end, -(6 - i));
    state.logs.push(log(d, b.id, i === 3 ? 0 : 10, 10));
  }
  const rec = recommendLevel(b, state.logs, end);
  assert.equal(rec.action, 'advance');
  assert.equal(rec.toLevel, 5);
  assert.equal(rec.toMinutes, 15);
});

test('progresión: serie 20/20/0/5/10/20/0/5/10/0 → reducir a 10 min (ejemplo del prompt)', () => {
  const state = stateWithGoal('Quiero ponerme en forma', '2025-05-20', 5); // caminar nivel 5 = 20 min
  const b = state.behaviors[0];
  const end = '2025-06-10';
  const series = [20, 20, 0, 5, 10, 20, 0, 5, 10, 0];
  for (let i = 0; i < series.length; i++) {
    const d = addDays(end, -(series.length - 1 - i));
    state.logs.push(log(d, b.id, series[i], 20));
  }
  const rec = recommendLevel(b, state.logs, end);
  assert.equal(rec.action, 'reduce');
  assert.equal(rec.toMinutes, 10);
  assert.ok(rec.message.includes('consolidar') || rec.message.includes('10 min'));
});

test('progresión: no reduce con pocos días de datos (no reaccionar a un mal día)', () => {
  const state = stateWithGoal('Quiero leer más', '2025-06-01', 3);
  const b = state.behaviors[0];
  const end = '2025-06-05';
  state.logs.push(log(addDays(end, -2), b.id, 0, 5));
  state.logs.push(log(addDays(end, -1), b.id, 0, 5));
  state.logs.push(log(end, b.id, 0, 5));
  const rec = recommendLevel(b, state.logs, end);
  assert.equal(rec.action, 'not_enough_data');
});

// ---------- 5. Replanificación ("no puedo") ----------

test('replan: reunión ahora pero hay hueco → trasladar (no es un fracaso)', () => {
  const state = stateWithGoal('Quiero ponerme en forma', '2025-06-01');
  const plan = planDay({
    state,
    checkin: ci({ date: '2025-06-01', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' }),
  });
  const b = state.behaviors[0];
  state.plans['2025-06-01'] = plan;
  const reply = handleCannot({
    state,
    date: '2025-06-01',
    behaviorId: b.id,
    reasonText: 'No puedo porque me ha surgido una reunión.',
    nowMinutes: 600, // 10:00
  });
  assert.equal(reply.action, 'rescheduled');
  assert.ok(reply.message.includes('13:00'), reply.message);
});

test('replan: agotado → modo mantenimiento y versión mínima, sin moralina', () => {
  const state = stateWithGoal('Quiero ponerme en forma', '2025-06-01');
  state.behaviors.push({ ...beh('s1', state.goals[0].id, 'strength', 2, '2025-06-01') });
  const plan = planDay({
    state,
    checkin: ci({ date: '2025-06-01', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' }),
  });
  state.plans['2025-06-01'] = plan;
  const b = state.behaviors[0];
  const reply = handleCannot({
    state,
    date: '2025-06-01',
    behaviorId: b.id,
    reasonText: 'Estoy agotado, no he dormido nada.',
    nowMinutes: 400,
  });
  assert.equal(classifyReason('Estoy agotado'), 'tired');
  assert.equal(reply.action, 'mode_change');
  assert.equal(reply.plan.mode, 'minimal');
  const items = reply.plan.items;
  assert.ok(items.every((i) => i.status === 'excused' || i.version === 'minimal'));
});

test('replan: sin tiempo de verdad → versión mínima para mantener el hábito', () => {
  const state = stateWithGoal('Quiero leer más', '2025-06-01');
  const b = state.behaviors[0];
  const plan = planDay({
    state,
    checkin: ci({ date: '2025-06-01', energy: 7, mood: 7, focus: 7, stress: 3 }),
  });
  state.plans['2025-06-01'] = plan;
  const reply = handleCannot({
    state,
    date: '2025-06-01',
    behaviorId: b.id,
    reasonText: 'No tengo tiempo hoy para nada.',
    nowMinutes: 1430, // sin huecos posteriores
  });
  assert.equal(reply.action, 'reduced');
  assert.ok(reply.message.includes('mantener el hábito') || reply.message.includes('mín'));
});

// ---------- 6. Detección de patrones ----------

test('patrones: martes sistemáticamente fallido → sugerir cambio de horario', () => {
  const state = stateWithGoal('Quiero ponerme en forma', '2025-05-01');
  const b = state.behaviors[0];
  const end = '2025-06-15'; // domingo
  for (let i = 0; i < 42; i++) {
    const d = addDays(end, -i);
    if (d < '2025-05-19') continue;
    // Saltamos los martes (weekdayOf = 2)
    if (weekdayOf(d) === 2) continue;
    state.logs.push(log(d, b.id, 20, 20));
  }
  const insights = analyzePatterns(state, { sinceDays: 28 });
  const weak = insights.find((i) => i.type === 'schedule_change');
  assert.ok(weak, 'debe detectar el día débil: ' + JSON.stringify(insights));
  assert.equal(weak!.data?.weekday, 2);
});

test('patrones: relación sueño <6h con menor adherencia (sin afirmar causalidad)', () => {
  const state = stateWithGoal('Quiero ponerme en forma', '2025-05-01');
  const b = state.behaviors[0];
  const end = '2025-06-12';
  const sleepLogs: { date: string; hours: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = addDays(end, -(11 - i));
    const short = i % 2 === 0; // 6 días cortos
    sleepLogs.push({ date: d, hours: short ? 5 : 7.5 });
    const done = short ? i === 0 : true; // cortos: casi nunca; largos: casi siempre
    state.logs.push(log(d, b.id, done ? 20 : 0, 20));
  }
  const insights = analyzePatterns(state, { sleepLogs, sinceDays: 30 });
  const rel = insights.find((i) => i.type === 'sleep_relation');
  assert.ok(rel, 'debe detectar la relación sueño-adherencia');
});

// ---------- 7. Gamificación adaptativa ----------

test('gamificación: completar el mínimo en día difícil → victoria de resiliencia', () => {
  const state = stateWithGoal('Quiero leer más', '2025-06-01', 2);
  const b = state.behaviors[0];
  const { counters, events } = evaluateCompletion(
    { counters: state.counters, logs: state.logs },
    b,
    '2025-06-01',
    1, // versión mínima (nivel 2 = 1 min objetivo)
    5, // pero el día se planificó a 5 (modo adverso)
    'minimal',
  );
  const res = events.find((e) => e.type === 'resilience');
  assert.ok(res, 'debe premiar la resiliencia');
  assert.equal(res!.title, 'Victoria de resiliencia');
  assert.equal(counters.resilienceWins, 1);
});

test('gamificación: consolidación al alcanzar nivel 5', () => {
  const state = stateWithGoal('Quiero ponerme en forma', '2025-06-01', 5);
  const b = state.behaviors[0];
  const ev = consolidationEvent(state.counters, b);
  assert.ok(ev);
  assert.equal(ev!.type, 'consolidated');
});

// ---------- 8. Adherencia y rachas ----------

test('adherencia y racha: excused no rompe la racha pero no cuenta como éxito pleno', () => {
  const state = stateWithGoal('Quiero leer más', '2025-06-01', 3);
  const b = state.behaviors[0];
  const end = '2025-06-10';
  for (let i = 0; i < 10; i++) state.logs.push(log(addDays(end, -(9 - i)), b.id, 10, 10));
  const slice = adherence(state.logs, b, end, 10);
  assert.equal(slice.full, 10);
  assert.equal(slice.rate, 1);
  assert.equal(streakDays(state.logs, b, end), 10);

  // Un día excusado con motivo: no rompe la racha (pero tampoco suma un día completo).
  state.logs.push({ ...log(addDays(end, 1), b.id, 0, 10), kind: 'excused', reasonCode: 'work' });
  const s2 = adherence(state.logs, b, addDays(end, 1), 11);
  assert.ok(Math.abs(s2.rate - 10.5 / 11) < 1e-9);
  assert.equal(streakDays(state.logs, b, addDays(end, 1)), 10, 'excusado mantiene viva la racha sin sumar');

  // Un día no realizado sin motivo SÍ rompe.
  state.logs.push(log(addDays(end, 2), b.id, 0, 10));
  assert.equal(streakDays(state.logs, b, addDays(end, 2)), 0);
});

test('decompose: "Quiero aprender inglés" genera plan de idioma específico', () => {
  const d = decompose('Quiero aprender inglés', '2025-06-01');
  assert.equal(d.goal.area, 'learning');
  assert.equal(d.behaviors[0].name, 'Estudiar Inglés');
  assert.equal(d.behaviors[0].icon, '📱');
  assert.ok(d.message.includes('primera semana'));
  assert.equal(resolveLevels(d.behaviors[0])[6].minutes, 30);
});

test('tiempo: toHHMM correcto', () => {
  assert.equal(toHHMM(540), '09:00');
  assert.equal(toHHMM(780), '13:00');
});

test('plan: respeta la hora exacta (startMinute) del comportamiento', () => {
  const state = stateWithGoal('Quiero ponerme en forma', '2025-06-15');
  const b = state.behaviors[0];
  state.behaviors = state.behaviors.map((x) => (x.id === b.id ? { ...x, startMinute: 660 } : x)); // 11:00
  const c = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { plan } = getOrBuildPlan(state, c);
  assert.equal(plan.items[0].startMinute, 660);
});

test('coach en chat: parsea peticiones de añadir hábitos (con hora o franja)', () => {
  const r = parseAddHabitRequest('añade un hábito de meditación a las 7:30');
  assert.ok(r);
  assert.equal(r!.templateId, 'mindfulness');
  assert.equal(r!.time, 450);
  const r2 = parseAddHabitRequest('quiero un hábito para caminar por la mañana');
  assert.equal(r2!.templateId, 'walk');
  assert.equal(r2!.slot, 'morning');
  const r3 = parseAddHabitRequest('ponme un hábito de leer por la noche');
  assert.equal(r3!.templateId, 'read');
  assert.equal(r3!.slot, 'night');
  assert.equal(parseAddHabitRequest('¿cómo estás hoy?'), null);
  assert.equal(parseAddHabitRequest('añade un hábito de volar con alas'), null);
});

test('coach añade el hábito pedido y lo programa a la hora exacta', () => {
  let state = stateWithGoal('Quiero reducir el estrés', '2025-06-15');
  const goal = state.goals[0];
  const r = parseAddHabitRequest('añade un hábito de respiración a las 21:00')!;
  state = addBehaviorToState(state, goal.id, '2025-06-15', r);
  const b = state.behaviors.find((x) => x.goalId === goal.id && x.startMinute === 1260)!;
  assert.ok(b, 'debe crear el hábito');
  const c = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { state: s2, plan: p2 } = getOrBuildPlan(state, c);
  state = s2;
  const item = p2.items.find((i) => i.behaviorId === b.id)!;
  assert.equal(item.startMinute, 1260);
});

test('replan: "lo dejo para mañana" excusa hoy y el hábito vuelve mañana', () => {
  let state = stateWithGoal('Quiero ponerme en forma', '2025-06-15');
  const c = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { state: s1, plan: p1 } = getOrBuildPlan(state, c);
  state = s1;
  const b = state.behaviors[0];
  state = postponeItem(state, '2025-06-15', b.id);
  const entry = state.logs.find((l) => l.behaviorId === b.id)!;
  assert.equal(entry.kind, 'excused');
  assert.equal(entry.reasonCode, 'postpone');
  assert.equal(state.plans['2025-06-15'].items[0].status, 'excused');
  // Mañana el plan se regenera y el hábito vuelve a estar programado.
  const c2 = ci({ date: '2025-06-16', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { plan: p2 } = getOrBuildPlan(state, c2);
  assert.ok(p2.items.some((i) => i.behaviorId === b.id));
});

test('objetivos: removeGoal elimina objetivo, hábitos, logs y sus items del plan', () => {
  let state = stateWithGoal('Quiero ponerme en forma', '2025-06-15');
  state = applyDecomposed(state, decompose('Quiero leer más', '2025-06-15'));
  const g1 = state.goals.find((g) => g.area === 'fitness')!;
  const g2 = state.goals.find((g) => g.area === 'reading')!;
  const c = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { state: s1, plan: p1 } = getOrBuildPlan(state, c);
  state = s1;
  const firstItem = p1.items.find((i) => i.goalId === g1.id)!;
  state = recordCompletion(state, { date: '2025-06-15', behaviorId: firstItem.behaviorId, minutes: firstItem.minutes, plannedMinutes: firstItem.minutes, dayMode: p1.mode });
  assert.ok(state.logs.length > 0);

  state = removeGoal(state, g1.id);
  assert.equal(state.goals.length, 1);
  assert.equal(state.goals[0].id, g2.id);
  assert.ok(!state.behaviors.some((b) => b.goalId === g1.id));
  assert.equal(state.logs.length, 0); // el log del hábito eliminado se limpia
  const items = state.plans['2025-06-15'].items;
  assert.ok(!items.some((i) => i.goalId === g1.id));
  assert.ok(items.some((i) => i.goalId === g2.id));
});

test('plan: rebuildPlan al añadir un 2º objetivo conserva lo ya hecho y suma lo nuevo', () => {
  let state = stateWithGoal('Quiero ponerme en forma', '2025-06-15');
  const c = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { state: s1, plan: p1 } = getOrBuildPlan(state, c);
  state = s1;
  const first = p1.items[0];
  state = recordCompletion(state, { date: '2025-06-15', behaviorId: first.behaviorId, minutes: first.minutes, plannedMinutes: first.minutes, dayMode: p1.mode });
  // añadir un segundo objetivo
  const d2 = decompose('Quiero leer más', '2025-06-15');
  state = applyDecomposed(state, d2);
  state = rebuildPlan(state, c);
  const plan2 = state.plans['2025-06-15'];
  // lo hecho se conserva
  const kept = plan2.items.find((i) => i.behaviorId === first.behaviorId);
  assert.ok(kept && kept.status === 'done_full');
  // hay item nuevo del segundo objetivo
  const newB = state.behaviors.find((b) => b.goalId === d2.goal.id)!;
  assert.ok(plan2.items.some((i) => i.behaviorId === newB.id));
});

test('agenda: hábito L–V no se planifica el domingo y la adherencia no lo penaliza', () => {
  let state = stateWithGoal('Quiero leer más', '2025-06-15'); // domingo
  const b0 = state.behaviors[0];
  state.behaviors = state.behaviors.map((x) =>
    x.id === b0.id ? { ...x, schedule: { type: 'days', days: [1, 2, 3, 4, 5] } } : x,
  );
  const b = state.behaviors[0];
  const cSun = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { state: s1, plan: pSun } = getOrBuildPlan(state, cSun);
  state = s1;
  assert.equal(pSun.items.filter((i) => i.behaviorId === b.id).length, 0, 'domingo no programado');
  const cMon = ci({ date: '2025-06-16', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { plan: pMon } = getOrBuildPlan(state, cMon);
  assert.ok(pMon.items.some((i) => i.behaviorId === b.id), 'lunes sí programado');
  const a = adherence(state.logs, b, '2025-06-16', 3);
  assert.equal(a.eligible, 1, 'solo cuenta el día programado (lunes)');
});

test('tipos: hábito binario (vitaminas) se planifica sin minutos ni versión mínima', () => {
  let state = stateWithGoal('Quiero dormir mejor', '2025-06-15');
  const goal = state.goals[0];
  const r = parseAddHabitRequest('añade un hábito de vitaminas')!;
  assert.equal(r.templateId, 'supplements');
  state = addBehaviorToState(state, goal.id, '2025-06-15', r);
  const b = state.behaviors.find((x) => x.templateId === 'supplements')!;
  assert.equal(b.kind, 'binary');
  const c = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { plan: p } = getOrBuildPlan(state, c);
  const item = p.items.find((i) => i.behaviorId === b.id)!;
  assert.ok(item, 'el binario entra en el plan');
  assert.equal(item.minutes, 1);
  assert.ok(!/\d+\s*min/.test(item.label), 'no muestra minutos');
});

test('micro-pasos: el plan del día muestra exactamente el micro-paso del nivel actual', () => {
  let state = stateWithGoal('Quiero ser más productivo', '2025-06-15');
  const req = parseAddHabitRequest('añade un hábito de escribir')!;
  assert.equal(req.templateId, 'write');
  state = addBehaviorToState(state, state.goals[0].id, '2025-06-15', req);
  const b = state.behaviors.find((x) => x.templateId === 'write')!;
  state.behaviors = state.behaviors.map((x) => (x.id === b.id ? { ...x, currentLevel: 2 } : x));
  const c = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { plan } = getOrBuildPlan(state, c);
  const item = plan.items.find((i) => i.behaviorId === b.id)!;
  assert.ok(item, 'micro-paso en el plan');
  assert.match(item.label, /Escribir 1 frase sin borrarla/);
});


test('micro-pasos: el detalle del objetivo marca como activo el paso del nivel', () => {
  const state = stateWithGoal('Quiero ser más productivo', '2025-06-15');
  const req = parseAddHabitRequest('añade un hábito de escribir')!;
  const next = addBehaviorToState(state, state.goals[0].id, '2025-06-15', req);
  const b = next.behaviors.find((x) => x.templateId === 'write')!;
  assert.equal(ritualStepFor({ ...b, currentLevel: 1 }), 'Abrir el documento');
  assert.equal(ritualStepFor({ ...b, currentLevel: 2 }), 'Escribir 1 frase sin borrarla');
  assert.equal(ritualStepFor({ ...b, currentLevel: 3 }), 'Continuar 2 minutos seguidos');
  // Cicla: nivel 4 vuelve al paso 1
  assert.equal(ritualStepFor({ ...b, currentLevel: 4 }), 'Abrir el documento');
});

test('planner: muestra el label del nivel (no "Nombre — X min")', () => {
  const state = stateWithGoal('Quiero leer más', '2025-06-15');
  const c = ci({ date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
  const { plan } = getOrBuildPlan(state, c);
  const item = plan.items[0];
  assert.match(item.label, /Abrir el libro o la app/);
  assert.ok(!/Lectura\s*—\s*\d+/.test(item.label));
});

test('recordCompletion: ignora entradas inválidas sin corromper el estado', () => {
  let state = stateWithGoal('Quiero leer más', '2025-06-15');
  const b = state.behaviors[0];
  // Fecha mal formada
  let s1 = recordCompletion(state, { date: 'ayer', behaviorId: b.id, minutes: 5 } as any);
  assert.equal(s1, state);
  // behaviorId vacío
  s1 = recordCompletion(state, { date: '2025-06-15', behaviorId: '', minutes: 5 } as any);
  assert.equal(s1, state);
  // Behavior inexistente
  s1 = recordCompletion(state, { date: '2025-06-15', behaviorId: 'no-existe', minutes: 5 } as any);
  assert.equal(s1, state);
  // Minutes negativas → 0, sin reasonCode → 'miss'
  state = recordCompletion(state, { date: '2025-06-15', behaviorId: b.id, minutes: -10 });
  assert.equal(state.logs[0].minutes, 0);
  assert.equal(state.logs[0].kind, 'miss');
  // JSON.parse sí lanza con input corrupto (loadState usa try/catch para no romper).
  assert.throws(() => JSON.parse('{{{'));
});

test('7 días sintéticos: adherencia, racha, avance y consistencia', () => {
  let state = stateWithGoal('Quiero ponerme en forma', '2025-06-01');
  const b = state.behaviors[0];
  // Generar 14 días con un check-in y un log por día (algunos completos, otros no).
  for (let i = 0; i < 14; i++) {
    const date = addDays('2025-06-01', i);
    const c = ci({ date, energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' });
    state = getOrBuildPlan(state, c).state;
    const item = state.plans[date].items.find((x) => x.behaviorId === b.id)!;
    const minutes = i % 7 === 6 ? 0 : 8;
    state = recordCompletion(state, { date, behaviorId: b.id, minutes, plannedMinutes: item.minutes, dayMode: c.intention as any });
  }
  const a = adherence(state.logs, b, '2025-06-14', 7);
  assert.ok(a.full + a.minimal + a.excused > 0);
  assert.ok(a.eligible > 0);
  const s = streakDays(state.logs, b, '2025-06-14');
  assert.ok(s >= 0);
  const rec = recommendLevel(b, state.logs, '2025-06-14');
  assert.ok(['maintain', 'advance', 'reduce', 'not_enough_data'].includes(rec.action));
});

test('decomposer: objetivos ambiguos caen en custom (no en learning)', () => {
  const cases = [
    'Quiero aprender a tocar la guitarra',
    'Quiero aprender a programar',
    'Quiero aprender a cocinar',
    'Quiero estudiar una carrera',
    'Quiero hacer un curso online',
    'Quiero tener un huerto',
  ];
  for (const text of cases) {
    const r = decompose(text, '2025-06-15');
    assert.notEqual(r.goal.area, 'learning', `should NOT be learning: ${text}`);
  }
});

test('decomposer: solo objetivos con idioma real caen en learning', () => {
  const cases = ['Quiero aprender inglés', 'Quiero aprender francés', 'Quiero aprender chino'];
  for (const text of cases) {
    const r = decompose(text, '2025-06-15');
    assert.equal(r.goal.area, 'learning', `should be learning: ${text}`);
  }
});

test('decomposer: objetivos custom reciben nombre basado en el texto', () => {
  const r = decompose('Quiero aprender a tocar la guitarra', '2025-06-15');
  assert.match(r.behaviors[0].name, /tocar la guitarra/i);
  assert.equal(r.goal.area, 'other');
  assert.equal(r.behaviors[0].templateId, 'custom');
});

test('decomposer: objetivo de adelgazar usa preset weight con micro-pasos específicos', () => {
  const r = decompose('Quiero adelgazar', '2025-06-15');
  assert.equal(r.goal.area, 'weight');
  assert.equal(r.behaviors[0].templateId, 'weight');
  assert.match(r.behaviors[0].name, /control de peso/i);
});

test('decomposer: objetivos "dejar de..." caen en preset reduce con micro-pasos específicos', () => {
  const cases = [
    'Quiero dejar de ser descuidado',
    'Quiero dejar de fumar',
    'Quiero dejar de picar',
    'Quiero ser menos desordenado',
    'Quiero reducir el consumo',
  ];
  for (const text of cases) {
    const r = decompose(text, '2025-06-15');
    assert.equal(r.goal.area, 'reduce', `should be reduce: ${text} (got ${r.goal.area})`);
    assert.equal(r.behaviors[0].templateId, 'reduce');
  }
});

test('decomposer: objetivos custom generan micro-pasos específicos (heurísticas por keywords)', () => {
  const r1 = decompose('Quiero cuidar mi aspecto', '2025-06-15');
  assert.match(r1.behaviors[0].startRitual?.[0] ?? '', /cara|piel|aspecto/i, 'debería hablar de cara/piel');
  const r2 = decompose('Quiero aprender a tocar la guitarra', '2025-06-15');
  assert.match(r2.behaviors[0].startRitual?.[0] ?? '', /instrumento|guitarra|tocar/i);
  const r3 = decompose('Quiero ahorrar dinero', '2025-06-15');
  assert.match(r3.behaviors[0].startRitual?.[0] ?? '', /gast|€|dinero/i);
});

test('updateBehaviorTime (vía setCs + rebuildPlan): cambiar hora reordena el plan', () => {
  // Reproduce lo que hace updateBehaviorTime en CoachView.tsx
  const ck = { date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' };
  let s = emptyState();
  s.checkins.push(ck);
  const o1 = decompose('Quiero aprender inglés', '2025-06-15');
  const o2 = decompose('Quiero ponerme en forma', '2025-06-15');
  s = applyDecomposed(s, o1);
  s = applyDecomposed(s, o2);
  s = rebuildPlan(s, ck);
  // Asignar horas distintas
  const en = s.behaviors.find((b) => b.templateId === 'study')!;
  const walk = s.behaviors.find((b) => b.templateId === 'walk')!;
  s.behaviors = s.behaviors.map((b) =>
    b.id === en.id ? { ...b, startMinute: 18 * 60 } :
    b.id === walk.id ? { ...b, startMinute: 9 * 60 } : b
  );
  s = rebuildPlan(s, ck);
  const plan1 = s.plans['2025-06-15'];
  const enItem1 = plan1.items.find((i) => i.behaviorId === en.id)!;
  const walkItem1 = plan1.items.find((i) => i.behaviorId === walk.id)!;
  assert.ok(walkItem1.startMinute < enItem1.startMinute, 'walk (9:00) debe ir antes que study (18:00)');
  // Cambiar la hora de estudio a 7:00 (simula updateBehaviorTime)
  s.behaviors = s.behaviors.map((b) =>
    b.id === en.id ? { ...b, startMinute: 7 * 60 } : b
  );
  s = rebuildPlan(s, ck);
  const plan2 = s.plans['2025-06-15'];
  const enItem2 = plan2.items.find((i) => i.behaviorId === en.id)!;
  assert.equal(enItem2.startMinute, 7 * 60, 'study ahora debe estar a las 7:00');
  assert.ok(enItem2.startMinute < walkItem1.startMinute, 'study (7:00) debe ir antes que walk (9:00)');
});

test('regresión: cambiar hora del hábito 3° en slot morning actualiza el plan (no se queda con el offset del slot counter)', () => {
  // Caso del usuario: 3 hábitos en morning, edita el 3° a 9:00.
  const ck = { date: '2025-06-15', energy: 7, mood: 7, focus: 7, stress: 3, intention: 'advance' };
  let s = emptyState();
  s.checkins.push(ck);
  const out = decompose('Quiero cuidar mi aspecto', '2025-06-15');
  s = applyDecomposed(s, out);
  s = rebuildPlan(s, ck);
  // El hábito está en morning (slot default). startMinute del item debe ser 540.
  const b = s.behaviors[0];
  assert.equal(s.plans['2025-06-15'].items[0].startMinute, 540);
  // Editamos a 9:00 (540) explícitamente.
  s.behaviors = s.behaviors.map((x) => x.id === b.id ? { ...x, startMinute: 540 } : x);
  s = rebuildPlan(s, ck);
  assert.equal(s.plans['2025-06-15'].items[0].startMinute, 540);
  assert.notEqual(s.plans['2025-06-15'].items[0].startMinute, 590); // nunca debe volver al offset del slot counter
});
