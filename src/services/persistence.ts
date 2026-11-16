/**
 * Capa de persistencia para HabitQuest.
 *
 * Estrategia multi-capa:
 *  - localStorage = fuente primaria, instantáneo y síncrono.
 *  - IndexedDB    = espejo robusto (cuota, evictions). NUNCA es lo único que escribe.
 *  - Archivo JSON = copia de seguridad manual que el usuario descarga.
 *
 * Contrato:
 *  - Ninguna lanza excepciones. Ante cualquier error, degrada silenciosamente.
 *  - Las escrituras a IDB van con debounce para no martillear el navegador.
 *  - No tocamos claves ajenas al namespace `habitquest_*` (respeto al Coach).
 */

import { idbGet, idbSet, idbDel } from './idb.ts';

export { idbGet, idbSet };

// --- Namespaces ----------------------------------------------------------------
// Cada namespace tiene su propio par de claves LS + IDB. Así el modo manual y el
// Coach no se pisan y se pueden restaurar de forma independiente.
export const NS = {
  MANUAL: 'habitquest_data',     // modo manual (Inicio, Stats, Logros, Héroe)
  COACH: 'habitquest_coach',     // coach con IA
  BACKUP_META: 'habitquest_backup_meta', // recordatorios + onboarding
} as const;

// --- Backup metadata ----------------------------------------------------------

export interface BackupMeta {
  /** ISO date (YYYY-MM-DD) de la última vez que el usuario descargó un .json del namespace MANUAL. */
  lastManualDownload: string;
  /** ISO date de la última vez que el usuario vio y cerró el modal de bienvenida. */
  onboardingDismissed: boolean;
  /** Última vez que el banner de recordatorio se cerró. */
  lastReminderDismissed: string | null;
}

const DEFAULT_META: BackupMeta = {
  lastManualDownload: '',
  onboardingDismissed: false,
  lastReminderDismissed: null,
};

const META_VERSION = 1;

function loadMeta(): BackupMeta {
  try {
    const raw = localStorage.getItem(NS.BACKUP_META);
    if (!raw) return DEFAULT_META;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_META, ...(parsed ?? {}) };
  } catch {
    return DEFAULT_META;
  }
}

function saveMeta(meta: BackupMeta): void {
  try {
    localStorage.setItem(NS.BACKUP_META, JSON.stringify({ version: META_VERSION, ...meta }));
  } catch {
    /* ignore */
  }
}

// --- Core: load / save ------------------------------------------------------

// --- Marcas de tiempo por capa ---------------------------------------------
//
// localStorage e IndexedDB guardan el MISMO dato, pero no siempre están
// sincronizados:
//   - LS se vacía (eviction de iOS/Safari, "borrar datos del sitio").
//   - LS lanza QuotaExceededError y conserva un valor VIEJO mientras IDB
//     guarda el nuevo.
// Para saber cuál de las dos capas tiene el dato más reciente guardamos una
// marca de tiempo por namespace en cada capa:
//   - LS  → clave hermana `habitquest_<ns>_ts`
//   - IDB → clave hermana `<ns>_ts`
// El payload NO cambia de formato: los lectores directos (idbGet, CoachView)
// siguen viendo el dato tal cual.

function tsKey(namespace: string): string {
  return `${namespace}_ts`;
}

/** Marca de tiempo de la escritura en localStorage (0 si no la hay). */
function readLsTs(namespace: string): number {
  try {
    const n = Number(localStorage.getItem(tsKey(namespace)));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Marca de tiempo de la escritura en IndexedDB (0 si no la hay). */
async function readIdbTs(namespace: string): Promise<number> {
  const n = Number(await idbGet<string>(tsKey(namespace)));
  return Number.isFinite(n) ? n : 0;
}

/** Un valor y de qué capa (y de cuándo) viene. */
export interface LayerValue<T = unknown> {
  data: T | null;
  ts: number;
  source: 'ls' | 'idb' | 'none';
}

/**
 * Elige el valor MÁS RECIENTE entre las dos capas.
 *
 * Reglas:
 *  - Si una capa está vacía, gana la otra (eviction de LS).
 *  - Si ambas tienen datos, gana la de marca de tiempo más alta (cuota llena
 *    en LS → IDB tiene el dato nuevo).
 *  - Sin marcas de tiempo (instalaciones viejas), gana LS: es la primaria.
 */
export function pickFreshest<T>(ls: LayerValue<T>, idb: LayerValue<T>): LayerValue<T> {
  const lsEmpty = ls.data === null || ls.data === undefined;
  const idbEmpty = idb.data === null || idb.data === undefined;
  if (lsEmpty && idbEmpty) return { data: null, ts: 0, source: 'none' };
  if (lsEmpty) return idb;
  if (idbEmpty) return ls;
  return idb.ts > ls.ts ? idb : ls;
}

/** Lee de localStorage. Si no hay, intenta IDB como espejo. */
export async function loadPrimary<T>(namespace: string): Promise<T | null> {
  const ls: LayerValue<T> = {
    data: readSnapshot(namespace) as T | null,
    ts: readLsTs(namespace),
    source: 'ls',
  };
  const idb: LayerValue<T> = {
    data: (await idbGet<T>(namespace)) ?? null,
    ts: await readIdbTs(namespace),
    source: 'idb',
  };
  const fresh = pickFreshest(ls, idb);
  if (fresh.data === null || fresh.data === undefined) return null;
  if (fresh.source === 'idb') {
    // Repoblamos localStorage para la próxima vez (si hay espacio).
    try {
      localStorage.setItem(namespace, JSON.stringify(fresh.data));
      localStorage.setItem(tsKey(namespace), String(fresh.ts));
    } catch {
      /* ignore */
    }
  }
  return fresh.data;
}

/**
 * Escribe en localStorage (instantáneo, fuente de verdad para el UI) y dispara
 * una escritura espejo a IndexedDB (debounced). La promesa devuelta resuelve
 * con localStorage; IDB es fire-and-forget.
 */
const pendingIdbWrites = new Map<string, ReturnType<typeof setTimeout>>();
/** Último payload pendiente de escribir a IDB por namespace. Necesario para
 *  poder vaciar el debounce al cerrar la app (flush) o al borrar (cancel).
 *  Guardamos también la marca de tiempo de la escritura para saber si el dato
 *  de IDB es más nuevo que el de localStorage. */
const pendingIdbData = new Map<string, { data: unknown; ts: number }>();
const IDB_DEBOUNCE_MS = 800;

/** Avisamos UNA vez por namespace: si LS falla por cuota, el estado sigue
 *  vivo en IndexedDB, pero la copia de seguridad usará esa capa. Sin este
 *  aviso el fallo era invisible (#3). */
const warnedQuota = new Set<string>();
function warnQuotaOnce(namespace: string): void {
  if (warnedQuota.has(namespace)) return;
  warnedQuota.add(namespace);
  console.warn(
    `[habitquest] localStorage no pudo guardar "${namespace}" (¿cuota llena?). ` +
      'El estado sigue en IndexedDB, pero la copia de seguridad usará esa capa.',
  );
}

function writeIdbNow(namespace: string, data: unknown, ts: number): void {
  pendingIdbWrites.delete(namespace);
  pendingIdbData.delete(namespace);
  void idbSet(namespace, data);
  void idbSet(tsKey(namespace), String(ts));
}

export function savePrimary(namespace: string, data: unknown): void {
  const json = JSON.stringify(data);
  const ts = Date.now();
  // LocalStorage: síncrono e inmediato.
  try {
    localStorage.setItem(namespace, json);
    localStorage.setItem(tsKey(namespace), String(ts));
  } catch {
    /* ignore — seguimos intentando IDB */
    warnQuotaOnce(namespace);
  }
  // IDB: debounced. Si hay otra en vuelo para el mismo namespace, la reemplazamos.
  const existing = pendingIdbWrites.get(namespace);
  if (existing) clearTimeout(existing);
  pendingIdbData.set(namespace, { data, ts });
  const t = setTimeout(() => writeIdbNow(namespace, data, ts), IDB_DEBOUNCE_MS);
  pendingIdbWrites.set(namespace, t);
}

/**
 * Vuelca a IDB cualquier escritura pendiente del debounce.
 *
 * Sin esto, un cambio hecho <800ms antes de cerrar la PWA se queda solo en
 * localStorage. Si el navegador luego evicciona LS (presión de cuota, iOS
 * limpiando almacenamiento tras semanas sin abrir la app), IDB devuelve un
 * estado viejo y el usuario aparece con los hábitos predeterminados.
 *
 * Idempotente y sin excepciones: se puede llamar en cualquier momento.
 */
export function flushPendingWrites(): void {
  for (const [namespace, entry] of pendingIdbData) {
    const t = pendingIdbWrites.get(namespace);
    if (t) clearTimeout(t);
    writeIdbNow(namespace, entry.data, entry.ts);
  }
}

/** Borra de AMBAS capas. Útil para "Reiniciar" del usuario. */
export function clearPrimary(namespace: string): void {
  // Cancelamos cualquier escritura pendiente: si no, un debounce en vuelo
  // reescribiría en IDB el estado que el usuario acaba de borrar.
  const t = pendingIdbWrites.get(namespace);
  if (t) clearTimeout(t);
  pendingIdbWrites.delete(namespace);
  pendingIdbData.delete(namespace);
  try {
    localStorage.removeItem(namespace);
    localStorage.removeItem(tsKey(namespace));
  } catch {
    /* ignore */
  }
  void idbDel(namespace);
  void idbDel(tsKey(namespace));
}

// --- Backup a archivo -------------------------------------------------------

export interface BackupEnvelope {
  /** Tipo de payload: 'manual' | 'coach' | 'full' */
  type: 'manual' | 'coach' | 'full';
  /** Versión del formato para futuras migraciones. */
  format: 1;
  /** ISO datetime de la exportación. */
  exportedAt: string;
  /** La app que lo generó. */
  app: 'HabitQuest';
  /** El payload tal cual estaba guardado. Para type='full' contiene {manual, coach}. */
  data: unknown;
}

/** Construye un Blob con un sobre versionado y lo ofrece como descarga. */
export function downloadBackup(type: 'manual' | 'coach', data: unknown): void {
  const envelope: BackupEnvelope = {
    type,
    format: 1,
    exportedAt: new Date().toISOString(),
    app: 'HabitQuest',
    data,
  };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `habitquest-${type}-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lee un archivo y devuelve el sobre validado, o null si el formato es incorrecto. */
export function parseBackup(file: File): Promise<BackupEnvelope | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') return resolve(null);
        if (parsed.app !== 'HabitQuest') return resolve(null);
        if (parsed.format !== 1) return resolve(null);
        if (parsed.type !== 'manual' && parsed.type !== 'coach' && parsed.type !== 'full') return resolve(null);
        if (!('data' in parsed)) return resolve(null);
        resolve(parsed as BackupEnvelope);
      } catch {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/** Lee el valor actual de un namespace desde LS (no IDB). Devuelve null si no hay. */
export function readSnapshot(namespace: string): unknown {
  try {
    const raw = localStorage.getItem(namespace);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Lee el valor MÁS RECIENTE de un namespace, comparando localStorage e
 * IndexedDB. Es la lectura que debe usarse para las copias de seguridad:
 * `readSnapshot` solo mira LS y puede devolver un estado vacío (#8) o
 * desfasado (#3).
 */
export async function readSnapshotFresh(namespace: string): Promise<unknown> {
  const ls: LayerValue = {
    data: readSnapshot(namespace),
    ts: readLsTs(namespace),
    source: 'ls',
  };
  const idb: LayerValue = {
    data: (await idbGet(namespace)) ?? null,
    ts: await readIdbTs(namespace),
    source: 'idb',
  };
  return pickFreshest(ls, idb).data;
}

/** Construye y descarga un sobre 'full' con manual + coach en un solo archivo.
 *  Es la copia que cubre los objetivos/hábitos del Coach.
 *
 *  Lee la capa MÁS FRESCA de cada namespace (LS + IDB), así que la copia no
 *  sale vacía si localStorage fue evictado ni desfasada si LS está lleno (#8, #3). */
export async function downloadFullBackup(): Promise<void> {
  const manual = (await readSnapshotFresh(NS.MANUAL)) ?? null;
  const coach = (await readSnapshotFresh(NS.COACH)) ?? null;
  const envelope: BackupEnvelope = {
    type: 'full',
    format: 1,
    exportedAt: new Date().toISOString(),
    app: 'HabitQuest',
    data: { manual, coach },
  };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `habitquest-full-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Metadata / recordatorios ----------------------------------------------

const REMINDER_INTERVAL_DAYS = 7;

/** Acepta también un sobre legacy (sin `app`/`format`) de versiones previas. */
export function isLegacyShape(obj: unknown): obj is { data: unknown; type?: string } {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  // Legacy: archivo descargado por la versión vieja (sin sobre).
  // Aceptamos cualquier objeto JSON; el caller decide si encaja con su namespace.
  return !('app' in o) && !('format' in o);
}

export function markManualDownloaded(): void {
  const m = loadMeta();
  m.lastManualDownload = new Date().toISOString();
  saveMeta(m);
}

export function dismissOnboarding(): void {
  const m = loadMeta();
  m.onboardingDismissed = true;
  saveMeta(m);
}

export function dismissReminder(): void {
  const m = loadMeta();
  m.lastReminderDismissed = new Date().toISOString();
  saveMeta(m);
}

/** Días desde la última descarga. -1 si nunca descargó. */
export function daysSinceLastDownload(): number {
  const m = loadMeta();
  if (!m.lastManualDownload) return -1;
  const last = new Date(m.lastManualDownload).getTime();
  if (Number.isNaN(last)) return -1;
  const diffMs = Date.now() - last;
  return Math.floor(diffMs / 86400000);
}

/** ¿Hay que mostrar el banner de "X días sin copia"? Respeta snooze. */
export function shouldShowReminder(): boolean {
  const m = loadMeta();
  if (!m.lastManualDownload) {
    // Nunca descargó: mostrar solo si también descartó el onboarding
    // (sino, sería ruido redundante).
    return m.onboardingDismissed;
  }
  if (daysSinceLastDownload() < REMINDER_INTERVAL_DAYS) return false;
  if (!m.lastReminderDismissed) return true;
  const snoozeMs = Date.now() - new Date(m.lastReminderDismissed).getTime();
  return snoozeMs >= REMINDER_INTERVAL_DAYS * 86400000;
}

export function getOnboardingDismissed(): boolean {
  return loadMeta().onboardingDismissed;
}