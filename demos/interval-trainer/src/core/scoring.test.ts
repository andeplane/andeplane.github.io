import { describe, expect, it } from 'vitest';
import {
  BASE_POINTS,
  CLOCK_CAP_SECONDS,
  FAST_BONUS,
  FAST_MS,
  QUICK_BONUS,
  QUICK_MS,
  START_SECONDS,
  STREAK_BONUS_MAX,
  TIME_PER_CORRECT,
  addTime,
  formatClock,
  scoreAnswer,
  speedTier,
} from './scoring.ts';

describe('speedTier', () => {
  it('is inclusive at both thresholds', () => {
    expect(speedTier(FAST_MS)).toBe('fast');
    expect(speedTier(FAST_MS + 1)).toBe('quick');
    expect(speedTier(QUICK_MS)).toBe('quick');
    expect(speedTier(QUICK_MS + 1)).toBe('none');
  });
});

describe('scoreAnswer', () => {
  it('pays base plus the speed bonus, with no streak bonus on the first one', () => {
    expect(scoreAnswer(true, 500, 0)).toMatchObject({
      points: BASE_POINTS + FAST_BONUS,
      timeDelta: TIME_PER_CORRECT,
      streak: 1,
      speedTier: 'fast',
    });
    expect(scoreAnswer(true, 1500, 0).points).toBe(BASE_POINTS + QUICK_BONUS);
    expect(scoreAnswer(true, 5000, 0).points).toBe(BASE_POINTS);
  });

  it('grows the streak bonus and then caps it', () => {
    expect(scoreAnswer(true, 5000, 1).streakBonus).toBe(10);
    expect(scoreAnswer(true, 5000, 5).streakBonus).toBe(50);
    expect(scoreAnswer(true, 5000, 40).streakBonus).toBe(STREAK_BONUS_MAX);
  });

  it('gives a wrong answer nothing at all, and resets the streak', () => {
    expect(scoreAnswer(false, 100, 9)).toMatchObject({
      points: 0,
      timeDelta: 0,
      streak: 0,
    });
  });
});

describe('addTime', () => {
  it('caps the clock so a hot streak cannot make the game endless', () => {
    expect(addTime(CLOCK_CAP_SECONDS - 1, TIME_PER_CORRECT)).toBe(CLOCK_CAP_SECONDS);
  });

  it('never goes negative', () => {
    expect(addTime(1, -10)).toBe(0);
  });

  it('leaves room above the starting clock for a streak to bank time', () => {
    expect(CLOCK_CAP_SECONDS).toBeGreaterThan(START_SECONDS);
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds above a minute', () => {
    expect(formatClock(120)).toBe('2:00');
    expect(formatClock(119.9)).toBe('1:59');
    expect(formatClock(60)).toBe('1:00');
  });

  it('switches to tenths once under a minute', () => {
    expect(formatClock(59.94)).toBe('59.9');
    expect(formatClock(9.25)).toBe('9.3');
    expect(formatClock(0)).toBe('0.0');
  });

  it('never shows negative time', () => {
    expect(formatClock(-3)).toBe('0.0');
  });
});
