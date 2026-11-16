/**
 * Cliente Appwrite (TablesDB) + sync del estado del coach.
 *
 * Sustituye a Supabase con el mismo contrato (`fetchRemoteState` /
 * `pushRemoteState`), asi que la app no cambia de comportamiento:
 *  - Sin login: cada dispositivo genera un UUID persistente en localStorage
 *    y guarda su estado en UNA fila de la tabla `state`. El id de esa fila
 *    es el propio UUID del dispositivo.
 *  - Sin realtime: push/pull manual con debounce (lo llama CoachView).
 *  - Si el SDK falla (red, origen no permitido, sin config) -> todo cae a
 *    localStorage y la app sigue funcionando igual.
 *
 * Backend (creado via MCP de Appwrite, proyecto `HabitQuest`):
 *   database `habitquest` / table `state` (columns: state longtext, updated_at datetime)
 *   permisos: read/create/update "any" (el SDK web va sin sesion, igual que
 *   la policy `public_all` de Supabase). El origen esta restringido a las
 *   web platforms del proyecto: `davidlopezg.github.io` y `localhost`.
 */

import { Client, TablesDB } from 'appwrite';

const ENDPOINT = (import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined) ?? 'https://cloud.appwrite.io/v1';
const PROJECT = (import.meta.env.VITE_APPWRITE_PROJECT_ID as string | undefined) ?? '6afac1c0001bfeb71628';
const DATABASE = (import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined) ?? 'habitquest';
const TABLE = (import.meta.env.VITE_APPWRITE_TABLE_ID as string | undefined) ?? 'state';
const DEVICE_KEY = 'habitquest_device_id';

let tables: TablesDB | null = null;

export function isAppwriteConfigured(): boolean {
  return Boolean(ENDPOINT && PROJECT && DATABASE && TABLE);
}

function getTables(): TablesDB | null {
  if (!isAppwriteConfigured()) return null;
  if (!tables) {
    tables = new TablesDB(new Client().setEndpoint(ENDPOINT).setProject(PROJECT));
  }
  return tables;
}

/** UUID estable por dispositivo (sin auth). Persiste en localStorage. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Sin localStorage (modo ultra-restrictivo): usa uno en memoria.
    return '00000000-0000-4000-8000-000000000000';
  }
}

/** Carga el estado del coach desde Appwrite. Devuelve null si no hay fila o falla. */
export async function fetchRemoteState(): Promise<{ state: unknown; updatedAt: string } | null> {
  const db = getTables();
  if (!db) return null;
  try {
    const row = await db.getRow({ databaseId: DATABASE, tableId: TABLE, rowId: getDeviceId() });
    const raw = row?.state;
    if (typeof raw !== 'string') return null;
    return { state: JSON.parse(raw) as unknown, updatedAt: String(row?.updated_at ?? '') };
  } catch {
    // 404 = este dispositivo aun no tiene fila. Cualquier otro error = red/permisos.
    return null;
  }
}

/** Empuja el estado del coach a Appwrite (upsert). No lanza — loguea y olvida. */
export async function pushRemoteState(state: unknown): Promise<void> {
  const db = getTables();
  if (!db) return;
  try {
    await db.upsertRow({
      databaseId: DATABASE,
      tableId: TABLE,
      rowId: getDeviceId(),
      data: { state: JSON.stringify(state), updated_at: new Date().toISOString() },
    });
  } catch {
    /* ponytail: red caída → localStorage es la fuente de verdad hasta el siguiente push */
  }
}
