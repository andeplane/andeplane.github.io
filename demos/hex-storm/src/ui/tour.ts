/** Step-by-step onboarding. Steps can wait on a condition before enabling "Next". */
import { h } from './controls.ts';

export interface TourStep {
  title: string;
  body: string; // HTML
  onEnter?: () => void;
  onLeave?: () => void;
  /** If set, "Next" stays disabled and this text shows until the predicate is true. */
  waitFor?: { text: string; done: () => boolean };
}

export class Tour {
  private readonly root: HTMLElement;
  private index = -1;
  private timer = 0;

  constructor(private readonly steps: TourStep[], private readonly onFinish: () => void) {
    this.root = document.getElementById('tour')!;
  }

  get active(): boolean {
    return this.index >= 0;
  }

  start(): void {
    this.go(0);
  }

  private go(i: number): void {
    if (this.index >= 0) this.steps[this.index].onLeave?.();
    window.clearInterval(this.timer);
    if (i >= this.steps.length || i < 0) {
      this.index = -1;
      this.root.hidden = true;
      this.onFinish();
      return;
    }
    this.index = i;
    const step = this.steps[i];
    step.onEnter?.();
    this.render();
    if (step.waitFor) {
      this.timer = window.setInterval(() => {
        if (step.waitFor!.done()) {
          window.clearInterval(this.timer);
          this.render(true);
        }
      }, 250);
    }
  }

  private render(ready = false): void {
    const step = this.steps[this.index];
    const body = h('p');
    body.innerHTML = step.body;
    const waiting = !!step.waitFor && !ready;
    const next = h('button', { type: 'button', class: 'primary' }, this.index === this.steps.length - 1 ? 'Done' : 'Next');
    if (waiting) next.setAttribute('disabled', 'true');
    next.addEventListener('click', () => this.go(this.index + 1));
    const back = h('button', { type: 'button' }, 'Back');
    back.addEventListener('click', () => this.go(this.index - 1));
    if (this.index === 0) back.setAttribute('disabled', 'true');
    const skip = h('button', { type: 'button' }, 'Skip');
    skip.addEventListener('click', () => this.go(this.steps.length));
    const dots = h('div', { class: 'dots' }, ...this.steps.map((_, j) => h('i', { class: j === this.index ? 'on' : '' })));
    this.root.replaceChildren(
      h('div', { class: 'step' }, `Step ${this.index + 1} of ${this.steps.length}`),
      h('h3', {}, step.title),
      body,
      ...(waiting ? [h('div', { class: 'wait' }, '⏳ ' + step.waitFor!.text)] : []),
      h('div', { class: 'nav' }, h('div', { class: 'right' }, back, skip), dots, next),
    );
    this.root.hidden = false;
  }
}
