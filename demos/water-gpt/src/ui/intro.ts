// A three-step introduction shown on first visit (and from the "How it works" button):
// 1) a language model is mostly matrix multiplications, 2) water in pipes can do a matrix
// multiplication, 3) we simulate that water, so a whole GPT runs on it.

export interface IntroActions {
  /** Close the intro and open chapter 1 (the 4×4 crossbar). */
  crossbar(): void;
  /** Close the intro and open chapter 2 on a language model. */
  gpt(): void;
}

const SEEN_KEY = 'water-gpt:intro-seen';

const STEPS: { kicker: string; title: string; figure: string; body: string }[] = [
  {
    kicker: 'A GPT that runs on water · 1 of 3',
    title: 'Every language model is mostly one operation: multiply a matrix',
    figure: figureLLM(),
    body: `
      <p>GPT-2 turns every word into a list of 768 numbers, a <b>vector</b>. To guess the next
      word it pushes that vector through 12 layers, and almost all of the work in each layer is
      one operation: multiply the vector by a big table of learned numbers, a <b>matrix</b>.</p>
      <p>That's about 85 million multiply-and-add steps per word, and they're almost all
      <em>y = W · x</em>. Training only picks the numbers in W. Running the model is mostly
      doing that multiplication again and again.</p>`,
  },
  {
    kicker: 'A GPT that runs on water · 2 of 3',
    title: 'Pipes and valves can multiply a matrix, with nothing but water',
    figure: figureCrossbar(),
    body: `
      <p>Put each input number in a <b>reservoir</b>, as a water level <em>x</em>. Run a pipe from
      every reservoir to every output tank, each with a <b>valve</b> opened to one weight
      <em>W</em>. Slow water in a thin pipe flows in proportion to the pressure times how open
      the valve is, so each pipe carries <em>W × x</em>.</p>
      <p>Water isn't created or lost, so each output tank collects the sum of its pipes:
      <em>y = Σ W·x</em>. That's a whole matrix–vector product, all at once, with no electronics.
      Valves can't flow backwards, so negative weights use a second tank that gets subtracted.</p>`,
  },
  {
    kicker: 'A GPT that runs on water · 3 of 3',
    title: 'Simulate the water, and a real GPT-2 writes text with it',
    figure: figureMachine(),
    body: `
      <p>This page doesn't animate a fake answer. It <b>simulates the water</b>: for every
      pipe and valve it solves the laminar-flow and conservation-of-water equations, including
      the flaws real hardware would have. Valves only have 64 positions, each is set slightly
      wrong, and pressure is lost along the pipes.</p>
      <p>Every matrix multiplication in the model is done by that simulated water: calc-gpt,
      TinyStories-33M and the real GPT-2, with their published weights set into the valves.
      The few steps between the water machines (normalising, softmax, picking the word) are
      ordinary arithmetic, as in analog AI chips, and the page marks them as <b>digital</b>.
      The water's answers sit next to an exact computer's, so you can see what the water gets
      right and wrong.</p>`,
  },
];

export function setupIntro(actions: IntroActions): { open(step?: number): void } {
  const root = document.createElement('div');
  root.id = 'intro';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'intro-title');
  root.innerHTML = `
    <div class="intro-card">
      <button type="button" class="intro-close" aria-label="Close">×</button>
      <div class="intro-figure"></div>
      <div class="intro-text">
        <p class="kicker intro-kicker"></p>
        <h2 id="intro-title"></h2>
        <div class="intro-body"></div>
      </div>
      <div class="intro-nav">
        <div class="intro-dots"></div>
        <div class="intro-buttons">
          <button type="button" class="intro-back">Back</button>
          <button type="button" class="intro-next primary">Next</button>
          <button type="button" class="intro-crossbar" hidden>Try the crossbar</button>
          <button type="button" class="intro-gpt primary" hidden>Run a GPT on water</button>
        </div>
      </div>
    </div>`;
  document.body.append(root);

  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const dots = q<HTMLDivElement>('.intro-dots');
  for (let i = 0; i < STEPS.length; i++) {
    const d = document.createElement('button');
    d.type = 'button';
    d.setAttribute('aria-label', `Step ${i + 1}`);
    d.addEventListener('click', () => show(i));
    dots.append(d);
  }

  let step = 0;
  function show(i: number): void {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[step];
    q('.intro-kicker').textContent = s.kicker;
    q('#intro-title').textContent = s.title;
    q('.intro-figure').innerHTML = s.figure;
    q('.intro-body').innerHTML = s.body;
    dots.querySelectorAll('button').forEach((d, k) => d.classList.toggle('on', k === step));
    const last = step === STEPS.length - 1;
    q('.intro-back').style.visibility = step === 0 ? 'hidden' : 'visible';
    q('.intro-next').hidden = last;
    q('.intro-crossbar').hidden = !last;
    q('.intro-gpt').hidden = !last;
  }

  function close(): void {
    root.hidden = true;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable: the intro simply shows again next time */
    }
  }

  q('.intro-close').addEventListener('click', close);
  q('.intro-back').addEventListener('click', () => show(step - 1));
  q('.intro-next').addEventListener('click', () => show(step + 1));
  q('.intro-crossbar').addEventListener('click', () => {
    close();
    actions.crossbar();
  });
  q('.intro-gpt').addEventListener('click', () => {
    close();
    actions.gpt();
  });
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(step + 1);
    else if (e.key === 'ArrowLeft') show(step - 1);
  });

  const api = {
    open(i = 0) {
      show(i);
      root.hidden = false;
      q<HTMLButtonElement>(step === STEPS.length - 1 ? '.intro-gpt' : '.intro-next').focus();
    },
  };

  let seen = false;
  try {
    seen = localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    seen = false;
  }
  const params = new URLSearchParams(location.search);
  if (params.has('intro') || (!seen && !params.has('nointro'))) api.open(0);
  return api;
}

// ---------------------------------------------------------------- figures (inline SVG)

function figureLLM(): string {
  const layer = (x: number, label: string) => `
    <g transform="translate(${x},0)">
      <rect x="0" y="36" width="64" height="88" rx="6" class="f-mat"/>
      ${grid(8, 36, 48, 72, 6, 8)}
      <text x="32" y="142" class="f-cap">${label}</text>
    </g>`;
  const vec = (x: number, n: number, cls: string) =>
    Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${46 + i * 12}" width="10" height="9" rx="2" class="${cls}"/>`).join('');
  return `
  <svg viewBox="0 0 560 160" role="img" aria-label="A word becomes a vector, which is multiplied by matrices layer after layer, giving next-word probabilities">
    <text x="18" y="88" class="f-word">“the”</text>
    ${arrow(64, 84, 92)}
    ${vec(100, 6, 'f-vec')}
    <text x="105" y="142" class="f-cap">x</text>
    ${arrow(116, 84, 140)}
    ${layer(146, 'W₁ · x')}
    ${arrow(214, 84, 238)}
    ${layer(244, 'W₂ · x')}
    <text x="330" y="88" class="f-dots">· · ·</text>
    ${layer(376, 'W₁₂ · x')}
    ${arrow(444, 84, 468)}
    ${[0.25, 0.55, 0.9, 0.35, 0.15].map((p, i) => `<rect x="${474 + i * 14}" y="${118 - p * 70}" width="10" height="${p * 70}" rx="2" class="f-prob"/>`).join('')}
    <text x="508" y="142" class="f-cap">next word</text>
  </svg>`;
}

function figureCrossbar(): string {
  const xs = [96, 156, 216, 276];
  const ys = [44, 84, 124];
  const levels = [0.8, 0.4, 0.65];
  const open = [
    [0.9, 0.2, 0.6, 0],
    [0.3, 0.8, 0, 0.5],
    [0, 0.5, 0.7, 0.9],
  ];
  let s = '';
  ys.forEach((y, r) => {
    s += `<rect x="18" y="${y - 16}" width="34" height="32" rx="3" class="f-tank"/>`;
    s += `<rect x="19" y="${y + 16 - 31 * levels[r]}" width="32" height="${31 * levels[r]}" class="f-water"/>`;
    s += `<text x="6" y="${y + 4}" class="f-lab">x${'₀₁₂'[r]}</text>`;
    s += `<line x1="52" y1="${y}" x2="300" y2="${y}" class="f-pipe"/>`;
  });
  xs.forEach((x, c) => {
    s += `<line x1="${x}" y1="${ys[0]}" x2="${x}" y2="168" class="f-pipe"/>`;
    s += `<rect x="${x - 14}" y="170" width="28" height="34" rx="3" class="f-tank"/>`;
    const fill = ys.reduce((a, _, r) => a + open[r][c] * levels[r], 0) / 2.2;
    s += `<rect x="${x - 13}" y="${203 - 32 * fill}" width="26" height="${32 * fill}" class="f-water"/>`;
    s += `<text x="${x}" y="220" class="f-lab" text-anchor="middle">y${'₀₁₂₃'[c]}</text>`;
    ys.forEach((y, r) => {
      const o = open[r][c];
      s += `<circle cx="${x}" cy="${y}" r="9" class="f-valve"/>`;
      if (o > 0) s += `<path d="M${x} ${y} L${x} ${y - 8} A8 8 0 ${o > 0.5 ? 1 : 0} 1 ${x + 8 * Math.sin(o * 2 * Math.PI)} ${y - 8 * Math.cos(o * 2 * Math.PI)} Z" class="f-open"/>`;
    });
  });
  return `
  <svg viewBox="0 0 560 226" role="img" aria-label="Reservoirs on the left feed pipes; valves at each crossing set the weights; tanks at the bottom collect the sums">
    ${s}
    <text x="330" y="52" class="f-note">reservoir level = input <tspan class="f-em">x</tspan></text>
    <text x="330" y="88" class="f-note">valve opening = weight <tspan class="f-em">W</tspan></text>
    <text x="330" y="124" class="f-note">flow in each pipe = <tspan class="f-em">W × x</tspan></text>
    <text x="330" y="190" class="f-note">tank collects the sum:</text>
    <text x="330" y="210" class="f-note"><tspan class="f-em">y = W · x</tspan></text>
  </svg>`;
}

function figureMachine(): string {
  const bank = (x: number, label: string, water: boolean) => `
    <g transform="translate(${x},40)">
      <rect width="86" height="64" rx="6" class="${water ? 'f-mat' : 'f-dig'}"/>
      ${water ? grid(8, 8, 70, 48, 6, 4) : ''}
      <text x="43" y="${water ? 84 : 38}" class="f-cap">${label}</text>
    </g>`;
  return `
  <svg viewBox="0 0 560 150" role="img" aria-label="A row of simulated water crossbars with small digital steps between them">
    ${bank(10, 'attention', true)}
    ${arrow(98, 72, 112)}
    <g transform="translate(116,58)"><rect width="56" height="28" rx="14" class="f-dig"/><text x="28" y="18" class="f-cap">softmax</text></g>
    ${arrow(174, 72, 188)}
    ${bank(192, 'MLP up', true)}
    ${arrow(280, 72, 294)}
    <g transform="translate(298,58)"><rect width="46" height="28" rx="14" class="f-dig"/><text x="23" y="18" class="f-cap">GELU</text></g>
    ${arrow(346, 72, 360)}
    ${bank(364, 'MLP down', true)}
    <text x="462" y="76" class="f-dots">· · ·</text>
    <g transform="translate(12,128)">
      <rect width="12" height="12" rx="3" class="f-mat"/><text x="18" y="10" class="f-leg">simulated water (every matrix multiply)</text>
      <rect x="280" width="12" height="12" rx="6" class="f-dig"/><text x="298" y="10" class="f-leg">ordinary arithmetic, labelled digital</text>
    </g>
  </svg>`;
}

function grid(x: number, y: number, w: number, h: number, cols: number, rows: number): string {
  let s = '';
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const v = Math.sin(r * 2.3 + c * 1.7) * 0.5 + 0.5;
      s += `<circle cx="${x + (c + 0.5) * (w / cols)}" cy="${y + (r + 0.5) * (h / rows)}" r="${Math.min(w / cols, h / rows) * 0.32}" class="f-dot" style="opacity:${0.25 + 0.75 * v}"/>`;
    }
  return s;
}

function arrow(x1: number, y: number, x2: number): string {
  return `<path d="M${x1} ${y} H${x2 - 6} M${x2 - 11} ${y - 5} L${x2 - 4} ${y} L${x2 - 11} ${y + 5}" class="f-arrow"/>`;
}
