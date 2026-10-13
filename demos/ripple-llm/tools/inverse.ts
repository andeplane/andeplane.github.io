/**
 * Inverse design of a ripple tank's floor so that its transfer matrix computes W.
 *
 * Design variable: an unconstrained field θ on the grid. The floor is
 *
 *   ρ = blur(θ)                       (a smooth, sculptable seabed)
 *   c² = C2_DEEP − mask · (C2_DEEP − C2_SHALLOW) · sigmoid(ρ)
 *
 * so the depth stays between "shallow" and "deep" and the strips at the
 * wave-makers and probes stay deep and flat.
 *
 * Objective, for target W (M×N) and the fixed lock-in gain G shared by every tank:
 *
 *   J = Σᵢⱼ rᵢⱼ²,   rᵢⱼ = (Re Tᵢⱼ − G·Wᵢⱼ) / (G ‖W‖)
 *
 * Derivatives by the adjoint method. With Uⱼ = A⁻¹Fⱼ (one solve per wave-maker) and
 * λᵢ = A⁻ᵀeᵢ = A⁻¹eᵢ (one solve per probe; A is complex symmetric), the derivative
 * of Tᵢⱼ with respect to the weight w of the face between cells a and b is
 *
 *   ∂Tᵢⱼ/∂w = −(λᵢ[a] − λᵢ[b])(Uⱼ[a] − Uⱼ[b]),
 *
 * so one factorisation and N + M back-substitutions give the full Jacobian of all
 * M·N residuals. There are thousands of cells and only M·N targets, so
 * Levenberg–Marquardt in its minimum-norm form converges in about ten steps.
 */
import { C2_DEEP, C2_SHALLOW, makeSpec, NX, NY, PADDLE_X, PROBE_X, probeCells, type TankSpec } from '../src/sim/tank.ts';
import { Helmholtz, paddleForcing } from '../src/sim/helmholtz.ts';
import { gauss, mulberry32 } from '../src/sim/rng.ts';

export const BLUR_SIGMA = 1.6;

export function designMask(nx = NX, ny = NY): Float64Array {
  const m = new Float64Array(nx * ny);
  const x0 = PADDLE_X + 5;
  const x1 = PROBE_X - 4;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const ax = Math.min(1, Math.max(0, (x - x0) / 4), Math.max(0, (x1 - x) / 4));
      const ay = Math.min(1, Math.max(0, (y - 3) / 4), Math.max(0, (ny - 4 - y) / 4));
      const s = ax * ay;
      m[y * nx + x] = s * s * (3 - 2 * s);
    }
  }
  return m;
}

function gaussKernel(sigma: number): Float64Array {
  const r = Math.ceil(3 * sigma);
  const k = new Float64Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp((-0.5 * i * i) / (sigma * sigma));
  return k.map((v) => v / s);
}

/** Separable Gaussian blur with clamped edges' mass dropped (self-adjoint). */
export function blur(src: Float64Array, nx: number, ny: number, sigma = BLUR_SIGMA): Float64Array {
  const k = gaussKernel(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float64Array(nx * ny);
  const out = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let s = 0;
      for (let t = -r; t <= r; t++) {
        const xx = x + t;
        if (xx >= 0 && xx < nx) s += k[t + r] * src[y * nx + xx];
      }
      tmp[y * nx + x] = s;
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let s = 0;
      for (let t = -r; t <= r; t++) {
        const yy = y + t;
        if (yy >= 0 && yy < ny) s += k[t + r] * tmp[yy * nx + x];
      }
      out[y * nx + x] = s;
    }
  }
  return out;
}

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

export function floorFromTheta(theta: Float64Array, mask: Float64Array, nx = NX, ny = NY): Float32Array {
  const rho = blur(theta, nx, ny);
  const c2 = new Float32Array(nx * ny);
  for (let i = 0; i < c2.length; i++) c2[i] = C2_DEEP - mask[i] * (C2_DEEP - C2_SHALLOW) * sigmoid(rho[i]);
  return c2;
}

/** Quantise c² to 16 bits, the stored form; designs are always evaluated quantised. */
export function quantise(c2: Float32Array): Uint16Array {
  return Uint16Array.from(c2, (v) => Math.round(((v - C2_SHALLOW) / (C2_DEEP - C2_SHALLOW)) * 65535));
}
export function dequantise(q: Uint16Array): Float32Array {
  return Float32Array.from(q, (v) => C2_SHALLOW + (v / 65535) * (C2_DEEP - C2_SHALLOW));
}

export interface DesignOptions {
  gain: number;
  iters: number;
  seed: number;
  /** Largest change of θ in one step. */
  lr?: number;
  log?: (it: number, loss: number) => void;
}

/** Residuals r = (Re T − G·W)/√norm and their Jacobian with respect to c² per cell. */
export function jacobian(spec: TankSpec, W: number[][], gain: number) {
  const { nx, ny } = spec;
  const n = nx * ny;
  const M = W.length;
  const N = W[0].length;
  const h = new Helmholtz(spec);
  const forcing = paddleForcing(spec);
  const probes = probeCells(spec);
  const col = (i: number) => (i % nx) * ny + Math.floor(i / nx);
  const U: { re: Float64Array; im: Float64Array }[] = [];
  for (let j = 0; j < N; j++) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const f = forcing[j];
    for (let i = 0; i < n; i++) if (f[i] !== 0) re[col(i)] = f[i];
    h.solveCol(re, im);
    U.push({ re, im });
  }
  const lam: { re: Float64Array; im: Float64Array }[] = [];
  for (let i = 0; i < M; i++) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    re[col(probes[i])] = 1;
    h.solveCol(re, im);
    lam.push({ re, im });
  }
  let norm = 0;
  // NaN entries are "don't care": an unused probe or wave-maker in a tile.
  const pairs: [number, number][] = [];
  for (let i = 0; i < M; i++) for (let j = 0; j < N; j++) if (Number.isFinite(W[i][j])) pairs.push([i, j]);
  for (const [i, j] of pairs) norm += W[i][j] * W[i][j];
  norm = Math.max(norm, 1e-6) * gain * gain;
  const sq = Math.sqrt(norm);
  const r = new Float64Array(pairs.length);
  const Tre: number[][] = [];
  const Tim: number[][] = [];
  for (let i = 0; i < M; i++) {
    const pc = col(probes[i]);
    Tre.push([]);
    Tim.push([]);
    for (let j = 0; j < N; j++) {
      Tre[i].push(U[j].re[pc]);
      Tim[i].push(U[j].im[pc]);
    }
  }
  pairs.forEach(([i, j], p) => (r[p] = (Tre[i][j] - gain * W[i][j]) / sq));
  // Face differences of every field; J[ij, cell] = −Re(Δλᵢ·ΔUⱼ)/√norm, half to each cell.
  const dif = (v: { re: Float64Array; im: Float64Array }) => {
    const eR = new Float64Array(n);
    const eI = new Float64Array(n);
    const nR = new Float64Array(n);
    const nI = new Float64Array(n);
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) {
        const k = x * ny + y;
        if (x < nx - 1) {
          eR[k] = v.re[k] - v.re[k + ny];
          eI[k] = v.im[k] - v.im[k + ny];
        }
        if (y < ny - 1) {
          nR[k] = v.re[k] - v.re[k + 1];
          nI[k] = v.im[k] - v.im[k + 1];
        }
      }
    }
    return { eR, eI, nR, nI };
  };
  const dU = U.map(dif);
  const dL = lam.map(dif);
  const J: Float64Array[] = [];
  for (const [i, j] of pairs) {
    {
      const a = dL[i];
      const b = dU[j];
      const row = new Float64Array(n);
      for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) {
          const k = x * ny + y;
          const cell = y * nx + x;
          if (x < nx - 1) {
            const g = (-0.5 * (a.eR[k] * b.eR[k] - a.eI[k] * b.eI[k])) / sq;
            row[cell] += g;
            row[cell + 1] += g;
          }
          if (y < ny - 1) {
            const g = (-0.5 * (a.nR[k] * b.nR[k] - a.nI[k] * b.nI[k])) / sq;
            row[cell] += g;
            row[cell + nx] += g;
          }
        }
      }
      J.push(row);
    }
  }
  return { r, J, Tre, Tim };
}

/** Solve the small dense SPD system (A + μI) x = b by Cholesky. */
function cholSolve(A: Float64Array, m: number, mu: number, b: Float64Array): Float64Array {
  const L = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * m + j] + (i === j ? mu : 0);
      for (let k = 0; k < j; k++) s -= L[i * m + k] * L[j * m + k];
      L[i * m + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j * m + j];
    }
  }
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * m + k] * y[k];
    y[i] = s / L[i * m + i];
  }
  for (let i = m - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < m; k++) s -= L[k * m + i] * y[k];
    y[i] = s / L[i * m + i];
  }
  return y;
}

export interface LMResult {
  c2q: Uint16Array;
  loss: number;
  history: number[];
  theta: Float64Array;
}

/**
 * Levenberg–Marquardt in its minimum-norm form. There is far more design freedom
 * (one value per cell) than there are targets (M·N matrix entries), so each step
 * solves the small system (J Jᵀ + μI) z = r and moves θ by −Jᵀz.
 */
export function designLM(W: number[][], opts: DesignOptions & { theta0?: Float64Array; target?: number }): LMResult {
  const M = W.length;
  const N = W[0].length;
  const nx = NX;
  const ny = NY;
  const n = nx * ny;
  const mask = designMask(nx, ny);
  let theta: Float64Array;
  if (opts.theta0) theta = opts.theta0.slice();
  else {
    const rand = mulberry32(opts.seed);
    const noise = new Float64Array(n);
    for (let i = 0; i < n; i++) noise[i] = gauss(rand) * 6;
    theta = blur(noise, nx, ny, 3.5);
  }
  const lossOf = (r: Float64Array) => r.reduce((s, v) => s + v * v, 0);
  const at = (th: Float64Array) => {
    const c2 = dequantise(quantise(floorFromTheta(th, mask, nx, ny)));
    return { c2, ...jacobian(makeSpec(N, M, c2), W, opts.gain) };
  };
  let cur = at(theta);
  let loss = lossOf(cur.r);
  let mu = 1e-3;
  const history = [loss];
  const maxStepCap = opts.lr ?? 1.5;
  for (let it = 1; it <= opts.iters; it++) {
    // Jacobian with respect to θ: J_θ = blur(J_c² · dc²/dρ).
    const rho = blur(theta, nx, ny);
    const dc = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = sigmoid(rho[i]);
      dc[i] = -mask[i] * (C2_DEEP - C2_SHALLOW) * s * (1 - s);
    }
    const R = cur.r.length;
    const Jt = cur.J.map((row) => blur(row.map((v, i) => v * dc[i]), nx, ny));
    const JJ = new Float64Array(R * R);
    for (let a = 0; a < R; a++) {
      const ra = Jt[a];
      for (let b = 0; b <= a; b++) {
        const rb = Jt[b];
        let s = 0;
        for (let i = 0; i < n; i++) s += ra[i] * rb[i];
        JJ[a * R + b] = JJ[b * R + a] = s;
      }
    }
    let trace = 0;
    for (let a = 0; a < R; a++) trace += JJ[a * R + a];
    let accepted = false;
    for (let tries = 0; tries < 10 && !accepted; tries++) {
      const z = cholSolve(JJ, R, (mu * trace) / R, cur.r);
      const step = new Float64Array(n);
      for (let a = 0; a < R; a++) {
        const za = z[a];
        const ra = Jt[a];
        for (let i = 0; i < n; i++) step[i] -= za * ra[i];
      }
      let maxStep = 0;
      for (let i = 0; i < n; i++) maxStep = Math.max(maxStep, Math.abs(step[i]));
      // Cap the step so the linearisation stays trustworthy.
      const scale = maxStep > maxStepCap ? maxStepCap / maxStep : 1;
      const next = theta.slice();
      for (let i = 0; i < n; i++) next[i] += scale * step[i];
      const cand = at(next);
      const l = lossOf(cand.r);
      if (l < loss) {
        theta = next;
        cur = cand;
        loss = l;
        mu = Math.max(1e-10, mu / 5);
        accepted = true;
      } else mu *= 8;
    }
    history.push(loss);
    opts.log?.(it, loss);
    if (opts.target && loss < opts.target) break;
    if (!accepted) break;
  }
  return { c2q: quantise(cur.c2), loss, history, theta };
}
