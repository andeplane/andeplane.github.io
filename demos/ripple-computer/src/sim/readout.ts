/**
 * The only trained part of the computer: a linear readout.
 *
 * One weight vector per class, fitted by ridge regression to ±1 targets
 * (one-vs-rest), prediction = argmax of the scores. Features are standardised
 * with the training-set mean and spread first. Solved in closed form with a
 * Cholesky factorisation; no iterative training, no hidden layers.
 */

export interface Readout {
  mean: Float64Array;
  scale: Float64Array;
  /** classes × (features + 1), last column is the bias. */
  weights: Float64Array[];
  classes: number;
}

export function trainReadout(xs: ArrayLike<number>[], labels: number[], classes: number, lambda = 1e-2): Readout {
  const n = xs.length;
  const f = xs[0].length;
  const mean = new Float64Array(f);
  const scale = new Float64Array(f);
  for (const x of xs) for (let j = 0; j < f; j++) mean[j] += x[j] / n;
  for (const x of xs) for (let j = 0; j < f; j++) scale[j] += (x[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < f; j++) scale[j] = Math.sqrt(scale[j]) + 1e-6;

  const d = f + 1;
  const z = xs.map((x) => standardise(x, mean, scale));
  // Normal equations A = ZᵀZ + λnI (bias unregularised), B = ZᵀY.
  const A = new Float64Array(d * d);
  for (const row of z) {
    for (let i = 0; i < d; i++) {
      const ri = row[i];
      if (ri === 0) continue;
      for (let j = 0; j <= i; j++) A[i * d + j] += ri * row[j];
    }
  }
  for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) A[j * d + i] = A[i * d + j];
  for (let i = 0; i < f; i++) A[i * d + i] += lambda * n;
  A[f * d + f] += 1e-9;
  const L = cholesky(A, d);

  const weights: Float64Array[] = [];
  const k = classes === 2 ? 1 : classes;
  for (let c = 0; c < k; c++) {
    const b = new Float64Array(d);
    z.forEach((row, s) => {
      const target = classes === 2 ? (labels[s] === 1 ? 1 : -1) : labels[s] === c ? 1 : -1;
      for (let i = 0; i < d; i++) b[i] += row[i] * target;
    });
    weights.push(cholSolve(L, d, b));
  }
  return { mean, scale, weights, classes };
}

function standardise(x: ArrayLike<number>, mean: Float64Array, scale: Float64Array): Float64Array {
  const f = mean.length;
  const out = new Float64Array(f + 1);
  for (let j = 0; j < f; j++) out[j] = (x[j] - mean[j]) / scale[j];
  out[f] = 1;
  return out;
}

/** Raw scores, one per class (for two classes: [−s, s]). */
export function scores(r: Readout, x: ArrayLike<number>): number[] {
  const z = standardise(x, r.mean, r.scale);
  const s = r.weights.map((w) => {
    let acc = 0;
    for (let i = 0; i < z.length; i++) acc += w[i] * z[i];
    return acc;
  });
  return r.classes === 2 ? [-s[0], s[0]] : s;
}

export function predict(r: Readout, x: ArrayLike<number>): number {
  const s = scores(r, x);
  let best = 0;
  for (let i = 1; i < s.length; i++) if (s[i] > s[best]) best = i;
  return best;
}

export function accuracy(r: Readout, xs: ArrayLike<number>[], labels: number[]): number {
  let ok = 0;
  xs.forEach((x, i) => {
    if (predict(r, x) === labels[i]) ok++;
  });
  return ok / xs.length;
}

/** Softmax of scores with a temperature, for a friendly confidence bar. */
export function confidence(s: number[], temp = 0.35): number[] {
  const m = Math.max(...s);
  const e = s.map((v) => Math.exp((v - m) / temp));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

function cholesky(A: Float64Array, d: number): Float64Array {
  const L = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * d + j];
      for (let k = 0; k < j; k++) s -= L[i * d + k] * L[j * d + k];
      if (i === j) L[i * d + i] = Math.sqrt(Math.max(s, 1e-12));
      else L[i * d + j] = s / L[j * d + j];
    }
  }
  return L;
}

function cholSolve(L: Float64Array, d: number, b: Float64Array): Float64Array {
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * d + k] * y[k];
    y[i] = s / L[i * d + i];
  }
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < d; k++) s -= L[k * d + i] * x[k];
    x[i] = s / L[i * d + i];
  }
  return x;
}
