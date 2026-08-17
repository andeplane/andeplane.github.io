/** Score, streak and the clock. Practice mode hides all three. */

import { CLOCK_CAP_SECONDS, formatClock } from '../core/scoring.ts';
import { el, restartAnimation } from './dom.ts';

/** How long the earned seconds take to travel from the note to the clock. */
const FLY_MS = 850;

export class Hud {
  constructor(
    private readonly modeChip: HTMLElement,
    private readonly difficultyChip: HTMLElement,
    private readonly readouts: HTMLElement,
    private readonly scoreEl: HTMLElement,
    private readonly streakEl: HTMLElement,
    private readonly timeEl: HTMLElement,
    private readonly timebar: HTMLElement,
    private readonly timebarFill: HTMLElement,
  ) {}

  setMode(mode: 'practice' | 'game'): void {
    this.modeChip.textContent = mode;
    this.modeChip.dataset.mode = mode;
    const isGame = mode === 'game';
    this.readouts.hidden = !isGame;
    this.timebar.hidden = !isGame;
  }

  setDifficulty(label: string): void {
    this.difficultyChip.textContent = label.toLowerCase();
  }

  setScore(score: number): void {
    this.scoreEl.textContent = String(score);
    restartAnimation(this.scoreEl, 'bump');
  }

  setStreak(streak: number): void {
    this.streakEl.textContent = String(streak);
    this.streakEl.dataset.hot = streak >= 3 ? 'yes' : 'no';
  }

  setTime(seconds: number): void {
    this.timeEl.textContent = formatClock(seconds);
    const fraction = Math.max(0, Math.min(1, seconds / CLOCK_CAP_SECONDS));
    this.timebarFill.style.transform = `scaleX(${fraction})`;
    this.timebar.dataset.low = seconds <= 5 ? 'yes' : 'no';
  }

  /** A `+250` that drifts up from the score and fades. Small, but it sells the bonus. */
  floatPoints(points: number, label?: string): void {
    if (points <= 0) return;
    const node = el('span', 'float-points', label ? `+${points} ${label}` : `+${points}`);
    this.scoreEl.parentElement?.append(node);
    node.addEventListener('animationend', () => node.remove());
  }

  /**
   * The seconds a correct answer earned, flying from the note that earned them up to the
   * clock, which flashes as they land. The travel is the whole point: it says *where* the
   * time came from and *where* it went, which a number quietly changing in the corner
   * does not. Scripted here rather than in CSS because the path depends on two live
   * positions.
   */
  flyTime(seconds: number, from: { x: number; y: number }): void {
    if (seconds <= 0) return;

    const node = el('span', 'time-fly', `+${seconds}s`);
    document.body.append(node);
    const size = node.getBoundingClientRect();
    // Born just clear of the dot, so it never lands on top of the note's own label.
    const originY = from.y - 26;
    node.style.left = `${from.x - size.width / 2}px`;
    node.style.top = `${originY - size.height / 2}px`;

    // It lands just under the readout rather than on top of it: covering the digits at
    // the exact moment they change would hide the thing the chip is announcing.
    const clock = this.timeEl.getBoundingClientRect();
    const dx = clock.left + clock.width / 2 - from.x;
    const dy = clock.bottom + 10 - originY;

    const land = (): void => {
      node.remove();
      restartAnimation(this.timeEl, 'time-gain');
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // No flight: it appears at the clock, says its piece, and goes.
      node.style.left = `${clock.left + clock.width / 2 - size.width / 2}px`;
      node.style.top = `${clock.bottom + 10}px`;
      node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700 }).finished
        .then(land, land);
      return;
    }

    // Easing lives on the individual keyframes, with the animation itself linear, so the
    // offsets below mean what they say: it pops, it travels, and it is still solid when
    // it reaches the clock — the whole point is watching it arrive.
    node
      .animate(
        [
          {
            transform: 'translate(0, 0) scale(0.7)',
            opacity: 0,
            offset: 0,
            easing: 'cubic-bezier(.2,.9,.3,1)',
          },
          {
            transform: 'translate(0, -16px) scale(1.15)',
            opacity: 1,
            offset: 0.22,
            easing: 'cubic-bezier(.45,0,.25,1)',
          },
          // Overshooting above the straight line, so it arcs rather than slides.
          {
            transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(1)`,
            opacity: 1,
            offset: 0.62,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(0.95)`, opacity: 1, offset: 0.9 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0, offset: 1 },
        ],
        { duration: FLY_MS, easing: 'linear' },
      )
      .finished.then(land, land);
  }
}
