/**
 * The stage: three dots standing for the notes of a question — the two of the opening
 * chord and the one to name — plus the replay controls and the prompt line.
 *
 * The dots' heights encode pitch — root low, fifth seven semitones up. The target stays
 * on the baseline with a `?` until it is answered, then rises to where it belongs. Doing
 * that before the answer would give the interval away; doing it after makes the reveal
 * mean something.
 */

import { el, viewportFraction } from './dom.ts';

/** Vertical pixels per semitone in the constellation. */
const PX_PER_SEMITONE = 7;

export type NoteSlot = 'root' | 'fifth' | 'target';
export type PromptTone = 'neutral' | 'good' | 'bad';

export class Stage {
  private readonly notes: Record<NoteSlot, HTMLElement>;

  constructor(
    private readonly keyName: HTMLElement,
    private readonly prompt: HTMLElement,
    root: HTMLElement,
    fifth: HTMLElement,
    target: HTMLElement,
  ) {
    this.notes = { root, fifth, target };
    root.style.setProperty('--lift', '0px');
    fifth.style.setProperty('--lift', `${7 * PX_PER_SEMITONE}px`);
  }

  setKey(name: string): void {
    this.keyName.textContent = name;
  }

  /** Back to an unanswered question. */
  reset(): void {
    const target = this.notes.target;
    target.style.setProperty('--lift', '0px');
    target.classList.remove('is-revealed', 'is-correct', 'is-wrong');
    this.tagOf(target).textContent = '?';
    for (const note of Object.values(this.notes)) note.classList.remove('is-sounding');
  }

  /** A note just sounded: flash its dot. */
  sound(slot: NoteSlot): void {
    const note = this.notes[slot];
    note.classList.remove('is-sounding');
    void note.offsetWidth;
    note.classList.add('is-sounding');
  }

  reveal(label: string, semitones: number, correct: boolean): void {
    const target = this.notes.target;
    target.style.setProperty('--lift', `${semitones * PX_PER_SEMITONE}px`);
    this.tagOf(target).textContent = label;
    target.classList.add('is-revealed', correct ? 'is-correct' : 'is-wrong');
  }

  setPrompt(text: string, tone: PromptTone = 'neutral'): void {
    this.prompt.textContent = text;
    this.prompt.dataset.tone = tone;
  }

  /** Where the wave field should place this note's point source. */
  fractionOf(slot: NoteSlot): { fx: number; fy: number } {
    return viewportFraction(this.dotOf(this.notes[slot]));
  }

  /** This note's dot in viewport pixels — where an earned-time chip should fly from. */
  centerOf(slot: NoteSlot): { x: number; y: number } {
    const rect = this.dotOf(this.notes[slot]).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  private dotOf(note: HTMLElement): Element {
    return note.querySelector('.dot') ?? note;
  }

  private tagOf(note: HTMLElement): HTMLElement {
    return note.querySelector<HTMLElement>('.tag') ?? el('span');
  }
}
