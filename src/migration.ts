/**
 * Migración del modo manual (v1, `habitquest_data`) al coach (v2).
 *
 * Objetivo: que quien ya usaba la app no empiece de cero. Al crear el primer
 * objetivo en el coach se suma el XP del perfil antiguo (mismo nivel) y se
 * reconoce la historia acumulada. Es 100 % puro y determinista.
 */

export interface LegacyHabit {
  name?: string;
  icon?: string;
  xp?: number;
  completedDates?: string[];
}

export interface LegacySnapshot {
  name?: string;
  avatar?: string;
  xp?: number;
  gems?: number;
  globalStreak?: number;
  habits?: LegacyHabit[];
}

export interface MigrationResult {
  /** XP a sembrar en el coach (1:1 con el perfil v1 para conservar el nivel). */
  seedXp: number;
  /** Días distintos con al menos un hábito completado en v1. */
  historyDays: number;
  /** Hábito con más historia (para el mensaje de bienvenida). */
  mostActiveHabit?: { name: string; icon: string; days: number };
  /** ¿Hay algo que migrar? */
  hasLegacy: boolean;
}

const DAY_MS = 86400000;

/** Calcula cuánto progreso v1 se puede reconocer en el coach. */
export function computeLegacySeed(legacy: LegacySnapshot | null | undefined): MigrationResult {
  if (!legacy || typeof legacy !== 'object') {
    return { seedXp: 0, historyDays: 0, hasLegacy: false };
  }
  const seedXp = Math.max(0, Math.floor(legacy.xp ?? 0));

  const dateSet = new Set<string>();
  let best: { name: string; icon: string; days: number } | null = null;
  for (const h of legacy.habits ?? []) {
    const dates = Array.isArray(h.completedDates) ? h.completedDates : [];
    for (const d of dates) dateSet.add(d);
    const uniq = new Set(dates).size;
    if (uniq > 0 && (!best || uniq > best.days)) {
      best = { name: h.name ?? 'hábito', icon: h.icon ?? '✨', days: uniq };
    }
  }

  const historyDays = dateSet.size;
  return {
    seedXp,
    historyDays,
    mostActiveHabit: best ?? undefined,
    hasLegacy: seedXp > 0 || historyDays > 0,
  };
}

/** Mensaje de bienvenida que se muestra al migrar. */
export function migrationMessage(r: MigrationResult): string {
  if (!r.hasLegacy) return '';
  const parts: string[] = [];
  if (r.seedXp > 0) {
    const level = Math.floor(r.seedXp / 100) + 1;
    parts.push(`nivel ${level} (${r.seedXp} XP)`);
  }
  if (r.historyDays > 0) parts.push(`${r.historyDays} días de historia`);
  const base = `Bienvenido al Coach. Hemos sumado tu progreso del modo manual: ${parts.join(' y ')}.`;
  if (r.mostActiveHabit) {
    return `${base} Tu hábito con más constancia fue ${r.mostActiveHabit.icon} ${r.mostActiveHabit.name} (${r.mostActiveHabit.days} días). Ahora lo llevamos al siguiente nivel.`;
  }
  return base;
}
