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
import { emptyState } from './index.ts';

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

test('tiempo: toHHMM correcto', () => {
  assert.equal(toHHMM(540), '09:00');
  assert.equal(toHHMM(780), '13:00');
});
