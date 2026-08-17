import type { Solver } from '../sim/solver';
import type { Transform } from './renderer';

/**
 * Dust motes shaken by the wave.
 *
 * Each particle keeps a fixed home cell and a displacement from it, integrated
 * from the local air velocity. Acoustic motion is oscillatory, so the cloud
 * stays put and just shivers as a front passes — which is exactly the thing
 * that's hard to see in a pressure field alone: where the air is actually
 * moving, and in which direction (into the hole, out of the open end).
 *
 * The displacement is amplified by DISPLAY_GAIN; real acoustic displacements
 * here are microns, which would be invisible. Direction and relative magnitude
 * are honest, absolute size is not.
 */
const TARGET_COUNT = 1600;
const DISPLAY_GAIN = 90;
const MAX_OFFSET_CELLS = 5;
const RETURN_TAU = 4e-3; // s, keeps numerical drift from accumulating

export class ParticleField {
  private homeX = new Float32Array(0);
  private homeY = new Float32Array(0);
  private offX = new Float32Array(0);
  private offY = new Float32Array(0);
  private speed = new Float32Array(0);
  private count = 0;
  private builtFor = '';
  private readonly tmp = { vx: 0, vy: 0 };

  /** Reseeds the cloud when the grid changes (tube length, diameter, holes). */
  sync(solver: Solver): void {
    const { nx, ny, spongeWidth } = solver.layout;
    const key = `${nx}x${ny}:${solver.layout.holeGaps.map((g) => `${g.x0}-${g.x1}`).join(',')}`;
    if (key === this.builtFor) return;
    this.builtFor = key;

    const x0 = spongeWidth;
    const x1 = nx - spongeWidth;
    const y0 = spongeWidth;
    const y1 = ny - spongeWidth;
    const spacing = Math.max(1.5, Math.sqrt(((x1 - x0) * (y1 - y0)) / TARGET_COUNT));

    const hx: number[] = [];
    const hy: number[] = [];
    for (let y = y0; y < y1; y += spacing) {
      for (let x = x0; x < x1; x += spacing) {
        // Jitter so the cloud doesn't read as a lattice.
        const px = x + (pseudoRandom(hx.length * 2 + 1) - 0.5) * spacing;
        const py = y + (pseudoRandom(hx.length * 2 + 2) - 0.5) * spacing;
        const ci = Math.round(py) * nx + Math.round(px);
        if (px < 0 || px >= nx || py < 0 || py >= ny) continue;
        if (solver.solid[ci]) continue;
        hx.push(px);
        hy.push(py);
      }
    }

    this.count = hx.length;
    this.homeX = Float32Array.from(hx);
    this.homeY = Float32Array.from(hy);
    this.offX = new Float32Array(this.count);
    this.offY = new Float32Array(this.count);
    this.speed = new Float32Array(this.count);
  }

  update(solver: Solver, simDt: number): void {
    if (simDt <= 0) return;
    const decay = Math.exp(-simDt / RETURN_TAU);
    const gain = (DISPLAY_GAIN * simDt) / solver.layout.h;
    for (let i = 0; i < this.count; i++) {
      const x = this.homeX[i] + this.offX[i];
      const y = this.homeY[i] + this.offY[i];
      solver.velocityAt(Math.round(x), Math.round(y), this.tmp);
      const ox = clamp(this.offX[i] * decay + this.tmp.vx * gain, -MAX_OFFSET_CELLS, MAX_OFFSET_CELLS);
      const oy = clamp(this.offY[i] * decay + this.tmp.vy * gain, -MAX_OFFSET_CELLS, MAX_OFFSET_CELLS);
      this.offX[i] = ox;
      this.offY[i] = oy;
      this.speed[i] = Math.hypot(this.tmp.vx, this.tmp.vy);
    }
  }

  /** Draws the cloud additively; still air stays invisible. */
  draw(ctx: CanvasRenderingContext2D, t: Transform, referenceSpeed: number): void {
    if (this.count === 0) return;
    const r = Math.max(0.8, t.scale * 0.32);
    const norm = Math.max(referenceSpeed, 1e-4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.count; i++) {
      const lit = Math.min(1, Math.pow(this.speed[i] / norm, 0.5));
      const a = 0.06 + 0.72 * lit;
      if (a < 0.09) continue; // still air: nothing to draw
      const x = t.offsetX + (this.homeX[i] + this.offX[i] + 0.5) * t.scale;
      const y = t.offsetY + (this.homeY[i] + this.offY[i] + 0.5) * t.scale;
      ctx.fillStyle = `rgba(214, 232, 255, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r * (0.7 + 0.6 * lit), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Deterministic jitter, so a rebuild of the same grid reseeds identically. */
function pseudoRandom(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
