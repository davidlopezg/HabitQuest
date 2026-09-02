/**
 * Tests de la migración v1 (manual) → v2 (coach).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeLegacySeed, migrationMessage } from './migration.ts';

test('migración: suma XP 1:1 y cuenta días de historia', () => {
  const r = computeLegacySeed({
    xp: 1240,
    name: 'Ada',
    habits: [
      { name: 'Leer rápido', icon: '📖', xp: 15, completedDates: ['2025-05-01', '2025-05-02', '2025-05-03', '2025-05-05'] },
      { name: 'Caminar', icon: '🏃', xp: 25, completedDates: ['2025-05-02', '2025-05-03'] },
    ],
  });
  assert.equal(r.seedXp, 1240);
  assert.equal(r.historyDays, 4); // 4 fechas distintas
  assert.equal(r.mostActiveHabit?.name, 'Leer rápido');
  assert.equal(r.hasLegacy, true);
});

test('migración: sin datos → hasLegacy false y sin mensaje', () => {
  const r = computeLegacySeed(null);
  assert.equal(r.hasLegacy, false);
  assert.equal(r.seedXp, 0);
  assert.equal(migrationMessage(r), '');
});

test('migración: el mensaje incluye nivel y el hábito más constante', () => {
  const r = computeLegacySeed({ xp: 320, habits: [{ name: 'Ducha', icon: '🚿', completedDates: ['2025-05-01'] }] });
  const msg = migrationMessage(r);
  assert.ok(msg.includes('nivel 4')); // 320 XP → floor(320/100)+1 = 4
  assert.ok(msg.includes('Ducha'));
});
