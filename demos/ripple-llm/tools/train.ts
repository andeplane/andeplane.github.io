/**
 * Train the tiny character-level name model (offline; not part of the build).
 *
 *   node --experimental-strip-types tools/train.ts
 *
 * Reads tools/corpus/names.txt (32 032 US first names from the Social Security
 * Administration's public-domain baby-name data, via Karpathy's makemore), trains
 * the MLP in src/model/llm.ts with plain backprop + Adam, and writes
 * src/data/model.json (weights plus held-out test names).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CTX, EMB, encode, HID, V, type Weights } from '../src/model/llm.ts';
import { gauss, mulberry32 } from '../src/sim/rng.ts';

const here = dirname(fileURLToPath(import.meta.url));
const names = readFileSync(join(here, 'corpus/names.txt'), 'utf8')
  .split('\n')
  .map((s) => s.trim().toLowerCase())
  .filter((s) => /^[a-z]+$/.test(s));

const rand = mulberry32(2024);
for (let i = names.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [names[i], names[j]] = [names[j], names[i]];
}
const nVal = Math.round(names.length * 0.1);
const valNames = names.slice(0, nVal);
const trainNames = names.slice(nVal);

function examples(list: string[]): { ctx: Int32Array; tgt: Int32Array } {
  const ctx: number[] = [];
  const tgt: number[] = [];
  for (const nm of list) {
    const ids = [...encode(nm), 0];
    let window = new Array(CTX).fill(0);
    for (const id of ids) {
      ctx.push(...window);
      tgt.push(id);
      window = [...window.slice(1), id];
    }
  }
  return { ctx: Int32Array.from(ctx), tgt: Int32Array.from(tgt) };
}
const tr = examples(trainNames);
const va = examples(valNames);
const nTr = tr.tgt.length;
console.log(`train ${trainNames.length} names / ${nTr} examples, val ${valNames.length} names / ${va.tgt.length}`);

const IN = CTX * EMB + 1;
const H1 = HID + 1;
// Parameters, flat.
const C = new Float64Array(V * EMB).map(() => gauss(rand) * 1.0);
const A1 = new Float64Array(HID * IN).map(() => (gauss(rand) * 1.0) / Math.sqrt(IN));
const A2 = new Float64Array(V * H1).map(() => (gauss(rand) * 0.5) / Math.sqrt(H1));
const params = [C, A1, A2];
const grads = params.map((p) => new Float64Array(p.length));
const m1 = params.map((p) => new Float64Array(p.length));
const m2 = params.map((p) => new Float64Array(p.length));
const WMAX = Number(process.env.WMAX ?? 3.5);
const DECAY = Number(process.env.DECAY ?? 1e-4);

const x = new Float64Array(IN);
const h = new Float64Array(H1);
const z = new Float64Array(V);
const dz = new Float64Array(V);
const dh = new Float64Array(H1);
const dx = new Float64Array(IN);

function forwardOne(ctx: Int32Array, o: number): void {
  for (let k = 0; k < CTX; k++) for (let d = 0; d < EMB; d++) x[k * EMB + d] = C[ctx[o + k] * EMB + d];
  x[IN - 1] = 1;
  for (let i = 0; i < HID; i++) {
    let s = 0;
    for (let j = 0; j < IN; j++) s += A1[i * IN + j] * x[j];
    h[i] = Math.tanh(s);
  }
  h[HID] = 1;
  let m = -Infinity;
  for (let i = 0; i < V; i++) {
    let s = 0;
    for (let j = 0; j < H1; j++) s += A2[i * H1 + j] * h[j];
    z[i] = s;
    if (s > m) m = s;
  }
  let sum = 0;
  for (let i = 0; i < V; i++) sum += z[i] = Math.exp(z[i] - m);
  for (let i = 0; i < V; i++) z[i] /= sum;
}

function evalLoss(set: { ctx: Int32Array; tgt: Int32Array }): number {
  let l = 0;
  for (let e = 0; e < set.tgt.length; e++) {
    forwardOne(set.ctx, e * CTX);
    l -= Math.log(z[set.tgt[e]]);
  }
  return l / set.tgt.length;
}

const STEPS = Number(process.env.STEPS ?? 40000);
const BATCH = 128;
const t0 = performance.now();
for (let step = 1; step <= STEPS; step++) {
  for (const g of grads) g.fill(0);
  let loss = 0;
  for (let b = 0; b < BATCH; b++) {
    const e = Math.floor(rand() * nTr);
    forwardOne(tr.ctx, e * CTX);
    const t = tr.tgt[e];
    loss -= Math.log(z[t]);
    for (let i = 0; i < V; i++) dz[i] = (z[i] - (i === t ? 1 : 0)) / BATCH;
    dh.fill(0);
    for (let i = 0; i < V; i++) {
      const g = dz[i];
      for (let j = 0; j < H1; j++) {
        grads[2][i * H1 + j] += g * h[j];
        dh[j] += g * A2[i * H1 + j];
      }
    }
    dx.fill(0);
    for (let i = 0; i < HID; i++) {
      const g = dh[i] * (1 - h[i] * h[i]);
      for (let j = 0; j < IN; j++) {
        grads[1][i * IN + j] += g * x[j];
        dx[j] += g * A1[i * IN + j];
      }
    }
    for (let k = 0; k < CTX; k++) for (let d = 0; d < EMB; d++) grads[0][tr.ctx[e * CTX + k] * EMB + d] += dx[k * EMB + d];
  }
  const lr = step < STEPS * 0.5 ? 0.01 : step < STEPS * 0.8 ? 0.003 : 0.001;
  params.forEach((p, k) => {
    const g = grads[k];
    for (let i = 0; i < p.length; i++) {
      const gi = g[i] + DECAY * p[i];
      m1[k][i] = 0.9 * m1[k][i] + 0.1 * gi;
      m2[k][i] = 0.999 * m2[k][i] + 0.001 * gi * gi;
      const mh = m1[k][i] / (1 - 0.9 ** step);
      const vh = m2[k][i] / (1 - 0.999 ** step);
      p[i] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
      // Keep every weight within what one tank can be designed to produce.
      if (k > 0) p[i] = Math.max(-WMAX, Math.min(WMAX, p[i]));
    }
  });
  if (step % 5000 === 0) {
    console.log(`step ${step} batch loss ${(loss / BATCH).toFixed(3)} val ${evalLoss(va).toFixed(4)} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
const trainLoss = evalLoss(tr);
const valLoss = evalLoss(va);
console.log(`final train ${trainLoss.toFixed(4)} val ${valLoss.toFixed(4)}`);

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const weights: Weights = {
  C: Array.from({ length: V }, (_, i) => Array.from(C.subarray(i * EMB, (i + 1) * EMB), r4)),
  A1: Array.from({ length: HID }, (_, i) => Array.from(A1.subarray(i * IN, (i + 1) * IN), r4)),
  A2: Array.from({ length: V }, (_, i) => Array.from(A2.subarray(i * H1, (i + 1) * H1), r4)),
};
let maxW = 0;
for (const M of [weights.A1, weights.A2]) for (const row of M) for (const v of row) maxW = Math.max(maxW, Math.abs(v));
console.log('max |weight| in tanks', maxW);

// Samples from the digital model, for a feel of the quality.
const sampleRand = mulberry32(7);
const samples: string[] = [];
for (let s = 0; s < 12; s++) {
  const ctx = new Int32Array(CTX);
  let out = '';
  for (let n = 0; n < 20; n++) {
    forwardOne(ctx, 0);
    let u = sampleRand();
    let id = 0;
    for (; id < V - 1; id++) if ((u -= z[id]) <= 0) break;
    if (id === 0) break;
    out += String.fromCharCode(96 + id);
    ctx.copyWithin(0, 1);
    ctx[CTX - 1] = id;
  }
  samples.push(out);
}
console.log(samples.join(' '));

const out = {
  about: 'Character-level MLP (context 3, embedding 5, hidden 31, tanh) trained by tools/train.ts on 32k first names (SSA public-domain data via karpathy/makemore).',
  trainLoss: r4(trainLoss),
  valLoss: r4(valLoss),
  weights,
  testNames: valNames.slice(0, 400),
};
if (!process.env.DRY) writeFileSync(join(here, '../src/data/model.json'), JSON.stringify(out));
