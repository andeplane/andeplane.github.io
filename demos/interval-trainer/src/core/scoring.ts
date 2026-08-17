/**
 * Scoring and clock arithmetic for game mode. Pure functions and a single block of
 * constants, so the whole feel of the game is tunable from one screenful.
 */

/** Two minutes: long enough to settle into listening rather than panicking. */
export const START_SECONDS = 120;
/** Correct answers buy time; the clock is capped so a hot streak can't make it endless. */
export const TIME_PER_CORRECT = 6;
export const CLOCK_CAP_SECONDS = 180;

export const BASE_POINTS = 100;
/** Answer inside this and the speed bonus is full. */
export const FAST_MS = 1000;
/** ...inside this and it is half. Beyond it, nothing. */
export const QUICK_MS = 2000;
export const FAST_BONUS = 100;
export const QUICK_BONUS = 50;

export const STREAK_BONUS_PER = 10;
export const STREAK_BONUS_MAX = 100;

export type SpeedTier = 'fast' | 'quick' | 'none';

export interface AnswerOutcome {
  correct: boolean;
  basePoints: number;
  speedBonus: number;
  streakBonus: number;
  /** Total added to the score for this answer. */
  points: number;
  /** Seconds added to the clock. */
  timeDelta: number;
  /** Streak *after* this answer. */
  streak: number;
  speedTier: SpeedTier;
}

export function speedTier(elapsedMs: number): SpeedTier {
  if (elapsedMs <= FAST_MS) return 'fast';
  if (elapsedMs <= QUICK_MS) return 'quick';
  return 'none';
}

/**
 * `elapsedMs` is measured from the moment the target note started sounding — replays
 * deliberately do not reset it, so the bonus rewards hearing the interval rather than
 * re-triggering the clock.
 */
export function scoreAnswer(
  correct: boolean,
  elapsedMs: number,
  streakBefore: number,
): AnswerOutcome {
  if (!correct) {
    return {
      correct: false,
      basePoints: 0,
      speedBonus: 0,
      streakBonus: 0,
      points: 0,
      timeDelta: 0,
      streak: 0,
      speedTier: 'none',
    };
  }

  const tier = speedTier(elapsedMs);
  const speedBonus = tier === 'fast' ? FAST_BONUS : tier === 'quick' ? QUICK_BONUS : 0;
  const streak = streakBefore + 1;
  // The streak bonus counts consecutive answers *before* this one, so the first correct
  // answer of a run pays base + speed only.
  const streakBonus = Math.min(STREAK_BONUS_MAX, (streak - 1) * STREAK_BONUS_PER);

  return {
    correct: true,
    basePoints: BASE_POINTS,
    speedBonus,
    streakBonus,
    points: BASE_POINTS + speedBonus + streakBonus,
    timeDelta: TIME_PER_CORRECT,
    streak,
    speedTier: tier,
  };
}

export function addTime(clockSeconds: number, delta: number): number {
  return Math.min(CLOCK_CAP_SECONDS, Math.max(0, clockSeconds + delta));
}

/**
 * The clock readout. Minutes and seconds while there is plenty of time, tenths once under
 * a minute — the decimal only starts mattering when it is running out.
 */
export function formatClock(seconds: number): string {
  // Round to tenths *before* branching, so 59.97 reads "1:00" rather than "60.0".
  const left = Math.max(0, Math.round(seconds * 10) / 10);
  if (left < 60) return left.toFixed(1);
  const minutes = Math.floor(left / 60);
  return `${minutes}:${String(Math.floor(left - minutes * 60)).padStart(2, '0')}`;
}
