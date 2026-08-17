/**
 * The tutorial, for someone who has never thought about intervals as numbers.
 *
 * It is self-contained: its own note buttons, its own guided questions, its own copy of
 * the rules. Nothing in it drives the real game state, so it can be opened at any time
 * and abandoned at any point without leaving the app half-configured.
 */

import { ALL_SEMITONES } from '../core/difficulty.ts';
import { ANSWERS, intervalBySemitones } from '../core/intervals.ts';
import { makeQuestion, type Question } from '../core/question.ts';
import { createRng } from '../core/rng.ts';
import {
  FAST_BONUS,
  formatClock,
  QUICK_BONUS,
  QUICK_MS,
  START_SECONDS,
  TIME_PER_CORRECT,
} from '../core/scoring.ts';
import { storageGet, storageSet } from '../core/storage.ts';
import type { Player } from '../audio/player.ts';
import { el } from './dom.ts';
import type { Overlay } from './overlay.ts';
import { button, eyebrow, panel, para, row, title } from './panels.ts';

const TUTORIAL_KEY = 'interval-trainer.tutorial-v1';
/** Middle C: a neutral, familiar home for the explaining steps. */
const DEMO_ROOT = 60;
const GUIDED_QUESTIONS = 3;

export function tutorialSeen(): boolean {
  return storageGet(TUTORIAL_KEY) === '1';
}

export function markTutorialSeen(): void {
  storageSet(TUTORIAL_KEY, '1');
}

function demoQuestion(semitones: number): Question {
  return {
    rootMidi: DEMO_ROOT,
    fifthMidi: DEMO_ROOT + 7,
    targetMidi: DEMO_ROOT + semitones,
    semitones,
  };
}

export class Tutorial {
  private step = 0;
  private guidedIndex = 0;
  private guided: Question | null = null;
  private guidedRight = 0;
  private readonly rng = createRng(Date.now() & 0xffff);

  constructor(
    private readonly overlay: Overlay,
    private readonly player: Player,
    private readonly onFinish: (next: 'practice' | 'game' | 'menu') => void,
  ) {}

  start(): void {
    this.step = 0;
    this.guidedIndex = 0;
    this.guidedRight = 0;
    this.render();
  }

  private go(step: number): void {
    this.step = step;
    this.render();
  }

  private render(): void {
    const steps = [
      () => this.stepContext(),
      () => this.stepNumbering(),
      () => this.stepGuided(),
      () => this.stepRules(),
    ];
    const card = steps[this.step]();
    card.prepend(this.progress());
    this.overlay.show(card, {
      dismissible: true,
      onDismiss: () => {
        this.player.cancel();
        this.onFinish('menu');
      },
    });
  }

  private progress(): HTMLElement {
    const bar = el('div', 'tutorial-progress');
    for (let i = 0; i < 4; i++) {
      const dot = el('i', 'tutorial-dot');
      if (i === this.step) dot.classList.add('is-current');
      if (i < this.step) dot.classList.add('is-done');
      bar.append(dot);
    }
    return bar;
  }

  // ---- step 1 -------------------------------------------------------------

  private stepContext(): HTMLElement {
    const play = () => this.player.playQuestion(demoQuestion(0), { contextOnly: true });
    // Play it once on arrival: this step is about a sound, not a paragraph.
    queueMicrotask(play);

    return panel(
      eyebrow('step 1 of 4'),
      title('One chord sets the scene'),
      para(
        'Every question opens the same way: the <b>root</b> and the <b>fifth</b> above it, ' +
          'struck <b>together</b>. That open, hollow chord tells your ear where <i>home</i> ' +
          'is. Listen a few times — it is the reference everything else is measured against.',
      ),
      row(button('Play 1+5 again', play, 'primary'), button('Next', () => this.go(1))),
    );
  }

  // ---- step 2 -------------------------------------------------------------

  private stepNumbering(): HTMLElement {
    const readout = el('p', 'tutorial-readout', 'Tap any of them.');
    const grid = el('div', 'tutorial-grid');

    for (const interval of ANSWERS) {
      const btn = el('button', 'key key--mini');
      btn.type = 'button';
      btn.append(el('span', 'key-label', interval.label), el('span', 'key-name', interval.short));
      btn.addEventListener('click', () => {
        this.player.playQuestion(demoQuestion(interval.semitones));
        readout.innerHTML = `<b>${interval.label}</b> &mdash; ${interval.name}`;
      });
      grid.append(btn);
    }

    return panel(
      eyebrow('step 2 of 4'),
      title('Ten places a note can land'),
      para(
        'The number is how far above the root the note sits, and <b>b</b> after it means ' +
          'a semitone lower: <b>3</b> is the bright major third, <b>3b</b> the darker ' +
          'minor one. <b>4#</b> is the restless one halfway up (some write it <b>5b</b>). ' +
          'The root and fifth are not here — the opening chord gives you those for free.',
      ),
      grid,
      readout,
      row(button('Back', () => this.go(0)), button('Next', () => this.go(2), 'primary')),
    );
  }

  // ---- step 3 -------------------------------------------------------------

  private stepGuided(): HTMLElement {
    // The tutorial teaches all ten regardless of the difficulty you will end up playing.
    if (!this.guided) {
      this.guided = makeQuestion({ rootMode: 'random', degrees: ALL_SEMITONES }, this.rng);
    }
    const question = this.guided;
    const answer = intervalBySemitones(question.semitones);
    const decoy = this.decoyFor(question.semitones);
    // Two candidates, shuffled: enough of a narrowing to be a lesson, not a coin toss
    // dressed up as one.
    const candidates = this.rng() < 0.5 ? [answer, decoy] : [decoy, answer];

    const feedback = el('p', 'tutorial-readout', ' ');
    const choices = el('div', 'tutorial-choices');
    const play = () => this.player.playQuestion(question);
    queueMicrotask(play);

    for (const candidate of candidates) {
      const btn = el('button', 'key key--mini');
      btn.type = 'button';
      btn.append(
        el('span', 'key-label', candidate.label),
        el('span', 'key-name', candidate.short),
      );
      btn.addEventListener('click', () => {
        const correct = candidate.semitones === question.semitones;
        if (correct) this.guidedRight++;
        btn.classList.add(correct ? 'is-correct' : 'is-wrong');
        for (const other of choices.querySelectorAll('button')) other.disabled = true;
        if (!correct) {
          choices
            .querySelector(`button:not(.is-wrong)`)
            ?.classList.add('is-correct');
        }
        feedback.innerHTML = correct
          ? `Yes — that was <b>${answer.label}</b>, the ${answer.name}.`
          : `It was <b>${answer.label}</b>, the ${answer.name}. Play it once more and ` +
            'hear the difference.';
        next.hidden = false;
      });
      choices.append(btn);
    }

    const advance = () => {
      this.guidedIndex++;
      this.guided = null;
      if (this.guidedIndex >= GUIDED_QUESTIONS) this.go(3);
      else this.render();
    };
    const next = button(
      this.guidedIndex + 1 >= GUIDED_QUESTIONS ? 'Finish' : 'Next question',
      advance,
      'primary',
    );
    next.hidden = true;

    return panel(
      eyebrow(`step 3 of 4 · question ${this.guidedIndex + 1} of ${GUIDED_QUESTIONS}`),
      title('Your turn'),
      para('The chord, then one note — and that last one is up to you. It is one of these two.'),
      choices,
      feedback,
      row(button('Play again', play), next),
    );
  }

  private decoyFor(semitones: number): (typeof ANSWERS)[number] {
    // A neighbouring degree makes a fair decoy: close enough to require listening,
    // far enough that the answer isn't a guess between two shades of the same note.
    const candidates = ANSWERS.filter(
      (i) => i.semitones !== semitones && Math.abs(i.semitones - semitones) <= 2,
    );
    const pool = candidates.length > 0 ? candidates : ANSWERS.filter((i) => i.semitones !== semitones);
    return pool[Math.floor(this.rng() * pool.length)];
  }

  // ---- step 4 -------------------------------------------------------------

  private stepRules(): HTMLElement {
    const rules = el('ul', 'tutorial-rules');
    const items = [
      `<b>Keys 1 – 0</b> match the ten buttons left to right. <b>Space</b> replays.`,
      `<b>Practice</b> has no clock: replay as often as you like, and it tracks which ` +
        `intervals you keep missing.`,
      `<b>Easy</b> stays in one key and asks only the five degrees without a flat or a ` +
        `sharp. <b>Medium</b> opens up all ten. <b>Hard</b> moves the key every question. ` +
        `Each keeps its own highscore board.`,
      `<b>The game</b> starts at ${formatClock(START_SECONDS)}. Every correct answer adds ` +
        `${TIME_PER_CORRECT}s to the clock — you can watch them fly up to it — and 100 points.`,
      `Answer within a second for <b>+${FAST_BONUS}</b>, within ${QUICK_MS / 1000} for ` +
        `<b>+${QUICK_BONUS}</b>. A streak pays a little more each time.`,
      `A wrong answer costs nothing but the clock: no points, no time, streak back to zero.`,
    ];
    for (const item of items) {
      const li = el('li');
      li.innerHTML = item;
      rules.append(li);
    }

    return panel(
      eyebrow('step 4 of 4'),
      title(this.guidedRight === GUIDED_QUESTIONS ? 'All three. Go on then' : 'How it works'),
      rules,
      row(
        button('Practice', () => this.finish('practice')),
        button('Play the game', () => this.finish('game'), 'primary'),
      ),
    );
  }

  private finish(next: 'practice' | 'game'): void {
    markTutorialSeen();
    this.player.cancel();
    this.onFinish(next);
  }
}
