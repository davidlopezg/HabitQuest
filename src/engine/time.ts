/**
 * Utilidades de tiempo locales puras (sin dependencias del navegador).
 * Todas las fechas se manejan como claves 'YYYY-MM-DD' en zona local.
 */

export type DateKey = string; // 'YYYY-MM-DD'

const pad = (n: number) => String(n).padStart(2, '0');

/** Clave YYYY-MM-DD local a partir de un Date. */
export function dateKeyOf(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Clave de hoy en zona local. */
export function todayKey(): DateKey {
  return dateKeyOf(new Date());
}

/** Suma/resta días a una clave y devuelve otra clave. */
export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateKeyOf(dt);
}

/** Días transcurridos entre dos claves (b - a), puede ser negativo. */
export function diffDays(a: DateKey, b: DateKey): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const da = new Date(pa[0], pa[1] - 1, pa[2]).getTime();
  const db = new Date(pb[0], pb[1] - 1, pb[2]).getTime();
  return Math.round((db - da) / 86400000);
}

/** Nombre corto del día de la semana (0=domingo ... 6=sábado). */
export function weekdayOf(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export const WEEKDAY_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Convierte 'HH:MM' a minutos desde medianoche. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Convierte minutos desde medianoche a 'HH:MM'. */
export function toHHMM(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
