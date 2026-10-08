/**
 * The exhibit: wires the solver, the 3D tank, training and the overlay UI together.
 *
 * The tank you see is the computer. Every trial starts from still water, the
 * wave-makers play the input, the same CPU solver the training workers use
 * advances the surface, the probes record it, and at the end the trained linear
 * readout turns the recording into an answer.
 */
import * as THREE from 'three';
import { buildLayout, WaveTank } from './sim/tank.ts';
import {
  DIGIT_COLS,
  DIGIT_ROWS,
  DIGIT_SLOT,
  digitBitmap,
  digitStimulus,
  driveAt,
  extractFeatures,
  FEATURES_PER_PROBE,
  featureStart,
  paddleDisplacement,
  perturbBitmap,
  XOR_PADDLES,
  xorStimulus,
  type Stimulus,
  type TaskName,
} from './sim/tasks.ts';
import { confidence, scores } from './sim/readout.ts';
import { mulberry32 } from './sim/rng.ts';
import { TankView, type ProbeVisual } from './render/tankView.ts';
import { PLANS, trainTask, type TrainResult } from './trainer.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const errlog = $('#errlog');
window.addEventListener('error', (e) => {
  errlog.textContent += `${e.message}\n`;
});
window.addEventListener('unhandledrejection', (e) => {
  errlog.textContent += `${String(e.reason)}\n`;
});

// ------------------------------------------------------------------ world

const layout = buildLayout();
const tank = new WaveTank(layout);
const canvas = $<HTMLCanvasElement>('#view');
const view = new TankView(canvas, layout);
const P = layout.probes.length;

const BASE_STEPS_PER_SEC = 95;
const SPEEDS = [0.5, 1, 2, 4];
let speed = 1;

// ------------------------------------------------------------------ state

type Phase = 'idle' | 'calming' | 'running' | 'answer';

interface Trial {
  task: TaskName;
  stim: Stimulus;
  t: number;
  rec: Float32Array;
  truth: number;
  /** A training example being shown while the readout is still being fitted. */
  montage: boolean;
  bits?: [number, number];
  bitmap?: Uint8Array;
  inputEnd: number;
  listenFrom: number;
}

interface Prediction {
  task: TaskName;
  truth: number;
  predicted: number;
  probs: number[];
  contrib: number[];
}

let task: TaskName = 'xor';
let phase: Phase = 'idle';
let trial: Trial | null = null;
let pending: Trial | null = null;
let calmSteps = 0;
let answerAt = performance.now();
let lastPrediction: Prediction | null = null;
let autoPlay = true;
let autoIndex = 0;
let trainingTask: TaskName | null = null;
let trainDone = 0;
let trainTotal = 0;
let completedTrials = 0;
const results: Partial<Record<TaskName, TrainResult>> = {};
const trainQueue: TaskName[] = [];
const autoRand = mulberry32(4242);

const xorBits: [number, number] = [1, 0];
let padBits = digitBitmap(3);
/** The digit the pad is meant to show, when we know it (presets, auto-play). */
let padTruth: number | null = 3;

// ------------------------------------------------------------------ trials

function makeTrial(t: TaskName, montage: boolean, rand?: () => number): Trial {
  let stim: Stimulus;
  let truth: number;
  let bits: [number, number] | undefined;
  let bitmap: Uint8Array | undefined;
  if (t === 'xor') {
    bits = montage ? [Math.round(autoRand()), Math.round(autoRand())] : [xorBits[0], xorBits[1]];
    stim = xorStimulus(bits[0], bits[1], rand);
    truth = bits[0] ^ bits[1];
  } else if (montage) {
    const d = Math.floor(autoRand() * 10);
    bitmap = perturbBitmap(digitBitmap(d), autoRand);
    stim = digitStimulus(bitmap, rand);
    truth = d;
  } else {
    bitmap = padBits.slice();
    stim = digitStimulus(bitmap, rand);
    truth = padTruth ?? classifyTemplate(bitmap);
  }
  const inputEnd = Math.max(0, ...stim.bursts.map((b) => b.start + b.length));
  return {
    task: t,
    stim,
    t: 0,
    rec: new Float32Array(stim.steps * P),
    truth,
    montage,
    bits,
    bitmap,
    inputEnd,
    listenFrom: featureStart(stim.steps),
  };
}

/** Which template a drawing is closest to (for marking answers right or wrong). */
function classifyTemplate(bmp: Uint8Array): number {
  let best = -1;
  let bestD = Infinity;
  for (let d = 0; d < 10; d++) {
    const t = digitBitmap(d);
    let dist = 0;
    for (let i = 0; i < t.length; i++) dist += t[i] !== bmp[i] ? 1 : 0;
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return bestD <= 6 ? best : -1;
}

function queueTrial(t: Trial): void {
  pending = t;
  phase = 'calming';
  calmSteps = 0;
  lastPrediction = null;
  renderAnswer();
}

function startPending(): void {
  tank.reset();
  tank.extraDamping = 0;
  trial = pending;
  pending = null;
  phase = trial ? 'running' : 'idle';
  if (trial?.bits) setXorBits(trial.bits);
  if (trial?.bitmap) setPad(trial.bitmap);
}

const probeBuf = new Float32Array(P);
const probeEnergy = new Float32Array(P);

function advance(): void {
  if (phase === 'calming') {
    tank.drive.fill(0);
    tank.extraDamping = 0.035;
    tank.step();
    calmSteps++;
    if (tank.energy() < 0.05 || calmSteps > 140) startPending();
  } else if (phase === 'running' && trial) {
    driveAt(trial.stim, trial.t, tank.drive);
    tank.step();
    tank.readProbes(probeBuf);
    trial.rec.set(probeBuf, trial.t * P);
    trial.t++;
    if (trial.t >= trial.stim.steps) finishTrial();
  } else {
    tank.drive.fill(0);
    tank.step();
    tank.readProbes(probeBuf);
  }
  if (phase !== 'running') tank.readProbes(probeBuf);
  for (let p = 0; p < P; p++) probeEnergy[p] = probeEnergy[p] * 0.97 + 0.03 * probeBuf[p] * probeBuf[p];
}

function finishTrial(): void {
  if (!trial) return;
  completedTrials++;
  phase = 'answer';
  answerAt = performance.now();
  const res = results[trial.task];
  if (!res || trial.montage) {
    lastPrediction = null;
    renderAnswer();
    return;
  }
  const f = extractFeatures(trial.rec, trial.stim.steps, P);
  const s = scores(res.water, f);
  let predicted = 0;
  for (let i = 1; i < s.length; i++) if (s[i] > s[predicted]) predicted = i;
  const probs = confidence(s, trial.task === 'xor' ? 0.25 : 0.12);
  // How much each probe pushed the vote for the chosen answer.
  const w = res.water.weights[trial.task === 'xor' ? 0 : predicted];
  const sign = trial.task === 'xor' && predicted === 0 ? -1 : 1;
  const contrib = new Array(P).fill(0);
  for (let p = 0; p < P; p++) {
    for (let j = 0; j < FEATURES_PER_PROBE; j++) {
      const k = p * FEATURES_PER_PROBE + j;
      contrib[p] += sign * w[k] * ((f[k] - res.water.mean[k]) / res.water.scale[k]);
    }
  }
  lastPrediction = { task: trial.task, truth: trial.truth, predicted, probs, contrib };
  renderAnswer();
}

function nextAuto(): void {
  if (task === 'xor') {
    const seq: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const b = seq[autoIndex++ % 4];
    xorBits[0] = b[0];
    xorBits[1] = b[1];
  } else {
    const d = [3, 7, 0, 5, 2, 8, 1, 6, 4, 9][autoIndex++ % 10];
    padBits = perturbBitmap(digitBitmap(d), autoRand, 0.03, 0.25);
    padTruth = d;
  }
  queueTrial(makeTrial(task, false));
}

// ------------------------------------------------------------------ training

function enqueueTraining(t: TaskName): void {
  if (results[t] || trainingTask === t || trainQueue.includes(t)) return;
  trainQueue.push(t);
  if (!trainingTask) runTrainingQueue();
}

async function runTrainingQueue(): Promise<void> {
  while (trainQueue.length) {
    const t = trainQueue.shift()!;
    trainingTask = t;
    trainDone = 0;
    trainTotal = PLANS[t].train + PLANS[t].test;
    updateStatus();
    const res = await trainTask(t, (done, total) => {
      trainDone = done;
      trainTotal = total;
      updateStatus();
    });
    results[t] = res;
    trainingTask = null;
    console.info(
      `[ripple] ${t}: water ${(res.waterTest * 100).toFixed(1)}% test (${(res.waterTrain * 100).toFixed(1)}% train), raw ${(res.rawTest * 100).toFixed(1)}% test, ${res.examples} examples, ${res.features} features, ${res.ms.toFixed(0)} ms`,
    );
    renderScores();
    updateStatus();
    if (t === task && phase !== 'running') {
      autoIndex = 0;
      if (autoPlay) nextAuto();
    }
  }
}

// ------------------------------------------------------------------ UI: inputs

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs button'));
tabs.forEach((b) =>
  b.addEventListener('click', () => {
    const t = b.dataset.task as TaskName;
    if (t === task) return;
    task = t;
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('#xor-input').hidden = t !== 'xor';
    $('#digits-input').hidden = t !== 'digits';
    autoIndex = 0;
    lastPrediction = null;
    renderScores();
    renderAnswer();
    buildBars();
    enqueueTraining(t);
    if (results[t]) {
      if (autoPlay) nextAuto();
      else queueTrial(makeTrial(t, false));
    } else {
      queueTrial(makeTrial(t, true, autoRand));
    }
  }),
);

const bitButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.bit'));
function setXorBits(b: [number, number]): void {
  xorBits[0] = b[0];
  xorBits[1] = b[1];
  bitButtons.forEach((btn, k) => {
    btn.setAttribute('aria-pressed', String(!!xorBits[k]));
    btn.querySelector('.bit-val')!.textContent = String(xorBits[k]);
  });
}
bitButtons.forEach((btn, k) =>
  btn.addEventListener('click', () => {
    setAuto(false);
    const b: [number, number] = [xorBits[0], xorBits[1]];
    b[k] ^= 1;
    setXorBits(b);
  }),
);
setXorBits(xorBits);

const pad = $('#pad');
const pxEls: HTMLDivElement[] = [];
for (let r = 0; r < DIGIT_ROWS; r++) {
  for (let c = 0; c < DIGIT_COLS; c++) {
    const el = document.createElement('div');
    el.className = 'px';
    el.dataset.i = String(r * DIGIT_COLS + c);
    pad.appendChild(el);
    pxEls.push(el);
  }
}
function setPad(b: Uint8Array): void {
  padBits = b.slice();
  pxEls.forEach((el, i) => el.classList.toggle('on', !!padBits[i]));
}
let paintValue = -1;
pad.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest('.px') as HTMLElement | null;
  if (!el) return;
  setAuto(false);
  const i = Number(el.dataset.i);
  paintValue = padBits[i] ? 0 : 1;
  padTruth = null;
  padBits[i] = paintValue;
  setPad(padBits);
  pad.setPointerCapture(e.pointerId);
});
pad.addEventListener('pointermove', (e) => {
  if (paintValue < 0) return;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.px') as HTMLElement | null;
  if (!el || !pad.contains(el)) return;
  padBits[Number(el.dataset.i)] = paintValue;
  setPad(padBits);
});
pad.addEventListener('pointerup', () => (paintValue = -1));
pad.addEventListener('pointercancel', () => (paintValue = -1));

const presets = $('#presets');
for (let d = 1; d <= 10; d++) {
  const digit = d % 10;
  const b = document.createElement('button');
  b.textContent = String(digit);
  b.addEventListener('click', () => {
    setAuto(false);
    setPad(digitBitmap(digit));
    padTruth = digit;
  });
  presets.appendChild(b);
}
const clear = document.createElement('button');
clear.textContent = 'CLEAR';
clear.className = 'wide';
clear.addEventListener('click', () => {
  setAuto(false);
  setPad(new Uint8Array(DIGIT_COLS * DIGIT_ROWS));
  padTruth = null;
});
presets.appendChild(clear);
setPad(padBits);

const autoBox = $<HTMLInputElement>('#auto');
function setAuto(on: boolean): void {
  autoPlay = on;
  autoBox.checked = on;
}
autoBox.addEventListener('change', () => {
  autoPlay = autoBox.checked;
  if (autoPlay && phase !== 'running' && phase !== 'calming' && results[task]) nextAuto();
});

$('#send').addEventListener('click', () => {
  setAuto(false);
  queueTrial(makeTrial(task, false));
});

const speedInput = $<HTMLInputElement>('#speed');
speedInput.addEventListener('input', () => {
  speed = SPEEDS[Number(speedInput.value)];
  $('#speed-val').textContent = `${speed}×`;
});

// Tap the water between runs to make your own ripple.
let downAt: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
  downAt = null;
  if (phase === 'running' || phase === 'calming') return;
  const hit = view.pickWater(e.clientX, e.clientY);
  if (hit) tank.addDrop(hit.gx, hit.gy, 1.2, 2.2);
});

// ------------------------------------------------------------------ UI: readout

const statusEl = $('#status');
const progressEl = $('#progress');
function updateStatus(): void {
  const busy = trainingTask === task;
  progressEl.classList.toggle('on', busy);
  (progressEl.firstElementChild as HTMLElement).style.width = busy ? `${(100 * trainDone) / Math.max(1, trainTotal)}%` : '100%';
  if (busy) statusEl.textContent = `training · ${trainDone}/${trainTotal} trials`;
  else if (!results[task]) statusEl.textContent = 'queued';
  else statusEl.textContent = autoPlay ? 'trained · auto-play' : 'trained';
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function renderScores(): void {
  const r = results[task];
  $('#acc-water').textContent = r ? pct(r.waterTest) : '–';
  $('#acc-raw').textContent = r ? pct(r.rawTest) : '–';
  $('#bar-water').style.width = r ? pct(r.waterTest) : '0%';
  $('#bar-raw').style.width = r ? pct(r.rawTest) : '0%';
  const n = r ? PLANS[task].test : 0;
  const note = $('#score-note');
  if (!r) {
    note.textContent =
      task === 'xor'
        ? 'Running noisy practice trials through the tank to fit the readout…'
        : 'Running 400 noisy, shifted digits through the tank to fit the readout…';
  } else if (task === 'xor') {
    note.innerHTML = `No straight line separates XOR, so on the raw bits a linear readout is stuck at chance. Fed the <em>water's</em> response to the same bits, it gets ${pct(r.waterTest)} of ${n} unseen noisy trials right.`;
  } else {
    note.innerHTML = `Scored on ${n} unseen digits, each with flipped pixels and a one-pixel nudge. The readout never sees the picture: only how sixteen probes rippled.`;
  }
}

const answerLabel = $('#answer-label');
const answerValue = $('#answer-value');
const barsEl = $('#answer-bars');
const legendEl = $('#vote-legend');
let barEls: HTMLElement[] = [];
function buildBars(): void {
  const k = task === 'xor' ? 2 : 10;
  barsEl.innerHTML = '';
  barsEl.style.gridTemplateColumns = `repeat(${k}, 1fr)`;
  barEls = [];
  for (let i = 0; i < k; i++) {
    const b = document.createElement('div');
    b.className = 'b';
    b.innerHTML = `<i></i><span>${i}</span>`;
    barsEl.appendChild(b);
    barEls.push(b);
  }
}
buildBars();

function renderAnswer(): void {
  answerValue.classList.remove('right', 'wrong');
  const pr = lastPrediction;
  if (!pr || pr.task !== task) {
    const listening = phase === 'running' || phase === 'calming';
    answerLabel.textContent = trainingTask === task && !results[task] ? 'training example' : listening ? 'listening to the ripples…' : 'waiting for ripples';
    answerValue.textContent = trial && trial.task === task && trial.montage && phase === 'answer' ? `label ${trial.truth}` : '·';
    legendEl.hidden = true;
    barEls.forEach((b) => {
      (b.firstElementChild as HTMLElement).style.height = '2px';
      b.classList.remove('top');
    });
    return;
  }
  if (pr.task === 'xor' && trial?.bits) {
    answerLabel.textContent = `${trial.bits[0]} xor ${trial.bits[1]} — the water says`;
  } else {
    answerLabel.textContent = 'the water says this is a';
  }
  answerValue.textContent = String(pr.predicted);
  legendEl.hidden = false;
  if (pr.truth >= 0) answerValue.classList.add(pr.predicted === pr.truth ? 'right' : 'wrong');
  barEls.forEach((b, i) => {
    (b.firstElementChild as HTMLElement).style.height = `${Math.max(2, pr.probs[i] * 38)}px`;
    b.classList.toggle('top', i === pr.predicted);
  });
}

// Probe traces, drawn like a seismograph.
const traces = $<HTMLCanvasElement>('#traces');
const tctx = traces.getContext('2d')!;
const CYAN = new THREE.Color(0x66e0ff);
const GOLD = new THREE.Color(0xf2c46d);
const BLUE = new THREE.Color(0x6f8cff);

function probeColor(p: number): THREE.Color {
  const pr = lastPrediction;
  if (phase !== 'answer' || !pr || pr.task !== task) return CYAN;
  return pr.contrib[p] >= 0 ? GOLD : BLUE;
}

function drawTraces(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = traces.clientWidth;
  const h = traces.clientHeight;
  if (traces.width !== Math.round(w * dpr)) {
    traces.width = Math.round(w * dpr);
    traces.height = Math.round(h * dpr);
  }
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  tctx.clearRect(0, 0, w, h);
  if (!trial || trial.task !== task) return;
  const steps = trial.stim.steps;
  const x = (t: number) => 8 + ((w - 16) * t) / steps;
  // Input and listening windows.
  tctx.fillStyle = 'rgba(255,160,64,0.08)';
  tctx.fillRect(x(0), 0, x(trial.inputEnd) - x(0), h);
  tctx.fillStyle = 'rgba(242,196,109,0.07)';
  tctx.fillRect(x(trial.listenFrom), 0, x(steps) - x(trial.listenFrom), h);
  tctx.strokeStyle = 'rgba(242,196,109,0.18)';
  tctx.lineWidth = 1;
  for (let k = 0; k <= 8; k++) {
    const t = trial.listenFrom + ((steps - trial.listenFrom) * k) / 8;
    tctx.beginPath();
    tctx.moveTo(x(t), 4);
    tctx.lineTo(x(t), h - 4);
    tctx.stroke();
  }
  const rowH = (h - 8) / P;
  const n = Math.min(trial.t, steps);
  let peak = 0.02;
  for (let i = 0; i < n * P; i++) peak = Math.max(peak, Math.abs(trial.rec[i]));
  const gain = 1.5 / peak;
  const pr = lastPrediction;
  const maxC = pr ? Math.max(1e-6, ...pr.contrib.map(Math.abs)) : 1;
  for (let p = 0; p < P; p++) {
    const y0 = 4 + rowH * (p + 0.5);
    const c = probeColor(p);
    const a = phase === 'answer' && pr ? 0.35 + 0.65 * Math.abs(pr.contrib[p]) / maxC : 0.85;
    tctx.strokeStyle = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
    tctx.lineWidth = 1.1;
    tctx.beginPath();
    for (let t = 0; t < n; t += 1) {
      const v = Math.max(-1.6, Math.min(1.6, trial.rec[t * P + p] * gain)) * rowH * 0.5;
      if (t === 0) tctx.moveTo(x(t), y0 - v);
      else tctx.lineTo(x(t), y0 - v);
    }
    tctx.stroke();
  }
  if (phase === 'running') {
    tctx.fillStyle = 'rgba(255,255,255,0.6)';
    tctx.fillRect(x(trial.t), 2, 1.5, h - 4);
  }
}

// Paddle labels in the scene.
const labels = $('#labels');
const tagA = document.createElement('div');
const tagB = document.createElement('div');
tagA.className = tagB.className = 'tag';
tagA.textContent = 'A';
tagB.textContent = 'B';
labels.append(tagA, tagB);

function updateLabels(): void {
  const show = task === 'xor';
  [tagA, tagB].forEach((tag, k) => {
    tag.style.display = show ? '' : 'none';
    if (!show) return;
    const wp = view.paddleWorld(XOR_PADDLES[k]);
    const s = view.project(wp.x, wp.y + 0.08, wp.z);
    tag.style.left = `${s.x}px`;
    tag.style.top = `${s.y}px`;
    tag.classList.toggle('off', !xorBits[k]);
    tag.textContent = `${k === 0 ? 'A' : 'B'} = ${xorBits[k]}`;
  });
}

const timelineEls = Array.from(document.querySelectorAll<HTMLElement>('#timeline span'));
function updateTimeline(): void {
  let stage = -1;
  if (phase === 'running' && trial) {
    stage = trial.t < trial.inputEnd ? 0 : trial.t < trial.listenFrom ? 1 : 2;
  } else if (phase === 'answer') stage = 3;
  timelineEls.forEach((el, i) => {
    el.classList.toggle('on', i === stage);
    el.classList.toggle('done', stage > i);
  });
}

function updatePadCursor(): void {
  let col = -1;
  if (phase === 'running' && trial?.task === 'digits' && trial.t < trial.inputEnd) {
    col = Math.floor((trial.t - 10) / DIGIT_SLOT);
  }
  pxEls.forEach((el, i) => el.classList.toggle('now', i % DIGIT_COLS === col));
}

// ------------------------------------------------------------------ loop

const disp = new Float32Array(layout.paddles.length);
const AMBER = new THREE.Color(0xffa040);
const tints = layout.paddles.map(() => AMBER);
const probeVis: ProbeVisual[] = layout.probes.map(() => ({ level: 0, color: CYAN.clone() }));

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  // On wide screens the readout panel sits over the right of the canvas.
  // The input panel only covers the bottom-left corner, so it counts for less.
  const inset = w > 760 ? $('#readout-panel').getBoundingClientRect().width + 40 - 110 : 0;
  view.resize(w, h, inset);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let budget = 0;
let fps = 60;
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  if (now > last) fps = 1000 / ((1000 / fps) * 0.9 + 0.1 * (now - last));
  last = now;
  budget += dt * BASE_STEPS_PER_SEC * (phase === 'calming' ? 2.5 : speed) * (trial?.montage && phase === 'running' ? 2 : 1);
  const n = Math.min(Math.floor(budget), 40);
  budget = Math.min(budget - n, 2);
  for (let i = 0; i < n; i++) advance();

  if (phase === 'answer' && now - answerAt > (trial?.montage ? 600 : 3200)) {
    if (trainingTask === task && !results[task]) queueTrial(makeTrial(task, true, autoRand));
    else if (autoPlay && results[task]) nextAuto();
  }

  // Visuals.
  if (phase === 'running' && trial) paddleDisplacement(trial.stim, trial.t, disp);
  else disp.fill(0);
  const active = layout.paddles.map((_, k) => (task === 'xor' ? (XOR_PADDLES as readonly number[]).includes(k) : true));
  view.setPaddles(disp, active, tints);
  const pr = lastPrediction;
  const maxC = pr ? Math.max(1e-6, ...pr.contrib.map(Math.abs)) : 1;
  probeVis.forEach((v, p) => {
    if (phase === 'answer' && pr && pr.task === task) {
      v.color.copy(probeColor(p));
      v.level = 0.25 + 0.75 * (Math.abs(pr.contrib[p]) / maxC);
    } else {
      v.color.copy(CYAN);
      v.level = Math.min(1, Math.sqrt(probeEnergy[p]) * 9);
    }
  });
  view.setProbes(probeVis);
  view.setHeights(tank.u);
  view.render();

  updateLabels();
  updateTimeline();
  updatePadCursor();
  drawTraces();
  if (phase === 'running' || phase === 'calming') renderAnswer();
  requestAnimationFrame(frame);
}

// Expose a small read-only hook for automated checks.
(window as unknown as { __ripple: unknown }).__ripple = {
  get phase() {
    return phase;
  },
  get task() {
    return task;
  },
  get results() {
    return Object.fromEntries(
      Object.entries(results).map(([k, r]) => [
        k,
        { waterTest: r!.waterTest, waterTrain: r!.waterTrain, rawTest: r!.rawTest, rawTrain: r!.rawTrain, ms: r!.ms },
      ]),
    );
  },
  get lastPrediction() {
    return lastPrediction && { truth: lastPrediction.truth, predicted: lastPrediction.predicted };
  },
  get completedTrials() {
    return completedTrials;
  },
  get energy() {
    return tank.energy();
  },
  get fps() {
    return fps;
  },
  get trialStep() {
    return trial ? `${trial.t}/${trial.stim.steps}` : null;
  },
};

// Deep links: ?task=digits, ?speed=0..3 (index into SPEEDS).
const params = new URLSearchParams(location.search);
const speedParam = Number(params.get('speed'));
if (params.has('speed') && SPEEDS[speedParam]) {
  speedInput.value = String(speedParam);
  speedInput.dispatchEvent(new Event('input'));
}

// Start: show training examples while XOR trains, then digits trains in the background.
renderScores();
updateStatus();
enqueueTraining('xor');
enqueueTraining('digits');
queueTrial(makeTrial('xor', true, autoRand));
requestAnimationFrame(frame);
if (params.get('task') === 'digits') tabs[1].click();
