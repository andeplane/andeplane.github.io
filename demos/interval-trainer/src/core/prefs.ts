/** Player preferences that outlive a session. */

import { isDifficulty, type Difficulty } from './difficulty.ts';
import { NOTE_NAMES } from './intervals.ts';
import type { RootMode } from './question.ts';
import { storageGet, storageSet } from './storage.ts';

const PREFS_KEY = 'interval-trainer.prefs.v2';

export interface Prefs {
  /** Which degrees get asked, and whether the key moves. */
  difficulty: Difficulty;
  /**
   * Which key Easy and Medium hold for a run: `'random'` draws a fresh one at the start
   * of each run, a pitch class pins it for good. Hard ignores it — its key moves anyway.
   */
  rootMode: RootMode;
  /** The wave field can be switched off by anyone who finds it distracting. */
  waves: boolean;
}

export const DEFAULT_PREFS: Prefs = { difficulty: 'easy', rootMode: 'random', waves: true };

export function rootModeLabel(mode: RootMode): string {
  return mode === 'random' ? 'random key' : `key of ${NOTE_NAMES[mode]}`;
}

export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const rootMode =
      parsed.rootMode === 'random' ||
      (typeof parsed.rootMode === 'number' && parsed.rootMode >= 0 && parsed.rootMode < 12)
        ? parsed.rootMode
        : DEFAULT_PREFS.rootMode;
    return {
      difficulty: isDifficulty(parsed.difficulty) ? parsed.difficulty : DEFAULT_PREFS.difficulty,
      rootMode,
      waves: typeof parsed.waves === 'boolean' ? parsed.waves : DEFAULT_PREFS.waves,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function loadPrefs(): Prefs {
  return parsePrefs(storageGet(PREFS_KEY));
}

export function savePrefs(prefs: Prefs): void {
  storageSet(PREFS_KEY, JSON.stringify(prefs));
}
