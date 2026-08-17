/**
 * Per-interval hit/miss tally. Practice mode's whole point is finding out *which*
 * interval you keep missing, so this survives reloads.
 */

import { ANSWERS } from './intervals.ts';
import { storageGet, storageRemove, storageSet } from './storage.ts';

export const STATS_KEY = 'interval-trainer.stats.v1';

export interface Tally {
  correct: number;
  total: number;
}

export type StatsMap = Record<number, Tally>;

export function emptyStats(): StatsMap {
  const stats: StatsMap = {};
  for (const interval of ANSWERS) stats[interval.semitones] = { correct: 0, total: 0 };
  return stats;
}

export function record(stats: StatsMap, semitones: number, correct: boolean): StatsMap {
  const tally = stats[semitones] ?? { correct: 0, total: 0 };
  return {
    ...stats,
    [semitones]: { correct: tally.correct + (correct ? 1 : 0), total: tally.total + 1 },
  };
}

export function accuracy(tally: Tally | undefined): number | null {
  if (!tally || tally.total === 0) return null;
  return tally.correct / tally.total;
}

export function parseStats(raw: string | null): StatsMap {
  const stats = emptyStats();
  if (!raw) return stats;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return stats;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const semitones = Number(key);
      if (!(semitones in stats) || typeof value !== 'object' || value === null) continue;
      const tally = value as Record<string, unknown>;
      if (typeof tally.correct !== 'number' || typeof tally.total !== 'number') continue;
      // A stored `correct` above `total` would render as >100%; clamp rather than trust.
      const total = Math.max(0, Math.floor(tally.total));
      stats[semitones] = {
        total,
        correct: Math.min(total, Math.max(0, Math.floor(tally.correct))),
      };
    }
  } catch {
    return emptyStats();
  }
  return stats;
}

export function loadStats(): StatsMap {
  return parseStats(storageGet(STATS_KEY));
}

export function saveStats(stats: StatsMap): void {
  storageSet(STATS_KEY, JSON.stringify(stats));
}

export function clearStats(): void {
  storageRemove(STATS_KEY);
}
