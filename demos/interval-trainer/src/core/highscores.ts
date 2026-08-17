/**
 * The local highscore boards — one per difficulty, ten entries each, persisted as JSON in
 * localStorage. They are kept apart because a five-answer Easy run and a ten-answer Hard
 * one are not the same game; ranking them against each other would only reward picking
 * the easy option.
 *
 * Parsing is defensive on purpose: this data has been sitting in a browser profile for
 * who-knows-how-long and may have been hand-edited, truncated, or written by an older
 * version of the app. Anything that doesn't look like an entry is dropped rather than
 * allowed to crash the board.
 */

import { DIFFICULTY_ORDER, type Difficulty } from './difficulty.ts';
import { storageGet, storageSet } from './storage.ts';

export const SCORES_KEY = 'interval-trainer.scores.v2';
export const MAX_ENTRIES = 10;
export const MAX_NAME_LENGTH = 12;

export interface ScoreEntry {
  name: string;
  score: number;
  correct: number;
  wrong: number;
  /** The key the run was played in — a note name, or `'random'` on Hard. */
  key: string;
  dateISO: string;
}

/** Every difficulty has a board, even when it is empty. */
export type Boards = Record<Difficulty, ScoreEntry[]>;

export function emptyBoards(): Boards {
  return { easy: [], medium: [], hard: [] };
}

function isEntry(value: unknown): value is ScoreEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.name === 'string' &&
    typeof e.score === 'number' &&
    Number.isFinite(e.score) &&
    typeof e.correct === 'number' &&
    typeof e.wrong === 'number' &&
    typeof e.key === 'string' &&
    typeof e.dateISO === 'string'
  );
}

function parseBoard(value: unknown): ScoreEntry[] {
  if (!Array.isArray(value)) return [];
  return sortScores(value.filter(isEntry)).slice(0, MAX_ENTRIES);
}

export function parseBoards(raw: string | null): Boards {
  const boards = emptyBoards();
  if (!raw) return boards;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return boards;
    for (const difficulty of DIFFICULTY_ORDER) {
      boards[difficulty] = parseBoard((parsed as Record<string, unknown>)[difficulty]);
    }
    return boards;
  } catch {
    return boards;
  }
}

function sortScores(entries: ScoreEntry[]): ScoreEntry[] {
  // Highest score first; an equal score set more recently ranks above an older one.
  return [...entries].sort((a, b) => b.score - a.score || b.dateISO.localeCompare(a.dateISO));
}

export function insertScore(entries: ScoreEntry[], entry: ScoreEntry): ScoreEntry[] {
  return sortScores([...entries, entry]).slice(0, MAX_ENTRIES);
}

/** Would this score make the board? A zero never does, however empty the board is. */
export function qualifies(entries: ScoreEntry[], score: number): boolean {
  if (score <= 0) return false;
  if (entries.length < MAX_ENTRIES) return true;
  return score > entries[entries.length - 1].score;
}

export function sanitizeName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || 'anonymous';
}

export function loadBoards(): Boards {
  return parseBoards(storageGet(SCORES_KEY));
}

export function saveBoards(boards: Boards): void {
  const trimmed = emptyBoards();
  for (const difficulty of DIFFICULTY_ORDER) {
    trimmed[difficulty] = boards[difficulty].slice(0, MAX_ENTRIES);
  }
  storageSet(SCORES_KEY, JSON.stringify(trimmed));
}
