/**
 * Mensajes diarios de motivación.
 *
 * Diseño YAGNI:
 *  - Pool editable en localStorage (clave `habitquest_motivations`).
 *  - Toggle on/off en `habitquest_motivation_enabled` ('1' por defecto).
 *  - Fecha del último mostrado en `habitquest_motivation_last_date` (YYYY-MM-DD).
 *  - El mensaje se elige pseudo-aleatoriamente según el día: una vez al día,
 *    no en cada apertura. Si solo hay un mensaje en el pool, se muestra siempre.
 */

import { useEffect, useState } from 'react';

const POOL_KEY = 'habitquest_motivations';
const ENABLED_KEY = 'habitquest_motivation_enabled';
const LAST_DATE_KEY = 'habitquest_motivation_last_date';

export const DEFAULT_MOTIVATIONS: string[] = [
  'Cada pequeño paso cuenta. Hoy, solo uno.',
  'No tienes que motivarte para empezar. Empieza y la motivación viene.',
  'La mejor versión de ti se construye con días normales.',
  'Si hoy es difícil, que sea pequeño. Si hoy es fácil, suma algo.',
  'Mañana te lo agradecerás. Empieza por lo más fácil.',
  'No se trata de hacerlo perfecto, sino de no dejarlo.',
  'Un hábito no se rompe por un mal día. Se rompe por dos seguidos.',
  'Tu energía fluctúa: el plan se adapta. Mantén el rumbo.',
];

export function readPool(): string[] {
  try {
    const raw = localStorage.getItem(POOL_KEY);
    if (!raw) return [...DEFAULT_MOTIVATIONS];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) return arr as string[];
  } catch {
    /* ignore */
  }
  return [...DEFAULT_MOTIVATIONS];
}

export function writePool(pool: string[]): void {
  try {
    const cleaned = pool.map((s) => s.trim()).filter(Boolean);
    localStorage.setItem(POOL_KEY, JSON.stringify(cleaned));
  } catch {
    /* ignore */
  }
}

export function isEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setEnabled(v: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getLastShownDate(): string | null {
  try {
    return localStorage.getItem(LAST_DATE_KEY);
  } catch {
    return null;
  }
}

export function markShownToday(): void {
  try {
    const d = new Date().toISOString().split('T')[0];
    localStorage.setItem(LAST_DATE_KEY, d);
  } catch {
    /* ignore */
  }
}

/** Hash entero estable de un string (para elegir mensaje según el día). */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickMessageForToday(pool: string[]): string {
  if (pool.length === 0) return DEFAULT_MOTIVATIONS[0];
  const day = new Date().toISOString().split('T')[0];
  return pool[hash(day) % pool.length];
}

/**
 * Hook que decide si mostrar el modal hoy. Devuelve también el mensaje y el
 * callback de cierre (que persiste la fecha para no volver a mostrar hoy).
 */
export function useDailyMotivation(): {
  showModal: boolean;
  message: string;
  dismiss: () => void;
  pool: string[];
  enabled: boolean;
  toggleEnabled: (v: boolean) => void;
  updatePool: (next: string[]) => void;
} {
  const today = new Date().toISOString().split('T')[0];
  const [showModal, setShowModal] = useState<boolean>(() => {
    if (!isEnabled()) return false;
    return getLastShownDate() !== today;
  });
  const [pool, setPool] = useState<string[]>(() => readPool());
  const [message, setMessage] = useState<string>(() => pickMessageForToday(readPool()));
  const [enabled, setEnabledState] = useState<boolean>(() => isEnabled());
  // `enabled` ya está expuesto en el return; lo sincronizamos con el helper externo.

  // Si cambia el pool desde fuera (settings), refrescar el mensaje elegido.
  useEffect(() => {
    setMessage(pickMessageForToday(pool));
  }, [pool]);

  // Si el usuario activa el toggle pero ya marcó mostrado hoy, mostrar mañana.
  function dismiss() {
    markShownToday();
    setShowModal(false);
  }
  function toggleEnabled(v: boolean) {
    setEnabled(v);
    setEnabledState(v);
    if (!v) setShowModal(false);
  }
  function updatePool(next: string[]) {
    writePool(next);
    setPool(readPool());
  }

  return { showModal, message, dismiss, pool, enabled, toggleEnabled, updatePool };
}
