/**
 * The frequency-domain twin of the time-domain tank.
 *
 * Drive every wave-maker as Re(Fₖ e^{iωn}) and wait: the tank settles to
 * η_n = Re(U e^{iωn}). Substituting that into the leapfrog update gives one linear
 * equation per cell, a discrete Helmholtz equation
 *
 *   [e^{iω} − 1 − (1 − d)(1 − e^{−iω})] U − ∇·(c²∇U) = F,
 *
 * which is exact for the discrete tank (no continuum approximation), so the steady
 * state of the time-domain solver and this solve agree to rounding once the
 * transient has died away.
 *
 * The matrix is complex symmetric with a 5-point stencil. Numbered column by
 * column (k = x·ny + y) it is a band of half-width ny, so a banded LDLᵀ
 * factorisation solves it directly in O(n·ny²): about 0.1 s for a whole tank.
 * Because Aᵀ = A, the same factors give the adjoint solves the inverse design needs.
 */
import { dampingField, OMEGA, paddleCells, probeCells, type TankSpec } from './tank.ts';

export interface Complex {
  re: Float64Array;
  im: Float64Array;
}

export class Helmholtz {
  readonly nx: number;
  readonly ny: number;
  readonly n: number;
  /** Half bandwidth. */
  readonly b: number;
  /** Lower band, column by column: L[k + t, k] at k·(b+1) + t; the pivots at t = 0. */
  private readonly Lr: Float64Array;
  private readonly Li: Float64Array;
  /** Face weights in row-major cell order: east and north face of each cell. */
  readonly wE: Float64Array;
  readonly wN: Float64Array;

  constructor(spec: TankSpec, omega = OMEGA) {
    const { nx, ny, c2 } = spec;
    this.nx = nx;
    this.ny = ny;
    const n = (this.n = nx * ny);
    const b = (this.b = ny);
    const w = b + 1;
    this.Lr = new Float64Array(n * w);
    this.Li = new Float64Array(n * w);
    this.wE = new Float64Array(n);
    this.wN = new Float64Array(n);
    const d = dampingField(nx, ny);
    const cw = Math.cos(omega);
    const sw = Math.sin(omega);
    const { Lr, Li } = this;
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) {
        const i = y * nx + x;
        const k = x * ny + y;
        // Diagonal: a(ω, d) plus the sum of the face weights.
        let diag = -(2 - d[i]) * (1 - cw);
        Li[k * w] = d[i] * sw;
        if (x < nx - 1) {
          const f = 0.5 * (c2[i] + c2[i + 1]);
          this.wE[i] = f;
          diag += f;
          Lr[k * w + b] = -f; // east neighbour is k + ny
        }
        if (x > 0) diag += 0.5 * (c2[i] + c2[i - 1]);
        if (y < ny - 1) {
          const f = 0.5 * (c2[i] + c2[i + nx]);
          this.wN[i] = f;
          diag += f;
          Lr[k * w + 1] = -f; // north neighbour is k + 1
        }
        if (y > 0) diag += 0.5 * (c2[i] + c2[i - nx]);
        Lr[k * w] = diag;
      }
    }
    this.factor();
  }

  /** In-place banded LDLᵀ without pivoting (complex symmetric). */
  private factor(): void {
    const { n, b, Lr, Li } = this;
    const w = b + 1;
    const ur = new Float64Array(w);
    const ui = new Float64Array(w);
    for (let k = 0; k < n; k++) {
      const base = k * w;
      const pr = Lr[base];
      const pi = Li[base];
      const den = pr * pr + pi * pi;
      const qr = pr / den;
      const qi = -pi / den;
      const m = Math.min(b, n - 1 - k);
      for (let t = 1; t <= m; t++) {
        const ar = Lr[base + t];
        const ai = Li[base + t];
        ur[t] = ar;
        ui[t] = ai;
        Lr[base + t] = ar * qr - ai * qi;
        Li[base + t] = ar * qi + ai * qr;
      }
      for (let s = 1; s <= m; s++) {
        const sr = ur[s];
        const si = ui[s];
        if (sr === 0 && si === 0) continue;
        const jb = (k + s) * w - s;
        for (let t = s; t <= m; t++) {
          const lr = Lr[base + t];
          const li = Li[base + t];
          Lr[jb + t] -= lr * sr - li * si;
          Li[jb + t] -= lr * si + li * sr;
        }
      }
    }
  }

  /** Solve A x = f in place, with vectors in column-major (k = x·ny + y) order. */
  solveCol(xr: Float64Array, xi: Float64Array): void {
    const { n, b, Lr, Li } = this;
    const w = b + 1;
    for (let k = 0; k < n; k++) {
      const yr = xr[k];
      const yi = xi[k];
      if (yr === 0 && yi === 0) continue;
      const base = k * w;
      const m = Math.min(b, n - 1 - k);
      for (let t = 1; t <= m; t++) {
        const lr = Lr[base + t];
        const li = Li[base + t];
        xr[k + t] -= lr * yr - li * yi;
        xi[k + t] -= lr * yi + li * yr;
      }
    }
    for (let k = 0; k < n; k++) {
      const pr = Lr[k * w];
      const pi = Li[k * w];
      const den = pr * pr + pi * pi;
      const yr = xr[k];
      const yi = xi[k];
      xr[k] = (yr * pr + yi * pi) / den;
      xi[k] = (yi * pr - yr * pi) / den;
    }
    for (let k = n - 1; k >= 0; k--) {
      const base = k * w;
      const m = Math.min(b, n - 1 - k);
      let sr = xr[k];
      let si = xi[k];
      for (let t = 1; t <= m; t++) {
        const lr = Lr[base + t];
        const li = Li[base + t];
        const vr = xr[k + t];
        const vi = xi[k + t];
        sr -= lr * vr - li * vi;
        si -= lr * vi + li * vr;
      }
      xr[k] = sr;
      xi[k] = si;
    }
  }

  /** Solve with a real right-hand side given in row-major order; returns row-major. */
  solve(fRowMajor: ArrayLike<number>): Complex {
    const { nx, ny, n } = this;
    const xr = new Float64Array(n);
    const xi = new Float64Array(n);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) xr[x * ny + y] = fRowMajor[y * nx + x];
    this.solveCol(xr, xi);
    return toRowMajor({ re: xr, im: xi }, nx, ny);
  }
}

export function toRowMajor(v: Complex, nx: number, ny: number): Complex {
  const re = new Float64Array(nx * ny);
  const im = new Float64Array(nx * ny);
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      re[y * nx + x] = v.re[x * ny + y];
      im[y * nx + x] = v.im[x * ny + y];
    }
  }
  return { re, im };
}

/** The forcing pattern of each wave-maker at unit amplitude, row-major. */
export function paddleForcing(spec: TankSpec): Float64Array[] {
  return paddleCells(spec).map(({ idx, w }) => {
    const f = new Float64Array(spec.nx * spec.ny);
    for (let j = 0; j < idx.length; j++) f[idx[j]] += w[j];
    return f;
  });
}

export interface SteadyState {
  /** Complex transfer matrix, T[i][j] = probe i response to unit drive on paddle j. */
  Tre: Float64Array[];
  Tim: Float64Array[];
  /** Steady complex field for each wave-maker at unit amplitude (row-major). */
  fields: Complex[];
}

/** Solve one tank: the steady field of every wave-maker and the transfer matrix. */
export function steadyState(spec: TankSpec, keepFields = true): SteadyState {
  const h = new Helmholtz(spec);
  const probes = probeCells(spec);
  const forcing = paddleForcing(spec);
  const M = probes.length;
  const N = forcing.length;
  const Tre = Array.from({ length: M }, () => new Float64Array(N));
  const Tim = Array.from({ length: M }, () => new Float64Array(N));
  const fields: Complex[] = [];
  for (let j = 0; j < N; j++) {
    const u = h.solve(forcing[j]);
    for (let i = 0; i < M; i++) {
      Tre[i][j] = u.re[probes[i]];
      Tim[i][j] = u.im[probes[i]];
    }
    if (keepFields) fields.push(u);
  }
  return { Tre, Tim, fields };
}

/** The lock-in's signed reading: the in-phase part of the probe response, y = Re(T)·x. */
export function inPhase(T: Float64Array[], x: ArrayLike<number>): Float64Array {
  const y = new Float64Array(T.length);
  for (let i = 0; i < T.length; i++) {
    let s = 0;
    for (let j = 0; j < x.length; j++) s += T[i][j] * x[j];
    y[i] = s;
  }
  return y;
}
