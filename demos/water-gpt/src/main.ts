import { Stage } from './render/stage.ts';
import { Exhibit } from './render/exhibit.ts';
import { paintBackground } from './render/background.ts';
import { matrixAssembly, parallelAssembly, type Assembly } from './render/assembly.ts';
import { CpuCrossbar, exactMatvec, type Crossbar } from './crossbar/matrix.ts';
import { IDEAL, type CrossbarSettings } from './crossbar/tile.ts';
import { buildNonIdeal } from './ui/nonideal.ts';
import { ExactBackend, WaterBackend, type TraceEvent, type WeightSpec } from './engine/backend.ts';
import { generate, answer, type Generation } from './engine/generate.ts';
import { MODES } from './modes/index.ts';
import type { ModelMode } from './modes/types.ts';
import type { BigMode } from './big/mode.ts';
import type { Hall } from './big/app/hall.ts';
import { setupIntro } from './intro.ts';
import { valveSvg } from './ui/valve-icon.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ stage

const stageEl = $<HTMLDivElement>('stage');
const glCanvas = $<HTMLCanvasElement>('gl');
const hudCanvas = $<HTMLCanvasElement>('hud');
const hud = hudCanvas.getContext('2d')!;
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d')!;
let stage: Stage | null = null;
try {
  stage = new Stage(glCanvas, bgCanvas);
} catch (e) {
  console.warn('WebGL2 unavailable', e);
  $('nogl').hidden = false;
}
const exhibit = stage ? new Exhibit(stage, hud) : null;
// Debug/screenshot hook: hold the animation at a fraction of the current operation.
let hold: number | null = null;
(window as unknown as { __water: unknown }).__water = {
  stage,
  exhibit,
  hold: (f: number | null) => (hold = f),
};
const busyEl = $('busy');

function resize(): void {
  if (!stage) return;
  const r = stageEl.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  stage.resize(r.width, r.height, dpr);
  hudCanvas.width = Math.round(r.width * dpr);
  hudCanvas.height = Math.round(r.height * dpr);
  paintBackground(bgCtx, r.width, r.height, dpr);
  stage.bgChanged();
}
new ResizeObserver(resize).observe(stageEl);
resize();

let chapter: 1 | 2 = 1;

// ------------------------------------------------------------------ chapter 1: a 4 × 4 crossbar

const N1 = 4;
const x1 = new Float32Array([0.85, 0.35, 0.6, 1.0]);
const W1 = new Float32Array([0.8, -0.3, 0.5, 0.0, 0.2, 0.9, -0.6, 0.4, -0.5, 0.3, 0.7, -0.9, 0.4, -0.2, 0.1, 0.6]);
let settings1: CrossbarSettings = { ...IDEAL };
let asm1: Assembly | null = null;

const headsEl = $('heads');
const headInputs: HTMLInputElement[] = [];
for (let i = 0; i < N1; i++) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  const lab = document.createElement('label');
  const name = document.createElement('span');
  name.innerHTML = `x<sub>${i}</sub>`;
  const out = document.createElement('output');
  lab.append(name, out);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.value = String(x1[i]);
  input.setAttribute('aria-label', `reservoir level x${i}`);
  const sync = () => {
    out.textContent = Number(input.value).toFixed(2);
    input.style.setProperty('--fill', `${Number(input.value) * 100}%`);
  };
  sync();
  input.addEventListener('input', () => {
    x1[i] = Number(input.value);
    sync();
    compute1(false);
  });
  row.append(lab, input);
  headsEl.append(row);
  headInputs.push(input);
}

const wgrid = $('wgrid');
const wInputs: HTMLInputElement[] = [];
wgrid.append(document.createElement('span'));
for (let j = 0; j < N1; j++) {
  const s = document.createElement('span');
  s.innerHTML = `y<sub>${j}</sub>`;
  wgrid.append(s);
}
for (let i = 0; i < N1; i++) {
  const s = document.createElement('span');
  s.innerHTML = `x<sub>${i}</sub>`;
  wgrid.append(s);
  for (let j = 0; j < N1; j++) {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '-1';
    inp.max = '1';
    inp.step = '0.1';
    inp.setAttribute('aria-label', `valve from x${i} to y${j}`);
    inp.addEventListener('change', () => {
      W1[i * N1 + j] = Math.max(-1, Math.min(1, Number(inp.value) || 0));
      compute1(false);
    });
    wgrid.append(inp);
    wInputs.push(inp);
  }
}

function syncW(): void {
  for (let k = 0; k < N1 * N1; k++) {
    const inp = wInputs[k];
    if (document.activeElement !== inp) inp.value = W1[k].toFixed(2);
    inp.classList.toggle('w-pos', W1[k] > 0);
    inp.classList.toggle('w-neg', W1[k] < 0);
  }
}

$('randomise').addEventListener('click', () => {
  for (let k = 0; k < N1 * N1; k++) W1[k] = Math.round((Math.random() * 2 - 1) * 20) / 20;
  compute1(true);
});
$('identity').addEventListener('click', () => {
  for (let k = 0; k < N1 * N1; k++) W1[k] = k % (N1 + 1) === 0 ? 1 : 0;
  compute1(true);
});
$('run1').addEventListener('click', () => compute1(true));

const ni1 = buildNonIdeal(
  $('nonideal1'),
  {
    title: 'Non-idealities',
    caption:
      'A real machine is not perfect. Valves click into a limited number of stops, each one is set with a small error, and the supply pipes have a little friction of their own, so the pressure sags along a row. The friction is solved for the whole network of pipes at once. Analogue chips face exactly the same three problems.',
    presets: [
      { label: 'Ideal', s: IDEAL },
      { label: 'Realistic', s: { bits: 5, noise: 0.01, lambda: 3e-3, seed: 1 } },
      { label: 'Sloppy', s: { bits: 3, noise: 0.04, lambda: 1e-2, seed: 1 } },
    ],
    maxLambda: 1e-2,
  },
  settings1,
  (s) => {
    settings1 = s;
    compute1(false);
  },
);

function fmt(v: number): string {
  return (v >= 0 ? ' ' : '−') + Math.abs(v).toFixed(3);
}

function compute1(replay: boolean): void {
  syncW();
  const cb = new CpuCrossbar('chapter-1', W1, N1, N1, false, settings1);
  cb.commissionSync();
  const y = cb.matvec(x1);
  const ye = exactMatvec(W1, N1, N1, x1);
  asm1 = matrixAssembly(
    'A 4 × 4 hydraulic crossbar',
    '4 reservoirs · 4 pairs of collectors · 32 valves · yⱼ = Σᵢ wⱼᵢ xᵢ',
    cb,
    x1,
    y,
    ye,
  );
  const tb = $('table1').querySelector('tbody')!;
  tb.innerHTML = '';
  let maxErr = 0;
  let maxY = 0;
  for (let j = 0; j < N1; j++) {
    const tr = document.createElement('tr');
    const err = y[j] - ye[j];
    maxErr = Math.max(maxErr, Math.abs(err));
    maxY = Math.max(maxY, Math.abs(ye[j]));
    tr.innerHTML = `<td>y${j}</td><td class="water">${fmt(y[j])}</td><td>${fmt(ye[j])}</td><td>${Math.abs(err) < 5e-7 ? '0' : (err > 0 ? '+' : '−') + Math.abs(err).toExponential(1)}</td>`;
    tb.append(tr);
  }
  const ideal = settings1.bits === null && settings1.noise === 0 && settings1.lambda === 0;
  $('note1').textContent = ideal
    ? 'Ideal machine: the water gives W·x exactly (up to floating-point rounding).'
    : `Largest error: ${((maxErr / Math.max(maxY, 1e-9)) * 100).toFixed(1)}% of the largest output.`;
  if (exhibit && chapter === 1) {
    exhibit.opts = {
      rowLabels: (r) => `x${r} = ${x1[r].toFixed(2)}`,
      outLabels: (j) => (j < N1 ? `y${j} = ${y[j].toFixed(2)}` : null),
      caption: 'Water y (under each collector pair) is read as the + collector minus the − collector.',
    };
    exhibit.steady = true;
    if (replay) exhibit.play(asm1, 3.2);
    else exhibit.update(asm1);
  }
}

// ------------------------------------------------------------------ chapter 2: a GPT on crossbars

let mode: ModelMode = MODES[0];

// ------------------------------------------------------------------ the hall (big modes)
// GPT-2 and TinyStories run on the WebGPU machine and are drawn by the valve-field renderer
// in place of the exhibit. Its code loads only when one of them is chosen, so calc-gpt and
// chapter 1 work (and stay light) in browsers without WebGPU.
let hall: Hall | null = null;
let hallOn = false;
const isHall = (m: ModelMode): m is BigMode => m.kind === 'hall';

async function getHall(): Promise<Hall> {
  if (!hall) {
    const { Hall } = await import('./big/app/hall.ts');
    hall = new Hall({ stage: $('hall-stage'), panel: $('hall-panel') });
  }
  return hall;
}

function showHall(on: boolean): void {
  hallOn = on;
  $('stage').hidden = on;
  $('hall-stage').hidden = !on;
  $('hall-panel').hidden = !on;
  $('ch2').classList.toggle('hall-mode', on);
  if (!on) hall?.hide();
  syncPipeBar();
}

function chapterHash(): string {
  return chapter === 2 ? (isHall(mode) ? `#${mode.id}` : '#gpt') : '#crossbar';
}
let specs: WeightSpec[] = [];
let exact: ExactBackend | null = null;
let water: WaterBackend | null = null;
let settings2: CrossbarSettings = { bits: 6, noise: 0.005, lambda: 3e-5, seed: 1 };
let ready = false;
let commissionToken = 0;

const modesEl = $('modes');
function buildModes(): void {
  modesEl.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.textContent = m.copy.label;
    b.setAttribute('aria-checked', String(m === mode));
    b.addEventListener('click', () => {
      if (m !== mode) selectMode(m);
    });
    modesEl.append(b);
  }
  modesEl.hidden = MODES.length < 1;
}

const promptInput = $<HTMLInputElement>('prompt');
const goBtn = $<HTMLButtonElement>('go');
const promptErr = $('prompt-error');

function applyCopy(): void {
  $('mode-intro').innerHTML = `<p>${mode.copy.intro}</p><p>${mode.copy.provenance}</p>`;
  $('prompt-label').textContent = mode.copy.promptLabel;
  promptInput.placeholder = mode.copy.placeholder;
  if (!promptInput.value) promptInput.value = mode.copy.examples[0];
  const ex = $('examples');
  ex.innerHTML = '';
  for (const e of mode.copy.examples) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => {
      promptInput.value = e;
      run2();
    });
    ex.append(b);
  }
}

const ni2 = buildNonIdeal(
  $('nonideal2'),
  {
    title: 'How well the machine was built',
    caption:
      'These describe the factory: how finely the valves can be set, how accurately, and how much friction the supply pipes have. Changing them builds a new machine from the same trained weights and calibrates it. The circuits between crossbars (softmax, LayerNorm, ReLU, regulators) get the same manufacturing tolerance.',
    presets: [
      { label: 'Ideal', s: IDEAL },
      { label: 'Realistic', s: { bits: 6, noise: 0.005, lambda: 3e-5, seed: 1 } },
      { label: 'Cheap', s: { bits: 4, noise: 0.02, lambda: 1e-4, seed: 1 } },
    ],
    maxLambda: 1e-3,
  },
  settings2,
  (s) => {
    settings2 = s;
    void commission();
  },
);
void ni2;
void ni1;

async function selectMode(m: ModelMode): Promise<void> {
  mode = m;
  buildModes();
  applyCopy();
  if (chapter === 2) history.replaceState(null, '', location.search + chapterHash());
  if (isHall(m)) {
    commissionToken++;
    stopPlayer();
    ready = false;
    busyEl.hidden = true;
    if (chapter === 2) {
      showHall(true);
      await (await getHall()).show(m);
    }
    return;
  }
  if (hallOn) showHall(false);
  ready = false;
  gen = null;
  setBusy('Loading the model…');
  await mode.load();
  specs = mode.weights();
  exact = new ExactBackend(specs);
  const facts = $('facts');
  facts.innerHTML = mode
    .facts()
    .map((f) => `<span>${f.label} <b>${f.value}</b></span>`)
    .join('');
  buildPipeline();
  await commission();
}

function setBusy(msg: string | null): void {
  busyEl.hidden = msg === null || chapter !== 2;
  busyEl.textContent = msg ?? '';
  goBtn.disabled = msg !== null;
}

async function commission(): Promise<void> {
  const token = ++commissionToken;
  ready = false;
  stopPlayer();
  const wb = new WaterBackend(specs, settings2);
  const total = wb.tileCount;
  setBusy(`Calibrating the crossbars · 0 of ${total} blocks`);
  await wb.commission((d, t) => {
    if (token === commissionToken) setBusy(`Calibrating the crossbars · ${d} of ${t} blocks`);
  });
  if (token !== commissionToken) return;
  water = wb;
  ready = true;
  setBusy(null);
  void runAccuracy(token);
  if (chapter === 2) showIdle();
}

/** Before the first Calculate: the empty embedding crossbar, waiting for a sum. */
function showIdle(): void {
  if (!exhibit || !water || gen) return;
  const cb = water.crossbars.get('embed');
  const spec = specOf('embed');
  if (!cb || !spec) return;
  const zero = new Float32Array(spec.K);
  const none = new Float32Array(spec.N);
  exhibit.opts = { rowLabels: embedRowLabel, caption: 'Press Calculate: the characters of your sum open their reservoirs and the water starts to flow.' };
  exhibit.steady = true;
  exhibit.play(matrixAssembly('Embedding · waiting for a sum', 'one reservoir per character and one per position · all shut until you press Calculate', cb, zero, none, none), 0.01);
  highlight(null);
}

// ---------------------------------------------------------------- pipeline strip

interface PipeItem {
  key: string;
  label: string;
  /** A hydraulic circuit between crossbars (no crossbar picture). */
  circuit?: string;
  /** Tooltip for a crossbar step. */
  hint?: string;
  layer?: boolean;
}
let pipeItems: PipeItem[] = [];
const pipelineEl = $('pipeline');

const LN_CIRCUIT = 'water circuit: averaging node (mean), orifices (square, square root), valves opened in proportion to σ';

function buildPipeline(): void {
  const nLayer = specs.filter((s) => s.name.endsWith('.wqkv')).length;
  pipeItems = [{ key: 'embed', label: 'embed', hint: 'crossbar: the character opens its reservoir and its row of valves pours out its 32 numbers' }];
  for (let l = 0; l < nLayer; l++) {
    pipeItems.push(
      { key: `L${l}`, label: `L${l + 1}`, layer: true },
      { key: `l${l}.ln1`, label: 'LayerNorm', circuit: LN_CIRCUIT },
      { key: `l${l}.wqkv`, label: 'Q·K·V', hint: 'crossbar: each character makes a question (query), a label (key) and a message (value)' },
      { key: `l${l}.qk`, label: 'QKᵀ', hint: 'crossbar with valves set by the earlier characters: how well this question matches each earlier label' },
      { key: `l${l}.softmax`, label: 'softmax', circuit: 'water circuit: check-valve max node, valves profiled to open as e^(s/√d), constant-inflow flow divider' },
      { key: `l${l}.av`, label: 'A·V', hint: 'crossbar with valves set by the earlier characters: blend their messages by the attention shares' },
      { key: `l${l}.wproj`, label: 'out', hint: 'crossbar: mix the attention heads back together' },
      { key: `l${l}.ln2`, label: 'LayerNorm', circuit: LN_CIRCUIT },
      { key: `l${l}.w1`, label: 'up', hint: 'crossbar: 32 → 128, the first half of a small calculator for each character' },
      { key: `l${l}.relu`, label: 'ReLU', circuit: 'water circuit: a check valve' },
      { key: `l${l}.w2`, label: 'down', hint: 'crossbar: 128 → 32, back to the character’s width' },
    );
  }
  pipeItems.push(
    { key: 'out', label: 'out', layer: true },
    { key: 'lnf', label: 'LayerNorm', circuit: LN_CIRCUIT },
    { key: 'wout', label: 'scores', hint: 'crossbar: one collector per possible next character' },
    { key: 'argmax', label: 'read out', circuit: 'water circuit: every output collector feeds one node through a check valve; the one that fills it wins' },
  );
  pipelineEl.innerHTML = '';
  for (const p of pipeItems) {
    const li = document.createElement('li');
    li.textContent = p.label;
    li.dataset.key = p.key;
    if (p.circuit) li.classList.add('circuit');
    if (p.layer) li.classList.add('layer');
    li.title = p.circuit ?? p.hint ?? '';
    pipelineEl.append(li);
  }
}

function highlight(key: string | null): void {
  for (const li of pipelineEl.children) (li as HTMLElement).classList.toggle('active', (li as HTMLElement).dataset.key === key);
}

// ---------------------------------------------------------------- player

type Speed = 'watch' | 'fast' | 'instant';
let speed: Speed = 'fast';
for (const b of document.querySelectorAll<HTMLButtonElement>('.speed button')) {
  b.addEventListener('click', () => {
    speed = b.dataset.speed as Speed;
    for (const o of document.querySelectorAll<HTMLButtonElement>('.speed button')) o.setAttribute('aria-pressed', String(o === b));
  });
}

interface PlayStep {
  key: string;
  /** A circuit between crossbars (no crossbar picture). */
  circuit: boolean;
  /** Animate this step faster (the final end-of-answer character). */
  quick?: boolean;
  /** Fast mode, after the first character: tick the pipeline strip without swapping the picture. */
  skim?: boolean;
  /** Stop on this circuit and explain it (first character, first layer and the end). */
  explain?: boolean;
  /** A close-up of the current crossbar: zoom window (physical cells) and a card explaining it. */
  closeUp?: { win: { x: number; y: number; w: number; h: number }; title: string; body: string; cell?: number };
  /** Logical output to highlight under the collectors. */
  highlightOut?: number;
  build?: () => Assembly;
  /** Called when the step finishes (e.g. reveal a character). */
  after?: () => void;
  /** Visible token position for the HUD strip. */
  pos: number;
}

let queue: PlayStep[] = [];
let current: PlayStep | null = null;
let stepT = 0;
let stepDur = 0;
let gen: Generation | null = null;
let shownTokens = 0;
let stripPos = -1;

function stopPlayer(): void {
  queue = [];
  current = null;
  highlight(null);
  showCircuit(null);
}

function specOf(name: string): WeightSpec | undefined {
  return specs.find((s) => s.name === name);
}

function stepsForTrace(trace: TraceEvent[], pos: number, nCtx: number): PlayStep[] {
  const out: PlayStep[] = [];
  const byLayer = new Map<number, { qk: TraceEvent[]; av: TraceEvent[] }>();
  for (const e of trace) {
    const m = /^l(\d+)\.h\d+\.(qk|av)$/.exec(e.name);
    if (m) {
      const l = Number(m[1]);
      const g = byLayer.get(l) ?? { qk: [], av: [] };
      g[m[2] as 'qk' | 'av'].push(e);
      byLayer.set(l, g);
    }
  }
  const circuit = (key: string) => out.push({ key, circuit: true, pos });
  for (const e of trace) {
    if (e.kind !== 'linear') {
      const m = /^l(\d+)\.h0\.(qk|av)$/.exec(e.name);
      if (!m) continue;
      const l = Number(m[1]);
      const g = byLayer.get(l)!;
      if (m[2] === 'qk') {
        out.push({
          key: `l${l}.qk`,
          circuit: false,
          pos,
          build: () =>
            parallelAssembly(
              `Layer ${l + 1} · attention scores QKᵀ`,
              `4 attention heads side by side · valves set on the fly from the keys of the ${nCtx} characters so far · the queries fill the reservoirs`,
              g.qk.map((t) => ({ cb: t.crossbar as Crossbar, x: t.x, y: t.y })),
            ),
        });
        circuit(`l${l}.softmax`);
      } else {
        out.push({
          key: `l${l}.av`,
          circuit: false,
          pos,
          build: () =>
            parallelAssembly(
              `Layer ${l + 1} · attention × values`,
              `4 attention heads · valves set from the earlier characters' values · the attention shares fill the reservoirs (never negative, so no x⁻ reservoirs)`,
              g.av.map((t) => ({ cb: t.crossbar as Crossbar, x: t.x, y: t.y })),
            ),
        });
      }
      continue;
    }
    const spec = specOf(e.name)!;
    const lm = /^l(\d+)\.(\w+)$/.exec(e.name);
    if (lm && lm[2] === 'wqkv') circuit(`l${lm[1]}.ln1`);
    if (lm && lm[2] === 'w1') circuit(`l${lm[1]}.ln2`);
    if (e.name === 'wout') circuit('lnf');
    const cb = e.crossbar as Crossbar;
    const sub =
      e.name === 'embed'
        ? `one reservoir per character and one per position · the current character and position open, and their rows of valves pour the embedding`
        : `${spec.K} inputs → ${spec.N} outputs · ${(spec.K * spec.N).toLocaleString('en-US')} weights = ${(cb.K * (cb.signedInputs ? 2 : 1) * cb.N * 2).toLocaleString('en-US')} valves (± inputs × ± collectors) · set at the factory`;
    out.push({
      key: e.name === 'embed' ? 'embed' : lm ? `l${lm[1]}.${lm[2]}` : e.name,
      circuit: false,
      pos,
      build: () => {
        const ye = exactMatvec(spec.W, spec.K, spec.N, e.x);
        return matrixAssembly(spec.label[0].toUpperCase() + spec.label.slice(1), sub, cb, e.x, e.y, ye);
      },
    });
    if (lm && lm[2] === 'w1') circuit(`l${lm[1]}.relu`);
  }
  circuit('argmax');
  return out;
}

function run2(): void {
  if (!ready || !water || !exact) return;
  const p = mode.normalise ? mode.normalise(promptInput.value) : promptInput.value;
  const err = mode.validate(p);
  promptErr.hidden = !err;
  promptErr.textContent = err ?? '';
  if (err) return;
  promptInput.value = p;
  stopPlayer();
  gen = generate(mode, p, water, exact, true);
  const exactAns = answer(mode, p, exact);
  shownTokens = 0;
  $('ans-prompt').textContent = p;
  $('ans-gen').textContent = '';
  $('ans-cursor').classList.remove('off');
  $('ans-exact').textContent = exactAns || '–';
  const m = /^(\d+)\+(\d+)=$/.exec(p);
  $('ans-true').textContent = m ? String(Number(m[1]) + Number(m[2])) : '–';
  renderProbs(null);
  const steps: PlayStep[] = [];
  const nPrompt = mode.encode(p).length;
  gen.steps.forEach((s, k) => {
    const pos = nPrompt - 1 + k;
    const st = stepsForTrace(s.trace, pos, pos + 1);
    for (const x of st) {
      if (s.token === mode.stopToken) x.quick = true;
      if (k > 0) x.skim = true;
      else if (x.circuit && !/^l[1-9]/.test(x.key)) x.explain = true;
      if (x.key === 'wout') x.highlightOut = s.token;
    }
    st[st.length - 1].after = () => {
      shownTokens = k + 1;
      renderProbs(k);
      const text = gen!.steps
        .slice(0, k + 1)
        .filter((q) => q.token !== mode.stopToken)
        .map((q) => mode.vocab[q.token])
        .join('');
      $('ans-gen').textContent = text;
      if (k === gen!.steps.length - 1) $('ans-cursor').classList.add('off');
    };
    if (k === 0) {
      const at = st.findIndex((x) => x.key === 'l0.w1');
      const ev = s.trace.find((e) => e.kind === 'linear' && e.name === 'l0.w1');
      if (at >= 0 && ev) st.splice(at + 1, 0, ...neuronCloseUps(ev, pos));
    }
    steps.push(...st);
  });
  if (speed === 'instant') {
    for (const s of steps) s.after?.();
    const last = [...steps].reverse().find((s) => s.build);
    if (last && exhibit) showStep(last, 0.6);
    highlight(null);
    return;
  }
  queue = steps;
  nextStep();
}

function showStep(s: PlayStep, dur: number): void {
  if (!exhibit) return;
  if (s.build) {
    const asm = s.build();
    exhibit.opts = {
      rowLabels: s.key === 'embed' ? embedRowLabel : undefined,
      outLabels: s.key === 'wout' ? (j) => (mode.vocab[j] === ';' ? '⏎' : mode.vocab[j]) : undefined,
      highlightOut: s.highlightOut,
      caption: 'Each output is its + collector minus its − collector. A pressure regulator sets the next reservoir level from it.',
    };
    exhibit.steady = false;
    exhibit.play(asm, dur, true);
  }
  stripPos = s.pos;
}

function embedRowLabel(r: number): string | null {
  const V = mode.vocab.length;
  if (r < V) return `'${mode.vocab[r]}'`;
  return `pos ${r - V}`;
}

function nextStep(): void {
  current = queue.shift() ?? null;
  if (!current) {
    highlight(null);
    showCircuit(null);
    return;
  }
  // Fast: the first character goes through every crossbar at a pace you can follow. After
  // that only the read-out (head) is shown; the layers tick by on the pipeline strip without
  // swapping the picture, so nothing strobes.
  const ends = current.key === 'embed' || current.key === 'wout';
  const skim = speed === 'fast' && current.skim && current.key !== 'wout';
  const opDur = speed === 'watch' ? 1.1 : skim ? 0.04 : ends ? 0.9 : 0.6;
  const circDur = speed === 'watch' ? 0.25 : skim ? 0.02 : 0.12;
  const explain = current.circuit && current.explain && speed !== 'instant';
  stepDur = explain ? (speed === 'watch' ? 4 : 2.6) : (current.circuit ? circDur : opDur) / (current.quick ? 3 : 1);
  if (current.closeUp) stepDur = speed === 'watch' ? 9 : 6;
  stepT = 0;
  highlight(current.key);
  showCircuit(explain ? current.key : null);
  if (current.closeUp) {
    showCard('Close-up', current.closeUp.title, current.closeUp.body, 'bottom');
    exhibit?.focus(current.closeUp.win);
    exhibit?.finish();
    if (exhibit) exhibit.hoverCell = current.closeUp.cell ?? -1;
  } else {
    if (exhibit) exhibit.hoverCell = -1;
    if (!current.circuit && exhibit?.zoomed) exhibit.resetZoom();
  }
  if (!skim) showStep(current, stepDur);
  else stripPos = current.pos;
}

/**
 * The first character's zoom into layer 1's MLP-up crossbar: one valve (one multiplication),
 * then its column (one neuron, a dot product). Real numbers from the water's own run.
 */
function neuronCloseUps(ev: TraceEvent, pos: number): PlayStep[] {
  const spec = specOf(ev.name);
  if (!spec) return [];
  const { K, N, W } = spec;
  let j = 0;
  for (let c = 1; c < N; c++) if (ev.y[c] > ev.y[j]) j = c;
  const contrib = Array.from({ length: K }, (_, i) => ({ i, x: ev.x[i], w: W[i * N + j], f: ev.x[i] * W[i * N + j] }));
  const byFlow = [...contrib].sort((a, b) => b.f - a.f);
  const v = byFlow.find((c) => c.x > 0 && c.w > 0) ?? byFlow[0];
  const f2 = (x: number) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(2);
  const f3 = (x: number) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(3);
  // physical cells: input i has rows 2i (x⁺) and 2i+1 (x⁻); output j has columns 2j (+) and 2j+1 (−)
  const pr = 2 * v.i + (v.x >= 0 ? 0 : 1);
  const pc = 2 * j + (v.w >= 0 ? 0 : 1);
  const top = byFlow.slice(0, 3).map((c) => `${f2(c.x)}×${f3(c.w)}`).join(' + ');
  let sum = 0;
  for (const c of contrib) sum += c.f;
  return [
    {
      key: 'l0.w1',
      circuit: true,
      pos,
      closeUp: {
        win: { x: pc - 3, y: pr - 3, w: 7, h: 7 },
        cell: pr * 2 * N + pc,
        title: 'One valve, one multiplication',
        body: `This valve joins reservoir ${v.i}, standing at level ${f2(v.x)}, to collector ${j}. It was set at the factory to the weight ${f3(v.w)}. Pressure pushes water through in proportion to both, so ${f2(v.x)} × ${f3(v.w)} = ${f3(v.f)} units flow. That is one multiplication, done by plumbing, with this character's real numbers.`,
      },
    },
    {
      key: 'l0.w1',
      circuit: true,
      pos,
      closeUp: {
        win: { x: pc - 4, y: 0, w: 9, h: 2 * K },
        title: 'One column, one neuron',
        body: `All ${K} valves in this column pour into the same collector, which simply holds the total: ${top} + … = ${f3(sum)} (the machine as built gives ${f3(ev.y[j])}). Multiply and add, ${K} times, all at once: a dot product, one neuron. The whole crossbar is ${N} of these side by side, filling at the same moment.`,
      },
    },
  ];
}

const CIRCUITS: Record<string, [string, string]> = {
  ln: [
    'LayerNorm · evening out the levels',
    'All the levels feed one tank through equal pipes, so it settles at their mean. Orifices, whose pressure drop grows with the square of the flow, measure the spread σ. Valves opened in proportion to σ then divide by it. No arithmetic: the plumbing just settles.',
  ],
  softmax: [
    'softmax · attention scores become shares',
    'Check valves let the highest score set a common level. Each score then opens a valve shaped to open exponentially. A fixed inflow splits between those valves, and each branch’s share is that character’s attention weight. The shares add up to 1 because no water is lost.',
  ],
  relu: [
    'ReLU · a check valve on every output',
    'Positive pressure pushes water through; negative pressure just closes the valve. This one-way valve is the only bend in an otherwise straight-line machine, and it is what lets the network learn more than a single matrix could.',
  ],
  argmax: [
    'Read-out · the fullest collector wins',
    'Every output collector drains into one node through its own check valve. The node rises to the level of the fullest collector, and only that collector keeps flowing. Its character is the answer.',
  ],
};

function showCircuit(key: string | null): void {
  const kind = key === null ? null : key === 'argmax' ? 'argmax' : key === 'lnf' || /\.ln\d$/.test(key) ? 'ln' : key.split('.').pop()!;
  const c = kind ? CIRCUITS[kind] : undefined;
  if (c) showCard('Water circuit', c[0], c[1], 'top');
  else $('circuit-card').hidden = true;
}

function showCard(kicker: string, title: string, body: string, where: 'top' | 'bottom'): void {
  const card = $('circuit-card');
  card.hidden = false;
  card.style.top = where === 'top' ? `${barH + 140}px` : '';
  card.style.bottom = where === 'bottom' ? '64px' : '';
  card.querySelector('.cc-kicker')!.textContent = kicker;
  $('cc-title').textContent = title;
  $('cc-body').textContent = body;
}

function tickPlayer(dt: number): void {
  if (!current) return;
  stepT += dt;
  if (stepT >= stepDur) {
    current.after?.();
    nextStep();
  }
}

function renderProbs(k: number | null): void {
  const el = $('probs');
  if (k === null || !gen) {
    el.innerHTML = '<div class="empty">Probabilities appear as each character is produced.</div>';
    return;
  }
  const s = gen.steps[k];
  const order = Array.from(s.waterProbs.keys()).sort((a, b) => s.waterProbs[b] - s.waterProbs[a]).slice(0, 5);
  el.innerHTML = '';
  for (const t of order) {
    const tok = document.createElement('div');
    tok.className = 'tok';
    tok.textContent = mode.vocab[t] === ';' ? '⏎' : mode.vocab[t];
    tok.title = mode.vocab[t] === ';' ? 'end of answer' : '';
    const bars = document.createElement('div');
    bars.className = 'bars';
    const w = document.createElement('div');
    w.className = 'bar w';
    w.style.width = `${s.waterProbs[t] * 100}%`;
    const d = document.createElement('div');
    d.className = 'bar d';
    d.style.width = `${(s.exactProbs?.[t] ?? 0) * 100}%`;
    bars.append(w, d);
    const val = document.createElement('div');
    val.className = 'val';
    val.textContent = `${(s.waterProbs[t] * 100).toFixed(1)}%`;
    val.title = `ordinary computer: ${((s.exactProbs?.[t] ?? 0) * 100).toFixed(1)}%`;
    el.append(tok, bars, val);
  }
}

$('prompt-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run2();
});

// ---------------------------------------------------------------- accuracy

async function runAccuracy(token: number): Promise<void> {
  const el = $('accuracy');
  const cases = mode.benchmark?.() ?? [];
  if (!cases.length || !water || !exact) {
    el.innerHTML = '';
    return;
  }
  const w = water;
  const ex = exact;
  let okW = 0;
  let okE = 0;
  let n = 0;
  const wrong: string[] = [];
  const t0 = performance.now();
  const render = () => {
    const row = (cls: string, label: string, ok: number) =>
      `<div class="acc-row ${cls}"><span>${label}</span><div class="track"><div class="fill" style="width:${n ? (ok / n) * 100 : 0}%"></div></div><span class="pct">${n ? ((ok / n) * 100).toFixed(1) : '–'}%</span></div>`;
    el.innerHTML =
      row('dig', 'ordinary computer', okE) +
      row('', 'water', okW) +
      `<div class="acc-wrong">${n < cases.length ? `running… ${n} of ${cases.length}` : `${cases.length} sums never seen in training · water took ${((performance.now() - t0) / 1000).toFixed(1)} s`}${wrong.length ? `<br>water got wrong: ${wrong.slice(0, 6).join(', ')}${wrong.length > 6 ? ' …' : ''}` : ''}</div>`;
  };
  $('acc-hint').textContent = `· ${cases.length} sums held out from training`;
  render();
  for (let i = 0; i < cases.length; i++) {
    if (token !== commissionToken) return;
    // Each case is tens of milliseconds of water; never run it under the animation.
    while (current || queue.length) {
      await new Promise((r) => setTimeout(r, 150));
      if (token !== commissionToken) return;
    }
    const c = cases[i];
    const a = answer(mode, c.prompt, w);
    const b = answer(mode, c.prompt, ex);
    if (a === c.answer) okW++;
    else wrong.push(`${c.prompt}${a}`);
    if (b === c.answer) okE++;
    n++;
    if (i % 6 === 5) render();
    await new Promise((r) => setTimeout(r, 0));
  }
  render();
  (window as unknown as { __acc: unknown }).__acc = { water: okW / n, exact: okE / n, n, wrong };
}

// ---------------------------------------------------------------- chapters

function setChapter(c: 1 | 2): void {
  chapter = c;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button')) b.setAttribute('aria-selected', String(Number(b.dataset.ch) === c));
  $('ch1').hidden = c !== 1;
  $('ch2').hidden = c !== 2;
  history.replaceState(null, '', location.search + chapterHash());
  if (c === 2 && isHall(mode)) {
    showHall(true);
    void getHall().then((h) => h.show(mode as BigMode));
    return;
  }
  if (hallOn) showHall(false);
  if (c === 1) {
    stopPlayer();
    busyEl.hidden = true;
    compute1(true);
  } else {
    if (!ready) setBusy(busyEl.textContent || 'Loading…');
    else showIdle();
  }
  syncPipeBar();
}

/** The pipeline bar sits on top of the stage in chapter 2 (calc-gpt); the drawing starts below it. */
const pipeBar = $('pipe-bar');
let barH = 0;
function syncPipeBar(): void {
  pipeBar.hidden = chapter !== 2 || hallOn;
  $('valve-key').hidden = chapter !== 1;
  barH = pipeBar.hidden ? 0 : pipeBar.offsetHeight;
  if (exhibit) exhibit.insetTop = chapter === 2 ? 46 + barH : 0;
}
new ResizeObserver(syncPipeBar).observe(pipeBar);
for (const b of document.querySelectorAll<HTMLButtonElement>('#tabs button')) b.addEventListener('click', () => setChapter(Number(b.dataset.ch) as 1 | 2));

// ---------------------------------------------------------------- stage interaction

let drag: { x: number; y: number; valve: { i: number; j: number; w0: number } | null } | null = null;
const toUp = (e: { clientX: number; clientY: number }) => {
  const r = stageEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: r.height - (e.clientY - r.top) };
};
stageEl.addEventListener(
  'wheel',
  (e) => {
    if (!exhibit) return;
    const p = toUp(e);
    if (!exhibit.cellAt(p.x, p.y) && !exhibit.zoomed) return;
    e.preventDefault();
    exhibit.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  },
  { passive: false },
);
stageEl.addEventListener('pointerdown', (e) => {
  if (!exhibit) return;
  const p = toUp(e);
  if (exhibit.minimapClick(p.x, p.y)) return;
  const cell = exhibit.cellAt(p.x, p.y);
  let valve = null;
  if (chapter === 1 && cell) {
    const i = cell.r;
    const j = Math.floor(cell.c / 2);
    valve = { i, j, w0: W1[i * N1 + j] };
  }
  drag = { x: e.clientX, y: e.clientY, valve };
  stageEl.setPointerCapture(e.pointerId);
});
stageEl.addEventListener('pointermove', (e) => {
  if (!exhibit) return;
  const p = toUp(e);
  if (chapter === 1 && !drag) {
    const cell = exhibit.cellAt(p.x, p.y);
    exhibit.hoverCell = cell ? cell.r * exhibit.asm.cols + cell.c : -1;
    stageEl.style.cursor = cell ? 'ns-resize' : 'default';
  }
  if (!drag) return;
  if (drag.valve) {
    const v = drag.valve;
    const w = Math.max(-1, Math.min(1, Math.round((v.w0 - (e.clientY - drag.y) * 0.01) * 20) / 20));
    if (w !== W1[v.i * N1 + v.j]) {
      W1[v.i * N1 + v.j] = w;
      compute1(false);
    }
  } else {
    exhibit.pan(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
  }
});
const endDrag = () => (drag = null);
stageEl.addEventListener('pointerup', endDrag);
stageEl.addEventListener('pointercancel', endDrag);
stageEl.addEventListener('dblclick', () => exhibit?.resetZoom());

// ---------------------------------------------------------------- token strip (chapter 2)

function drawStrip(): void {
  if (!stage || chapter !== 2 || !gen) return;
  const ctx = hud;
  const chars = gen.prompt.split('');
  for (let k = 0; k < shownTokens; k++) {
    const t = gen.steps[k].token;
    if (t !== mode.stopToken) chars.push(mode.vocab[t]);
    else chars.push('⏎');
  }
  const bw = 26;
  const x0 = 26;
  const y0 = 14 + barH;
  ctx.save();
  ctx.font = `600 10px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(228, 196, 135, 0.85)';
  ctx.fillText('CONTEXT', x0, y0 + 10);
  for (let i = 0; i < Math.max(chars.length, stripPos + 2); i++) {
    const x = x0 + 64 + i * (bw + 4);
    const active = i === stripPos;
    const next = i === stripPos + 1;
    ctx.fillStyle = active ? 'rgba(111, 211, 255, 0.22)' : 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = active ? '#8fe0ff' : next ? 'rgba(228,196,135,0.7)' : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = active ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y0, bw, 26, 5);
    ctx.fill();
    ctx.stroke();
    ctx.font = `600 15px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = i < gen.prompt.length ? '#f6eedd' : '#8fe0ff';
    ctx.fillText(i < chars.length ? chars[i] : next ? '?' : '', x + bw / 2, y0 + 18);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

// ---------------------------------------------------------------- main loop

// ?fastclock lets a slow (software-rendered) browser keep real time, for automated screenshots.
const DT_CAP = new URLSearchParams(location.search).has('fastclock') ? 1.5 : 0.1;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(DT_CAP, (now - last) / 1000);
  last = now;
  if (chapter === 2 && hold === null && !hallOn) tickPlayer(dt);
  if (stage && exhibit && !hallOn) {
    if (hold !== null) exhibit.seek(hold);
    exhibit.frame(hold !== null ? Math.min(dt, 1 / 30) : dt);
    drawStrip();
    stage.render(now / 1000);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start

// Deep links: #gpt (calc-gpt), #tinystories, #gpt2, or ?mode=<id>.
const wanted = new URLSearchParams(location.search).get('mode') ?? location.hash.slice(1);
const linked = MODES.find((m) => m.id === wanted);
if (linked) mode = linked;
applyCopy();
buildModes();
renderProbs(null);
setChapter(location.hash === '#gpt' || linked ? 2 : 1);
// calc-gpt's weights are tiny and load at once; a big mode loads only when asked
void selectMode(isHall(mode) ? mode : MODES[0]);
requestAnimationFrame(frame);

$('valve-key').innerHTML = [
  [valveSvg(13, 13, 12, 0.3), '<b>Blue wedge</b>: how far the valve is open. That is the weight.'],
  [valveSvg(13, 13, 12, 0.65, true), '<b>Orange</b>: the valve feeds a − collector, so the weight is negative.'],
  [valveSvg(13, 13, 12, 0.5) + '<circle cx="13" cy="13" r="4.5" fill="#6fd3ff"/>', '<b>Glowing centre</b>: water is flowing through it right now.'],
]
  .map(([svg, t]) => `<div><svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">${svg}</svg><span>${t}</span></div>`)
  .join('');

setupIntro();
