/**
 * A programmable ripple tank: the 2D damped wave equation with a depth map.
 *
 * In shallow water the long-wave speed is c² = g·h, so a sculpted floor sets the
 * local wave speed everywhere in the tank. Deep water carries waves fast, shallow
 * water slows them down and bends them, exactly like a lens bends light. That depth
 * map is what the inverse design programs.
 *
 * Discretisation (leapfrog, one grid cell = one unit, one step = one unit):
 *
 *   η⁺ = η + (1 − d)(η − η⁻) + ∇·(c² ∇η) + f
 *
 * with ∇·(c²∇η) taken in conservative form: every face between two water cells
 * carries weight w = (c²_a + c²_b)/2, and a wall face carries nothing (reflecting).
 * Bulk damping d is small, with absorbing "beaches" along three walls.
 *
 * The equation is linear (no shallow-water steepening here), which is the whole
 * point: if every wave-maker plays the same frequency, the steady ripple at every
 * probe is a fixed linear combination of the wave-maker amplitudes. That linear map
 * is a matrix, and the depth map decides which one.
 *
 * Plain TypeScript, no DOM, so the rendered tank, the workers, the offline design
 * tools and the Node tests all run the identical solver.
 */

export const NX = 112;
export const NY = 72;
/** Steps per drive period. Every wave-maker runs on this one clock. */
export const PERIOD = 20;
export const OMEGA = (2 * Math.PI) / PERIOD;
/** (c·dt/dx)² over the deepest and the shallowest floor. Leapfrog needs < 0.5. */
export const C2_DEEP = 0.36;
export const C2_SHALLOW = 0.075;
export const DAMPING = 0.004;
export const BEACH = 0.07;
export const BEACH_WIDTH = 9;
/** Column the wave-makers push on, and the column the probes sit in. */
export const PADDLE_X = 3;
export const PROBE_X = NX - 15;

export interface Port {
  /** Position across the tank (grid y), in cells. */
  y: number;
}

export interface TankSpec {
  nx: number;
  ny: number;
  paddles: Port[];
  probes: Port[];
  /** Squared wave speed per cell, row-major (y·nx + x). Proportional to depth. */
  c2: Float32Array;
}

/** Evenly spaced ports across the tank, kept clear of the beaches. */
export function portPositions(n: number, ny = NY): number[] {
  const margin = 12;
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(margin + ((ny - 2 * margin) * (k + 0.5)) / n);
  return out;
}

export function makeSpec(nIn: number, nOut: number, c2?: Float32Array): TankSpec {
  return {
    nx: NX,
    ny: NY,
    paddles: portPositions(nIn).map((y) => ({ y })),
    probes: portPositions(nOut).map((y) => ({ y })),
    c2: c2 ?? new Float32Array(NX * NY).fill(C2_DEEP),
  };
}

/** Damping per cell: a small bulk value plus beaches on the far and the two long walls. */
export function dampingField(nx = NX, ny = NY): Float64Array {
  const d = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const dist = Math.min(nx - 1 - x, y, ny - 1 - y);
      const s = Math.max(0, 1 - dist / BEACH_WIDTH);
      d[y * nx + x] = DAMPING + BEACH * s * s;
    }
  }
  return d;
}

/** Half-width of a wave-maker's push profile, in cells. */
export function paddleHalf(spec: TankSpec): number {
  const gap = (spec.ny - 24) / spec.paddles.length;
  return Math.min(3.2, 0.36 * gap);
}

/**
 * Where each wave-maker pushes and how hard (a Gaussian along the wall, three
 * columns deep). Returned as row-major cell indices and weights.
 */
export function paddleCells(spec: TankSpec): { idx: Int32Array; w: Float64Array }[] {
  const { nx, ny } = spec;
  const half = paddleHalf(spec);
  return spec.paddles.map((p) => {
    const idx: number[] = [];
    const w: number[] = [];
    for (let y = Math.floor(p.y - half * 2); y <= Math.ceil(p.y + half * 2); y++) {
      if (y < 0 || y >= ny) continue;
      const t = (y + 0.5 - p.y) / half;
      const prof = Math.exp(-t * t);
      if (prof < 0.01) continue;
      for (let x = PADDLE_X - 1; x <= PADDLE_X + 1; x++) {
        idx.push(y * nx + x);
        w.push(0.25 * prof * (x === PADDLE_X ? 1 : 0.5));
      }
    }
    return { idx: Int32Array.from(idx), w: Float64Array.from(w) };
  });
}

/** Row-major cell index of each probe (a point gauge). */
export function probeCells(spec: TankSpec): Int32Array {
  return Int32Array.from(spec.probes.map((p) => Math.floor(p.y) * spec.nx + PROBE_X));
}

/**
 * The time-domain tank. Each wave-maker is driven as aₖ·cos(ωt) with a soft start;
 * a signed input becomes an amplitude and a phase of 0 or π.
 */
export class WaveTank {
  readonly spec: TankSpec;
  readonly nx: number;
  readonly ny: number;
  u: Float32Array;
  prev: Float32Array;
  private next: Float32Array;
  private readonly keep: Float32Array;
  /** Face weights c² to the east and north neighbour (0 at walls). */
  private readonly wE: Float32Array;
  private readonly wN: Float32Array;
  readonly paddles: { idx: Int32Array; w: Float64Array }[];
  readonly probes: Int32Array;
  /** Wave-maker amplitudes (the input vector). */
  readonly amp: Float64Array;
  time = 0;
  /** Steps over which the drive ramps up smoothly from zero. */
  ramp = 3 * PERIOD;
  /** Extra damping everywhere, used to calm the tank between runs. */
  extraDamping = 0;

  constructor(spec: TankSpec) {
    this.spec = spec;
    const { nx, ny, c2 } = spec;
    this.nx = nx;
    this.ny = ny;
    const n = nx * ny;
    this.u = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.next = new Float32Array(n);
    const d = dampingField(nx, ny);
    this.keep = Float32Array.from(d, (v) => 1 - v);
    this.wE = new Float32Array(n);
    this.wN = new Float32Array(n);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (x < nx - 1) this.wE[i] = 0.5 * (c2[i] + c2[i + 1]);
        if (y < ny - 1) this.wN[i] = 0.5 * (c2[i] + c2[i + nx]);
      }
    }
    this.paddles = paddleCells(spec);
    this.probes = probeCells(spec);
    this.amp = new Float64Array(spec.paddles.length);
  }

  reset(): void {
    this.u.fill(0);
    this.prev.fill(0);
    this.next.fill(0);
    this.time = 0;
  }

  /** Drive envelope at step n: a raised-cosine soft start, then constant. */
  envelope(n: number): number {
    if (n >= this.ramp) return 1;
    return 0.5 - 0.5 * Math.cos((Math.PI * n) / this.ramp);
  }

  /** Paddle displacement of wave-maker k right now (for drawing it). */
  paddlePhase(): number {
    return Math.cos(OMEGA * this.time) * this.envelope(this.time);
  }

  /** Advance one step. `driving` false lets the tank ring down with no input. */
  step(driving = true): void {
    const { nx, ny, u, prev, next, keep, wE, wN } = this;
    const ex = this.extraDamping;
    for (let y = 0; y < ny; y++) {
      const row = y * nx;
      for (let x = 0; x < nx; x++) {
        const i = row + x;
        const c = u[i];
        let lap = 0;
        if (x < nx - 1) lap += wE[i] * (u[i + 1] - c);
        if (x > 0) lap += wE[i - 1] * (u[i - 1] - c);
        if (y < ny - 1) lap += wN[i] * (u[i + nx] - c);
        if (y > 0) lap += wN[i - nx] * (u[i - nx] - c);
        next[i] = c + (keep[i] - ex) * (c - prev[i]) + lap;
      }
    }
    if (driving) {
      const g = Math.cos(OMEGA * this.time) * this.envelope(this.time);
      for (let k = 0; k < this.paddles.length; k++) {
        const a = this.amp[k] * g;
        if (a === 0) continue;
        const { idx, w } = this.paddles[k];
        for (let j = 0; j < idx.length; j++) next[idx[j]] += a * w[j];
      }
    }
    this.prev = u;
    this.u = next;
    this.next = prev;
    this.time++;
  }

  energy(): number {
    let e = 0;
    for (let i = 0; i < this.u.length; i++) e += this.u[i] * this.u[i];
    return e;
  }
}

/**
 * A lock-in amplifier on every probe: multiply the probe signal by the drive clock
 * (and by the clock shifted a quarter period) and average over whole periods.
 * The in-phase part is the signed answer; the quadrature part is ignored.
 */
export class LockIn {
  readonly re: Float64Array;
  readonly im: Float64Array;
  count = 0;
  constructor(n: number) {
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
  }
  reset(): void {
    this.re.fill(0);
    this.im.fill(0);
    this.count = 0;
  }
  /** Record the probes after step `n` has been taken (they hold η at time n). */
  add(tank: WaveTank): void {
    const n = tank.time;
    const c = Math.cos(OMEGA * n);
    const s = Math.sin(OMEGA * n);
    for (let k = 0; k < tank.probes.length; k++) {
      const v = tank.u[tank.probes[k]];
      this.re[k] += v * c;
      this.im[k] -= v * s;
    }
    this.count++;
  }
  /** Complex amplitude at each probe, valid after a whole number of periods. */
  result(): { re: Float64Array; im: Float64Array } {
    const f = 2 / Math.max(1, this.count);
    return { re: this.re.map((v) => v * f), im: this.im.map((v) => v * f) };
  }
}

/** Steps for the switch-on transient to die away (reading error below ~1e-3). */
export const SETTLE_STEPS = 2000;

/**
 * Run the time-domain tank to steady state with input vector x and return the
 * lock-in reading at every probe. This is the honest, slow way: no shortcuts.
 */
export function runTimeDomain(spec: TankSpec, x: ArrayLike<number>, settle = SETTLE_STEPS, periods = 4, ramp = 3 * PERIOD) {
  const tank = new WaveTank(spec);
  tank.ramp = ramp;
  for (let k = 0; k < x.length; k++) tank.amp[k] = x[k];
  const lock = new LockIn(spec.probes.length);
  const total = settle + periods * PERIOD;
  while (tank.time < total) {
    tank.step();
    if (tank.time > settle) lock.add(tank);
  }
  return lock.result();
}
