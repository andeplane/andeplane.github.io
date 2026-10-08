import { gauss3, uniform3 } from './rng.ts'

/**
 * The hydraulic crossbar: how a weight matrix becomes valves, and how water computes
 * y = W·x with it.
 *
 * PHYSICS (what every function below implements, on CPU here and in WGSL in gpu/)
 *
 *  - Inputs are reservoir heads. Row i of a tile is a horizontal supply manifold whose
 *    reservoir stands at head h_i = x_i / s_x above the datum (s_x = max|x|, so heads are
 *    in [-1, 1]; a negative head is a reservoir below the datum and the flow reverses —
 *    laminar flow is linear in the pressure difference, so signs come for free). The
 *    reservoir level is set by a level gauge with `inBits` of resolution (a DAC).
 *  - Each weight is a differential pair of valves feeding two collector columns, c⁺ and
 *    c⁻. A valve is a thin pipe: Hagen–Poiseuille gives flow = g · Δh with conductance
 *    g ∝ r⁴/L. The opening of the valve on the sign's side is |w|/s quantised to
 *    `bits` (2^bits − 1 detents); the other valve is shut. s is a per-(tile, column) gauge,
 *    i.e. the flow meter at the bottom of each 64-row column segment has its own gain.
 *  - Kirchhoff: each collector sums its valves' flows. Out comes y_j = s_x·s_j·(F⁺ − F⁻).
 *  - Manufacturing: each open valve's conductance is off by a fixed relative error,
 *    uniform with standard deviation `progNoise` (the same valve always has the same
 *    error). Flow meters add Gaussian noise with std `readNoise` × the column's total
 *    throughput Σ|f| (turbulent fluctuations grow with flow).
 *  - Finite manifold resistance (IR drop), linearised to first order (one Jacobi sweep
 *    from the ideal flows), per 64×64 tile, with ρ = segment resistance × full-open valve
 *    conductance:
 *      supply rows (mean-field): valve p of 2N on the row sees
 *        h·(1 − ρ·Gᵢ·[(p+1) − p(p+1)/(2·2N)]), Gᵢ = Σ conductance on that row in the tile;
 *        exact if all valves on the row drew equal flow.
 *      collectors (exact first order): outlet at the bottom; segment k carries
 *        T_k = Σ_{m≤k} f_m, so node r backs up by ρ·Σ_{k≥r} T_k and the collected flow is
 *        F = T_last − ρ·Σ_k T_k·G_{≤k}, accumulated in one pass down the column.
 *  - `ideal` bypasses all of it: valves hold the exact float weight, heads are exact.
 */

export const TILE = 64
export const CODE_MAX = 127

export interface Physics {
  ideal: boolean
  /** Valve opening resolution in bits (1..7): 2^bits − 1 detents. */
  bits: number
  /** Reservoir level gauge (input DAC) resolution in bits, signed; 0 = continuous. */
  inBits: number
  /** Relative std of each valve's conductance error (fixed per valve). */
  progNoise: number
  /** Flow-meter noise, relative to the column's total throughput. */
  readNoise: number
  /** Manifold segment resistance × full-open valve conductance. */
  irDrop: number
  /** Seed for manufacturing errors and meter noise. */
  seed: number
}

export const IDEAL: Physics = { ideal: true, bits: 7, inBits: 0, progNoise: 0, readNoise: 0, irDrop: 0, seed: 1 }

/** The default "museum" machine: chosen so text stays coherent (see tools/reference-big.ts). */
export const DEFAULT_WATER: Physics = {
  ideal: false,
  bits: 7,
  inBits: 10,
  progNoise: 0.005,
  readNoise: 0.002,
  irDrop: 2e-6,
  seed: 1,
}

export function physicsKey(p: Physics): string {
  return p.ideal ? 'ideal' : `${p.bits}|${p.progNoise}|${p.seed}`
}

/** Shape of a weight matrix as a crossbar: rows = inputs, cols = outputs. */
export interface GridShape {
  rows: number
  cols: number
}

/**
 * One crossbar (a weight matrix) stored tile-major: tile (tr, tc) is a contiguous
 * 64×64 block, row-major inside. Codes are signed int8 valve settings at full 7-bit
 * resolution; coarser valves are derived from them (`bits`).
 */
export class TileGrid {
  readonly id: number
  readonly name: string
  readonly rows: number
  readonly cols: number
  readonly tilesR: number
  readonly tilesC: number
  readonly codes: Int8Array
  /** Gauge per (row tile, column): layout [tr][col]. */
  readonly scale: Float32Array
  /** Exact float weights, tile-major (only kept for the CPU/ideal path). */
  readonly w: Float32Array | null
  /** Derived conductances for the current physics (CPU path). */
  private geff: Float32Array | null = null
  private gsum: Float32Array | null = null
  private geffKey = ''

  constructor(id: number, name: string, rows: number, cols: number, keepFloat: boolean) {
    this.id = id
    this.name = name
    this.rows = rows
    this.cols = cols
    this.tilesR = Math.ceil(rows / TILE)
    this.tilesC = Math.ceil(cols / TILE)
    const n = this.tilesR * this.tilesC * TILE * TILE
    this.codes = new Int8Array(n)
    this.scale = new Float32Array(this.tilesR * cols)
    this.w = keepFloat ? new Float32Array(n) : null
  }

  get valves(): number {
    return this.rows * this.cols
  }

  index(r: number, c: number): number {
    const tr = (r / TILE) | 0
    const tc = (c / TILE) | 0
    return ((tr * this.tilesC + tc) * TILE + (r - tr * TILE)) * TILE + (c - tc * TILE)
  }

  /**
   * Program valves from a band of a stored tensor.
   *  - layout 'in_out' (Conv1D, [in, out]): storage row = crossbar row; the band must be
   *    a whole 64-row block (rowStart % 64 == 0) so each column gauge sees its full tile.
   *  - layout 'out_in' (nn.Linear / embedding, [out, in]): storage row = crossbar column.
   * `offset` places the tensor inside a fused grid (columns for in_out and out_in alike).
   */
  programBand(data: Float32Array, rowStart: number, rows: number, rowLen: number, layout: 'in_out' | 'out_in', colOffset: number): void {
    if (layout === 'in_out') {
      if (rowStart % TILE !== 0) throw new Error(`${this.name}: band not tile aligned`)
      const tr = rowStart / TILE
      for (let c = 0; c < rowLen; c++) {
        let m = 0
        for (let rr = 0; rr < rows; rr++) m = Math.max(m, Math.abs(data[rr * rowLen + c]))
        const col = c + colOffset
        this.scale[tr * this.cols + col] = m
        const inv = m > 0 ? CODE_MAX / m : 0
        for (let rr = 0; rr < rows; rr++) {
          const v = data[rr * rowLen + c]
          const idx = this.index(rowStart + rr, col)
          this.codes[idx] = Math.round(v * inv)
          if (this.w) this.w[idx] = v
        }
      }
    } else {
      // each storage row is one full crossbar column
      for (let k = 0; k < rows; k++) {
        const col = rowStart + k + colOffset
        const src = k * rowLen
        for (let tr = 0; tr < this.tilesR; tr++) {
          const r0 = tr * TILE
          const r1 = Math.min(this.rows, r0 + TILE)
          let m = 0
          for (let r = r0; r < r1; r++) m = Math.max(m, Math.abs(data[src + r]))
          this.scale[tr * this.cols + col] = m
          const inv = m > 0 ? CODE_MAX / m : 0
          for (let r = r0; r < r1; r++) {
            const v = data[src + r]
            const idx = this.index(r, col)
            this.codes[idx] = Math.round(v * inv)
            if (this.w) this.w[idx] = v
          }
        }
      }
    }
    this.geffKey = ''
  }

  /** Signed effective conductance of valve (r, c) in units of a full-open valve. */
  conductance(r: number, c: number, p: Physics): number {
    const q = this.codes[this.index(r, c)]
    return valveConductance(q, p, this.id, r, c)
  }

  /** The weight this valve pair actually realises (what a visitor reads on the plaque). */
  realisedWeight(r: number, c: number, p: Physics): number {
    if (p.ideal && this.w) return this.w[this.index(r, c)]
    const tr = (r / TILE) | 0
    return this.conductance(r, c, p) * this.scale[tr * this.cols + c]
  }

  /** Column of weights (used to read an embedding row back out of the LM-head valves). */
  readColumn(c: number, p: Physics, out: Float32Array): Float32Array {
    for (let r = 0; r < this.rows; r++) out[r] = this.realisedWeight(r, c, p)
    return out
  }

  /** Prepare conductances + per-row conductance sums for a physics setting (CPU). */
  prepare(p: Physics): { geff: Float32Array; gsum: Float32Array } {
    const key = physicsKey(p)
    if (this.geff && this.gsum && this.geffKey === key) return { geff: this.geff, gsum: this.gsum }
    const n = this.codes.length
    const geff = this.geff ?? new Float32Array(n)
    const gsum = this.gsum ?? new Float32Array(this.tilesR * TILE * this.tilesC)
    gsum.fill(0)
    for (let tr = 0; tr < this.tilesR; tr++) {
      for (let tc = 0; tc < this.tilesC; tc++) {
        const base = (tr * this.tilesC + tc) * TILE * TILE
        for (let rr = 0; rr < TILE; rr++) {
          const r = tr * TILE + rr
          let s = 0
          for (let cc = 0; cc < TILE; cc++) {
            const c = tc * TILE + cc
            const i = base + rr * TILE + cc
            let g: number
            if (r >= this.rows || c >= this.cols) g = 0
            else if (p.ideal) g = this.w ? this.w[i] : (this.codes[i] / CODE_MAX) * this.scale[tr * this.cols + c]
            else g = valveConductance(this.codes[i], p, this.id, r, c)
            geff[i] = g
            s += Math.abs(g)
          }
          gsum[r * this.tilesC + tc] = s
        }
      }
    }
    this.geff = geff
    this.gsum = gsum
    this.geffKey = key
    return { geff, gsum }
  }

  /** Drop derived CPU buffers (memory). */
  release(): void {
    this.geff = null
    this.gsum = null
    this.geffKey = ''
  }
}

/** Valve code (−127..127) → signed conductance for the given physics. */
export function valveConductance(q: number, p: Physics, gridId: number, r: number, c: number): number {
  if (q === 0) return 0
  const L = (1 << p.bits) - 1
  const mag = Math.abs(q)
  let g = Math.round((mag * L) / CODE_MAX) / L
  if (g === 0) return 0
  if (p.progNoise > 0) {
    const u = uniform3(p.seed ^ 0x51ed27, (gridId * 8191 + r) >>> 0, c)
    g *= 1 + p.progNoise * 1.7320508075688772 * (2 * u - 1)
    if (g < 0) g = 0
  }
  return q > 0 ? g : -g
}

/** κ(p) for the mean-field supply-row drop, with nv valves on the row. */
function rowKappa(p: number, nv: number): number {
  return p + 1 - (p * (p + 1)) / (2 * nv)
}

const KAPPA_FULL = (() => {
  const k = new Float64Array(2 * TILE)
  for (let p = 0; p < 2 * TILE; p++) k[p] = rowKappa(p, 2 * TILE)
  return k
})()

/**
 * Set reservoir heads for x[start, start+n): scale by the block's absmax (each 64-row
 * tile has its own reservoir gauge) and quantise to a signed `inBits` level gauge.
 */
export function gaugeHeads(x: ArrayLike<number>, n: number, inBits: number, heads: Float64Array, start = 0): number {
  let sx = 0
  for (let i = start; i < start + n; i++) sx = Math.max(sx, Math.abs(x[i]))
  if (sx === 0) {
    heads.fill(0, start, start + n)
    return 0
  }
  const Lin = inBits > 0 ? (1 << (inBits - 1)) - 1 : 0
  for (let i = start; i < start + n; i++) {
    let h = x[i] / sx
    if (Lin > 0) h = Math.round(h * Lin) / Lin
    heads[i] = h
  }
  return sx
}

let headScratch = new Float64Array(4096)

/**
 * y = W·x through the crossbar (CPU reference of the WGSL kernel).
 * `seed` distinguishes readouts (meter noise is drawn per call, column and tile).
 */
export function crossbarMatmul(grid: TileGrid, x: Float32Array, p: Physics, seed: number, out?: Float32Array): Float32Array {
  const R = grid.rows
  const C = grid.cols
  const y = out ?? new Float32Array(C)
  y.fill(0)
  const { geff, gsum } = grid.prepare(p)
  const tilesC = grid.tilesC

  if (p.ideal) {
    const acc = new Float64Array(C)
    for (let tr = 0; tr < grid.tilesR; tr++) {
      for (let rr = 0; rr < TILE; rr++) {
        const r = tr * TILE + rr
        if (r >= R) break
        const h = x[r]
        if (h === 0) continue
        for (let tc = 0; tc < tilesC; tc++) {
          const base = ((tr * tilesC + tc) * TILE + rr) * TILE
          const c0 = tc * TILE
          const n = Math.min(TILE, C - c0)
          for (let cc = 0; cc < n; cc++) acc[c0 + cc] += h * geff[base + cc]
        }
      }
    }
    for (let c = 0; c < C; c++) y[c] = acc[c]
    return y
  }

  if (headScratch.length < R) headScratch = new Float64Array(R)
  const heads = headScratch
  const rho = p.irDrop
  const sigR = p.readNoise
  const Tp = new Float64Array(C)
  const Tm = new Float64Array(C)
  const Gp = new Float64Array(C)
  const Gm = new Float64Array(C)
  const Ap = new Float64Array(C)
  const Am = new Float64Array(C)
  const Fa = new Float64Array(C)
  for (let tr = 0; tr < grid.tilesR; tr++) {
    const sx = gaugeHeads(x, Math.min(TILE, R - tr * TILE), p.inBits, heads, tr * TILE)
    if (sx === 0) continue
    Tp.fill(0), Tm.fill(0), Gp.fill(0), Gm.fill(0), Ap.fill(0), Am.fill(0), Fa.fill(0)
    if (rho === 0) {
      // No manifold resistance: F⁺ − F⁻ is just the signed sum (same arithmetic, faster).
      for (let rr = 0; rr < TILE; rr++) {
        const r = tr * TILE + rr
        if (r >= R) break
        const h = heads[r]
        if (h === 0) continue
        for (let tc = 0; tc < tilesC; tc++) {
          const base = ((tr * tilesC + tc) * TILE + rr) * TILE
          const c0 = tc * TILE
          const n = Math.min(TILE, C - c0)
          if (sigR > 0) {
            for (let cc = 0; cc < n; cc++) {
              const f = h * geff[base + cc]
              Tp[c0 + cc] += f
              Fa[c0 + cc] += Math.abs(f)
            }
          } else {
            for (let cc = 0; cc < n; cc++) Tp[c0 + cc] += h * geff[base + cc]
          }
        }
      }
      const srow = tr * C
      for (let c = 0; c < C; c++) {
        let F = Tp[c]
        if (sigR > 0 && Fa[c] > 0) F += sigR * Fa[c] * gauss3(seed, tr, c)
        y[c] += sx * grid.scale[srow + c] * F
      }
      continue
    }
    for (let rr = 0; rr < TILE; rr++) {
      const r = tr * TILE + rr
      if (r >= R) break
      const h = heads[r]
      for (let tc = 0; tc < tilesC; tc++) {
        const base = ((tr * tilesC + tc) * TILE + rr) * TILE
        const c0 = tc * TILE
        const n = Math.min(TILE, C - c0)
        const nv = 2 * n
        const drop = rho * gsum[r * tilesC + tc]
        for (let cc = 0; cc < n; cc++) {
          const g = geff[base + cc]
          if (g === 0) continue
          const c = c0 + cc
          if (g > 0) {
            const k = n === TILE ? KAPPA_FULL[2 * cc] : rowKappa(2 * cc, nv)
            const f = g * h * (1 - drop * k)
            const T = Tp[c] + f
            const G = Gp[c] + g
            Tp[c] = T
            Gp[c] = G
            Ap[c] += T * G
            Fa[c] += Math.abs(f)
          } else {
            const gm = -g
            const k = n === TILE ? KAPPA_FULL[2 * cc + 1] : rowKappa(2 * cc + 1, nv)
            const f = gm * h * (1 - drop * k)
            const T = Tm[c] + f
            const G = Gm[c] + gm
            Tm[c] = T
            Gm[c] = G
            Am[c] += T * G
            Fa[c] += Math.abs(f)
          }
        }
      }
    }
    const srow = tr * C
    for (let c = 0; c < C; c++) {
      let F = Tp[c] - rho * Ap[c] - (Tm[c] - rho * Am[c])
      if (sigR > 0 && Fa[c] > 0) F += sigR * Fa[c] * gauss3(seed, tr, c)
      y[c] += sx * grid.scale[srow + c] * F
    }
  }
  return y
}

/** Plain float y = W·x on row-major [rows, cols] weights (the digital reference). */
export function floatMatmul(w: Float32Array, rows: number, cols: number, x: Float32Array, out?: Float32Array): Float32Array {
  const acc = new Float64Array(cols)
  for (let r = 0; r < rows; r++) {
    const h = x[r]
    if (h === 0) continue
    const o = r * cols
    for (let c = 0; c < cols; c++) acc[c] += h * w[o + c]
  }
  const y = out ?? new Float32Array(cols)
  for (let c = 0; c < cols; c++) y[c] = acc[c]
  return y
}

/**
 * The shared crossbar API: anything that can run y = W·x on a TileGrid. The CPU
 * implementation is below; the WebGPU one lives in gpu/gpu-machine.ts.
 */
export interface CrossbarBackend {
  physics: Physics
  matmul(grid: TileGrid, x: Float32Array, seed: number, out?: Float32Array): Float32Array
}

export class CpuCrossbar implements CrossbarBackend {
  physics: Physics
  constructor(physics: Physics) {
    this.physics = physics
  }
  matmul(grid: TileGrid, x: Float32Array, seed: number, out?: Float32Array): Float32Array {
    return crossbarMatmul(grid, x, this.physics, seed, out)
  }
}
