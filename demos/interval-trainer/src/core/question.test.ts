import { describe, expect, it } from 'vitest';
import { ALL_SEMITONES, NATURAL_SEMITONES } from './difficulty.ts';
import { NOTE_NAMES } from './intervals.ts';
import { ROOT_MAX_MIDI, ROOT_MIN_MIDI, makeQuestion } from './question.ts';
import { createRng } from './rng.ts';

const ASKABLE = [...ALL_SEMITONES];
const ANY = { rootMode: 'random' as const, degrees: ASKABLE };

describe('makeQuestion', () => {
  it('always builds a root, a fifth above it, and an askable target', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const q = makeQuestion(ANY, rng);
      expect(q.rootMidi).toBeGreaterThanOrEqual(ROOT_MIN_MIDI);
      expect(q.rootMidi).toBeLessThanOrEqual(ROOT_MAX_MIDI);
      expect(q.fifthMidi).toBe(q.rootMidi + 7);
      expect(q.targetMidi).toBe(q.rootMidi + q.semitones);
      expect(ASKABLE).toContain(q.semitones);
    }
  });

  it('never repeats the previous interval', () => {
    const rng = createRng(99);
    let previous: number | undefined;
    for (let i = 0; i < 500; i++) {
      const q = makeQuestion(ANY, rng, previous);
      expect(q.semitones).not.toBe(previous);
      previous = q.semitones;
    }
  });

  it('reaches every askable interval over a long run', () => {
    const rng = createRng(1234);
    const seen = new Set<number>();
    let previous: number | undefined;
    for (let i = 0; i < 2000; i++) {
      const q = makeQuestion(ANY, rng, previous);
      seen.add(q.semitones);
      previous = q.semitones;
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([...ASKABLE].sort((a, b) => a - b));
  });

  it('pins the key when asked, for every pitch class', () => {
    const rng = createRng(5);
    NOTE_NAMES.forEach((_, pitchClass) => {
      for (let i = 0; i < 20; i++) {
        const q = makeQuestion({ rootMode: pitchClass, degrees: ASKABLE }, rng);
        expect(q.rootMidi % 12).toBe(pitchClass);
      }
    });
  });

  it('asks only the degrees the difficulty allows', () => {
    const rng = createRng(42);
    const seen = new Set<number>();
    let previous: number | undefined;
    for (let i = 0; i < 500; i++) {
      const q = makeQuestion({ rootMode: 'random', degrees: NATURAL_SEMITONES }, rng, previous);
      expect(NATURAL_SEMITONES).toContain(q.semitones);
      seen.add(q.semitones);
      previous = q.semitones;
    }
    expect(seen.size).toBe(NATURAL_SEMITONES.length);
  });

  it('falls back to a repeat rather than nothing when only one degree is allowed', () => {
    const rng = createRng(3);
    const q = makeQuestion({ rootMode: 'random', degrees: [4] }, rng, 4);
    expect(q.semitones).toBe(4);
  });
});
