import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRIES,
  emptyBoards,
  insertScore,
  parseBoards,
  qualifies,
  sanitizeName,
  type ScoreEntry,
} from './highscores.ts';

function entry(score: number, name = 'a', dateISO = '2026-01-01T00:00:00.000Z'): ScoreEntry {
  return { name, score, correct: 1, wrong: 0, key: 'C', dateISO };
}

describe('parseBoards', () => {
  it('survives everything a browser profile can throw at it', () => {
    expect(parseBoards(null)).toEqual(emptyBoards());
    expect(parseBoards('not json')).toEqual(emptyBoards());
    expect(parseBoards('[1, "two", null]')).toEqual(emptyBoards());
    expect(parseBoards('{"easy":"nope"}')).toEqual(emptyBoards());
    expect(parseBoards(JSON.stringify({ easy: [{ name: 'x' }] }))).toEqual(emptyBoards());
  });

  it('keeps each difficulty apart, sorted and trimmed', () => {
    const raw = JSON.stringify({
      easy: [entry(10), { junk: true }, entry(99)],
      hard: [entry(5)],
    });
    const boards = parseBoards(raw);
    expect(boards.easy.map((e) => e.score)).toEqual([99, 10]);
    expect(boards.medium).toEqual([]);
    expect(boards.hard.map((e) => e.score)).toEqual([5]);
  });

  it('ignores a board written by the old single-list version', () => {
    expect(parseBoards(JSON.stringify([entry(10)]))).toEqual(emptyBoards());
  });
});

describe('insertScore', () => {
  it('sorts by score and keeps only ten', () => {
    let board: ScoreEntry[] = [];
    for (let i = 1; i <= 15; i++) board = insertScore(board, entry(i * 10));
    expect(board).toHaveLength(MAX_ENTRIES);
    expect(board[0].score).toBe(150);
    expect(board.at(-1)?.score).toBe(60);
  });

  it('ranks a fresh entry above an older one on a tie', () => {
    const older = entry(100, 'older', '2026-01-01T00:00:00.000Z');
    const newer = entry(100, 'newer', '2026-06-01T00:00:00.000Z');
    expect(insertScore([older], newer)[0].name).toBe('newer');
  });
});

describe('qualifies', () => {
  const full = Array.from({ length: MAX_ENTRIES }, (_, i) => entry((i + 1) * 100)).reverse();

  it('lets anything positive onto a short board', () => {
    expect(qualifies([], 1)).toBe(true);
    expect(qualifies([], 0)).toBe(false);
  });

  it('needs to beat the last row of a full board', () => {
    const lowest = full.at(-1)!.score;
    expect(qualifies(full, lowest)).toBe(false);
    expect(qualifies(full, lowest + 1)).toBe(true);
  });
});

describe('sanitizeName', () => {
  it('trims, collapses whitespace and falls back to a placeholder', () => {
    expect(sanitizeName('  Anders   H ')).toBe('Anders H');
    expect(sanitizeName('   ')).toBe('anonymous');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(12);
  });
});
