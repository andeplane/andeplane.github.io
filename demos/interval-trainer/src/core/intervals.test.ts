import { describe, expect, it } from 'vitest';
import { ANSWERS, ANSWER_KEYS, INTERVALS, answerIndex, noteName } from './intervals.ts';

describe('intervals', () => {
  it('covers all twelve degrees exactly once, in order', () => {
    expect(INTERVALS).toHaveLength(12);
    expect(INTERVALS.map((i) => i.semitones)).toEqual([...Array(12).keys()]);
  });

  it('labels flats after the number, and the tritone as 4#', () => {
    expect(INTERVALS.map((i) => i.label)).toEqual([
      '1',
      '2b',
      '2',
      '3b',
      '3',
      '4',
      '4#',
      '5',
      '6b',
      '6',
      '7b',
      '7',
    ]);
  });

  it('asks about ten intervals — never the root or the fifth the context gave away', () => {
    expect(ANSWERS).toHaveLength(10);
    expect(ANSWERS.map((i) => i.semitones)).not.toContain(0);
    expect(ANSWERS.map((i) => i.semitones)).not.toContain(7);
  });

  it('has one key per answer button, in reading order', () => {
    expect(ANSWER_KEYS).toHaveLength(ANSWERS.length);
    expect(new Set(ANSWER_KEYS).size).toBe(ANSWER_KEYS.length);
    expect(ANSWER_KEYS[0]).toBe('1');
    expect(ANSWER_KEYS.at(-1)).toBe('0');
  });

  it('maps semitones back to keypad position, and reports the unaskable ones', () => {
    expect(answerIndex(1)).toBe(0);
    expect(answerIndex(11)).toBe(9);
    expect(answerIndex(0)).toBe(-1);
    expect(answerIndex(7)).toBe(-1);
  });

  it('names pitch classes from MIDI numbers', () => {
    expect(noteName(60)).toBe('C');
    expect(noteName(69)).toBe('A');
    expect(noteName(53)).toBe('F');
  });
});
