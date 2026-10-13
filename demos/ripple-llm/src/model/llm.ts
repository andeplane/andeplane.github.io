/**
 * The tiny language model: a character-level MLP in the style of Bengio et al.
 * (2003) and Karpathy's makemore, trained on 32 000 first names.
 *
 *   context: the previous 3 characters ('.' marks the start and end of a name)
 *   e      = [C[c₁], C[c₂], C[c₃]]          embedding lookup        (digital)
 *   h      = tanh(W₁·[e, 1])                 16 → 31, bias folded in (water)
 *   logits = W₂·[h, 1]                       32 → 27, bias folded in (water)
 *   p      = softmax(logits)                                         (digital)
 *
 * Each matrix is cut into 8×8 tiles and every tile is a ripple tank: 8 wave-makers
 * in, 8 probes out. The "1" that carries the bias is simply a wave-maker that is
 * always driven at unit amplitude. Partial sums from tiles in the same row are
 * added digitally, as are tanh, softmax and sampling.
 */

export const VOCAB = '.abcdefghijklmnopqrstuvwxyz';
export const V = VOCAB.length;
export const CTX = 3;
export const EMB = 5;
export const HID = 31;
export const TILE = 8;
/** Lock-in gain: one unit of probe reading ↔ GAIN units of tank amplitude, for every tank. */
export const GAIN = 0.03;

export interface Weights {
  /** V × EMB */
  C: number[][];
  /** HID × (CTX·EMB + 1), bias in the last column */
  A1: number[][];
  /** V × (HID + 1), bias in the last column */
  A2: number[][];
}

export interface Tile {
  layer: 1 | 2;
  /** Row block and column block of the layer matrix. */
  r: number;
  c: number;
  /** TILE × TILE target, NaN where the tile has no probe or wave-maker in use. */
  W: number[][];
  rows: number;
  cols: number;
}

export function tilesOf(A: number[][], layer: 1 | 2): Tile[] {
  const R = A.length;
  const Cn = A[0].length;
  const out: Tile[] = [];
  for (let r = 0; r * TILE < R; r++) {
    for (let c = 0; c * TILE < Cn; c++) {
      const W: number[][] = [];
      const rows = Math.min(TILE, R - r * TILE);
      const cols = Math.min(TILE, Cn - c * TILE);
      for (let i = 0; i < TILE; i++) {
        const row: number[] = [];
        for (let j = 0; j < TILE; j++) row.push(i < rows && j < cols ? A[r * TILE + i][c * TILE + j] : NaN);
        W.push(row);
      }
      out.push({ layer, r, c, W, rows, cols });
    }
  }
  return out;
}

export function allTiles(w: Weights): Tile[] {
  return [...tilesOf(w.A1, 1), ...tilesOf(w.A2, 2)];
}

export function encode(s: string): number[] {
  return Array.from(s, (ch) => VOCAB.indexOf(ch)).filter((i) => i >= 0);
}

/** The context window for predicting the next character after `prefix` (a name in progress). */
export function contextOf(prefix: number[]): number[] {
  const ctx = [0, 0, 0, ...prefix].slice(-CTX);
  return ctx;
}

/** Layer-1 input: the three embeddings and the constant 1 for the bias. */
export function layer1Input(w: Weights, ctx: number[]): Float64Array {
  const x = new Float64Array(CTX * EMB + 1);
  ctx.forEach((c, k) => {
    for (let d = 0; d < EMB; d++) x[k * EMB + d] = w.C[c][d];
  });
  x[CTX * EMB] = 1;
  return x;
}

export function matvec(A: number[][], x: ArrayLike<number>): Float64Array {
  const y = new Float64Array(A.length);
  for (let i = 0; i < A.length; i++) {
    let s = 0;
    const row = A[i];
    for (let j = 0; j < row.length; j++) s += row[j] * x[j];
    y[i] = s;
  }
  return y;
}

export function softmax(z: ArrayLike<number>, temperature = 1): Float64Array {
  let m = -Infinity;
  for (let i = 0; i < z.length; i++) m = Math.max(m, z[i]);
  const p = new Float64Array(z.length);
  let s = 0;
  for (let i = 0; i < z.length; i++) s += p[i] = Math.exp((z[i] - m) / temperature);
  for (let i = 0; i < z.length; i++) p[i] /= s;
  return p;
}

/** Something that multiplies a layer matrix by a vector: exact digital, or water. */
export type MatMul = (layer: 1 | 2, x: Float64Array) => Float64Array;

export interface Step {
  x1: Float64Array;
  hidden: Float64Array;
  x2: Float64Array;
  logits: Float64Array;
  probs: Float64Array;
}

export function forward(w: Weights, ctx: number[], mul: MatMul): Step {
  const x1 = layer1Input(w, ctx);
  const pre = mul(1, x1);
  const hidden = pre.map(Math.tanh);
  const x2 = new Float64Array(HID + 1);
  x2.set(hidden);
  x2[HID] = 1;
  const logits = mul(2, x2);
  return { x1, hidden, x2, logits, probs: softmax(logits) };
}

export function digitalMul(w: Weights): MatMul {
  return (layer, x) => matvec(layer === 1 ? w.A1 : w.A2, x);
}

/**
 * Multiply through the tanks: each tile's in-phase transfer matrix Re(T), read with
 * the shared lock-in gain, and tile outputs in a row summed. `noise` (optional)
 * adds a random error to every probe reading, in the same units.
 */
export function waterMul(w: Weights, tiles: Tile[], Tre: ArrayLike<ArrayLike<number>>[], noise?: () => number): MatMul {
  return (layer, x) => {
    const rowsOut = layer === 1 ? w.A1.length : w.A2.length;
    const y = new Float64Array(rowsOut);
    tiles.forEach((t, k) => {
      if (t.layer !== layer) return;
      const T = Tre[k];
      for (let i = 0; i < t.rows; i++) {
        let s = 0;
        for (let j = 0; j < t.cols; j++) s += T[i][j] * x[t.c * TILE + j];
        y[t.r * TILE + i] += s / GAIN + (noise ? noise() : 0);
      }
    });
    return y;
  };
}

/** KL(p‖q) in nats. */
export function kl(p: ArrayLike<number>, q: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > 0) s += p[i] * Math.log(p[i] / Math.max(q[i], 1e-300));
  return s;
}

export function argmax(p: ArrayLike<number>): number {
  let b = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[b]) b = i;
  return b;
}

export interface Agreement {
  /** Next-letter predictions compared. */
  n: number;
  /** Fraction where water and exact arithmetic pick the same most likely letter. */
  top1: number;
  /** Mean KL(exact ‖ water) in nats. */
  kl: number;
  /** Mean cross-entropy of the true next letter, water and exact. */
  lossWater: number;
  lossExact: number;
}

/** Compare the water-run model with the exact one at every position of every name. */
export function agreement(w: Weights, names: string[], water: MatMul): Agreement {
  const exact = digitalMul(w);
  let n = 0;
  let same = 0;
  let klSum = 0;
  let lw = 0;
  let le = 0;
  for (const name of names) {
    const ids = [...encode(name), 0];
    for (let k = 0; k < ids.length; k++) {
      const ctx = contextOf(ids.slice(0, k));
      const pw = forward(w, ctx, water).probs;
      const pe = forward(w, ctx, exact).probs;
      n++;
      if (argmax(pw) === argmax(pe)) same++;
      klSum += kl(pe, pw);
      lw -= Math.log(pw[ids[k]]);
      le -= Math.log(pe[ids[k]]);
    }
  }
  return { n, top1: same / n, kl: klSum / n, lossWater: lw / n, lossExact: le / n };
}
