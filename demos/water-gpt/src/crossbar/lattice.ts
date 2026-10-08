/**
 * The same water, fast: crossbars for models with ~10⁸ valves.
 *
 * A CrossbarTile with `errors: 'hash'` and `ir: 'first-order'` is a linear machine whose
 * collector readout depends only on the valve settings, so each logical weight w_ij has a
 * *realised* value for a positive input (the x⁺ reservoir carries it) and one for a negative
 * input (the x⁻ reservoir carries it). This module computes those realised weights for a
 * whole 64 × 64 tile in O(valves) — prefix sums instead of the O(valves·(R + C)) direct
 * formula — and multiplies with them. It is the CPU twin of the WebGPU tile kernel
 * (src/big/gpu/kernels.ts), and both are checked against CpuCrossbar (see lattice.test.ts).
 *
 * Model, per tile (see tile.ts for the hydraulics):
 *  - w_max = max |w| in the tile; opening o = quantise(|w| / w_max, bits);
 *  - signed inputs: physical row 2i is x_i⁺, 2i+1 is x_i⁻; column 2j is y_j⁺, 2j+1 is y_j⁻;
 *    w ≥ 0 opens (2i, 2j) and (2i+1, 2j+1), w < 0 opens (2i, 2j+1) and (2i+1, 2j);
 *    unsigned inputs (attention weights) have only row i, opening (i, 2j + [w < 0]);
 *  - valve error: g = max(0, g⁰ + σ·N(seed, row, col)) on every valve, open or shut;
 *  - first-order manifold loss: g_eff = g − λ·g⁰·(A + B) (see transferFirstOrder);
 *  - per-collector calibration gain = Σ_rows g⁰ / Σ_rows g_eff (all reservoirs full);
 *  - readout y_j = w_max · Σ_rows head · (gain⁺·g_eff(row, j⁺) − gain⁻·g_eff(row, j⁻)).
 */
import { gauss3 } from './rng.ts';
import { matrixSeed, tileSeed } from './matrix.ts';
import { quantiseOpening, TILE, type CrossbarSettings } from './tile.ts';
import type { Backend, TraceEvent, WeightSpec } from '../engine/backend.ts';

export interface RealisedTile {
  wmax: number;
  /** Realised weight for a positive input, [k × n]. */
  pos: Float32Array;
  /** Realised weight for a negative input (zeros for an unsigned tile), [k × n]. */
  neg: Float32Array;
}

/**
 * Realised weights of one tile. `get(i, j)` returns the logical weight w_ij (i < k, j < n).
 * Results are written into `pos`/`neg` at [outOff + i·outStride + j].
 */
export function realiseTile(
  get: (i: number, j: number) => number,
  k: number,
  n: number,
  signed: boolean,
  s: CrossbarSettings,
  seed: number,
  pos: Float32Array,
  neg: Float32Array | null,
  outOff = 0,
  outStride = n,
): number {
  const R = signed ? 2 * k : k;
  const C = 2 * n;
  let wmax = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < n; j++) wmax = Math.max(wmax, Math.abs(get(i, j)));
  if (wmax === 0) wmax = 1;
  // Intended openings and which column of the pair is open on the x⁺ row.
  const o = new Float64Array(k * n);
  const neg0 = new Uint8Array(k * n);
  for (let i = 0; i < k; i++)
    for (let j = 0; j < n; j++) {
      const w = get(i, j);
      o[i * n + j] = quantiseOpening(Math.abs(w) / wmax, s.bits);
      neg0[i * n + j] = w >= 0 ? 0 : 1;
    }
  const lambda = s.lambda;
  // corr[(r·n + j)] = λ·o·(A + B) at the open valve of physical row r, logical column j.
  const corr = new Float64Array(R * n);
  if (lambda > 0) {
    // A: along each physical row.
    for (let r = 0; r < R; r++) {
      const i = signed ? r >> 1 : r;
      const flip = signed ? r & 1 : 0;
      let tot = 0;
      for (let j = 0; j < n; j++) tot += o[i * n + j];
      let P = 0;
      let N = 0;
      for (let j = 0; j < n; j++) {
        const oj = o[i * n + j];
        const c = 2 * j + (neg0[i * n + j] ^ flip);
        P += oj * (c + 1);
        N += oj;
        corr[r * n + j] = P + (c + 1) * (tot - N);
      }
    }
    // B: down each physical column. Column 2j+p is open on physical row 2i + (p ^ neg0)
    // (signed) or on row i when neg0 = p (unsigned).
    for (let j = 0; j < n; j++)
      for (let p = 0; p < 2; p++) {
        // Collect open entries (row, opening) in row order.
        let wTot = 0;
        for (let i = 0; i < k; i++) {
          const oi = o[i * n + j];
          if (signed) wTot += oi * (R - (2 * i + (p ^ neg0[i * n + j])));
          else if (neg0[i * n + j] === p) wTot += oi * (R - i);
        }
        let G = 0;
        let W = 0;
        for (let i = 0; i < k; i++) {
          const oi = o[i * n + j];
          let r: number;
          if (signed) r = 2 * i + (p ^ neg0[i * n + j]);
          else if (neg0[i * n + j] === p) r = i;
          else continue;
          G += oi;
          W += oi * (R - r);
          const B = (R - r) * G + (wTot - W);
          corr[r * n + j] += B;
        }
      }
    for (let r = 0; r < R; r++)
      for (let j = 0; j < n; j++) {
        const i = signed ? r >> 1 : r;
        corr[r * n + j] *= lambda * o[i * n + j];
      }
  }
  // Effective conductance of every valve, and the calibration sums.
  const geff = new Float64Array(R * C);
  const ideal = new Float64Array(C);
  const actual = new Float64Array(C);
  const sigma = s.noise;
  for (let r = 0; r < R; r++) {
    const i = signed ? r >> 1 : r;
    const flip = signed ? r & 1 : 0;
    for (let j = 0; j < n; j++) {
      const oj = o[i * n + j];
      const open = 2 * j + (neg0[i * n + j] ^ flip);
      for (let c = 2 * j; c < 2 * j + 2; c++) {
        const g0 = c === open ? oj : 0;
        let g = g0;
        if (sigma > 0) g = Math.max(0, g0 + sigma * gauss3(seed, r, c));
        const ge = c === open ? g - corr[r * n + j] : g;
        geff[r * C + c] = ge;
        ideal[c] += g0;
        actual[c] += ge;
      }
    }
  }
  const gain = new Float64Array(C);
  for (let c = 0; c < C; c++) gain[c] = actual[c] > 1e-9 && ideal[c] > 1e-9 ? ideal[c] / actual[c] : 1;
  for (let i = 0; i < k; i++)
    for (let j = 0; j < n; j++) {
      const rp = signed ? 2 * i : i;
      const at = outOff + i * outStride + j;
      pos[at] = wmax * (gain[2 * j] * geff[rp * C + 2 * j] - gain[2 * j + 1] * geff[rp * C + 2 * j + 1]);
      if (neg) {
        const rn = 2 * i + 1;
        neg[at] = signed ? -wmax * (gain[2 * j] * geff[rn * C + 2 * j] - gain[2 * j + 1] * geff[rn * C + 2 * j + 1]) : 0;
      }
    }
  return wmax;
}

/**
 * A whole K × N matrix on lattice tiles. Equivalent to
 * `new CpuCrossbar(name, W, K, N, signed, { ...s, errors: 'hash', ir: 'first-order' })`.
 */
export class LatticeCrossbar {
  readonly pos: Float32Array;
  readonly neg: Float32Array;

  constructor(
    readonly name: string,
    W: ArrayLike<number>,
    readonly K: number,
    readonly N: number,
    readonly signedInputs: boolean,
    s: CrossbarSettings,
    base = matrixSeed(name, s.seed),
  ) {
    this.pos = new Float32Array(K * N);
    this.neg = new Float32Array(signedInputs ? K * N : 0);
    for (let r0 = 0; r0 < K; r0 += TILE)
      for (let c0 = 0; c0 < N; c0 += TILE) {
        const k = Math.min(TILE, K - r0);
        const n = Math.min(TILE, N - c0);
        realiseTile(
          (i, j) => W[(r0 + i) * N + c0 + j],
          k,
          n,
          signedInputs,
          s,
          tileSeed(base, r0 / TILE, c0 / TILE),
          this.pos,
          signedInputs ? this.neg : null,
          r0 * N + c0,
          N,
        );
      }
  }

  matvec(x: ArrayLike<number>, y = new Float32Array(this.N)): Float32Array {
    y.fill(0);
    const { N } = this;
    for (let i = 0; i < this.K; i++) {
      const xi = x[i];
      if (xi === 0) continue;
      if (xi < 0 && !this.signedInputs) continue;
      const W = xi > 0 ? this.pos : this.neg;
      const off = i * N;
      for (let j = 0; j < N; j++) y[j] += xi * W[off + j];
    }
    return y;
  }

  /** Column j read backwards (one collector driven, the reservoirs read): the realised x⁺ weights. */
  column(j: number, out = new Float32Array(this.K)): Float32Array {
    for (let i = 0; i < this.K; i++) out[i] = this.pos[i * this.N + j];
    return out;
  }
}

/** Seed of an attention crossbar set on the fly: per tag (layer, head, product) and position. */
export function transientSeed(tag: string, seed: number, nKeys: number): number {
  return matrixSeed(`${tag}@${nKeys}`, seed);
}

/**
 * A Backend on lattice crossbars: the big models' water. Weight crossbars are realised once
 * (lazily, per matrix); attention crossbars are set from the activations at every step, with
 * fresh valve errors each time, exactly like WaterBackend does with CpuCrossbar.
 */
export class LatticeBackend implements Backend {
  readonly kind = 'water';
  trace: ((e: TraceEvent) => void) | null = null;
  private specs = new Map<string, WeightSpec>();
  private bars = new Map<string, LatticeCrossbar>();

  constructor(
    specs: WeightSpec[],
    readonly settings: CrossbarSettings,
  ) {
    for (const s of specs) this.specs.set(s.name, s);
  }

  crossbar(name: string): LatticeCrossbar {
    let c = this.bars.get(name);
    if (!c) {
      const s = this.specs.get(name);
      if (!s) throw new Error(`no weight ${name}`);
      c = new LatticeCrossbar(name, s.W, s.K, s.N, s.signedInputs, this.settings);
      this.bars.set(name, c);
    }
    return c;
  }

  /** Realise every weight crossbar now (otherwise done on first use). */
  commissionSync(): void {
    for (const n of this.specs.keys()) this.crossbar(n);
  }

  linear(name: string, x: Float32Array): Float32Array {
    const y = this.crossbar(name).matvec(x);
    this.trace?.({ kind: 'linear', name, label: this.specs.get(name)!.label, x, y });
    return y;
  }

  column(name: string, j: number): Float32Array {
    return this.crossbar(name).column(j);
  }

  scores(tag: string, q: Float32Array, keys: Float32Array[]): Float32Array {
    const N = keys.length;
    const K = keys[0].length;
    const W = new Float32Array(K * N);
    for (let j = 0; j < N; j++) for (let d = 0; d < K; d++) W[d * N + j] = keys[j][d];
    const c = new LatticeCrossbar(tag, W, K, N, true, this.settings, transientSeed(tag, this.settings.seed, N));
    const y = c.matvec(q);
    this.trace?.({ kind: 'scores', name: tag, label: tag, x: q, y });
    return y;
  }

  mix(tag: string, p: Float32Array, values: Float32Array[]): Float32Array {
    const K = values.length;
    const N = values[0].length;
    const W = new Float32Array(K * N);
    for (let j = 0; j < K; j++) W.set(values[j], j * N);
    const c = new LatticeCrossbar(tag, W, K, N, false, this.settings, transientSeed(tag, this.settings.seed, K));
    const y = c.matvec(p);
    this.trace?.({ kind: 'mix', name: tag, label: tag, x: p, y });
    return y;
  }
}
