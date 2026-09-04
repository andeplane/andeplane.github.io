/**
 * Sequences a question — the 1+5 chord, then the target — and keeps the visuals in step.
 *
 * Each note does three things at once: it sounds, it flashes its dot on the stage, and it
 * drops a point source into the wave field at that dot, with a wavelength set by its
 * pitch relative to the root. Scheduling is plain `setTimeout` rather than Web Audio's
 * sample clock — the gap here is a whole second, so a few milliseconds of jitter is
 * inaudible, and this way the sound and the ripple leave together even when the page is
 * muted. The root and the fifth share a timer so they land on the same tick: they are one
 * sound, and their two ripples interfere from the instant they are born.
 */

import type { Question } from '../core/question.ts';
import { wavelengthFor } from '../ui/field.ts';
import type { NoteSlot, Stage } from '../ui/stage.ts';
import type { WaveField } from '../ui/waves.ts';
import { AudioEngine } from './engine.ts';
import { decaySeconds, midiToHz } from './piano.ts';

export const CONTEXT_AT_MS = 0;
export const TARGET_AT_MS = 1000;

// The chord is two voices at once, so each is struck softer than a lone note would be —
// otherwise the context arrives louder than the note you are meant to be listening for.
const SLOT_VELOCITY: Record<NoteSlot, number> = { root: 0.66, fifth: 0.58, target: 1 };
const SLOT_WAVE_AMPLITUDE: Record<NoteSlot, number> = { root: 0.46, fifth: 0.42, target: 0.8 };

export class Player {
  private timers: number[] = [];

  constructor(
    private readonly engine: AudioEngine,
    private readonly waves: WaveField,
    private readonly stage: Stage,
  ) {}

  /** Cancel anything still scheduled and silence what is ringing. */
  cancel(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    this.engine.stopAll();
  }

  /**
   * Play a question. `onTarget` fires the instant the target note sounds — that is when
   * the answer clock starts.
   */
  playQuestion(
    question: Question,
    options: { contextOnly?: boolean; onTarget?: () => void } = {},
  ): void {
    this.cancel();
    const rootHz = midiToHz(question.rootMidi);

    this.at(CONTEXT_AT_MS, () => {
      this.note(question.rootMidi, 'root', rootHz);
      this.note(question.fifthMidi, 'fifth', rootHz);
    });
    if (options.contextOnly) return;
    this.at(TARGET_AT_MS, () => {
      this.note(question.targetMidi, 'target', rootHz);
      options.onTarget?.();
    });
  }

  /** A single note, used by the tutorial's free-play grid. */
  note(midi: number, slot: NoteSlot, referenceHz: number): void {
    const hz = midiToHz(midi);
    this.engine.play(midi, SLOT_VELOCITY[slot]);
    this.stage.sound(slot);
    const { fx, fy } = this.stage.fractionOf(slot);
    this.waves.emit(
      fx,
      fy,
      wavelengthFor(hz, referenceHz),
      decaySeconds(hz),
      SLOT_WAVE_AMPLITUDE[slot],
      performance.now() / 1000,
    );
  }

  private at(ms: number, action: () => void): void {
    this.timers.push(window.setTimeout(action, ms));
  }
}
