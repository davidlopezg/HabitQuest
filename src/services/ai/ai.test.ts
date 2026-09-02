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
} from './coach.ts';
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
