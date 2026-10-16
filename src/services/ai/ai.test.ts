/**
 * Tests de la capa de IA (proveedor MiniMax + respuestas offline deterministas).
 * Se prueban las partes puras sin hacer llamadas de red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyState,
  applyDecomposed,
  decompose,
  getOrBuildPlan,
  recordCompletion,
} from '../../engine/index.ts';
import type { CoachState, DayCheckIn } from '../../engine/index.ts';
import {
  looksLikeCannot,
  offlineCoachReply,
  learnedInsights,
  summarizeState,
  trendAnalysis,
  whatToChange,
  whyNotCompleting,
} from './coach.ts';
import { addDays, todayKey } from '../../engine/time.ts';
import { getAIConfig } from './config.ts';

function readyState(today: string): CoachState {
  let cs = emptyState();
  cs = applyDecomposed(cs, decompose('Quiero ponerme en forma', today));
  const checkin: DayCheckIn = {
    date: today,
    energy: 7,
    mood: 7,
    focus: 7,
    stress: 3,
    timeAvailable: 'normal',
    intention: 'advance',
  };
  const { state, plan } = getOrBuildPlan(cs, checkin);
  void plan;
  return state;
}

const today = '2025-06-15';

test('ai: detecta mensajes de "no puedo"', () => {
  assert.ok(looksLikeCannot('No puedo porque me ha surgido una reunión'));
  assert.ok(looksLikeCannot('estoy agotado, no he dormido'));
  assert.ok(looksLikeCannot('no tengo tiempo'));
  assert.ok(!looksLikeCannot('¿qué has aprendido sobre mis hábitos?'));
});

test('ai: respuestas offline son accionables y sin moralina', () => {
  const state = readyState(today);
  const tired = offlineCoachReply(state, 'Estoy agotado, no he dormido nada');
  assert.ok(tired.includes('mantenimiento') || tired.includes('mínima'));
  assert.ok(!/¡tú puedes!/i.test(tired));

  const lazy = offlineCoachReply(state, 'No me apetece nada hoy');
  assert.ok(lazy.includes('versión mínima') || lazy.includes('constancia'));

  const work = offlineCoachReply(state, 'Me ha surgido una reunión');
  assert.ok(work.includes('NO PUEDO'));
});

test('ai: responde con datos a "por qué sigo fallando"', () => {
  const state = readyState(today);
  const b = state.behaviors[0];
  // 2 de 4 días completos
  for (let i = 0; i < 4; i++) {
    const d = ['2025-06-12', '2025-06-13', '2025-06-14', '2025-06-15'][i];
    state.logs.push({
      date: d,
      behaviorId: b.id,
      kind: i % 2 === 0 ? 'full' : 'miss',
      minutes: i % 2 === 0 ? 5 : 0,
      dayMode: 'normal',
      plannedMinutes: 5,
    });
  }
  const reply = offlineCoachReply(state, '¿Por qué sigo fallando?');
  assert.ok(reply.includes('adherencia'));
  assert.ok(reply.includes('%'));
});

test('ai: "qué has aprendido" sin datos → pide tiempo; con datos → insights', () => {
  const empty = offlineCoachReply(emptyState(), '¿Qué has aprendido sobre mí?');
  assert.ok(empty.includes('pocos datos'));

  const state = readyState(today);
  const b = state.behaviors[0];
  for (let i = 0; i < 7; i++) {
    state.logs.push({
      date: `2025-06-${String(9 + i).padStart(2, '0')}`,
      behaviorId: b.id,
      kind: 'full',
      minutes: 5,
      dayMode: 'normal',
      plannedMinutes: 5,
    });
  }
  state.counters.consolidated.push(b.id);
  const withData = learnedInsights(state);
  assert.ok(withData.includes('consolidado') || withData.includes('Consolidado'));
});

test('ai: el contexto enviado al LLM resume objetivo, hábitos y plan', () => {
  const state = readyState(today);
  const ctx = summarizeState(state, today);
  assert.ok(ctx.includes('Ponerse en forma'));
  assert.ok(ctx.includes('Caminar'));
  assert.ok(ctx.includes('modo normal')); // modo del día presente
});

test('ai: sin API key el modo IA queda desactivado (no rompe nada)', () => {
  const cfg = getAIConfig();
  assert.equal(cfg.provider, 'minimax');
  assert.equal(typeof cfg.enabled, 'boolean');
  // En entornos de test no hay .env de Vite → normalmente desactivado.
  if (!process.env.VITE_MINIMAX_API_KEY) assert.equal(cfg.enabled, false);
});

test('ai: trendAnalysis con hábitos + logs devuelve datos de adherencia', () => {
  const state = readyState(today);
  const b = state.behaviors[0];
  // 14 días de logs (relativos a hoy): 7 buenos + 7 misses → adherencia ~50% 14d, 0% 7d
  const base = addDays(todayKey(), -13);
  for (let i = 0; i < 14; i++) {
    state.logs.push({
      date: addDays(base, i),
      behaviorId: b.id,
      kind: i < 7 ? 'full' : 'miss',
      minutes: i < 7 ? 5 : 0,
      dayMode: 'normal',
      plannedMinutes: 5,
    });
  }
  const reply = trendAnalysis(state);
  assert.ok(reply.includes('Caminar'), 'menciona el hábito');
  assert.ok(reply.includes('7d') && reply.includes('14d'), 'compara ventanas temporales');
  assert.match(reply, /\d+%/, 'incluye porcentajes');
});

test('ai: trendAnalysis cruza ánimo de conversaciones pasadas', () => {
  const state = readyState(today);
  // Sin conversaciones previas → respuesta mínima.
  let reply = trendAnalysis(state);
  assert.ok(!reply.includes('últimas'), 'sin conversaciones no comenta ánimo');

  // Con 3 conversaciones donde predomina "tired".
  state.conversations = [
    {
      id: '1',
      startedAt: '2025-06-10T08:00:00Z',
      endedAt: '2025-06-10T08:05:00Z',
      messageCount: 2,
      firstUserMessage: 'estoy cansado',
      topReason: 'tired',
      mood: 'tired',
      messages: [],
    },
    {
      id: '2',
      startedAt: '2025-06-12T08:00:00Z',
      endedAt: '2025-06-12T08:05:00Z',
      messageCount: 2,
      firstUserMessage: 'sin energía',
      topReason: 'tired',
      mood: 'tired',
      messages: [],
    },
    {
      id: '3',
      startedAt: '2025-06-14T08:00:00Z',
      endedAt: '2025-06-14T08:05:00Z',
      messageCount: 2,
      firstUserMessage: 'hoy sí',
      topReason: undefined,
      mood: 'positive',
      messages: [],
    },
  ];
  reply = trendAnalysis(state);
  assert.ok(reply.includes('cansado') || reply.includes('frustrado'), 'comenta el ánimo predominante');
});

test('ai: whatToChange sugiere ajustes cuando hay motivo repetido', () => {
  const state = readyState(today);
  const b = state.behaviors[0];
  // 5 "no puedo" por cansancio en los últimos 14 días (fechas relativas a hoy).
  const base = addDays(todayKey(), -10);
  for (let i = 0; i < 5; i++) {
    state.logs.push({
      date: addDays(base, i),
      behaviorId: b.id,
      kind: 'excused',
      minutes: 0,
      dayMode: 'normal',
      reasonCode: 'tired',
      plannedMinutes: 5,
    });
  }
  const reply = whatToChange(state);
  assert.match(reply, /cansancio|tired|agotad/i, 'detecta el motivo dominante');
  assert.match(reply, /(despertar|franja|reduc|ancla|sueño|h\u00e1bito)/i, 'propone un ajuste accionable');
});

test('ai: whyNotCompleting devuelve respuesta por hábito problemático', () => {
  const state = readyState(today);
  const b = state.behaviors[0];
  // 5 misses en 7 días → adherencia <60% en 7d. Usamos fechas relativas
  // a hoy porque whyNotCompleting filtra por los últimos 14 días.
  const base = addDays(todayKey(), -5);
  for (let i = 0; i < 5; i++) {
    state.logs.push({
      date: addDays(base, i),
      behaviorId: b.id,
      kind: 'miss',
      minutes: 0,
      dayMode: 'normal',
      reasonCode: 'work',
      plannedMinutes: 5,
    });
  }
  const reply = whyNotCompleting(state);
  assert.ok(reply.includes('Caminar'));
  assert.match(reply, /work|trabajo/i, 'menciona el motivo detectado');
});

// ── Tests del parser de propuesta de fases (parseGoalProposal) ───────────────

import { parseGoalProposal } from './coach.ts';

test('parseGoalProposal: JSON puro válido → ok con fases', () => {
  const raw = JSON.stringify({
    rationale: 'Empezar suave y subir.',
    phases: [
      { label: 'Fase 1 — Arrancar', startDay: 1, minutes: 5, behaviors: ['Caminar'] },
      { label: 'Fase 2 — Subir', startDay: 8, minutes: 15, behaviors: ['Caminar'] },
    ],
  });
  const r = parseGoalProposal(raw);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.phases.length, 2);
    assert.equal(r.phases[0].minutes, 5);
    assert.equal(r.phases[0].minimal, 3, 'default minimal = ceil(minutes/2)');
    assert.deepEqual(r.phases[0].behaviors, ['Caminar']);
    assert.equal(r.phases[1].startDay, 8);
  }
});

test('parseGoalProposal: minimal explícito se respeta si está dentro de rango', () => {
  const raw = JSON.stringify({
    phases: [{ label: 'F', startDay: 1, minutes: 20, minimal: 5, behaviors: [] }],
  });
  const r = parseGoalProposal(raw);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.phases[0].minimal, 5);
});

test('parseGoalProposal: minimal inválido (>minutes) cae al default', () => {
  const raw = JSON.stringify({
    phases: [{ label: 'F', startDay: 1, minutes: 5, minimal: 50, behaviors: [] }],
  });
  const r = parseGoalProposal(raw);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.phases[0].minimal, 3);
});

test('parseGoalProposal: acepta JSON envuelto en ```json```', () => {
  const raw = '```json\n{"rationale":"x","phases":[{"label":"F1","startDay":1,"minutes":5,"behaviors":["A"]}]}\n```';
  const r = parseGoalProposal(raw);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.phases[0].behaviors, ['A']);
});

test('parseGoalProposal: JSON inválido → ok=false con texto', () => {
  const r = parseGoalProposal('esto no es json');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.text, 'esto no es json');
});

test('parseGoalProposal: fases vacías → ok=false', () => {
  const r = parseGoalProposal(JSON.stringify({ rationale: 'sin fases', phases: [] }));
  assert.equal(r.ok, false);
});

test('parseGoalProposal: fase sin minutes → ok=false', () => {
  const r = parseGoalProposal(JSON.stringify({
    phases: [{ label: 'F', startDay: 1, behaviors: ['X'] }],
  }));
  assert.equal(r.ok, false);
});

test('parseGoalProposal: behaviors vacío es válido (significa "todos")', () => {
  const raw = JSON.stringify({
    phases: [{ label: 'F', startDay: 1, minutes: 5, behaviors: [] }],
  });
  const r = parseGoalProposal(raw);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.phases[0].behaviors, []);
});

test('parseGoalProposal: descarta entradas con label no-string', () => {
  const raw = JSON.stringify({
    phases: [
      { label: 123, startDay: 1, minutes: 5, behaviors: [] },
      { label: 'Válida', startDay: 1, minutes: 5, behaviors: [] },
    ],
  });
  const r = parseGoalProposal(raw);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.phases.length, 1);
    assert.equal(r.phases[0].label, 'Válida');
  }
});

test('parseGoalProposal: ordena fases por startDay ascendente', () => {
  const raw = JSON.stringify({
    phases: [
      { label: 'Tarde', startDay: 30, minutes: 30, behaviors: [] },
      { label: 'Temprano', startDay: 1, minutes: 5, behaviors: [] },
    ],
  });
  const r = parseGoalProposal(raw);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.phases[0].label, 'Temprano');
    assert.equal(r.phases[1].label, 'Tarde');
  }
});

test('parseGoalProposal: filters nombres vacíos en behaviors[]', () => {
  const raw = JSON.stringify({
    phases: [{ label: 'F', startDay: 1, minutes: 5, behaviors: ['X', '', '   ', 'Y'] }],
  });
  const r = parseGoalProposal(raw);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.phases[0].behaviors, ['X', 'Y']);
});
