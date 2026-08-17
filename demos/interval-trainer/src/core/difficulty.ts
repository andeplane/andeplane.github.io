/**
 * The three difficulties, and the two dials that separate them: how many degrees can be
 * asked, and whether the key moves.
 *
 * Easy asks only the degrees whose names carry no accidental — the plain major scale —
 * which is both a smaller keypad and a genuinely easier ear problem, since every answer
 * is a note of the key the chord just established. Medium opens up the other five.
 * Hard adds the thing that actually makes this hard: a new key every question, so no
 * memory of the last root helps you.
 *
 * Each difficulty keeps its own highscore board; comparing a five-answer run with a
 * ten-answer one would be meaningless.
 */

import { ANSWERS, type Interval } from './intervals.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** The degrees written without a flat or a sharp: 2, 3, 4, 6, 7. */
export const NATURAL_SEMITONES: readonly number[] = ANSWERS.filter(
  (interval) => !/[b#]/.test(interval.label),
).map((interval) => interval.semitones);

export const ALL_SEMITONES: readonly number[] = ANSWERS.map((interval) => interval.semitones);

export interface DifficultyRule {
  id: Difficulty;
  label: string;
  /** One line, shown under the picker. */
  blurb: string;
  /** Which degrees may be asked — also which keys the keypad shows. */
  semitones: readonly number[];
  /** Hard re-rolls the key every question; the others hold one key for the whole run. */
  movingKey: boolean;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyRule> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    blurb: 'One key all game, and only the five degrees without a flat or a sharp.',
    semitones: NATURAL_SEMITONES,
    movingKey: false,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    blurb: 'One key all game, and all ten degrees.',
    semitones: ALL_SEMITONES,
    movingKey: false,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    blurb: 'All ten degrees, and a new key every question.',
    semitones: ALL_SEMITONES,
    movingKey: true,
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && value in DIFFICULTIES;
}

/** The intervals a difficulty asks about, in keypad order. */
export function answersFor(difficulty: Difficulty): Interval[] {
  const allowed = DIFFICULTIES[difficulty].semitones;
  return ANSWERS.filter((interval) => allowed.includes(interval.semitones));
}
