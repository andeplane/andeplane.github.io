import { describe, expect, it } from 'vitest';
import { ANSWERS } from './intervals.ts';
import { accuracy, emptyStats, parseStats, record } from './stats.ts';

describe('stats', () => {
  it('starts with a tally for every askable interval and none for the rest', () => {
    const stats = emptyStats();
    expect(Object.keys(stats)).toHaveLength(ANSWERS.length);
    expect(stats[0]).toBeUndefined();
    expect(stats[7]).toBeUndefined();
  });

  it('records hits and misses without mutating the input', () => {
    const before = emptyStats();
    const after = record(record(before, 3, true), 3, false);
    expect(after[3]).toEqual({ correct: 1, total: 2 });
    expect(before[3]).toEqual({ correct: 0, total: 0 });
  });

  it('reports accuracy only once there is something to report', () => {
    expect(accuracy(undefined)).toBeNull();
    expect(accuracy({ correct: 0, total: 0 })).toBeNull();
    expect(accuracy({ correct: 3, total: 4 })).toBe(0.75);
  });

  it('survives junk in storage and clamps impossible tallies', () => {
    expect(parseStats(null)).toEqual(emptyStats());
    expect(parseStats('nonsense')).toEqual(emptyStats());
    // correct > total would render as more than 100%; the parser refuses to believe it.
    expect(parseStats(JSON.stringify({ 3: { correct: 99, total: 4 } }))[3]).toEqual({
      correct: 4,
      total: 4,
    });
    // Degrees that are never asked are ignored rather than added to the strip.
    expect(parseStats(JSON.stringify({ 7: { correct: 1, total: 1 } }))[7]).toBeUndefined();
  });
});
