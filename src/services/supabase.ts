/**
 * Cliente Supabase + sync del coach (v2).
 *
 * Diseño YAGNI:
 *  - Sin login: cada dispositivo genera un UUID persistente en localStorage
 *    y guarda su estado en una fila única de la tabla `habitquest_state`.
 *  - Sin realtime: push/pull manual con debounce. Suficiente para una sola
 *    persona en sus dispositivos.
 *  - Si las env vars faltan o la red falla → todo cae a localStorage y la
 *    app sigue funcionando igual.
 *
 * SQL necesario (pegar en Supabase → SQL editor):
 *
 *   create table if not exists habitquest_state (
 *     device_id uuid primary key,
 *     state     jsonb not null,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table habitquest_state enable row level security;
 *   create policy "public_all" on habitquest_state
 *     for all using (true) with check (true);
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
const TABLE = 'habitquest_state';
const DEVICE_KEY = 'habitquest_device_id';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(URL && KEY);
}

function getClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) client = createClient(URL!, KEY, { auth: { persistSession: false } });
  return client;
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

export interface RemoteRow {
  state: unknown;
  updated_at: string;
}

/** Carga el estado del coach desde Supabase. Devuelve null si no hay fila o falla. */
export async function fetchRemoteState(): Promise<{ state: unknown; updatedAt: string } | null> {
  const c = getClient();
  if (!c) return null;
  const id = getDeviceId();
  try {
    const { data, error } = await c.from(TABLE).select('state, updated_at').eq('device_id', id).maybeSingle();
    if (error || !data) return null;
    return { state: (data as RemoteRow).state, updatedAt: (data as RemoteRow).updated_at };
  } catch {
    return null;
  }
}

/** Empuja el estado del coach a Supabase (upsert). No lanza — loguea y olvida. */
export async function pushRemoteState(state: unknown): Promise<void> {
  const c = getClient();
  if (!c) return;
  const id = getDeviceId();
  try {
    await c.from(TABLE).upsert(
      { device_id: id, state, updated_at: new Date().toISOString() },
      { onConflict: 'device_id' },
    );
  } catch {
    /* ponytail: red caída → localStorage es la fuente de verdad hasta el siguiente push */
  }
}
