/**
 * Tasks: how an input becomes wave-maker motion, and how probe recordings become
 * the feature vector the linear readout sees.
 *
 * Every input is played into the tank as a set of "bursts": a paddle oscillates
 * for a few periods under a smooth (Hann) envelope. Nothing about the answer is
 * encoded anywhere except in which paddles move, and when.
 */
import { gauss, mulberry32 } from './rng.ts';
import { PADDLE_COUNT, WaveTank, type TankLayout } from './tank.ts';

/** Steps per oscillation of a wave-maker; with C²=0.36 the wavelength is ~9.6 cells. */
export const PERIOD = 16;
export const OMEGA = (2 * Math.PI) / PERIOD;
/** Peak paddle forcing per step. */
export const DRIVE_AMP = 0.2;

export interface Burst {
  paddle: number;
  start: number;
  length: number;
  amp: number;
  phase: number;
}

export interface Stimulus {
  bursts: Burst[];
  /** Total steps to simulate (input + time for the ripples to reach the probes). */
  steps: number;
}

export interface Jitter {
  /** Relative amplitude noise per burst. */
  amp: number;
  /** Onset jitter, in steps. */
  time: number;
  /** Phase noise, radians. */
  phase: number;
  /** Additive Gaussian noise on each probe sample, in units of surface height. */
  sensor: number;
}

export const NO_JITTER: Jitter = { amp: 0, time: 0, phase: 0, sensor: 0 };
export const TRAIN_JITTER: Jitter = { amp: 0.1, time: 2, phase: 0.1, sensor: 0.005 };

/** Paddle displacement for one burst at burst-local time s (zero outside the burst). */
export function burstShape(b: Burst, s: number): number {
  if (s <= 0 || s >= b.length) return 0;
  const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * s) / b.length);
  return b.amp * env * Math.sin(OMEGA * s + b.phase);
}

/**
 * The forcing each paddle applies this step. A paddle *displaces* water and then
 * returns to rest, so we force with the second time-difference of its displacement:
 * that injects no net volume and leaves no slowly rising mound behind.
 */
export function driveAt(stim: Stimulus, t: number, out: Float32Array): void {
  out.fill(0);
  const gain = DRIVE_AMP / (OMEGA * OMEGA);
  for (const b of stim.bursts) {
    const s = t - b.start;
    if (s < -1 || s > b.length + 1) continue;
    const d2 = burstShape(b, s + 1) - 2 * burstShape(b, s) + burstShape(b, s - 1);
    out[b.paddle] -= gain * d2;
  }
}

/** Current paddle displacement, for drawing the wave-makers. */
export function paddleDisplacement(stim: Stimulus, t: number, out: Float32Array): void {
  out.fill(0);
  for (const b of stim.bursts) out[b.paddle] += burstShape(b, t - b.start);
}

// ---------------------------------------------------------------- XOR

/** The two paddles that play the bits, chosen well apart. */
export const XOR_PADDLES = [1, 5] as const;
export const XOR_STEPS = 340;
const XOR_BURST = 3 * PERIOD;

export function xorStimulus(a: number, b: number, rand?: () => number, jit: Jitter = NO_JITTER): Stimulus {
  const bursts: Burst[] = [];
  const bits = [a, b];
  const r = rand ?? (() => 0.5);
  // The wave-makers share one crankshaft: timing jitter moves the whole input.
  const shift = Math.round((r() - 0.5) * 2 * jit.time);
  for (let k = 0; k < 2; k++) {
    if (!bits[k]) continue;
    bursts.push({
      paddle: XOR_PADDLES[k],
      start: 8 + shift,
      length: XOR_BURST,
      amp: 1 + (r() - 0.5) * 2 * jit.amp,
      phase: (r() - 0.5) * 2 * jit.phase,
    });
  }
  return { bursts, steps: XOR_STEPS };
}

// ---------------------------------------------------------------- Digits

/** 5×7 bitmap digits; row 0 is the top. Each row is played by one paddle. */
export const DIGIT_COLS = 5;
export const DIGIT_ROWS = 7;
const FONT: string[][] = [
  ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
];

export function digitBitmap(d: number): Uint8Array {
  const out = new Uint8Array(DIGIT_COLS * DIGIT_ROWS);
  FONT[d].forEach((row, r) => {
    for (let c = 0; c < DIGIT_COLS; c++) out[r * DIGIT_COLS + c] = row[c] === '1' ? 1 : 0;
  });
  return out;
}

/** Steps per bitmap column. */
export const DIGIT_SLOT = 2 * PERIOD;
export const DIGIT_STEPS = 10 + DIGIT_COLS * DIGIT_SLOT + 260;

/**
 * A bitmap is played like a piano roll: columns are time slots, rows are the
 * seven paddles. Each lit pixel makes its paddle oscillate during that slot.
 */
export function digitStimulus(bitmap: Uint8Array, rand?: () => number, jit: Jitter = NO_JITTER): Stimulus {
  const r = rand ?? (() => 0.5);
  const bursts: Burst[] = [];
  const shift = Math.round((r() - 0.5) * 2 * jit.time);
  for (let c = 0; c < DIGIT_COLS; c++) {
    for (let row = 0; row < DIGIT_ROWS; row++) {
      if (!bitmap[row * DIGIT_COLS + c]) continue;
      bursts.push({
        paddle: row % PADDLE_COUNT,
        start: 10 + c * DIGIT_SLOT + shift,
        length: DIGIT_SLOT,
        amp: 1 + (r() - 0.5) * 2 * jit.amp,
        phase: (r() - 0.5) * 2 * jit.phase,
      });
    }
  }
  return { bursts, steps: DIGIT_STEPS };
}

/** A noisy, hand-drawn-ish variant of a digit: a few pixels flipped, maybe a stroke thickened. */
export function perturbBitmap(src: Uint8Array, rand: () => number, flipP = 0.05, shiftP = 0.3): Uint8Array {
  let out = src.slice();
  if (rand() < shiftP) {
    // Nudge the whole drawing by one pixel, the way a hand-drawn digit wanders.
    const horizontal = rand() < 0.5;
    const dir = rand() < 0.5 ? -1 : 1;
    const moved = new Uint8Array(out.length);
    for (let r = 0; r < DIGIT_ROWS; r++) {
      for (let c = 0; c < DIGIT_COLS; c++) {
        const sr = horizontal ? r : r - dir;
        const sc = horizontal ? c - dir : c;
        if (sr >= 0 && sr < DIGIT_ROWS && sc >= 0 && sc < DIGIT_COLS) moved[r * DIGIT_COLS + c] = out[sr * DIGIT_COLS + sc];
      }
    }
    out = moved;
  }
  for (let i = 0; i < out.length; i++) if (rand() < flipP) out[i] ^= 1;
  return out;
}

// ---------------------------------------------------------------- Features

/** Number of time windows the probe recording is cut into. */
export const WINDOWS = 8;
export const FEATURES_PER_PROBE = 2 * WINDOWS;
/** Fraction of the trial before the first feature window opens. */
const FEATURE_START = 0.3;

/**
 * Turn a probe recording (steps × probes) into readout features. For each probe
 * and each time window we keep two numbers:
 *  - the ripple amplitude at the wave-maker frequency (what a lock-in amplifier on
 *    the probe would read: the magnitude, so a small timing shift does not matter), and
 *  - the mean squared height ("how bright the glints are", which is what the camera
 *    over Fernando & Sojakka's bucket effectively measured).
 * Both are nonlinear in the surface height: that, plus the interference and
 * scattering in the tank, is what lets a *linear* readout solve XOR.
 */
export function extractFeatures(rec: Float32Array, steps: number, probes: number): Float32Array {
  const f = new Float32Array(probes * FEATURES_PER_PROBE);
  const t0 = Math.floor(steps * FEATURE_START);
  const span = steps - t0;
  for (let p = 0; p < probes; p++) {
    const base = p * FEATURES_PER_PROBE;
    for (let w = 0; w < WINDOWS; w++) {
      const a = t0 + Math.floor((w * span) / WINDOWS);
      const b = t0 + Math.floor(((w + 1) * span) / WINDOWS);
      let si = 0;
      let sq = 0;
      let s2 = 0;
      for (let t = a; t < b; t++) {
        const v = rec[t * probes + p];
        si += v * Math.sin(OMEGA * t);
        sq += v * Math.cos(OMEGA * t);
        s2 += v * v;
      }
      const n = b - a;
      f[base + w] = (Math.hypot(si, sq) / n) * 10;
      f[base + WINDOWS + w] = (s2 / n) * 100;
    }
  }
  return f;
}

/** The step at which the readout starts listening (for drawing the timeline). */
export function featureStart(steps: number): number {
  return Math.floor(steps * FEATURE_START);
}

/**
 * Run one trial from still water and return the probe recording. `onStep` lets a
 * caller (the renderer) watch the tank as it goes; the training worker passes none.
 */
export function runTrial(
  tank: WaveTank,
  stim: Stimulus,
  sensorNoise = 0,
  rand?: () => number,
): Float32Array {
  const probes = tank.layout.probes.length;
  const rec = new Float32Array(stim.steps * probes);
  const buf = new Float32Array(probes);
  tank.reset();
  for (let t = 0; t < stim.steps; t++) {
    driveAt(stim, t, tank.drive);
    tank.step();
    tank.readProbes(buf);
    for (let p = 0; p < probes; p++) {
      rec[t * probes + p] = buf[p] + (sensorNoise && rand ? sensorNoise * gauss(rand) : 0);
    }
  }
  return rec;
}

export interface Sample {
  /** Water features (what the readout is trained on). */
  x: Float32Array;
  /** The raw input itself, for the "no water" baseline. */
  raw: Float32Array;
  label: number;
}

export type TaskName = 'xor' | 'digits';

export const TASK_CLASSES: Record<TaskName, number> = { xor: 2, digits: 10 };

/** Build one jittered sample for a task. `index` cycles through the classes. */
export function makeSample(
  task: TaskName,
  tank: WaveTank,
  index: number,
  rand: () => number,
  jit: Jitter = TRAIN_JITTER,
): Sample {
  const probes = tank.layout.probes.length;
  if (task === 'xor') {
    const a = index & 1;
    const b = (index >> 1) & 1;
    const stim = xorStimulus(a, b, rand, jit);
    const rec = runTrial(tank, stim, jit.sensor, rand);
    const raw = Float32Array.from([a + jit.sensor * gauss(rand), b + jit.sensor * gauss(rand)]);
    return { x: extractFeatures(rec, stim.steps, probes), raw, label: a ^ b };
  }
  const d = index % 10;
  const bmp = jit === NO_JITTER ? digitBitmap(d) : perturbBitmap(digitBitmap(d), rand);
  const stim = digitStimulus(bmp, rand, jit);
  const rec = runTrial(tank, stim, jit.sensor, rand);
  return { x: extractFeatures(rec, stim.steps, probes), raw: Float32Array.from(bmp), label: d };
}

export function sampleSeed(seed: number, index: number): number {
  return (Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
}

/** Examples `first .. first+count-1` of a dataset; each has its own noise seed. */
export function makeDataset(task: TaskName, tank: WaveTank, count: number, seed: number, first = 0): Sample[] {
  const out: Sample[] = [];
  for (let i = first; i < first + count; i++) out.push(makeSample(task, tank, i, mulberry32(sampleSeed(seed, i))));
  return out;
}

export function trialSteps(task: TaskName): number {
  return task === 'xor' ? XOR_STEPS : DIGIT_STEPS;
}

export type { TankLayout };
