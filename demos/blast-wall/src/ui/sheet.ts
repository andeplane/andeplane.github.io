/**
 * The first-run guide: what you are looking at and what the controls do.
 *
 * The theory is a separate, typeset document — see `explainer.ts`, which lazily loads
 * KaTeX so the maths is set properly rather than approximated in Unicode.
 */

const SEEN_KEY = 'blast-wall.guide.seen';

export type SheetName = 'guide';

const GUIDE = /* html */ `
<p class="lede">
  You are looking at four brick walls bonded at the corners — 1800 bricks, 28 000 finite
  elements, and every mortar joint between them solved rather than drawn. There is a
  charge outside. Press <b>Detonate</b> and watch what the joints do.
</p>

<ol class="steps">
  <li>
    <b>The red sphere is the charge.</b> Drag it anywhere in the scene, or set its mass and
    standoff in <i>The charge</i>. The expanding shell you see after firing is the shock
    front, leaving at several times the speed of sound and slowing as it goes.
  </li>
  <li>
    <b>Everything happens in 300 milliseconds</b>, so playback starts at 0.03× and goes
    down to 0.003×. At real speed you would miss the entire event between two frames.
  </li>
  <li>
    <b>Colour by joint damage</b> to see the crack path glowing through the mortar, or by
    speed to see what is actually flying. Plain masonry turns both off.
  </li>
  <li>
    <b>Four tools.</b> <i>Select</i> clicks a brick — then Backspace removes it and P pins
    it. <i>Carve</i> sweeps bricks away as you drag. <i>Pin</i> paints fixed supports.
    <i>Opening</i> drags out a window or a doorway.
  </li>
  <li>
    <b>Every material number is a slider</b>, with its literature range behind it. Drive
    the joint tensile strength to zero for a dry-stacked wall held up by friction alone.
    Turn strain-rate hardening off and the same charge does more damage.
  </li>
  <li>
    <b>Try the comparison the demo exists for.</b> Set <i>Plan</i> to one wall, fire it in
    running bond, then switch to stack bond and fire again. Same charge, different crack
    path — because in stack bond the head joints line up and a crack has somewhere to run.
  </li>
</ol>

<p class="foot">
  Drag to orbit · scroll to zoom · shift-drag to pan. The numbers top-right are live, and
  the plot bottom-right is the displacement of the middle of the loaded wall against
  time — the trace a real blast test records. For the maths behind all of it, the
  <b>Theory</b> button sits next to the one that opened this.
</p>
`;

const TITLES: Record<SheetName, string> = { guide: 'What you are looking at' };

const BODIES: Record<SheetName, string> = { guide: GUIDE };

export class Sheet {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;

  constructor() {
    this.root = document.getElementById('sheet')!;
    this.title = document.getElementById('sheet-title')!;
    this.body = document.getElementById('sheet-body')!;
    document.getElementById('sheet-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
  }

  open(name: SheetName): void {
    this.title.textContent = TITLES[name];
    this.body.innerHTML = BODIES[name];
    this.body.scrollTop = 0;
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Show the guide the first time someone opens the lab, and never nag after that. */
  openIfFirstVisit(): void {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Private windows and blocked site data throw here; showing the guide once per
      // session is a fine outcome, so carry on.
    }
    this.open('guide');
  }
}
