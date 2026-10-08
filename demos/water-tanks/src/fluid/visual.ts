/**
 * Everything that makes the water look alive without deciding any numbers: particles for the
 * jets, a 1D wave equation on every tank surface (driven by the impacts), and rising bubbles.
 */
import { Network } from '../model/network.ts';
import type { Machine } from '../model/machine.ts';
import { heightOf, widthAt, type VesselSpec } from '../model/vessel.ts';
import { Particles, SPACING, type Segment } from './particles.ts';

export class Wave {
  readonly eta: Float32Array;
  readonly vel: Float32Array;
  constructor(readonly n: number) {
    this.eta = new Float32Array(n);
    this.vel = new Float32Array(n);
  }
  step(dt: number, width: number): void {
    const n = this.n;
    const dx = Math.max(width, 0.2) / (n - 1);
    const c = Math.min(1.1, (0.45 * dx) / dt);
    const k = (c * c) / (dx * dx);
    const { eta, vel } = this;
    for (let i = 0; i < n; i++) {
      const l = eta[i > 0 ? i - 1 : 1];
      const r = eta[i < n - 1 ? i + 1 : n - 2];
      vel[i] += (k * (l + r - 2 * eta[i]) - 2.2 * vel[i] - 3 * eta[i]) * dt;
    }
    for (let i = 0; i < n; i++) {
      eta[i] += vel[i] * dt;
      if (eta[i] > 0.07) eta[i] = 0.07;
      if (eta[i] < -0.07) eta[i] = -0.07;
    }
  }
  sample(s: number): number {
    const f = Math.min(Math.max(s, 0), 1) * (this.n - 1);
    const i = Math.min(Math.floor(f), this.n - 2);
    const t = f - i;
    return this.eta[i] * (1 - t) + this.eta[i + 1] * t;
  }
  kick(s: number, dv: number): void {
    const f = Math.min(Math.max(s, 0), 1) * (this.n - 1);
    const i = Math.round(f);
    for (let o = -2; o <= 2; o++) {
      const j = i + o;
      if (j < 0 || j >= this.n) continue;
      this.vel[j] += dv * (o === 0 ? 1 : Math.abs(o) === 1 ? 0.6 : 0.25);
    }
  }
}

export interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
  vessel: string;
}

/** Wall polylines of a vessel (left and right), bottom to top. */
export function wallPolylines(v: VesselSpec): { left: [number, number][]; right: [number, number][] } {
  const curved = v.profile[2] !== 0;
  const n = curved ? 14 : 1;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const h = (v.height * i) / n;
    const w = widthAt(v.profile, h) / 2;
    left.push([v.x - w, v.y0 + h]);
    right.push([v.x + w, v.y0 + h]);
  }
  return { left, right };
}

export class VisualWorld {
  readonly particles = new Particles();
  readonly waves = new Map<string, Wave>();
  bubbles: Bubble[] = [];
  private carry = new Map<string, number>();
  private seq = new Map<string, number>();
  private time = 0;

  constructor(readonly machine: Machine) {
    for (const v of machine.scene.vessels) this.waves.set(v.id, new Wave(v.infinite ? 220 : 64));
    this.rebuildSegments();
  }

  get net(): Network {
    return this.machine.net;
  }

  rebuildSegments(): void {
    const segs: Segment[] = [];
    const add = (pts: [number, number][]) => {
      for (let i = 0; i + 1 < pts.length; i++)
        segs.push({ ax: pts[i][0], ay: pts[i][1], bx: pts[i + 1][0], by: pts[i + 1][1] });
    };
    for (const v of this.machine.scene.vessels) {
      if (v.infinite) continue;
      const { left, right } = wallPolylines(v);
      add(left);
      add(right);
      if (widthAt(v.profile, 0) > 0) add([left[0], right[0]]);
    }
    const knife = this.machine.scene.knife?.(this.machine.inputs);
    if (knife) {
      add([
        [knife.x, knife.tip],
        [knife.x, knife.base],
        knife.chuteEnd,
      ]);
    }
    this.particles.segments = segs;
  }

  level(v: VesselSpec): number {
    return heightOf(v.profile, this.net.vessel(v.id).V);
  }

  /** Visible surface height (world y) at x, including the ripples. */
  surfaceY(v: VesselSpec, x: number): number {
    const L = this.level(v);
    const w = widthAt(v.profile, L);
    const wave = this.waves.get(v.id)!;
    const s = w > 1e-4 ? (x - (v.x - w / 2)) / w : 0.5;
    return v.y0 + L + wave.sample(s);
  }

  private absorb = (x: number, y: number): string | null => {
    for (const v of this.machine.scene.vessels) {
      if (v.infinite) {
        if (y < v.y0 + this.level(v) + this.waves.get(v.id)!.sample((x - (v.x - 7.85)) / 15.7)) return v.id;
        continue;
      }
      if (y < v.y0 - 0.02 || y > v.y0 + v.height) continue;
      const half = widthAt(v.profile, Math.max(0, y - v.y0)) / 2;
      if (Math.abs(x - v.x) > half + 0.01) continue;
      if (y < Math.max(this.surfaceY(v, x), v.y0 + 0.035)) return v.id;
    }
    return null;
  };

  private onAbsorb = (id: string, x: number, _y: number, vx: number, vy: number): void => {
    const v = this.machine.scene.vessels.find((s) => s.id === id);
    if (!v) return;
    const L = this.level(v);
    const w = v.infinite ? 15.7 : widthAt(v.profile, L);
    const s = (x - (v.x - w / 2)) / Math.max(w, 1e-3);
    const speed = Math.hypot(vx, vy);
    this.waves.get(id)!.kick(s, Math.max(-0.5, vy * 0.045));
    const surf = v.y0 + L;
    if (speed > 2.2 && Math.random() < 0.09 && this.particles.count < this.particles.capacity * 0.8) {
      this.particles.spawn(
        x,
        surf + 0.04,
        (Math.random() - 0.5) * 1.4 + vx * 0.3,
        Math.abs(vy) * (0.12 + Math.random() * 0.22),
        1,
      );
    }
    if (!v.infinite && L > 0.08 && Math.random() < 0.06 && this.bubbles.length < 120) {
      const depth = Math.min(L - 0.03, 0.08 + speed * 0.05 * Math.random());
      this.bubbles.push({
        x: x + (Math.random() - 0.5) * 0.06,
        y: surf - Math.max(0.02, depth),
        r: 0.006 + Math.random() * 0.014,
        vy: 0.25 + Math.random() * 0.35,
        phase: Math.random() * 6.28,
        vessel: id,
      });
    }
  };

  /** Turn the volume each link emitted this frame into particles at its spout. */
  private spawnFromLinks(frameDt: number): void {
    const emitted = this.net.takeEmitted();
    const area = SPACING * SPACING;
    for (const [id, dv] of emitted) {
      const link = this.net.link(id);
      const s = link.spec;
      if (!s.spout || (s.law.kind === 'match' && s.immediate && link.q <= 0)) continue;
      const q = dv / Math.max(frameDt, 1e-4);
      const v = Network.speed(s, q);
      let n = (this.carry.get(id) ?? 0) + dv / area;
      const whole = Math.floor(n);
      this.carry.set(id, n - whole);
      const { x, y, dx, dy, width } = s.spout;
      const nx = -dy;
      const ny = dx;
      let seq = this.seq.get(id) ?? 0;
      for (let k = 0; k < whole; k++) {
        seq++;
        // Low-discrepancy positions across the width keep a sheet uniform, which is what
        // makes the knife-edge splitter split in exactly the right ratio.
        const across = (((seq * 0.6180339887) % 1) - 0.5) * width;
        const t = ((k + 0.5 + (Math.random() - 0.5) * 0.3) / whole) * frameDt;
        const px = x + nx * across + dx * v * t;
        const py = y + ny * across + dy * v * t - 3 * t * t;
        const jitter = s.sheet ? 0.004 * v : 0.03 * v;
        this.particles.spawn(px, py, dx * v + (Math.random() - 0.5) * jitter, dy * v + (Math.random() - 0.5) * jitter, 0);
      }
      this.seq.set(id, seq);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.spawnFromLinks(dt);
    const sub = 2;
    for (let i = 0; i < sub; i++) this.particles.step(dt / sub, this.absorb, this.onAbsorb);

    for (const v of this.machine.scene.vessels) {
      const wave = this.waves.get(v.id)!;
      const L = this.level(v);
      const w = v.infinite ? 15.7 : widthAt(v.profile, L);
      // A whisper of ambient motion keeps still water from looking frozen.
      const j = Math.floor(Math.random() * wave.n);
      wave.vel[j] += (Math.random() - 0.5) * 0.02;
      for (let k = 0; k < 3; k++) wave.step(dt / 3, w);
    }

    const keep: Bubble[] = [];
    for (const b of this.bubbles) {
      b.y += b.vy * dt;
      b.phase += dt * 7;
      b.x += Math.sin(b.phase) * 0.03 * dt * 6;
      const v = this.machine.scene.vessels.find((s) => s.id === b.vessel)!;
      if (b.y < this.surfaceY(v, b.x) - b.r) keep.push(b);
    }
    this.bubbles = keep;
  }
}
