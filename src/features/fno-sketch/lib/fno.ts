// One Fourier Neural Operator layer on a 5×5 periodic grid, written out the
// way a student's notebook page draws it: lift P, DFT per channel, keep the
// low modes, mix channels with R(k), inverse DFT, add the local path W, σ,
// then project with Q. Pure maths, no React and no `@/` imports, so the tests
// can run it under `node --experimental-strip-types`.
//
// Conventions (also stated on the page):
// - grid points x1 = i/5, x2 = j/5, i = row, j = column, pixel = i*5 + j;
// - tensors are arrays of pixels, each pixel an array of channels;
// - frequencies k1, k2 ∈ {−2..2}; mode index = (k1 mod 5)*5 + (k2 mod 5);
// - forward DFT unnormalized, inverse with 1/N, N = 25.

export type Complex = { re: number; im: number };
export type Activation = 'relu' | 'gelu';
export type Mode = readonly [number, number];

export const SIZE = 5;
export const N = SIZE * SIZE;
export const D_A = 4;
export const D_U = 1;
export const FREQS = [-2, -1, 0, 1, 2] as const;
export const HALF_K2 = [0, 1, 2] as const;

// ---------------------------------------------------------------- complex

export const cx = (re: number, im = 0): Complex => ({ re, im });
export const ZERO: Complex = { re: 0, im: 0 };
export const cadd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const csub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const cmul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
export const cscale = (a: Complex, s: number): Complex => ({ re: a.re * s, im: a.im * s });
export const cconj = (a: Complex): Complex => ({ re: a.re, im: -a.im });
export const cabs = (a: Complex): number => Math.hypot(a.re, a.im);
export const carg = (a: Complex): number => Math.atan2(a.im, a.re);

// ---------------------------------------------------------------- indexing

const mod5 = (k: number) => ((k % SIZE) + SIZE) % SIZE;
export const pixelIndex = (i: number, j: number) => i * SIZE + j;
export const pixelOf = (p: number): [number, number] => [Math.floor(p / SIZE), p % SIZE];
export const modeIndex = (k1: number, k2: number) => mod5(k1) * SIZE + mod5(k2);

/** k1·i + k2·j mod 5: on a 5-grid a mode has only five distinct phases. */
export const phaseClass = (k1: number, k2: number, i: number, j: number) => mod5(k1 * i + k2 * j);

/** e^{sign·2πi(k1 i + k2 j)/5}; sign −1 for the forward transform, +1 for the inverse. */
export function twiddle(k1: number, k2: number, i: number, j: number, sign: 1 | -1): Complex {
  const theta = (sign * 2 * Math.PI * phaseClass(k1, k2, i, j)) / SIZE;
  return { re: Math.cos(theta), im: Math.sin(theta) };
}

/** The drawn half-plane (rfft layout) holds k2 ≥ 0; within k2 = 0 the canonical cell has k1 ≥ 0. */
export const isCanonical = (k1: number, k2: number) => k2 > 0 || (k2 === 0 && k1 >= 0);
/** The mode that represents (k1,k2) in the drawn half-plane: itself or its conjugate partner. */
export const canonical = (k1: number, k2: number): Mode =>
  isCanonical(k1, k2) ? [k1, k2] : [-k1 === 0 ? 0 : -k1, -k2 === 0 ? 0 : -k2];

// ---------------------------------------------------------------- random

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------- input

/** Temperature T(i,j) ∈ [0,1]: a smooth periodic field with seeded phases, rounded to 2 decimals. */
export function makeField(seed: number): number[] {
  const rng = mulberry32(seed * 7919 + 17);
  const phi1 = rng();
  const phi2 = rng();
  return Array.from({ length: N }, (_, p) => {
    const [i, j] = pixelOf(p);
    return round2(
      0.5 + 0.25 * Math.cos(2 * Math.PI * (i / SIZE + phi1)) + 0.25 * Math.cos(2 * Math.PI * (j / SIZE + phi2)),
    );
  });
}

/** Outer ring = 1 (boundary), interior = 0. */
export function defaultMask(): number[] {
  return Array.from({ length: N }, (_, p) => {
    const [i, j] = pixelOf(p);
    return i === 0 || j === 0 || i === SIZE - 1 || j === SIZE - 1 ? 1 : 0;
  });
}

/** a(x) = [T, mask, x1, x2] at every pixel. */
export function makeInput(T: readonly number[], mask: readonly number[]): number[][] {
  return Array.from({ length: N }, (_, p) => {
    const [i, j] = pixelOf(p);
    return [T[p], mask[p], i / SIZE, j / SIZE];
  });
}

// ---------------------------------------------------------------- weights

export type Weights = {
  dv: number;
  /** dv × 4 */
  P: number[][];
  bP: number[];
  /** R[modeIndex(k1,k2)] is a dv × dv complex matrix, for all 25 modes, symmetry applied. */
  R: Complex[][][];
  /** dv × dv */
  W: number[][];
  bW: number[];
  /** 1 × dv (d_u = 1) */
  Q: number[];
  bQ: number;
};

/**
 * Deterministic weights. Draw order: P, b_P, R (15 half-plane cells, k1 = −2..2 then
 * k2 = 0..2, each entry real then imaginary), W, b_W, Q, b_Q. R is drawn for all 15
 * cells whatever the truncation, so moving K never changes a surviving mode's R.
 * Then R(k1,0) := conj R(−k1,0) for k1 < 0, R(0,0) is made real, and
 * R(k) := conj R(−k) for k2 < 0.
 */
export function makeWeights(seed: number, dv: number): Weights {
  const rng = mulberry32(seed);
  const u = (scale: number) => (rng() * 2 - 1) * scale;
  const matrix = (rows: number, cols: number, scale: number) =>
    Array.from({ length: rows }, () => Array.from({ length: cols }, () => u(scale)));

  const P = matrix(dv, D_A, 1 / Math.sqrt(D_A));
  const bP = Array.from({ length: dv }, () => u(0.1));
  const R: Complex[][][] = new Array(N);
  for (const k1 of FREQS) {
    for (const k2 of HALF_K2) {
      R[modeIndex(k1, k2)] = Array.from({ length: dv }, () =>
        Array.from({ length: dv }, () => {
          const re = u(1 / dv);
          const im = u(1 / dv);
          return { re, im };
        }),
      );
    }
  }
  const W = matrix(dv, dv, 1 / Math.sqrt(dv));
  const bW = Array.from({ length: dv }, () => u(0.1));
  const Q = Array.from({ length: dv }, () => u(1 / Math.sqrt(dv)));
  const bQ = u(0.1);

  R[modeIndex(0, 0)] = R[modeIndex(0, 0)].map((row) => row.map((z) => ({ re: z.re, im: 0 })));
  for (const k1 of FREQS) {
    for (const k2 of FREQS) {
      if (isCanonical(k1, k2)) continue;
      R[modeIndex(k1, k2)] = R[modeIndex(-k1, -k2)].map((row) => row.map(cconj));
    }
  }
  return { dv, P, bP, R, W, bW, Q, bQ };
}

/** R(k) = I for every k (the identity check). */
export function identityR(dv: number): Complex[][][] {
  const I = Array.from({ length: dv }, (_, r) => Array.from({ length: dv }, (_, c) => cx(r === c ? 1 : 0)));
  return Array.from({ length: N }, () => I);
}

// ---------------------------------------------------------------- the layer

export const matVec = (M: readonly (readonly number[])[], x: readonly number[], b?: readonly number[]) =>
  M.map((row, r) => row.reduce((s, m, c) => s + m * x[c], b ? b[r] : 0));

export const matVecC = (M: readonly (readonly Complex[])[], x: readonly Complex[]) =>
  M.map((row) => row.reduce((s, m, c) => cadd(s, cmul(m, x[c])), ZERO));

/** v(x) = P a(x) + b_P, per pixel. */
export function lift(a: readonly (readonly number[])[], P: readonly (readonly number[])[], bP: readonly number[]) {
  return a.map((ax) => matVec(P, ax, bP));
}

/** v̂(k1,k2,c) = Σ_i Σ_j v(i,j,c) e^{−2πi(k1 i + k2 j)/5}, indexed [modeIndex][channel]. */
export function dft2(v: readonly (readonly number[])[]): Complex[][] {
  const C = v[0].length;
  const out: Complex[][] = new Array(N);
  for (const k1 of FREQS) {
    for (const k2 of FREQS) {
      const acc = Array.from({ length: C }, () => ({ re: 0, im: 0 }));
      for (let p = 0; p < N; p++) {
        const [i, j] = pixelOf(p);
        const w = twiddle(k1, k2, i, j, -1);
        for (let c = 0; c < C; c++) {
          acc[c].re += v[p][c] * w.re;
          acc[c].im += v[p][c] * w.im;
        }
      }
      out[modeIndex(k1, k2)] = acc;
    }
  }
  return out;
}

/** The 25 terms v(i,j,c)·e^{−2πi(k1 i + k2 j)/5} whose sum is v̂(k,c), in pixel order. */
export function phasorTerms(v: readonly (readonly number[])[], c: number, k1: number, k2: number): Complex[] {
  return Array.from({ length: N }, (_, p) => {
    const [i, j] = pixelOf(p);
    return cscale(twiddle(k1, k2, i, j, -1), v[p][c]);
  });
}

/** The symmetric box |k1| ≤ K1, |k2| ≤ K2 (closed under k → −k). */
export function keptModes(K1: number, K2: number): Mode[] {
  const out: Mode[] = [];
  for (let k1 = -K1; k1 <= K1; k1++) for (let k2 = -K2; k2 <= K2; k2++) out.push([k1, k2]);
  return out;
}

export const isKept = (K1: number, K2: number, k1: number, k2: number) => Math.abs(k1) <= K1 && Math.abs(k2) <= K2;

/**
 * Zero-pad, mix and invert: (Kv)(i,j,:) = (1/25) Σ_{k∈kept} R(k) v̂(k,:) e^{+2πi(k1 i + k2 j)/5}.
 * Returns the mixed spectrum (zero outside the kept set), the real part of the inverse,
 * and the largest imaginary part that was dropped (rounding error only).
 */
export function spectralPath(vhat: readonly (readonly Complex[])[], R: readonly (readonly (readonly Complex[])[])[], kept: readonly Mode[]) {
  const C = vhat[0].length;
  const mixed: Complex[][] = Array.from({ length: N }, () => Array.from({ length: C }, () => ZERO));
  for (const [k1, k2] of kept) mixed[modeIndex(k1, k2)] = matVecC(R[modeIndex(k1, k2)], vhat[modeIndex(k1, k2)]);
  let maxImag = 0;
  const out = Array.from({ length: N }, (_, p) => {
    const [i, j] = pixelOf(p);
    const acc = Array.from({ length: C }, () => ({ re: 0, im: 0 }));
    for (const [k1, k2] of kept) {
      const w = twiddle(k1, k2, i, j, 1);
      const m = mixed[modeIndex(k1, k2)];
      for (let c = 0; c < C; c++) {
        acc[c].re += m[c].re * w.re - m[c].im * w.im;
        acc[c].im += m[c].re * w.im + m[c].im * w.re;
      }
    }
    return acc.map((z) => {
      maxImag = Math.max(maxImag, Math.abs(z.im / N));
      return z.re / N;
    });
  });
  return { mixed, out, maxImag };
}

export const relu = (x: number) => (x > 0 ? x : 0);
/** GELU, tanh approximation (JavaScript has no erf). */
export const gelu = (x: number) => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
export const activate = (kind: Activation, x: number) => (kind === 'relu' ? relu(x) : gelu(x));

/** Circular shift: out(i + s1, j + s2) = v(i, j). */
export function roll<T>(v: readonly T[], s1: number, s2: number): T[] {
  const out: T[] = new Array(N);
  for (let p = 0; p < N; p++) {
    const [i, j] = pixelOf(p);
    out[pixelIndex(mod5(i + s1), mod5(j + s2))] = v[p];
  }
  return out;
}

export type LayerOptions = { K1: number; K2: number; activation: Activation; identity: boolean };

export type LayerResult = {
  a: number[][];
  v: number[][];
  vhat: Complex[][];
  kept: Mode[];
  R: Complex[][][];
  mixed: Complex[][];
  spectralOut: number[][];
  maxImag: number;
  /** max |Kv − v|; the round-trip error when `identity` is on. */
  roundTrip: number;
  /** W v + b_W */
  local: number[][];
  /** W v + b_W + Kv */
  preAct: number[][];
  next: number[][];
  u: number[];
};

/** One full forward pass, returning every intermediate array the page shows. */
export function fnoLayer(
  input: { T: readonly number[]; mask: readonly number[] },
  w: Weights,
  opts: LayerOptions,
): LayerResult {
  const a = makeInput(input.T, input.mask);
  const v = lift(a, w.P, w.bP);
  const vhat = dft2(v);
  const kept = opts.identity ? keptModes(2, 2) : keptModes(opts.K1, opts.K2);
  const R = opts.identity ? identityR(w.dv) : w.R;
  const { mixed, out: spectralOut, maxImag } = spectralPath(vhat, R, kept);
  let roundTrip = 0;
  for (let p = 0; p < N; p++)
    for (let c = 0; c < w.dv; c++) roundTrip = Math.max(roundTrip, Math.abs(spectralOut[p][c] - v[p][c]));
  const local = v.map((vx) => matVec(w.W, vx, w.bW));
  const preAct = local.map((l, p) => l.map((x, c) => x + spectralOut[p][c]));
  const next = preAct.map((z) => z.map((x) => activate(opts.activation, x)));
  const u = next.map((z) => z.reduce((s, x, c) => s + w.Q[c] * x, w.bQ));
  return { a, v, vhat, kept, R, mixed, spectralOut, maxImag, roundTrip, local, preAct, next, u };
}

// ---------------------------------------------------------------- display

const MINUS = '−';

/** Real number with 2 decimals, a true minus sign and no "−0.00". */
export function fmt(x: number, digits = 2): string {
  const s = x.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.replace('-', MINUS);
}

/** a ± bi with 2 decimals. */
export function fmtC(z: Complex, digits = 2): string {
  const im = fmt(Math.abs(z.im), digits);
  const negative = z.im < 0 && Number(im) !== 0;
  return `${fmt(z.re, digits)} ${negative ? MINUS : '+'} ${im}i`;
}

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** 4.4 × 10⁻¹⁶ */
export function fmtSci(x: number): string {
  if (x === 0) return '0';
  const [mantissa, exponent] = x.toExponential(1).split('e');
  const e = String(Number(exponent)).split('').map((ch) => SUPERSCRIPT[ch] ?? ch).join('');
  return `${mantissa.replace('-', MINUS)} × 10${e}`;
}

/** Largest |value| in a list, never 0 (used as a colour scale). */
export const maxAbs = (values: readonly number[]) => values.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;

/**
 * Diverging "coloured pencil" map for cell fills: negative → blue, positive → green,
 * zero → transparent (the paper shows through). Pink and orange are kept free for the
 * selection highlights. Returns a CSS rgba() string.
 */
export function colour(value: number, scale: number): string {
  const t = Math.max(-1, Math.min(1, scale > 0 ? value / scale : 0));
  const alpha = Math.round(Math.pow(Math.abs(t), 0.85) * 0.72 * 1000) / 1000;
  const [r, g, b] = t < 0 ? [84, 136, 236] : [64, 182, 132];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Cells in the drawn half-plane: rows k1 = −K1..K1, columns k2 = 0..K2. */
export const halfPlaneCells = (K1: number, K2: number) => (2 * K1 + 1) * (K2 + 1);
/** Independent complex modes kept (the k2 = 0, k1 < 0 cells are mirrors). */
export const independentModes = (K1: number, K2: number) => halfPlaneCells(K1, K2) - K1;
