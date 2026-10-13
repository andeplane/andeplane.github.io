// CPU reference D2Q9 lattice Boltzmann solver. Pure TypeScript, runs in Node
// for the build-time truth-table tests. The GLSL kernel in gl/shaders.ts is a
// line-by-line port of `step()`: same pull streaming, same boundary rules, same
// Smagorinsky-BGK collision, same constants (from d2q9.ts).

import { CELL, EX, EY, OPP, PHYS, Q, W, feq } from './d2q9.ts'
import type { Raster } from './geometry.ts'

export interface Valve {
  /** Unit jet direction. */
  dx: number
  dy: number
  /** Opening 0..1 (the jet speed is opening × PHYS.jetSpeed). */
  open: number
}

export class CpuLbm {
  readonly w: number
  readonly h: number
  readonly n: number
  readonly geo: Raster
  /** Post-collision populations, SoA: f[i*n + idx]. */
  f: Float32Array
  private g: Float32Array
  readonly rho: Float32Array
  readonly ux: Float32Array
  readonly uy: Float32Array
  valves: Valve[] = []
  steps = 0

  constructor(geo: Raster) {
    this.geo = geo
    this.w = geo.w
    this.h = geo.h
    this.n = this.w * this.h
    this.f = new Float32Array(Q * this.n)
    this.g = new Float32Array(Q * this.n)
    this.rho = new Float32Array(this.n).fill(1)
    this.ux = new Float32Array(this.n)
    this.uy = new Float32Array(this.n)
    for (let i = 0; i < Q; i++) this.f.fill(W[i], i * this.n, (i + 1) * this.n)
  }

  private wall: Uint8Array | null = null

  /** Wall mask for this step: solids, plus nozzles whose valve is shut. */
  private buildWallMask(): Uint8Array {
    const { geo, n } = this
    const m = this.wall ?? (this.wall = new Uint8Array(n))
    for (let i = 0; i < n; i++) {
      const t = geo.type[i]
      m[i] = t === CELL.SOLID || (t === CELL.NOZZLE && this.valves[geo.nozzle[i]].open < PHYS.valveShut) ? 1 : 0
    }
    return m
  }

  step(): void {
    const { w, h, n, f, g, geo } = this
    const tau = PHYS.tau
    const smag2 = PHYS.smagorinsky * PHYS.smagorinsky
    const fin = new Float64Array(Q)
    const wall = this.buildWallMask()
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        const type = geo.type[idx]
        // walls hold no state: neighbours bounce off them instead of pulling
        if (wall[idx]) continue
        if (type === CELL.NOZZLE) {
          const v = this.valves[geo.nozzle[idx]]
          const s = v.open * PHYS.jetSpeed
          const u = v.dx * s
          const vv = v.dy * s
          for (let i = 0; i < Q; i++) g[i * n + idx] = feq(i, 1, u, vv)
          this.rho[idx] = 1
          this.ux[idx] = u
          this.uy[idx] = vv
          continue
        }
        if (type === CELL.DRAIN) {
          const code = geo.drainDir[idx]
          const nx = (code % 3) - 1
          const ny = Math.floor(code / 3) - 1
          // velocity of the upstream cell, from its (old) post-collision
          // populations — collision conserves momentum, so this is its u.
          const src = (y - ny) * w + (x - nx)
          let rs = 0
          let ms = 0
          let ns = 0
          for (let i = 0; i < Q; i++) {
            const v = f[i * n + src]
            rs += v
            ms += v * EX[i]
            ns += v * EY[i]
          }
          // keep only the normal component, and throttle inflow: an open
          // boundary that freely passes tangential or re-entering flow lets a
          // through-current between two vents run away on its own.
          let un = (ms / rs) * nx + (ns / rs) * ny
          if (un < 0) un *= PHYS.drainInflow
          const u = un * nx
          const vv = un * ny
          for (let i = 0; i < Q; i++) g[i * n + idx] = feq(i, 1, u, vv)
          this.rho[idx] = 1
          this.ux[idx] = u
          this.uy[idx] = vv
          continue
        }
        // fluid: pull-stream with half-way bounce-back
        let r = 0
        let mx = 0
        let my = 0
        for (let i = 0; i < Q; i++) {
          const sx = x - EX[i]
          const sy = y - EY[i]
          const sIdx = sy * w + sx
          const v = wall[sIdx] ? f[OPP[i] * n + idx] : f[i * n + sIdx]
          fin[i] = v
          r += v
          mx += v * EX[i]
          my += v * EY[i]
        }
        let ux = mx / r
        let uy = my / r
        const sp = Math.hypot(ux, uy)
        if (sp > PHYS.uClamp) {
          ux *= PHYS.uClamp / sp
          uy *= PHYS.uClamp / sp
        }
        // non-equilibrium momentum flux → Smagorinsky effective τ
        let pxx = 0
        let pyy = 0
        let pxy = 0
        for (let i = 0; i < Q; i++) {
          const ne = fin[i] - feq(i, r, ux, uy)
          pxx += EX[i] * EX[i] * ne
          pyy += EY[i] * EY[i] * ne
          pxy += EX[i] * EY[i] * ne
        }
        const qn = Math.sqrt(pxx * pxx + pyy * pyy + 2 * pxy * pxy)
        const te = 0.5 * (tau + Math.sqrt(tau * tau + 18 * Math.SQRT2 * smag2 * qn / r))
        const om = 1 / te
        for (let i = 0; i < Q; i++) {
          g[i * n + idx] = fin[i] + om * (feq(i, r, ux, uy) - fin[i])
        }
        this.rho[idx] = r
        this.ux[idx] = ux
        this.uy[idx] = uy
      }
    }
    this.f = g
    this.g = f
    this.steps++
  }

  /** Σ u_y over a horizontal line of cells (flux down through it, per unit depth). */
  fluxDown(x0: number, x1: number, y: number): number {
    let s = 0
    for (let x = x0; x <= x1; x++) {
      const idx = y * this.w + x
      if (this.geo.type[idx] === CELL.FLUID) s += this.rho[idx] * this.uy[idx]
    }
    return s
  }
}
