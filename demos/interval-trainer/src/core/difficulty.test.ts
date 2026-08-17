import { describe, expect, it } from 'vitest';
import {
  ALL_SEMITONES,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  NATURAL_SEMITONES,
  answersFor,
  isDifficulty,
} from './difficulty.ts';
import { ANSWERS, ANSWER_KEYS } from './intervals.ts';

describe('the natural degrees', () => {
  it('is the five whose labels carry no accidental', () => {
    expect(answersFor('easy').map((i) => i.label)).toEqual(['2', '3', '4', '6', '7']);
    expect(NATURAL_SEMITONES).toEqual([2, 4, 5, 9, 11]);
  });
});

describe('the difficulties', () => {
  it('opens up the degrees, then the key', () => {
    expect(DIFFICULTIES.easy.semitones).toEqual(NATURAL_SEMITONES);
    expect(DIFFICULTIES.medium.semitones).toEqual(ALL_SEMITONES);
    expect(DIFFICULTIES.hard.semitones).toEqual(ALL_SEMITONES);
    expect(DIFFICULTIES.easy.movingKey).toBe(false);
    expect(DIFFICULTIES.medium.movingKey).toBe(false);
    expect(DIFFICULTIES.hard.movingKey).toBe(true);
  });

  it('never asks about more degrees than there are keyboard shortcuts', () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      expect(answersFor(difficulty).length).toBeLessThanOrEqual(ANSWER_KEYS.length);
      expect(answersFor(difficulty).length).toBeGreaterThan(0);
    }
  });

  it('keeps the keypad in its canonical order', () => {
    const order = ANSWERS.map((i) => i.semitones);
    for (const difficulty of DIFFICULTY_ORDER) {
      const asked = answersFor(difficulty).map((i) => i.semitones);
      expect(asked).toEqual(order.filter((s) => asked.includes(s)));
    }
  });

  it('recognises its own names and nothing else', () => {
    expect(isDifficulty('easy')).toBe(true);
    expect(isDifficulty('HARD')).toBe(false);
    expect(isDifficulty(undefined)).toBe(false);
  });
});
