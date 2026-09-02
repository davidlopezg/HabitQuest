/**
 * Detección de patrones (determinista).
 *
 * No afirmamos causalidad: usamos lenguaje tipo "parece existir una relación".
 * - Días de la semana con adherencia sistemáticamente baja → proponer cambio
 *   de horario.
 * - Motivos de abandono recurrentes.
 * - Relación entre sueño corto y adherencia (cuando haya datos de sueño).
 */

import type { BehaviorLogEntry, CoachInsight, CoachState, ReasonCode } from './types.ts';
import { adherence, reasonDistribution } from './history.ts';
import { addDays, WEEKDAY_ES, weekdayOf } from './time.ts';

export interface PatternOpts {
  sinceDays?: number;
  minSamples?: number;
  sleepLogs?: { date: string; hours: number }[];
  onBehaviorId?: string; // analizar solo un comportamiento
}

export function analyzePatterns(state: CoachState, opts: PatternOpts = {}): CoachInsight[] {
  const sinceDays = opts.sinceDays ?? 28;
  const minSamples = opts.minSamples ?? 4;
  const end = latestLogDate(state.logs);
  if (!end) return [];
  const from = addDays(end, -(sinceDays - 1));
  const insights: CoachInsight[] = [];

  const behaviors = opts.onBehaviorId
    ? state.behaviors.filter((b) => b.id === opts.onBehaviorId)
    : state.behaviors;

  // 1) Días de la semana débiles.
  for (const b of behaviors) {
    const counts = Array(7).fill(0) as number[];
    const done = Array(7).fill(0) as number[];
    for (let d = 0; d < sinceDays; d++) {
      const key = addDays(end, -d);
      if (key < from || key < b.introducedAt) continue;
      const wd = weekdayOf(key);
      counts[wd]++;
      const e = state.logs.find((l) => l.behaviorId === b.id && l.date === key);
      if (e && (e.kind === 'full' || e.kind === 'minimal')) done[wd]++;
    }
    const withData = counts.map((c, i) => ({ wd: i, count: c, rate: c ? done[i] / c : 0 }))
      .filter((x) => x.count >= minSamples);
    if (withData.length < 4) continue;
    const avg = withData.reduce((s, x) => s + x.rate, 0) / withData.length;
    for (const x of withData) {
      if (x.rate < 0.35 && x.rate < avg - 0.25) {
        insights.push({
          type: 'schedule_change',
          severity: 'suggestion',
          message: `Parece que los ${WEEKDAY_ES[x.wd]} casi nunca completas ${b.name.toLowerCase()} (${Math.round(x.rate * 100)} % de ${x.count} días). Ese horario probablemente no te funciona. ¿Probamos otra hora ese día?`,
          data: { behaviorId: b.id, weekday: x.wd, rate: x.rate },
        });
      }
    }
  }

  // 2) Motivos de abandono recurrentes.
  const reasons = reasonDistribution(state.logs, end, sinceDays);
  const total = Object.values(reasons).reduce((s, n) => s + (n ?? 0), 0);
  if (total >= 3) {
    const top = (Object.entries(reasons) as [ReasonCode, number][]).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3 && top[1] / total >= 0.4) {
      insights.push({
        type: 'reason_pattern',
        severity: 'info',
        message: `He detectado que "${reasonLabel(top[0])}" es el motivo más frecuente (${top[1]} de ${total} veces). Quizá podamos ajustar el plan para que ocurra menos.`,
        data: { code: top[0], count: top[1] },
      });
    }
  }

  // 3) Relación sueño ↔ adherencia (solo con datos; sin afirmar causalidad).
  if (opts.sleepLogs && opts.sleepLogs.length >= 12) {
    const sleepByDate = new Map(opts.sleepLogs.map((s) => [s.date, s.hours]));
    let short = 0, shortDone = 0, long = 0, longDone = 0;
    for (const l of state.logs) {
      const h = sleepByDate.get(l.date);
      if (h === undefined || h === 0) continue;
      const ok = l.kind === 'full' || l.kind === 'minimal';
      if (h < 6) { short++; if (ok) shortDone++; }
      else { long++; if (ok) longDone++; }
    }
    if (short >= 6 && long >= 6) {
      const shortRate = shortDone / short;
      const longRate = longDone / long;
      if (shortRate < longRate - 0.2) {
        insights.push({
          type: 'sleep_relation',
          severity: 'info',
          message: `Los días que duermes menos de 6 horas tu adherencia baja del ${Math.round(longRate * 100)} % al ${Math.round(shortRate * 100)} %. Parece existir una relación (no es causalidad con esta muestra).`,
          data: { shortRate, longRate },
        });
      }
    }
  }

  return insights;
}

function latestLogDate(logs: BehaviorLogEntry[]): string | undefined {
  return logs.length ? logs.map((l) => l.date).sort().at(-1) : undefined;
}

const REASON_LABELS: Partial<Record<ReasonCode, string>> = {
  work: 'el trabajo',
  no_time: 'la falta de tiempo',
  tired: 'el cansancio',
  outside: 'estar fuera de casa',
  family: 'compromisos familiares',
  illness: 'enfermedad',
  no_motivation: 'la falta de motivación',
  distraction: 'las distracciones',
  other: 'otros motivos',
};
function reasonLabel(c: ReasonCode): string {
  return REASON_LABELS[c] ?? 'otros motivos';
}
