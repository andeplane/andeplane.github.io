/**
 * The answer buttons — ten of them, or the five naturals on Easy.
 *
 * They respond on `pointerdown` rather than `click`: on a phone that removes the ~100 ms
 * the browser spends deciding whether a tap was a scroll, and this is a game where the
 * answer time is scored.
 */

import { ANSWERS, ANSWER_KEYS, type Interval } from '../core/intervals.ts';
import { el, restartAnimation } from './dom.ts';

export type Mark = 'correct' | 'wrong' | 'hint';

export class Keypad {
  private readonly buttons = new Map<number, HTMLButtonElement>();
  private shown: readonly Interval[] = [];
  private enabled = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly onAnswer: (semitones: number) => void,
  ) {
    this.setAnswers(ANSWERS);
  }

  /**
   * Rebuild the pad for a set of intervals. The number keys are positional, so a five-key
   * Easy pad answers to `1`–`5` and nothing else: there is no dead key to hit.
   */
  setAnswers(intervals: readonly Interval[]): void {
    this.shown = intervals;
    this.buttons.clear();
    // The stylesheet sizes the grid from this: five fat keys should not stretch to the
    // width ten of them need.
    this.root.dataset.count = String(intervals.length);
    this.root.replaceChildren(
      ...intervals.map((interval, index) => {
        const key = ANSWER_KEYS[index];
        const button = el('button', 'key');
        button.type = 'button';
        button.disabled = !this.enabled;
        button.dataset.semitones = String(interval.semitones);
        button.setAttribute('aria-label', `${interval.label}, ${interval.name}`);
        button.append(
          el('span', 'key-label', interval.label),
          el('span', 'key-name', interval.short),
          el('kbd', 'key-hint', key),
        );
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          this.press(interval.semitones);
        });
        // Keyboard users get here via focus + Enter/Space, which fires click, not
        // pointerdown.
        button.addEventListener('click', (event) => {
          if (event.detail === 0) this.press(interval.semitones);
        });
        this.buttons.set(interval.semitones, button);
        return button;
      }),
    );
  }

  private press(semitones: number): void {
    if (!this.enabled) return;
    this.onAnswer(semitones);
  }

  /** Returns true if the key was one of ours, so the caller can stop the event. */
  pressByKey(key: string): boolean {
    const index = ANSWER_KEYS.indexOf(key as (typeof ANSWER_KEYS)[number]);
    if (index === -1 || index >= this.shown.length) return false;
    this.press(this.shown[index].semitones);
    return true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.classList.toggle('is-locked', !enabled);
    for (const button of this.buttons.values()) button.disabled = !enabled;
  }

  mark(semitones: number, mark: Mark): void {
    const button = this.buttons.get(semitones);
    if (!button) return;
    button.classList.add(`is-${mark}`);
    if (mark !== 'hint') restartAnimation(button, `pulse-${mark}`);
  }

  clearMarks(): void {
    for (const button of this.buttons.values()) {
      button.classList.remove('is-correct', 'is-wrong', 'is-hint', 'pulse-correct', 'pulse-wrong');
    }
  }

}
