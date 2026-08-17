/**
 * Question generation.
 *
 * A question is a chord and a note: the root and the fifth above it sounded together to
 * establish the key, then a target somewhere in that same octave. The target may sit below
 * the fifth — the context fixes *home*, not a ceiling.
 */

import { ANSWERS } from './intervals.ts';
import { pick, type Rng } from './rng.ts';

/**
 * Roots span exactly one octave, F3-E4, so every pitch class is available when the player
 * pins the key to a specific note, and the highest target (E4 + a major seventh) still
 * lands in a comfortable register.
 */
export const ROOT_MIN_MIDI = 53; // F3
export const ROOT_MAX_MIDI = 64; // E4

/** `'random'` re-rolls the key every question; a number pins it to that pitch class. */
export type RootMode = 'random' | number;

export interface QuestionSpec {
  rootMode: RootMode;
  /** Which degrees may be asked — the difficulty decides this. */
  degrees: readonly number[];
}

export interface Question {
  rootMidi: number;
  fifthMidi: number;
  targetMidi: number;
  /** Semitones of the target above the root — the thing being guessed. */
  semitones: number;
}

function rootFor(mode: RootMode, rng: Rng): number {
  if (mode === 'random') {
    return ROOT_MIN_MIDI + Math.floor(rng() * (ROOT_MAX_MIDI - ROOT_MIN_MIDI + 1));
  }
  // Every pitch class occurs exactly once in the root octave, so this always resolves.
  const pitchClass = ((mode % 12) + 12) % 12;
  for (let midi = ROOT_MIN_MIDI; midi <= ROOT_MAX_MIDI; midi++) {
    if (midi % 12 === pitchClass) return midi;
  }
  throw new Error(`no root in range for pitch class ${pitchClass}`);
}

export function makeQuestion(
  spec: QuestionSpec,
  rng: Rng,
  previousSemitones?: number,
): Question {
  const askable = ANSWERS.filter((i) => spec.degrees.includes(i.semitones));
  const pool = askable.length > 0 ? askable : ANSWERS;
  // Never ask the same degree twice running: back-to-back repeats read as a bug even
  // when they are honest randomness. With a small pool there may be only one degree
  // left, in which case the repeat is unavoidable and honest.
  const withoutRepeat = pool.filter((i) => i.semitones !== previousSemitones);
  const choices = withoutRepeat.length > 0 ? withoutRepeat : pool;
  const semitones = pick(choices, rng).semitones;
  const rootMidi = rootFor(spec.rootMode, rng);
  return {
    rootMidi,
    fifthMidi: rootMidi + 7,
    targetMidi: rootMidi + semitones,
    semitones,
  };
}
