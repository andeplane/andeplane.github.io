import { Machine } from './model/machine.ts';
import { SCENES, sceneById, type SceneDef } from './model/scenes.ts';
import { VisualWorld } from './fluid/visual.ts';
import { View } from './render/view.ts';
import { WaterRenderer } from './render/water.ts';
import { paintBackground, paintDynamic, paintGlass, type ChartSample } from './render/paint.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = $<HTMLDivElement>('stage');
const glCanvas = $<HTMLCanvasElement>('gl');
const glassCanvas = $<HTMLCanvasElement>('glass');
const hudCanvas = $<HTMLCanvasElement>('hud');
const bgCanvas = document.createElement('canvas');
const glassCtx = glassCanvas.getContext('2d')!;
const hudCtx = hudCanvas.getContext('2d')!;
const bgCtx = bgCanvas.getContext('2d')!;

const view = new View();
let water: WaterRenderer | null = null;
try {
  water = new WaterRenderer(glCanvas, bgCanvas);
} catch (e) {
  console.warn('WebGL2 unavailable', e);
  $('nogl').hidden = false;
}

let scene: SceneDef = sceneById(location.hash.slice(1));
let machine = new Machine(scene);
let world = new VisualWorld(machine);
const valveAngles = new Map<string, number>();
let chart: ChartSample[] = [];
let lastChartT = -1;

// ------------------------------------------------------------------ UI

const tabs = $('tabs');
for (const s of SCENES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.role = 'tab';
  b.textContent = s.tab;
  b.title = s.title;
  b.dataset.id = s.id;
  b.addEventListener('click', () => setScene(s.id));
  tabs.appendChild(b);
}

const inputsEl = $('inputs');
const runBtn = $<HTMLButtonElement>('run');
const resetBtn = $<HTMLButtonElement>('reset');
const controls = new Map<string, HTMLInputElement>();

function fmtInput(v: number, step: number): string {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return v.toFixed(d);
}

function buildInputs(): void {
  inputsEl.innerHTML = '';
  controls.clear();
  for (const def of scene.inputs) {
    const row = document.createElement('div');
    row.className = 'input-row' + (def.toggle ? ' toggle' : '');
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.id = `in-${def.key}`;
    label.htmlFor = input.id;
    if (def.toggle) {
      input.type = 'checkbox';
      input.checked = machine.inputs[def.key] > 0;
      label.append(input, document.createTextNode(def.label === 'leak' ? 'open the capillary leak' : def.label));
      input.addEventListener('change', () => {
        machine.setInput(def.key, input.checked ? 1 : 0);
        afterInput();
      });
      row.append(label);
    } else {
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(machine.inputs[def.key]);
      const out = document.createElement('output');
      const sync = () => {
        out.textContent = fmtInput(Number(input.value), def.step) + (def.unit ?? '');
        input.style.setProperty('--fill', `${((Number(input.value) - def.min) / (def.max - def.min)) * 100}%`);
      };
      sync();
      input.addEventListener('input', () => {
        sync();
        machine.setInput(def.key, Number(input.value));
        afterInput();
      });
      const name = document.createElement('span');
      name.textContent = def.label;
      label.append(name, out);
      row.append(label, input);
    }
    controls.set(def.key, input);
    inputsEl.appendChild(row);
  }
}

function afterInput(): void {
  if (scene.knife) world.rebuildSegments();
}

runBtn.addEventListener('click', () => {
  machine.run();
  chart = [];
  lastChartT = -1;
});
resetBtn.addEventListener('click', () => {
  machine.reset();
  chart = [];
});

function setScene(id: string): void {
  scene = sceneById(id);
  machine = new Machine(scene);
  world = new VisualWorld(machine);
  water?.setWorld(world);
  valveAngles.clear();
  chart = [];
  $('op-title').textContent = scene.title;
  $('op-text').innerHTML = scene.text;
  for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.id === scene.id));
  buildInputs();
  repaintStatic();
  if (location.hash.slice(1) !== scene.id) history.replaceState(null, '', `#${scene.id}`);
}

// ------------------------------------------------------------------ layout

function repaintStatic(): void {
  paintBackground(bgCtx, view, scene);
  if (water) water.bgTexture.needsUpdate = true;
  paintGlass(glassCtx, view, scene);
}

function resize(): void {
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  view.fit(w, h, dpr);
  for (const c of [bgCanvas, glassCanvas, hudCanvas]) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  water?.resize(view);
  repaintStatic();
}

new ResizeObserver(resize).observe(stage);

// ------------------------------------------------------------------ result panel

const exprEl = $('expr');
const readingEl = $('reading');
const exactEl = $('exact');
const errorEl = $('error');
const statusEl = $('status');
let lastStatus = '';

function setText(el: HTMLElement, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

function updatePanel(): void {
  const m = machine;
  const r = scene.result;
  setText(exprEl, scene.expression(m.inputs));
  const reading = m.reading();
  const exact = m.exact();
  setText(readingEl, reading.toFixed(r.digits));
  setText(exactEl, Number.isInteger(exact) ? String(exact) : exact.toFixed(4));
  if (m.state === 'done') {
    const err = Math.abs(reading - exact);
    const rel = Math.abs(exact) > 1e-9 ? (err / Math.abs(exact)) * 100 : err * 100;
    setText(errorEl, rel < 0.0005 ? '< 0.001 %' : `${rel.toFixed(3)} %`);
  } else setText(errorEl, '–');

  let status = '';
  switch (m.state) {
    case 'preparing':
      status = 'Setting up: the taps fill the inputs to their set points and the result tank drains.';
      break;
    case 'ready':
      status = 'Ready. Press Run.';
      break;
    case 'running': {
      const pd = m.phaseDef;
      if (!pd) status = 'Finishing the set-up…';
      else {
        status = `${pd.title}. ${pd.text}`;
        if (pd.duration !== undefined && !m.timedClosed)
          status += ` (${Math.min(m.phaseTime, pd.duration).toFixed(1)} / ${pd.duration} s)`;
        else if (pd.duration !== undefined) status = `${pd.title}: valves shut, the last water is still falling.`;
      }
      break;
    }
    case 'done':
      status = `Settled. The ${r.label} tank reads ${reading.toFixed(r.digits)}.`;
      break;
  }
  if (status !== lastStatus) {
    statusEl.textContent = status;
    lastStatus = status;
  }
  const running = m.state === 'running';
  runBtn.disabled = running;
  runBtn.textContent = m.state === 'done' ? 'Run again' : 'Run';
  for (const def of scene.inputs) {
    const c = controls.get(def.key);
    if (c) c.disabled = running && !def.live;
  }
}

// ------------------------------------------------------------------ loop

function sampleChart(): void {
  if (!scene.chart || machine.state !== 'running' || machine.phase !== 0) return;
  const t = machine.phaseTime;
  if (t - lastChartT >= 0.05) {
    chart.push({ t, u: machine.timedClosed ? 0 : machine.inputs.u, v: machine.reading(), exact: machine.exact() });
    lastChartT = t;
  }
}

const perf = { model: 0, fluid: 0, gl: 0, hud: 0 };
let last = performance.now();
let time = 0;

function frame(now: number): void {
  const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30);
  last = now;
  time += dt;
  const t0 = performance.now();
  machine.advance(dt);
  const t1 = performance.now();
  world.update(dt);
  const t2 = performance.now();

  sampleChart();

  water?.render(time);
  const t3 = performance.now();
  paintDynamic(hudCtx, view, machine, world, valveAngles, chart, time);
  updatePanel();
  const t4 = performance.now();
  const ema = (k: keyof typeof perf, v: number) => (perf[k] = perf[k] * 0.9 + v * 0.1);
  ema('model', t1 - t0);
  ema('fluid', t2 - t1);
  ema('gl', t3 - t2);
  ema('hud', t4 - t3);
  requestAnimationFrame(frame);
}

setScene(scene.id);
resize();
requestAnimationFrame(frame);

// ------------------------------------------------------------------ scripting hook (used by tests)

declare global {
  interface Window {
    waterTanks: unknown;
  }
}

window.waterTanks = {
  scenes: SCENES.map((s) => s.id),
  setScene,
  set(key: string, value: number) {
    machine.setInput(key, value);
    const c = controls.get(key);
    if (c) {
      if (c.type === 'checkbox') c.checked = value > 0;
      else {
        c.value = String(value);
        c.dispatchEvent(new Event('input'));
      }
    }
    afterInput();
  },
  run: () => runBtn.click(),
  /** Advance model and particles together without rendering (headless capture). */
  warp(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 60) {
      machine.advance(1 / 60);
      world.update(1 / 60);
      sampleChart();
    }
  },
  /** Advance the hydraulic model without rendering, e.g. to finish a run quickly. */
  fastForward(seconds: number) {
    for (let t = 0; t < seconds && machine.state !== 'done'; t += 1 / 60) machine.advance(1 / 60);
  },
  state: () => ({
    scene: scene.id,
    state: machine.state,
    phase: machine.phase,
    reading: machine.reading(),
    exact: machine.exact(),
    particles: world.particles.count,
    perf: { ...perf },
  }),
};
