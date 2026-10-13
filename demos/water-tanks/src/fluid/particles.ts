/**
 * 2D position-based fluid (Macklin & Müller 2013) for the jets, pours and splashes.
 *
 * This is the visual layer, not the answer: the lumped network decides how much water moves
 * and when; this system turns each link's emitted volume into particles at the spout, lets
 * them fall under the same gravity, splash off knife edges and chutes, and removes them when
 * they plunge beneath a tank's surface (where the smooth tank body takes over).
 *
 * PBF here enforces incompressibility only against compression (free-surface clamp), with
 * XSPH viscosity to keep a jet coherent. Walls are thin two-sided segments with
 * anti-tunnelling, since a falling drop moves about one particle diameter per substep.
 */
import { G } from '../model/network.ts';

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export const SPACING = 0.036;
const H = SPACING * 2.2; // kernel radius
const H2 = H * H;
const POLY6 = 4 / (Math.PI * Math.pow(H, 8));
const SPIKY = -30 / (Math.PI * Math.pow(H, 5));
const RADIUS = 0.018; // collision radius against walls
export const MAX_PARTICLES = 12000;
const MAX = MAX_PARTICLES;

/** Domain covered by the neighbour grid. */
const GX0 = -9;
const GY0 = -1;
const GW = Math.ceil(18 / H);
const GH = Math.ceil(12 / H);

export type AbsorbFn = (x: number, y: number) => string | null;
export type AbsorbHook = (id: string, x: number, y: number, vx: number, vy: number) => void;

function poly6(r2: number): number {
  if (r2 >= H2) return 0;
  const d = H2 - r2;
  return POLY6 * d * d * d;
}

export class Particles {
  count = 0;
  readonly x = new Float32Array(MAX);
  readonly y = new Float32Array(MAX);
  readonly vx = new Float32Array(MAX);
  readonly vy = new Float32Array(MAX);
  readonly px = new Float32Array(MAX);
  readonly py = new Float32Array(MAX);
  readonly foam = new Float32Array(MAX);
  readonly age = new Float32Array(MAX);
  private lam = new Float32Array(MAX);
  private dx = new Float32Array(MAX);
  private dy = new Float32Array(MAX);
  private cellStart = new Int32Array(GW * GH + 1);
  private cursor = new Int32Array(GW * GH + 1);
  private cellOf = new Int32Array(MAX);
  private sorted = new Int32Array(MAX);
  private rho0: number;
  segments: Segment[] = [];

  constructor() {
    // Rest density: a square lattice at the spawn spacing.
    let s = 0;
    for (let i = -4; i <= 4; i++)
      for (let j = -4; j <= 4; j++) s += poly6((i * SPACING * 0.85) ** 2 + (j * SPACING * 0.85) ** 2);
    this.rho0 = s;
  }

  get capacity(): number {
    return MAX;
  }

  clear(): void {
    this.count = 0;
  }

  spawn(x: number, y: number, vx: number, vy: number, foam = 0): void {
    if (this.count >= MAX) return;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.foam[i] = foam;
    this.age[i] = 0;
  }

  private buildGrid(): void {
    const n = this.count;
    const cs = this.cellStart;
    cs.fill(0);
    for (let i = 0; i < n; i++) {
      let cx = Math.floor((this.px[i] - GX0) / H);
      let cy = Math.floor((this.py[i] - GY0) / H);
      cx = cx < 0 ? 0 : cx >= GW ? GW - 1 : cx;
      cy = cy < 0 ? 0 : cy >= GH ? GH - 1 : cy;
      const c = cy * GW + cx;
      this.cellOf[i] = c;
      cs[c + 1]++;
    }
    for (let c = 0; c < GW * GH; c++) cs[c + 1] += cs[c];
    const next = this.cursor;
    next.set(cs);
    for (let i = 0; i < n; i++) this.sorted[next[this.cellOf[i]]++] = i;
  }

  private forNeighbours(i: number, fn: (j: number, rx: number, ry: number, r2: number) => void): void {
    const c = this.cellOf[i];
    const cx = c % GW;
    const cy = (c - cx) / GW;
    const pxi = this.px[i];
    const pyi = this.py[i];
    for (let oy = -1; oy <= 1; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= GH) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const xx = cx + ox;
        if (xx < 0 || xx >= GW) continue;
        const cell = yy * GW + xx;
        for (let k = this.cellStart[cell]; k < this.cellStart[cell + 1]; k++) {
          const j = this.sorted[k];
          const rx = pxi - this.px[j];
          const ry = pyi - this.py[j];
          const r2 = rx * rx + ry * ry;
          if (r2 < H2) fn(j, rx, ry, r2);
        }
      }
    }
  }

  private collide(i: number): void {
    const ox = this.x[i];
    const oy = this.y[i];
    let px = this.px[i];
    let py = this.py[i];
    for (const s of this.segments) {
      const ex = s.bx - s.ax;
      const ey = s.by - s.ay;
      const len2 = ex * ex + ey * ey;
      // Anti-tunnelling: did the step cross the segment's line within the segment?
      const so = ex * (oy - s.ay) - ey * (ox - s.ax);
      const sn = ex * (py - s.ay) - ey * (px - s.ax);
      if (so * sn < 0) {
        const t = so / (so - sn);
        const ix = ox + (px - ox) * t;
        const iy = oy + (py - oy) * t;
        const u = ((ix - s.ax) * ex + (iy - s.ay) * ey) / len2;
        if (u >= 0 && u <= 1) {
          const l = Math.sqrt(len2);
          const sign = so > 0 ? 1 : -1;
          // Normal pointing to the side the particle came from.
          const nx = (-ey / l) * sign;
          const ny = (ex / l) * sign;
          px = ix + nx * RADIUS;
          py = iy + ny * RADIUS;
        }
      }
      // Capsule push-out.
      let u = ((px - s.ax) * ex + (py - s.ay) * ey) / len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const cx = s.ax + ex * u;
      const cy = s.ay + ey * u;
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < RADIUS * RADIUS) {
        const d = Math.sqrt(d2);
        if (d > 1e-7) {
          px = cx + (dx / d) * RADIUS;
          py = cy + (dy / d) * RADIUS;
        } else {
          const l = Math.sqrt(len2);
          const sign = ex * (oy - s.ay) - ey * (ox - s.ax) > 0 ? 1 : -1;
          px = cx + (-ey / l) * sign * RADIUS;
          py = cy + (ex / l) * sign * RADIUS;
        }
      }
    }
    this.px[i] = px;
    this.py[i] = py;
  }

  step(dt: number, absorb: AbsorbFn, onAbsorb: AbsorbHook): void {
    const n = this.count;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
      this.vy[i] -= G * dt;
      this.px[i] = this.x[i] + this.vx[i] * dt;
      this.py[i] = this.y[i] + this.vy[i] * dt;
      this.collide(i);
    }
    this.buildGrid();
    const rho0 = this.rho0;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < n; i++) {
        let rho = 0;
        let sx = 0;
        let sy = 0;
        let sum2 = 0;
        this.forNeighbours(i, (j, rx, ry, r2) => {
          rho += poly6(r2);
          if (j === i || r2 < 1e-12) return;
          const r = Math.sqrt(r2);
          const g = (SPIKY * (H - r) * (H - r)) / r / rho0;
          const gx = g * rx;
          const gy = g * ry;
          sx += gx;
          sy += gy;
          sum2 += gx * gx + gy * gy;
        });
        const C = Math.max(rho / rho0 - 1, 0);
        this.lam[i] = -C / (sum2 + sx * sx + sy * sy + 200);
      }
      for (let i = 0; i < n; i++) {
        let ddx = 0;
        let ddy = 0;
        const li = this.lam[i];
        this.forNeighbours(i, (j, rx, ry, r2) => {
          if (j === i || r2 < 1e-12) return;
          const r = Math.sqrt(r2);
          const g = ((SPIKY * (H - r) * (H - r)) / r) * (li + this.lam[j]);
          ddx += g * rx;
          ddy += g * ry;
        });
        ddx /= rho0;
        ddy /= rho0;
        const m = Math.hypot(ddx, ddy);
        const cap = SPACING * 0.4;
        if (m > cap) {
          ddx *= cap / m;
          ddy *= cap / m;
        }
        this.dx[i] = ddx;
        this.dy[i] = ddy;
      }
      for (let i = 0; i < n; i++) {
        this.px[i] += this.dx[i];
        this.py[i] += this.dy[i];
        this.collide(i);
      }
    }
    const inv = 1 / dt;
    for (let i = 0; i < n; i++) {
      this.vx[i] = (this.px[i] - this.x[i]) * inv;
      this.vy[i] = (this.py[i] - this.y[i]) * inv;
    }
    // XSPH viscosity: keeps a jet moving as one ribbon.
    for (let i = 0; i < n; i++) {
      let ax = 0;
      let ay = 0;
      this.forNeighbours(i, (j, _rx, _ry, r2) => {
        if (j === i) return;
        const w = poly6(r2) / rho0;
        ax += (this.vx[j] - this.vx[i]) * w;
        ay += (this.vy[j] - this.vy[i]) * w;
      });
      this.dx[i] = ax;
      this.dy[i] = ay;
    }
    let w = 0;
    for (let i = 0; i < n; i++) {
      const vx = this.vx[i] + 0.08 * this.dx[i];
      const vy = this.vy[i] + 0.08 * this.dy[i];
      const x = this.px[i];
      const y = this.py[i];
      const a = this.age[i] + dt;
      const hit = absorb(x, y);
      if (hit !== null || y < -0.5 || x < -9 || x > 9 || a > 8) {
        if (hit !== null) onAbsorb(hit, x, y, vx, vy);
        continue;
      }
      this.x[w] = x;
      this.y[w] = y;
      this.vx[w] = vx;
      this.vy[w] = vy;
      this.age[w] = a;
      this.foam[w] = this.foam[i] * Math.exp(-dt * 1.5);
      w++;
    }
    this.count = w;
  }
}
