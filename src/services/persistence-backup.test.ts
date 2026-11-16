/**
 * Tests de la copia de seguridad multi-capa (#8 y #3).
 *
 * Reproducen los dos fallos reportados contra el MÓDULO REAL (no una copia de
 * la lógica), con un IndexedDB falso mínimo:
 *
 *  #8 · Eviction: localStorage queda vacío pero IndexedDB conserva el estado →
 *       la copia debe llevar el dato de IDB (antes salía `manual:null`).
 *  #3 · Cuota: localStorage conserva un valor VIEJO (setItem lanza
 *       QuotaExceededError) mientras IDB guarda el nuevo → la copia debe
 *       llevar el dato de IDB (antes salía el viejo).
 *
 * Además cubre la marca de tiempo por capa y el borrado de las marcas.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NS,
  pickFreshest,
  readSnapshotFresh,
  savePrimary,
  flushPendingWrites,
  clearPrimary,
} from './persistence.ts';

// ── localStorage falso (controlable: cuota, eviction) ───────────────────────
const memStore = new Map<string, string>();
let failingKeys: Set<string> | null = null;

(globalThis as any).localStorage = {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (failingKeys?.has(k)) {
      const e = new Error('quota');
      e.name = 'QuotaExceededError';
      throw e;
    }
    memStore.set(k, v);
  },
  removeItem: (k: string) => {
    memStore.delete(k);
  },
};

// ── IndexedDB falso (lo justo para idb.ts) ─────────────────────────────────
const idbStore = new Map<string, unknown>();

function installFakeIdb(): void {
  const mkReq = () => {
    const r: any = { onsuccess: null, onerror: null, result: undefined };
    return r;
  };
  const fakeDb: any = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => ({}),
    transaction: () => {
      const tx: any = { oncomplete: null, onerror: null, onabort: null };
      tx.objectStore = () => ({
        get: (key: string) => {
          const r = mkReq();
          queueMicrotask(() => {
            r.result = idbStore.get(key);
            r.onsuccess?.();
          });
          return r;
        },
        put: (value: unknown, key: string) => {
          idbStore.set(key, value);
          const r = mkReq();
          queueMicrotask(() => r.onsuccess?.());
          return r;
        },
        delete: (key: string) => {
          idbStore.delete(key);
          const r = mkReq();
          queueMicrotask(() => r.onsuccess?.());
          return r;
        },
      });
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };
  (globalThis as any).indexedDB = {
    open: () => {
      const r: any = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: fakeDb };
      queueMicrotask(() => r.onsuccess?.());
      return r;
    },
  };
}
installFakeIdb();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function reset(): void {
  memStore.clear();
  idbStore.clear();
  failingKeys = null;
}

// ── pickFreshest (puro) ───────────────────────────────────────────────────

test('pickFreshest: LS vacía + IDB con datos → gana IDB (eviction)', () => {
  const r = pickFreshest(
    { data: null, ts: 0, source: 'ls' },
    { data: { a: 1 }, ts: 10, source: 'idb' },
  );
  assert.equal(r.source, 'idb');
  assert.deepEqual(r.data, { a: 1 });
});

test('pickFreshest: IDB vacía + LS con datos → gana LS', () => {
  const r = pickFreshest(
    { data: { b: 2 }, ts: 10, source: 'ls' },
    { data: null, ts: 0, source: 'idb' },
  );
  assert.equal(r.source, 'ls');
  assert.deepEqual(r.data, { b: 2 });
});

test('pickFreshest: IDB con ts mayor → gana IDB (LS desfasado por cuota)', () => {
  const r = pickFreshest(
    { data: 'viejo', ts: 100, source: 'ls' },
    { data: 'nuevo', ts: 200, source: 'idb' },
  );
  assert.equal(r.source, 'idb');
  assert.equal(r.data, 'nuevo');
});

test('pickFreshest: empate de ts → gana LS (la primaria)', () => {
  const r = pickFreshest(
    { data: 'ls', ts: 100, source: 'ls' },
    { data: 'idb', ts: 100, source: 'idb' },
  );
  assert.equal(r.source, 'ls');
});

test('pickFreshest: las dos vacías → none', () => {
  const r = pickFreshest(
    { data: null, ts: 0, source: 'ls' },
    { data: null, ts: 0, source: 'idb' },
  );
  assert.equal(r.source, 'none');
  assert.equal(r.data, null);
});

// ── #8 · eviction de localStorage ──────────────────────────────────────────

test('#8: LS evictado + IDB intacto → la copia usa el estado de IDB', async () => {
  reset();
  const state = { habits: [{ name: 'correr', completedDates: ['2026-11-16'] }] };

  // 1. El usuario guarda con normalidad (LS + espejo en IDB).
  savePrimary(NS.MANUAL, state);
  flushPendingWrites();
  await sleep(5);

  // 2. El navegador evicciona localStorage (iOS/Safari), IDB sobrevive.
  memStore.delete(NS.MANUAL);
  memStore.delete(`${NS.MANUAL}_ts`);

  // 3. La copia de seguridad debe llevar el dato que aún existe (IDB).
  const fresh = await readSnapshotFresh(NS.MANUAL);
  assert.deepEqual(fresh, state, 'la copia no puede salir vacía si IDB tiene el estado');
});

// ── #3 · localStorage lleno (QuotaExceededError) ───────────────────────────

test('#3: LS lleno (conserva el viejo) + IDB con el nuevo → la copia usa IDB', async () => {
  reset();
  const viejo = { habits: [{ name: 'viejo' }] };
  const nuevo = { habits: [{ name: 'nuevo' }] };

  // 1. Estado viejo guardado con normalidad.
  savePrimary(NS.MANUAL, viejo);
  flushPendingWrites();
  await sleep(5);

  // 2. localStorage se llena: setItem lanza, LS conserva el valor viejo.
  failingKeys = new Set([NS.MANUAL, `${NS.MANUAL}_ts`]);
  savePrimary(NS.MANUAL, nuevo);
  flushPendingWrites();
  await sleep(5);
  failingKeys = null;

  // 3. LS sigue con lo viejo; IDB ya tiene lo nuevo.
  assert.deepEqual(JSON.parse(memStore.get(NS.MANUAL) ?? 'null'), viejo);

  // 4. La copia debe llevar lo NUEVO (IDB), no lo viejo (LS).
  const fresh = await readSnapshotFresh(NS.MANUAL);
  assert.deepEqual(fresh, nuevo, 'la copia debe reflejar el estado más reciente');
});

// ── marcas de tiempo ───────────────────────────────────────────────────────

test('savePrimary: escribe la marca de tiempo en LS y en IDB', async () => {
  reset();
  savePrimary(NS.COACH, { goals: [] });
  flushPendingWrites();
  await sleep(5);

  const lsTs = Number(memStore.get(`${NS.COACH}_ts`));
  assert.equal(Number.isFinite(lsTs), true, 'LS debe guardar la marca de tiempo');
  assert.equal(lsTs > 0, true);

  const idbTs = Number(idbStore.get(`${NS.COACH}_ts`));
  assert.equal(Number.isFinite(idbTs), true, 'IDB debe guardar la marca de tiempo');
  assert.equal(idbTs > 0, true);

  // El payload NO cambia de formato: idbGet sigue viendo el dato tal cual.
  assert.deepEqual(idbStore.get(NS.COACH), { goals: [] });
});

test('clearPrimary: borra también las marcas de tiempo de LS e IDB', async () => {
  reset();
  savePrimary(NS.COACH, { goals: [1] });
  flushPendingWrites();
  await sleep(5);

  clearPrimary(NS.COACH);
  await sleep(5);

  assert.equal(memStore.has(NS.COACH), false);
  assert.equal(memStore.has(`${NS.COACH}_ts`), false);
  assert.equal(idbStore.has(NS.COACH), false);
  assert.equal(idbStore.has(`${NS.COACH}_ts`), false);
});

test('sin marcas de tiempo (instalación vieja): LS gana, y IDB si LS está vacío', async () => {
  reset();
  // Datos legacy: payload plano en ambas capas, sin marca de tiempo.
  memStore.set(NS.MANUAL, JSON.stringify({ habits: ['ls'] }));
  idbStore.set(NS.MANUAL, { habits: ['idb'] });

  const fresh = await readSnapshotFresh(NS.MANUAL);
  assert.deepEqual(fresh, { habits: ['ls'] }, 'sin ts, LS (primaria) gana');

  memStore.delete(NS.MANUAL);
  const fresh2 = await readSnapshotFresh(NS.MANUAL);
  assert.deepEqual(fresh2, { habits: ['idb'] }, 'si LS está vacío, IDB rescata el dato');
});
