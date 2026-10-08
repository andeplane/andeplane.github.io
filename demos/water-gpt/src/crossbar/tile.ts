/**
 * Programming a weight block onto a physical crossbar tile, and using it to multiply.
 *
 * Signs. Water heads and valve openings are both non-negative, so a signed multiply uses two
 * tricks from analogue in-memory computing:
 *  - every logical output j has a differential pair of collector columns (j⁺, j⁻); the answer
 *    is the difference of their outflows, y_j ∝ Q(j⁺) − Q(j⁻);
 *  - a signed input x_i is split into two reservoirs, x_i⁺ = max(x_i, 0) and x_i⁻ = max(−x_i, 0).
 *    The x⁻ row has its valves swapped between the j⁺ and j⁻ columns, so it subtracts.
 *  So the logical weight w_ij becomes up to four valves: on the x⁺ row, opening |w|/w_max on
 *  column j⁺ if w > 0 (else j⁻); on the x⁻ row, the same opening on the opposite column.
 *  When the inputs can never be negative (ReLU outputs, attention probabilities) the x⁻ rows
 *  are left out.
 *
 * Physical layout: rows are interleaved (x₀⁺, x₀⁻, x₁⁺, …) and columns too (y₀⁺, y₀⁻, y₁⁺, …).
 *
 * Non-idealities modelled (all optional):
 *  - quantised valves: the opening is one of 2^bits evenly spaced stops between shut and open;
 *  - programming error: each valve's conductance is off by σ × (full opening), Gaussian, fixed
 *    when the tile is set (closed valves can leak a little; conductance is clamped at 0);
 *  - manifold resistance λ (IR drop), solved exactly by the network model, after a one-off
 *    per-collector gain calibration (see calibrate()).
 * The reservoir heads are scaled per input vector so the largest |x| uses the full head; that
 * scale and the per-tile weight scale w_max are applied when the collector flows are read out.
 */
import { CrossbarNetwork, type NetworkSolution } from './network.ts';
import { gauss3 } from './rng.ts';

export interface CrossbarSettings {
  /** Valve resolution in bits (2^bits stops), or null for continuously variable valves. */
  bits: number | null;
  /** Valve programming error σ, as a fraction of the full opening. */
  noise: number;
  /** Dimensionless manifold resistance per segment, λ = r · g_max. */
  lambda: number;
  /** Seed for the programming error. */
  seed: number;
  /**
   * Where each valve's programming error comes from. 'stream' (default): a seeded sequence
   * per tile. 'hash': a counter-based hash of (tile seed, physical row, physical column),
   * so a GPU can recompute any one valve's error on the fly (used by the big models).
   */
  errors?: 'stream' | 'hash';
  /**
   * How the manifold network is solved. 'network' (default): the full linear network,
   * exactly. 'first-order': the first-order expansion in λ of the same network (every valve
   * sees its reservoir head minus the drop along its row and the rise along its column, both
   * computed from the intended openings); see transferFirstOrder(). Used by the big models,
   * where a full solve per tile is out of reach.
   */
  ir?: 'network' | 'first-order';
}

export const IDEAL: CrossbarSettings = { bits: null, noise: 0, lambda: 0, seed: 1 };

/** Logical tile edge: each physical tile holds at most TILE × TILE weights. */
export const TILE = 64;

/** Seeded Gaussian (mulberry32 + Box–Muller). */
export function gaussianStream(seed: number): () => number {
  let st = seed >>> 0;
  const u = () => {
    st = (st + 0x6d2b79f5) >>> 0;
    let t = st;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    let a = u();
    if (a < 1e-12) a = 1e-12;
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
  };
}

export function quantiseOpening(o: number, bits: number | null): number {
  if (bits === null) return o;
  const L = (1 << bits) - 1;
  return Math.round(o * L) / L;
}

export interface TileDetail {
  heads: Float64Array;
  headScale: number;
  sol: NetworkSolution;
  flows: { row: Float32Array; col: Float32Array; valve: Float32Array };
}

export class CrossbarTile {
  readonly R: number;
  readonly C: number;
  /** Largest |w| in the block: a fully open valve stands for this weight. */
  readonly wmax: number;
  /** Signed, quantised logical weights as actually set: ±opening · wmax. */
  readonly wSet: Float32Array;
  readonly net: CrossbarNetwork;
  private T: Float64Array | null = null;
  /** Per-collector readout gain from the calibration run (null until calibrated). */
  private gain: Float64Array | null = null;
  /** Conductances as intended (quantised, before programming error). */
  private gIntended: Float64Array;
  private heads: Float64Array;
  private q: Float64Array;

  /**
   * @param w   the logical block, row-major [k × n] in calc-gpt's layout (y = x · W).
   * @param signedInputs whether the inputs can be negative (adds the x⁻ rows).
   */
  constructor(
    readonly w: Float32Array,
    readonly k: number,
    readonly n: number,
    readonly signedInputs: boolean,
    readonly settings: CrossbarSettings,
  ) {
    this.R = signedInputs ? 2 * k : k;
    this.C = 2 * n;
    let m = 0;
    for (let i = 0; i < k * n; i++) m = Math.max(m, Math.abs(w[i]));
    this.wmax = m > 0 ? m : 1;
    const g = new Float64Array(this.R * this.C);
    this.wSet = new Float32Array(k * n);
    const rs = signedInputs ? 2 : 1;
    for (let i = 0; i < k; i++)
      for (let j = 0; j < n; j++) {
        const v = w[i * n + j];
        const o = quantiseOpening(Math.abs(v) / this.wmax, settings.bits);
        this.wSet[i * n + j] = Math.sign(v) * o * this.wmax;
        const pos = v >= 0 ? 0 : 1;
        g[i * rs * this.C + 2 * j + pos] = o;
        if (signedInputs) g[(i * 2 + 1) * this.C + 2 * j + (1 - pos)] = o;
      }
    this.gIntended = g.slice();
    if (settings.noise > 0) {
      if (settings.errors === 'hash') {
        const C = this.C;
        for (let t = 0; t < g.length; t++) g[t] = Math.max(0, g[t] + settings.noise * gauss3(settings.seed, (t / C) | 0, t % C));
      } else {
        const rnd = gaussianStream(settings.seed);
        for (let t = 0; t < g.length; t++) g[t] = Math.max(0, g[t] + settings.noise * rnd());
      }
    }
    this.net = new CrossbarNetwork(this.R, this.C, g, settings.lambda);
    this.heads = new Float64Array(this.R);
    this.q = new Float64Array(this.C);
  }

  /**
   * Calibration, as done on a real crossbar: fill every reservoir to full head, measure each
   * collector's outflow, and compare with what the intended valve settings should give in an
   * ideal network. The ratio becomes that collector's flowmeter gain. It removes the uniform
   * part of the manifold loss (and the column-sum part of the valve error); what is left is
   * the input-dependent error, which is what the exhibit reports.
   */
  calibrate(): void {
    if (this.gain) return;
    const { R, C } = this;
    const ones = new Float64Array(R).fill(1);
    const ideal = new Float64Array(C);
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) ideal[j] += this.gIntended[i * C + j];
    let actual: Float64Array;
    if (this.firstOrder) {
      this.T ??= transferFirstOrder(R, C, this.net.g, this.gIntended, this.settings.lambda);
      actual = new Float64Array(C);
      for (let j = 0; j < C; j++) for (let i = 0; i < R; i++) actual[j] += this.T[j * R + i];
    } else actual = this.settings.lambda > 0 ? this.net.solve(ones, 1e-11).q : this.net.idealOutflow(ones);
    this.gain = new Float64Array(C);
    for (let j = 0; j < C; j++) this.gain[j] = actual[j] > 1e-9 && ideal[j] > 1e-9 ? ideal[j] / actual[j] : 1;
  }

  /** Calibrate, then solve the network once per reservoir so later multiplies are one superposition. */
  commission(): void {
    this.calibrate();
    if (!this.T && this.settings.lambda > 0) this.T = this.net.transferMatrix();
  }

  private get firstOrder(): boolean {
    return this.settings.ir === 'first-order' && this.settings.lambda > 0;
  }

  get commissioned(): boolean {
    return this.T !== null || this.settings.lambda <= 0;
  }

  /** Reservoir heads for input x: split into x⁺/x⁻ and scaled so max |x| is a full head. */
  setHeads(x: ArrayLike<number>, xOff = 0): number {
    let xs = 0;
    for (let i = 0; i < this.k; i++) xs = Math.max(xs, Math.abs(x[xOff + i]));
    const h = this.heads;
    h.fill(0);
    if (xs === 0) return 0;
    for (let i = 0; i < this.k; i++) {
      const v = x[xOff + i] / xs;
      if (this.signedInputs) {
        if (v > 0) h[2 * i] = v;
        else h[2 * i + 1] = -v;
      } else h[i] = Math.max(0, v);
    }
    return xs;
  }

  /** y[yOff + j] += (this tile's share of) x·W, read from the collector flows. */
  matvecAdd(x: ArrayLike<number>, xOff: number, y: Float32Array, yOff: number): void {
    const xs = this.setHeads(x, xOff);
    if (xs === 0) return;
    this.calibrate();
    const { R, C } = this;
    const q = this.q;
    if (this.settings.lambda <= 0) this.net.idealOutflow(this.heads, q);
    else if (this.T || this.firstOrder) {
      this.T ??= transferFirstOrder(R, C, this.net.g, this.gIntended, this.settings.lambda);
      const T = this.T!;
      const h = this.heads;
      for (let j = 0; j < C; j++) {
        let acc = 0;
        const off = j * R;
        for (let i = 0; i < R; i++) acc += T[off + i] * h[i];
        q[j] = acc;
      }
    } else q.set(this.net.solve(this.heads, 1e-10).q);
    const gain = xs * this.wmax;
    const cg = this.gain!;
    for (let j = 0; j < this.n; j++) y[yOff + j] += gain * (cg[2 * j] * q[2 * j] - cg[2 * j + 1] * q[2 * j + 1]);
  }

  /** Full network state for input x, for drawing (heads, node heads, pipe flows). */
  detail(x: ArrayLike<number>, xOff = 0): TileDetail {
    const headScale = this.setHeads(x, xOff);
    const heads = this.heads.slice();
    const sol = this.net.solve(heads, 1e-9);
    return { heads, headScale, sol, flows: this.net.segmentFlows(sol) };
  }
}

/**
 * First-order manifold loss, as a transfer matrix T [C × R] (outflow of column j per unit
 * head on reservoir i).
 *
 * Zeroth order every valve sees its full reservoir head and an empty column, so valve (m, k)
 * passes f = g_mk·s_m. To first order in λ, the head at row node (i, j) has dropped by λ times
 * the flow through every row segment upstream of it, λ·Σ_m f_im·(min(m, j) + 1), and the
 * head at column node (i, j) has risen by λ times the flow through every column segment
 * between it and the collector, λ·Σ_m f_mj·(R − max(m, i)). Evaluating both with the intended
 * openings g⁰ (dropping terms of order σ·λ) gives a per-valve effective conductance
 *   T_ji = g_ij − λ·g⁰_ij·(A_ij + B_ij),
 *   A_ij = Σ_m g⁰_im·(min(m, j) + 1),   B_ij = Σ_m g⁰_mj·(R − max(m, i)).
 * The full network is linear in the heads, so this is the exact network's Taylor expansion to
 * first order; at λ = 3·10⁻⁵ on a 128 × 128 tile it captures most of the IR drop (see the tests).
 */
export function transferFirstOrder(R: number, C: number, g: ArrayLike<number>, g0: ArrayLike<number>, lambda: number): Float64Array {
  const T = new Float64Array(C * R);
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++) {
      const o = g0[i * C + j];
      let corr = 0;
      if (o !== 0) {
        let A = 0;
        for (let m = 0; m < C; m++) A += g0[i * C + m] * (Math.min(m, j) + 1);
        let B = 0;
        for (let m = 0; m < R; m++) B += g0[m * C + j] * (R - Math.max(m, i));
        corr = lambda * o * (A + B);
      }
      T[j * R + i] = g[i * C + j] - corr;
    }
  return T;
}
