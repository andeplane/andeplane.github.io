// CPU reference LBM solver — the correctness anchor for the WGSL kernel.
// Pure TypeScript, Node-runnable, no DOM/Babylon. Same algorithm, same flat
// indexing (idx = y*w + x), same constants as the GPU kernel; the vitest suite
// validates physics here, and the GPU kernel is a line-by-line port.
//
// Scheme: pull streaming + BGK collide fused per step, Guo forcing,
// optional Smagorinsky LES, Walsh–Burwinkle–Saar partial bounce-back for
// porous walls (solidity 0 = open, 1 = solid).

import { CONFIG } from '../../config'
import { CELL, EX, EY, OPP, Q, W, type SimParams, defaultParams } from './constants'

const CHOKE = CONFIG.inlet.choke

export interface LbmRefOptions {
  width: number
  height: number
  params?: Partial<SimParams>
  /** Wrap x (used by channel-flow tests; the game uses inlet/outlet instead). */
  periodicX?: boolean
}

export class LbmRef {
  readonly w: number
  readonly h: number
  readonly n: number
  readonly params: SimParams
  readonly periodicX: boolean

  /** Post-collision distributions, SoA: f[i*n + idx]. */
  f: Float32Array
  private fNext: Float32Array

  /** Cell classes (CELL.*) and wall solidity (only meaningful for WALL cells). */
  readonly cellType: Uint32Array
  readonly solidity: Float32Array

  /** Per-cell external force (towers etc.), added to params.gx/gy. */
  readonly forceX: Float32Array
  readonly forceY: Float32Array

  /** Inlet boundary state per row: density and x-velocity (rows not in an inlet ignore it). */
  readonly inletRho: Float32Array
  readonly inletU: Float32Array

  /** Macroscopic outputs of the last step. */
  readonly rho: Float32Array
  readonly ux: Float32Array
  readonly uy: Float32Array

  constructor(opts: LbmRefOptions) {
    this.w = opts.width
    this.h = opts.height
    this.n = this.w * this.h
    this.params = { ...defaultParams(), ...opts.params }
    this.periodicX = opts.periodicX ?? false
    this.f = new Float32Array(Q * this.n)
    this.fNext = new Float32Array(Q * this.n)
    this.cellType = new Uint32Array(this.n)
    this.solidity = new Float32Array(this.n)
    this.forceX = new Float32Array(this.n)
    this.forceY = new Float32Array(this.n)
    this.inletRho = new Float32Array(this.h).fill(1)
    this.inletU = new Float32Array(this.h)
    this.rho = new Float32Array(this.n).fill(1)
    this.ux = new Float32Array(this.n)
    this.uy = new Float32Array(this.n)
    this.initEquilibrium()
  }

  idx(x: number, y: number): number {
    return y * this.w + x
  }

  /** Reset all fluid to equilibrium at the given density field (default ρ=1, u=0). */
  initEquilibrium(rhoInit?: (x: number, y: number) => number): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const idx = this.idx(x, y)
        const r = rhoInit ? rhoInit(x, y) : 1
        this.rho[idx] = r
        for (let i = 0; i < Q; i++) this.f[i * this.n + idx] = W[i] * r
      }
    }
  }

  totalMass(): number {
    let m = 0
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const idx = this.idx(x, y)
        if (this.cellType[idx] === CELL.OPEN || this.cellType[idx] === CELL.WALL) {
          for (let i = 0; i < Q; i++) m += this.f[i * this.n + idx]
        }
      }
    }
    return m
  }

  private solidityAt(idx: number): number {
    const t = this.cellType[idx]
    if (t === CELL.BEDROCK) return 1
    if (t === CELL.WALL) return this.solidity[idx]
    return 0
  }

  step(): void {
    const { w, h, n, params } = this
    const tau0 = params.tau0
    const smagC = params.smagorinsky
    const uClamp = params.uClamp
    const fIn = new Float32Array(Q)
    const feqArr = new Float32Array(Q)

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = this.idx(x, y)
        const type = this.cellType[idx]

        if (type === CELL.BEDROCK || (type === CELL.WALL && this.solidity[idx] >= 1)) {
          // Fully solid: hold at rest-state equilibrium (streaming pulls bounce
          // from the neighbour's own cell, never from inside solids).
          for (let i = 0; i < Q; i++) this.fNext[i * n + idx] = W[i]
          this.rho[idx] = 1
          this.ux[idx] = 0
          this.uy[idx] = 0
          continue
        }

        if (type === CELL.INLET) {
          const r = this.inletRho[y]
          // Back-pressure choke (see lbm.wgsl.ts): pump loses flow against head.
          const nIdx = this.idx(Math.min(x + 1, w - 1), y)
          let rhoN = 0
          for (let i = 0; i < Q; i++) rhoN += this.f[i * n + nIdx]
          const chokeFactor = Math.min(Math.max(1 - CHOKE * Math.max(rhoN - r, 0), 0), 1)
          const u = this.inletU[y] * chokeFactor
          const usq = u * u
          for (let i = 0; i < Q; i++) {
            const eu = EX[i] * u
            this.fNext[i * n + idx] = W[i] * r * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq)
          }
          this.rho[idx] = r
          this.ux[idx] = u
          this.uy[idx] = 0
          continue
        }

        if (type === CELL.OUTLET) {
          // Pressure outlet: anchor ρ = 1 (nothing else pins the domain's
          // pressure level), velocity extrapolated from upstream.
          const up = this.idx(Math.max(0, x - 1), y)
          let r = 0
          let mx = 0
          let my = 0
          for (let i = 0; i < Q; i++) {
            const v = this.f[i * n + up]
            r += v
            mx += EX[i] * v
            my += EY[i] * v
          }
          const vx = mx / r
          const vy = my / r
          const usq = vx * vx + vy * vy
          for (let i = 0; i < Q; i++) {
            const eu = EX[i] * vx + EY[i] * vy
            this.fNext[i * n + idx] = W[i] * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq)
          }
          this.rho[idx] = 1
          this.ux[idx] = vx
          this.uy[idx] = vy
          continue
        }

        // --- Pull streaming with partial bounce-back -------------------------
        for (let i = 0; i < Q; i++) {
          let sx = x - EX[i]
          const sy = y - EY[i]
          if (this.periodicX) sx = (sx + w) % w
          let streamed: number
          if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
            // Off-domain: treat as solid (full bounce-back from own cell).
            streamed = this.f[OPP[i] * n + idx]
          } else {
            const sIdx = this.idx(sx, sy)
            const s = this.solidityAt(sIdx)
            if (s <= 0) {
              streamed = this.f[i * n + sIdx]
            } else if (s >= 1) {
              streamed = this.f[OPP[i] * n + idx]
            } else {
              // Partial bounce-back (Walsh–Burwinkle–Saar): blend transmitted
              // and reflected populations by solidity.
              streamed = (1 - s) * this.f[i * n + sIdx] + s * this.f[OPP[i] * n + idx]
            }
          }
          fIn[i] = streamed
        }

        // --- Macroscopics (Guo half-force shift) -----------------------------
        let r = 0
        let mx = 0
        let my = 0
        for (let i = 0; i < Q; i++) {
          r += fIn[i]
          mx += EX[i] * fIn[i]
          my += EY[i] * fIn[i]
        }
        const fx = params.gx + this.forceX[idx]
        const fy = params.gy + this.forceY[idx]
        let vx = (mx + 0.5 * fx) / r
        let vy = (my + 0.5 * fy) / r

        // Stability clamp.
        const speed2 = vx * vx + vy * vy
        if (speed2 > uClamp * uClamp) {
          const scale = uClamp / Math.sqrt(speed2)
          vx *= scale
          vy *= scale
        }

        // --- Collision: BGK + optional Smagorinsky + Guo forcing -------------
        const usq = vx * vx + vy * vy
        for (let i = 0; i < Q; i++) {
          const eu = EX[i] * vx + EY[i] * vy
          feqArr[i] = W[i] * r * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq)
        }

        let tau = tau0
        if (smagC > 0) {
          // |Π_neq| from non-equilibrium second moment.
          let pxx = 0
          let pyy = 0
          let pxy = 0
          for (let i = 0; i < Q; i++) {
            const fneq = fIn[i] - feqArr[i]
            pxx += EX[i] * EX[i] * fneq
            pyy += EY[i] * EY[i] * fneq
            pxy += EX[i] * EY[i] * fneq
          }
          const piNorm = Math.sqrt(2 * (pxx * pxx + pyy * pyy + 2 * pxy * pxy))
          tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + (18 * smagC * smagC * piNorm) / r))
        }

        const omega = 1 / tau
        const forcePrefactor = 1 - 0.5 * omega
        for (let i = 0; i < Q; i++) {
          const eu = EX[i] * vx + EY[i] * vy
          const guo =
            forcePrefactor *
            W[i] *
            (3 * ((EX[i] - vx) * fx + (EY[i] - vy) * fy) + 9 * eu * (EX[i] * fx + EY[i] * fy))
          this.fNext[i * n + idx] = fIn[i] - omega * (fIn[i] - feqArr[i]) + guo
        }

        this.rho[idx] = r
        this.ux[idx] = vx
        this.uy[idx] = vy
      }
    }

    const tmp = this.f
    this.f = this.fNext
    this.fNext = tmp
  }
}
