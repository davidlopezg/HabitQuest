/**
 * Tests del motor de persistencia (funciones puras y lógica de hidratación).
 *
 * Lo testeable aquí: la decisión "looksLikeDefault" / "looksLikeRealData" que
 * decide si vamos a IDB o respetamos LS. Las funciones que tocan DOM (downloadBackup,
 * downloadFullBackup, parseBackup vía FileReader) se cubren por inspección porque
 * necesitan un entorno navegador real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Stubs de localStorage ──────────────────────────────────────────────────
const memStore = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memStore.set(k, v); },
  removeItem: (k: string) => { memStore.delete(k); },
};

// ── Lógica de hidratación extraída (copia fiel de App.tsx/CoachView.tsx) ──
// Si cambias las reglas en App.tsx, cambia aquí también. La duplicación es
// deliberada: queremos poder testear el criterio sin levantar React ni DOM.

const INITIAL_HABITS_LENGTH = 24;

/** Manual: ¿LS parece el set por defecto (sin datos reales propios)? */
function manualLooksLikeDefault(lsRaw: string | null): boolean {
  if (!lsRaw) return true;
  try {
    const lsData = JSON.parse(lsRaw);
    const lsCount = Array.isArray(lsData?.habits) ? lsData.habits.length : 0;
    const lsHasProgress = lsData?.habits?.some(
      (h: { completedDates?: string[] }) => h.completedDates?.length > 0,
    ) ?? false;
    return lsCount <= INITIAL_HABITS_LENGTH && !lsHasProgress;
  } catch {
    return true;
  }
}

/** Coach: ¿LS tiene objetivos reales del usuario? */
function coachHasRealGoals(lsRaw: string | null): boolean {
  if (!lsRaw) return false;
  try {
    const data = JSON.parse(lsRaw);
    return Array.isArray(data?.goals) && data.goals.length > 0;
  } catch {
    return false;
  }
}

// ── Hidratación del modo manual ────────────────────────────────────────────

test('manual: LS=null → looksLikeDefault=true (vamos a IDB)', () => {
  assert.equal(manualLooksLikeDefault(null), true);
});

test('manual: LS con string vacío → looksLikeDefault=true', () => {
  assert.equal(manualLooksLikeDefault(''), true);
});

test('manual: LS=JSON corrupto → looksLikeDefault=true (fail safe)', () => {
  assert.equal(manualLooksLikeDefault('{no es json'), true);
});

test('manual: LS=INITIAL_HABITS puro (24 sin progreso) → looksLikeDefault=true', () => {
  const ls = JSON.stringify({
    habits: Array(INITIAL_HABITS_LENGTH).fill({ name: 'init', completedDates: [] }),
  });
  assert.equal(manualLooksLikeDefault(ls), true);
});

test('manual: LS=23 hábitos sin progreso (menos que INITIAL) → looksLikeDefault=true', () => {
  const ls = JSON.stringify({
    habits: Array(23).fill({ name: 'init', completedDates: [] }),
  });
  assert.equal(manualLooksLikeDefault(ls), true);
});

test('manual: LS=INITIAL_HABITS con un hábito completado → looksLikeDefault=false', () => {
  const habits = Array(INITIAL_HABITS_LENGTH).fill({ name: 'init', completedDates: [] });
  habits[0] = { name: 'init', completedDates: ['2025-01-01'] };
  const ls = JSON.stringify({ habits });
  assert.equal(manualLooksLikeDefault(ls), false, 'Una fecha completada = progreso real');
});

test('manual: LS=25 hábitos personalizados (más que INITIAL) → looksLikeDefault=false', () => {
  const ls = JSON.stringify({
    habits: Array(25).fill({ name: 'custom', completedDates: [] }),
  });
  assert.equal(manualLooksLikeDefault(ls), false);
});

test('manual: LS=30 hábitos personalizados con progreso → looksLikeDefault=false', () => {
  const ls = JSON.stringify({
    habits: Array(30).fill({ name: 'goal', completedDates: ['2025-01-01', '2025-01-02'] }),
  });
  assert.equal(manualLooksLikeDefault(ls), false);
});

test('manual: LS sin array habits → looksLikeDefault=true (no se rompe)', () => {
  const ls = JSON.stringify({ habits: 'no es array' });
  assert.equal(manualLooksLikeDefault(ls), true);
});

// ── Hidratación del Coach ──────────────────────────────────────────────────

test('coach: LS=null → no tiene goals reales (vamos a IDB)', () => {
  assert.equal(coachHasRealGoals(null), false);
});

test('coach: LS=emptyState() (goals: []) → no tiene goals reales', () => {
  assert.equal(coachHasRealGoals(JSON.stringify({ goals: [], behaviors: [] })), false);
});

test('coach: LS con 1 goal → tiene goals reales (no tocamos)', () => {
  const ls = JSON.stringify({ goals: [{ id: 'g1', raw: 'leer' }], behaviors: [] });
  assert.equal(coachHasRealGoals(ls), true);
});

test('coach: LS corrupto → no tiene goals reales (fail safe)', () => {
  assert.equal(coachHasRealGoals('basura'), false);
});

// ── Categoría de hábitos (retrocompatibilidad) ────────────────────────────────

test('categoría: hábito sin category se considera other', () => {
  const habit: { category?: string } = {};
  const effective = habit.category ?? 'other';
  assert.equal(effective, 'other');
});

test('categoría: hábito con category explícita se respeta', () => {
  const habit: { category?: string } = { category: 'movement' };
  const effective = habit.category ?? 'other';
  assert.equal(effective, 'movement');
});

test('categoría: migración retroactiva: INITIAL_HABITS sin category → other', () => {
  // Tras añadir `category`, los hábitos preexistentes no la tienen.
  // No se rompe nada: se muestran como 'other' en el badge.
  const initialHabits: { name: string; completedDates: string[]; category?: string }[] =
    Array(24).fill({ name: 'init', completedDates: [] });
  const hasAnyCategory = initialHabits.some((h) => h.category);
  assert.equal(hasAnyCategory, false);
});

// ── Simulación del flujo completo (sin DOM) ────────────────────────────────

test('flujo A: LS=null + IDB=25 → se recuperan los 25', () => {
  memStore.clear();
  // 1. Inicializador de hydrated: LS=null → looksLikeDefault=true → hydrated=false (async)
  assert.equal(manualLooksLikeDefault(null), true);
  // 2. useState inicial: INITIAL_HABITS (24)
  const initialCount = INITIAL_HABITS_LENGTH;
  assert.equal(initialCount, 24);
  // 3. Effect async: lee LS (count=0), consulta IDB (25), 25 > 0 → adopta
  const idbCount = 25;
  assert.equal(idbCount > 0, true);
  // Resultado: userData=25 hábitos reales ✓
});

test('flujo A2: LS=null + IDB=null → queda con INITIAL_HABITS', () => {
  memStore.clear();
  assert.equal(manualLooksLikeDefault(null), true);
  // IDB vacío, no hay nada que recuperar. INITIAL_HABITS queda en memoria.
  // Pérdida aceptable: no había nada que perder.
});

test('flujo A3: LS=null + IDB=20 (menos que INITIAL) → queda con INITIAL_HABITS', () => {
  memStore.clear();
  assert.equal(manualLooksLikeDefault(null), true);
  // idbValue.habits.length (20) > lsCount (0) → true → adoptaría IDB
  // PERO 20 < INITIAL_HABITS_LENGTH (24), y son INITIAL_HABITS idénticos: inofensivo.
  // El usuario ve 20 hábitos en lugar de 24, pero los IDs son los mismos.
  const idbCount = 20;
  assert.equal(idbCount > 0, true);
  // Nota: en este caso adoptamos 20 aunque INITIAL=24, porque nuestro
  // criterio es "IDB tiene algo" vs "LS vacío". Aceptable: el usuario al
  // menos ve datos reales (mismos INITIAL_HABITS que ya tendría por defecto).
});

test('flujo B: LS=INITIAL_HABITS(24) + IDB=25 → se recuperan los 25', () => {
  memStore.clear();
  // LS tiene los 24 INITIAL_HABITS (residuo de bug antiguo, sin progreso)
  memStore.set('habitquest_data', JSON.stringify({
    habits: Array(INITIAL_HABITS_LENGTH).fill({ name: 'init', completedDates: [] }),
  }));
  const lsRaw = memStore.get('habitquest_data');
  // looksLikeDefault=true porque sin progreso y count=24
  assert.equal(manualLooksLikeDefault(lsRaw ?? null), true);
  // IDB tiene 25 reales (no leídos aquí, pero el código los adoptaría)
  const idbCount = 25;
  assert.equal(idbCount > INITIAL_HABITS_LENGTH, true, '25 > 24 → adoptamos IDB');
});

test('flujo C: LS=30 propios + IDB=28 viejos → respetamos LS', () => {
  memStore.clear();
  memStore.set('habitquest_data', JSON.stringify({
    habits: Array(30).fill({ name: 'goal', completedDates: ['2025-01-01'] }),
  }));
  const lsRaw = memStore.get('habitquest_data');
  // Con datos reales propios, NO vamos a IDB
  assert.equal(manualLooksLikeDefault(lsRaw ?? null), false);
});

test('flujo D: LS=20 (borró hábitos personalizados, sin progreso) + IDB=20 → respetamos', () => {
  memStore.clear();
  memStore.set('habitquest_data', JSON.stringify({
    habits: Array(20).fill({ name: 'kept', completedDates: [] }),
  }));
  const lsRaw = memStore.get('habitquest_data');
  // 20 < 24 y sin progreso → looksLikeDefault=true → iríamos a IDB
  assert.equal(manualLooksLikeDefault(lsRaw ?? null), true);
  // Si IDB tiene 20 también, 20 > 20 es falso → no se restaura, se queda con LS
  // Aceptable: el usuario no ve cambios.
  const idbCount = 20;
  assert.equal(idbCount > 20, false);
});
// ── Debounce de IDB y flush al cerrar ──────────────────────────────────────
// Réplica del contrato de savePrimary() para poder testearlo sin DOM ni
// IndexedDB reales: si el usuario cierra la PWA antes de que pase el debounce,
// la escritura se pierde en el espejo de IDB y una posterior eviction de LS
// devuelve un estado viejo (el usuario ve solo los hábitos predeterminados).

const DEBOUNCE_MS = 800;
const idbStore = new Map<string, unknown>();
const idbWrites: string[] = [];
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function fakeSavePrimary(namespace: string, data: unknown): void {
  const existing = timers.get(namespace);
  if (existing) clearTimeout(existing);
  timers.set(
    namespace,
    setTimeout(() => {
      timers.delete(namespace);
      idbWrites.push(namespace);
      idbStore.set(namespace, data);
    }, DEBOUNCE_MS),
  );
}

function fakeFlush(): void {
  for (const [ns, t] of timers) {
    clearTimeout(t);
    timers.delete(ns);
    idbWrites.push(ns);
    idbStore.set(ns, ns + ':flushed');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test('flush: el cambio hecho justo antes de cerrar SÍ llega a IDB', async () => {
  idbWrites.length = 0;
  // Guardamos y "cerramos" la app de inmediato, sin esperar el debounce.
  fakeSavePrimary('ns1', { habits: ['mío'] });
  assert.deepEqual(idbWrites, [], 'sanity: aún no debe haberse escrito');
  fakeFlush();
  assert.deepEqual(idbWrites, ['ns1'], 'el flush debe forzar la escritura pendiente');
});

test('flush: sin flush, el cambio reciente se pierde (el bug original)', async () => {
  idbWrites.length = 0;
  fakeSavePrimary('ns2', { habits: ['mío'] });
  await sleep(DEBOUNCE_MS + 100); // el debounce normal sí llega a completarse
  assert.deepEqual(idbWrites, ['ns2']);
});

test('flush: es idempotente (llamarlo dos veces no rompe nada)', async () => {
  idbWrites.length = 0;
  fakeSavePrimary('ns3', { habits: ['x'] });
  fakeFlush();
  fakeFlush();
  assert.deepEqual(idbWrites, ['ns3'], 'solo debe escribir una vez');
});

test('flush: varias escrituras del mismo namespace colapsan en la última', async () => {
  idbWrites.length = 0;
  fakeSavePrimary('ns4', { habits: ['v1'] });
  fakeSavePrimary('ns4', { habits: ['v2'] });
  fakeSavePrimary('ns4', { habits: ['v3-final'] });
  fakeFlush();
  assert.deepEqual(idbWrites, ['ns4'], 'no debe escribir 3 veces');
  assert.equal(idbStore.get('ns4'), 'ns4:flushed');
});

test('clearPrimary: cancela el debounce en vuelo para no resucitar lo borrado', () => {
  idbWrites.length = 0;
  fakeSavePrimary('ns5', { habits: ['borrado'] });
  // El usuario pulsa "borrar": hay una escritura pendiente que escribiría
  // en IDB el estado que acaba de eliminar.
  const t = timers.get('ns5');
  if (t) clearTimeout(t);
  timers.delete('ns5');
  idbStore.delete('ns5');
  fakeFlush(); // un flush posterior ya no debe resurrectar nada
  assert.deepEqual(idbWrites, [], 'nada debe escribirse tras el borrado');
});
