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

export { idbGet };

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

/** Lee de localStorage. Si no hay, intenta IDB como espejo. */
export async function loadPrimary<T>(namespace: string): Promise<T | null> {
  try {
    const raw = localStorage.getItem(namespace);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* fallthrough a IDB */
  }
  const fromIdb = await idbGet<T>(namespace);
  if (fromIdb) {
    // Repoblamos localStorage para la próxima vez.
    try {
      localStorage.setItem(namespace, JSON.stringify(fromIdb));
    } catch {
      /* ignore */
    }
    return fromIdb;
  }
  return null;
}

/**
 * Escribe en localStorage (instantáneo, fuente de verdad para el UI) y dispara
 * una escritura espejo a IndexedDB (debounced). La promesa devuelta resuelve
 * con localStorage; IDB es fire-and-forget.
 */
const pendingIdbWrites = new Map<string, ReturnType<typeof setTimeout>>();
const IDB_DEBOUNCE_MS = 800;

export function savePrimary(namespace: string, data: unknown): void {
  const json = JSON.stringify(data);
  // LocalStorage: síncrono e inmediato.
  try {
    localStorage.setItem(namespace, json);
  } catch {
    /* ignore — seguimos intentando IDB */
  }
  // IDB: debounced. Si hay otra en vuelo para el mismo namespace, la reemplazamos.
  const existing = pendingIdbWrites.get(namespace);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    pendingIdbWrites.delete(namespace);
    void idbSet(namespace, data);
  }, IDB_DEBOUNCE_MS);
  pendingIdbWrites.set(namespace, t);
}

/** Borra de AMBAS capas. Útil para "Reiniciar" del usuario. */
export function clearPrimary(namespace: string): void {
  try {
    localStorage.removeItem(namespace);
  } catch {
    /* ignore */
  }
  void idbDel(namespace);
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

/** Construye y descarga un sobre 'full' con manual + coach en un solo archivo.
 *  Es la copia que cubre los objetivos/hábitos del Coach. */
export function downloadFullBackup(): void {
  const manual = readSnapshot(NS.MANUAL) ?? null;
  const coach = readSnapshot(NS.COACH) ?? null;
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