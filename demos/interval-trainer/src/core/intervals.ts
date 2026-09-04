/**
 * The interval vocabulary of the app.
 *
 * Labels use the notation this trainer is built around: the accidental comes *after* the
 * number (`3b`, `7b`), and the tritone is written `4#` rather than `5b`.
 *
 * Every question opens with the root and its fifth sounded together, so those two are
 * never the answer — `ANSWERS` is the remaining ten, and it is what the keypad renders.
 */

export interface Interval {
  /** Semitones above the root, 0-11. */
  semitones: number;
  /** Button label, e.g. `3b`. */
  label: string;
  /** Spoken name, used for aria-labels and the tutorial. */
  name: string;
  /** Abbreviated name, shown under the label when there is room for it. */
  short: string;
}

/** All twelve degrees of the octave, indexed by semitone. */
export const INTERVALS: readonly Interval[] = [
  { semitones: 0, label: '1', name: 'root', short: 'root' },
  { semitones: 1, label: '2b', name: 'minor second', short: 'min 2nd' },
  { semitones: 2, label: '2', name: 'major second', short: 'maj 2nd' },
  { semitones: 3, label: '3b', name: 'minor third', short: 'min 3rd' },
  { semitones: 4, label: '3', name: 'major third', short: 'maj 3rd' },
  { semitones: 5, label: '4', name: 'perfect fourth', short: 'fourth' },
  { semitones: 6, label: '4#', name: 'tritone', short: 'tritone' },
  { semitones: 7, label: '5', name: 'perfect fifth', short: 'fifth' },
  { semitones: 8, label: '6b', name: 'minor sixth', short: 'min 6th' },
  { semitones: 9, label: '6', name: 'major sixth', short: 'maj 6th' },
  { semitones: 10, label: '7b', name: 'minor seventh', short: 'min 7th' },
  { semitones: 11, label: '7', name: 'major seventh', short: 'maj 7th' },
];

/** Semitones the context already gives away, and which are therefore never asked. */
export const CONTEXT_SEMITONES = [0, 7] as const;

/** The ten askable intervals, in keypad order (left to right, top row first). */
export const ANSWERS: readonly Interval[] = INTERVALS.filter(
  (i) => !CONTEXT_SEMITONES.includes(i.semitones as 0 | 7),
);

/**
 * Keyboard shortcuts, positional: the number row maps onto the keypad in reading order,
 * so key `1` is the leftmost button (`2b`) and key `0` is the last (`7`).
 */
export const ANSWER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

export function intervalBySemitones(semitones: number): Interval {
  const found = INTERVALS[semitones];
  if (!found) throw new Error(`no interval for ${semitones} semitones`);
  return found;
}

/** Index into `ANSWERS` for a semitone count, or -1 if that degree is never asked. */
export function answerIndex(semitones: number): number {
  return ANSWERS.findIndex((i) => i.semitones === semitones);
}

/** Pitch-class names, used to show which key a question is in. */
export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export function noteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}
