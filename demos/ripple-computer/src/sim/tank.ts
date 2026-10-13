/**
 * The ripple tank: a 2D damped wave equation on a regular grid, with
 * a weak shallow-water nonlinearity (crests travel a little faster than troughs,
 * because long-wave speed grows with local depth, c² = g(h + η)).
 *
 * Discretisation (leapfrog / Verlet, one grid cell = one unit, one step = one unit):
 *
 *   η⁺ = η + (1 − d)(η − η⁻) + C² ∇²(η + κη²/2) + forcing
 *
 * The κ term is the conservative form of ∇·(c²(η)∇η): mass is exactly conserved.
 *
 * Obstacles (stone pillars) and the tank walls are reflecting (Neumann) boundaries:
 * a neighbour that is solid simply drops out of the 5-point Laplacian. A thin
 * "beach" of extra damping along three walls keeps the tank from ringing forever,
 * which gives the reservoir the fading memory it needs. The wall the wave-makers
 * sit on reflects.
 *
 * This file is plain TypeScript with no DOM or GPU dependencies so the exact same
 * solver drives the rendered tank, the in-page training worker and the Node tests.
 */
import { mulberry32 } from './rng.ts';

export interface Pillar {
  x: number;
  y: number;
  r: number;
}

export interface Paddle {
  /** Centre along the y axis, in cells. */
  y: number;
  /** Half the paddle width, in cells. */
  half: number;
}

export interface Probe {
  x: number;
  y: number;
}

export interface TankLayout {
  nx: number;
  ny: number;
  /** 1 where the cell is wall or obstacle. */
  solid: Uint8Array;
  pillars: Pillar[];
  paddles: Paddle[];
  probes: Probe[];
  /** Column where the wave-makers push the water. */
  paddleX: number;
}

export const NX = 152;
export const NY = 96;
export const PADDLE_COUNT = 7;
export const PROBE_COUNT = 16;

/** Courant number squared (c·dt/dx)²; must stay below 0.5 for the 2D leapfrog. */
export const C2 = 0.36;
/** Shallow-water nonlinearity: relative change in c² per unit surface height. */
export const KAPPA = 0.35;
/** Bulk damping per step. */
export const DAMPING = 0.0035;
/** Extra damping at the absorbing beaches. */
export const BEACH = 0.06;
export const BEACH_WIDTH = 10;

/**
 * Build the fixed exhibit layout: seven wave-makers on the left wall, a field of
 * stone pillars in the middle, and sixteen probes scattered through the right half.
 * Deterministic, so the browser and the tests see the same tank.
 */
export function buildLayout(seed = 7): TankLayout {
  const nx = NX;
  const ny = NY;
  const rand = mulberry32(seed);
  const solid = new Uint8Array(nx * ny);
  for (let x = 0; x < nx; x++) {
    solid[x] = 1;
    solid[(ny - 1) * nx + x] = 1;
  }
  for (let y = 0; y < ny; y++) {
    solid[y * nx] = 1;
    solid[y * nx + nx - 1] = 1;
  }

  const paddles: Paddle[] = [];
  const margin = 10;
  for (let k = 0; k < PADDLE_COUNT; k++) {
    const y = margin + ((ny - 2 * margin) * (k + 0.5)) / PADDLE_COUNT;
    paddles.push({ y, half: 4.2 });
  }

  // Pillars: Poisson-disc-ish rejection sampling in the middle band of the tank.
  const pillars: Pillar[] = [];
  const x0 = 0.2 * nx;
  const x1 = 0.66 * nx;
  let tries = 0;
  while (pillars.length < 26 && tries < 5000) {
    tries++;
    const r = 2.2 + rand() * 3.2;
    const x = x0 + rand() * (x1 - x0);
    const y = 7 + r + rand() * (ny - 14 - 2 * r);
    let ok = true;
    for (const p of pillars) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r + r + 6.5) {
        ok = false;
        break;
      }
    }
    if (ok) pillars.push({ x, y, r });
  }
  for (const p of pillars) {
    const r2 = p.r * p.r;
    for (let y = Math.floor(p.y - p.r - 1); y <= Math.ceil(p.y + p.r + 1); y++) {
      for (let x = Math.floor(p.x - p.r - 1); x <= Math.ceil(p.x + p.r + 1); x++) {
        if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
        const dx = x + 0.5 - p.x;
        const dy = y + 0.5 - p.y;
        if (dx * dx + dy * dy <= r2) solid[y * nx + x] = 1;
      }
    }
  }

  // Probes: jittered grid over the right part of the tank, kept clear of pillars.
  const probes: Probe[] = [];
  const cols = 4;
  const rows = 4;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = 0.5 * nx + ((i + 0.5 + (rand() - 0.5) * 0.6) / cols) * 0.42 * nx;
        const y = 10 + ((j + 0.5 + (rand() - 0.5) * 0.6) / rows) * (ny - 20);
        const clear = pillars.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + 3);
        if (clear || attempt === 49) {
          probes.push({ x, y });
          break;
        }
      }
    }
  }

  return { nx, ny, solid, pillars, paddles, probes, paddleX: 3 };
}

export class WaveTank {
  readonly layout: TankLayout;
  readonly nx: number;
  readonly ny: number;
  /** Surface height now, and one step ago. */
  u: Float32Array;
  prev: Float32Array;
  private next: Float32Array;
  private readonly damp: Float32Array;
  private readonly wE: Float32Array;
  private readonly wW: Float32Array;
  private readonly wN: Float32Array;
  private readonly wS: Float32Array;
  /** 1 for fluid cells whose four neighbours are all fluid (the fast path). */
  private readonly interior: Uint8Array;
  /** For each paddle, the cells it pushes and the weight of each push. */
  private readonly paddleCells: { idx: Int32Array; w: Float32Array }[];
  private readonly probeIdx: Int32Array;
  readonly drive: Float32Array;
  time = 0;
  /** Extra damping everywhere, used by the exhibit to calm the tank between trials. */
  extraDamping = 0;

  constructor(layout: TankLayout) {
    this.layout = layout;
    const { nx, ny, solid } = layout;
    this.nx = nx;
    this.ny = ny;
    const n = nx * ny;
    this.u = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.next = new Float32Array(n);
    this.damp = new Float32Array(n);
    this.wE = new Float32Array(n);
    this.wW = new Float32Array(n);
    this.wN = new Float32Array(n);
    this.wS = new Float32Array(n);
    this.interior = new Uint8Array(n);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (solid[i]) continue;
        this.wE[i] = solid[i + 1] ? 0 : 1;
        this.wW[i] = solid[i - 1] ? 0 : 1;
        this.wN[i] = solid[i + nx] ? 0 : 1;
        this.wS[i] = solid[i - nx] ? 0 : 1;
        this.interior[i] = this.wE[i] + this.wW[i] + this.wN[i] + this.wS[i] === 4 ? 1 : 0;
        // Beaches on the far wall and the two long walls; the paddle wall reflects.
        const dist = Math.min(nx - 1 - x, y, ny - 1 - y);
        const s = Math.max(0, 1 - dist / BEACH_WIDTH);
        this.damp[i] = DAMPING + BEACH * s * s;
      }
    }
    this.paddleCells = layout.paddles.map((p) => {
      const idx: number[] = [];
      const w: number[] = [];
      for (let y = Math.floor(p.y - p.half * 1.6); y <= Math.ceil(p.y + p.half * 1.6); y++) {
        if (y < 1 || y >= ny - 1) continue;
        const t = (y + 0.5 - p.y) / p.half;
        const prof = Math.exp(-t * t);
        if (prof < 0.02) continue;
        for (let x = layout.paddleX - 1; x <= layout.paddleX + 1; x++) {
          idx.push(y * nx + x);
          w.push(prof * (x === layout.paddleX ? 1 : 0.5));
        }
      }
      return { idx: Int32Array.from(idx), w: Float32Array.from(w) };
    });
    this.probeIdx = Int32Array.from(
      layout.probes.map((p) => Math.floor(p.y) * nx + Math.floor(p.x)),
    );
    this.drive = new Float32Array(layout.paddles.length);
  }

  reset(): void {
    this.u.fill(0);
    this.prev.fill(0);
    this.next.fill(0);
    this.drive.fill(0);
    this.time = 0;
  }

  /** Advance one time step with the current paddle drive (acceleration per paddle). */
  step(): void {
    const { nx, ny, u, prev, next, damp, wE, wW, wN, wS, interior } = this;
    const ex = this.extraDamping;
    const k2 = 0.5 * KAPPA;
    for (let y = 1; y < ny - 1; y++) {
      const row = y * nx;
      for (let i = row + 1, end = row + nx - 1; i < end; i++) {
        const c = u[i];
        // Conservative form: η_tt = C²∇²(η + κη²/2), i.e. ∇·(C²(1 + κη)∇η) with
        // face-averaged depth, so the nonlinearity never creates or destroys water.
        const pc = c + k2 * c * c;
        let lap: number;
        if (interior[i] === 1) {
          const e = u[i + 1];
          const w = u[i - 1];
          const n = u[i + nx];
          const s = u[i - nx];
          lap = e + k2 * e * e + w + k2 * w * w + n + k2 * n * n + s + k2 * s * s - 4 * pc;
        } else {
          const e = u[i + 1];
          const w = u[i - 1];
          const n = u[i + nx];
          const s = u[i - nx];
          lap =
            wE[i] * (e + k2 * e * e - pc) +
            wW[i] * (w + k2 * w * w - pc) +
            wN[i] * (n + k2 * n * n - pc) +
            wS[i] * (s + k2 * s * s - pc);
        }
        next[i] = c + (1 - damp[i] - ex) * (c - prev[i]) + C2 * lap;
      }
    }
    for (let k = 0; k < this.paddleCells.length; k++) {
      const a = this.drive[k];
      if (a === 0) continue;
      const { idx, w } = this.paddleCells[k];
      for (let j = 0; j < idx.length; j++) next[idx[j]] += a * w[j];
    }
    this.prev = u;
    this.u = next;
    this.next = prev;
    this.time++;
  }

  /** Drop a smooth bump of water (a fingertip touching the surface). */
  addDrop(gx: number, gy: number, amp: number, radius = 2.5): void {
    const { nx, ny } = this;
    const r = Math.ceil(radius * 2.5);
    for (let y = Math.max(1, Math.floor(gy) - r); y <= Math.min(ny - 2, Math.floor(gy) + r); y++) {
      for (let x = Math.max(1, Math.floor(gx) - r); x <= Math.min(nx - 2, Math.floor(gx) + r); x++) {
        const i = y * nx + x;
        if (this.layout.solid[i]) continue;
        const d2 = ((x + 0.5 - gx) ** 2 + (y + 0.5 - gy) ** 2) / (radius * radius);
        // Mexican-hat profile: pushes water aside without adding any.
        const v = amp * (1 - d2) * Math.exp(-d2);
        this.u[i] += v;
        this.prev[i] += v;
      }
    }
  }

  readProbes(out: Float32Array): void {
    for (let k = 0; k < this.probeIdx.length; k++) out[k] = this.u[this.probeIdx[k]];
  }

  /** Total wave energy proxy (sum of η²), handy for tests and UI meters. */
  energy(): number {
    let e = 0;
    for (let i = 0; i < this.u.length; i++) e += this.u[i] * this.u[i];
    return e;
  }
}
