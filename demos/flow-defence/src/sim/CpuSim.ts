// CPU sim: LbmRef + erosion + biomass, mirroring the GPU tick exactly.
// Pure TypeScript (no DOM/Babylon) — powers vitest and the headless runner.

import { CONFIG } from '../config'
import { inletProfile, type DomainMap, type InletState } from '../engine/map'
import { CELL } from './core/constants'
import { erosionStress } from './core/erosionRule'
import { LbmRef } from './core/lbmRef'

export class CpuSim {
  readonly ref: LbmRef
  readonly map: DomainMap
  biomass: Float32Array
  private biomassNext: Float32Array
  /** Per-row biomass release rate (from the inlet profile). */
  private bioRate: Float32Array
  readonly towerField: Float32Array

  // Monotone accumulators, same semantics as the GPU counters.
  absorbedTotal = 0
  killedTotal = 0
  breachCount = 0
  tickCount = 0

  constructor(map: DomainMap) {
    this.map = map
    this.ref = new LbmRef({
      width: map.width,
      height: map.height,
      params: {
        tau0: CONFIG.sim.tau0,
        smagorinsky: CONFIG.sim.smagorinsky,
        uClamp: CONFIG.sim.uClamp,
      },
    })
    this.ref.cellType.set(map.cellType)
    this.ref.solidity.set(map.solidity)
    const n = map.width * map.height
    this.biomass = new Float32Array(n)
    this.biomassNext = new Float32Array(n)
    this.bioRate = new Float32Array(map.height)
    this.towerField = new Float32Array(n)
  }

  setInletStates(states: InletState[]): void {
    const profile = inletProfile(this.map, states)
    for (let y = 0; y < this.map.height; y++) {
      this.ref.inletRho[y] = profile[y * 4]
      this.ref.inletU[y] = profile[y * 4 + 1]
      this.bioRate[y] = profile[y * 4 + 2]
    }
  }

  totalBiomass(): number {
    let t = 0
    for (let i = 0; i < this.biomass.length; i++) t += this.biomass[i]
    return t
  }

  tick(carrierOnly = false): void {
    this.tickCount++
    for (let k = 0; k < CONFIG.sim.substeps; k++) this.ref.step()
    this.erode()
    if (!carrierOnly) this.advectBiomass()
  }

  private erode(): void {
    const { width, height } = this.map
    const ct = this.ref.cellType
    const sol = this.ref.solidity
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (ct[idx] !== CELL.WALL) continue
        let shear = 0
        let maxRho = 0
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const nIdx = ny * width + nx
          const t = ct[nIdx]
          if (t !== CELL.OPEN && t !== CELL.INLET && t !== CELL.OUTLET) continue
          shear = Math.max(shear, Math.hypot(this.ref.ux[nIdx], this.ref.uy[nIdx]))
          maxRho = Math.max(maxRho, this.ref.rho[nIdx])
        }
        const stress = erosionStress({
          integrity: sol[idx],
          shear,
          head: Math.max(maxRho - 1, 0),
        })
        // Self-healing competes with erosion, but not under piping pressure
        // (see erosion.wgsl.ts).
        const head = Math.max(maxRho - 1, 0)
        const cure = head > CONFIG.erosion.pipeThreshold ? 0 : CONFIG.erosion.cureRate
        const next = Math.min(sol[idx] + cure, 1) - stress
        if (next <= 0) {
          ct[idx] = CELL.OPEN
          sol[idx] = 0
          this.breachCount++
        } else {
          sol[idx] = next
        }
      }
    }
  }

  private advectBiomass(): void {
    const { width, height } = this.map
    const adv = CONFIG.sim.substeps
    const ct = this.ref.cellType
    const sol = this.ref.solidity
    const next = this.biomassNext
    next.fill(0)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        const t = ct[idx]
        if (t === CELL.BEDROCK || (t === CELL.WALL && sol[idx] >= 1)) continue

        const sx = x - this.ref.ux[idx] * adv
        const sy = y - this.ref.uy[idx] * adv
        let b = this.sampleBiomass(sx, sy)
        if (t === CELL.WALL) b *= 1 - sol[idx]

        const rate = this.towerField[idx]
        if (rate > 0) {
          const after = b * Math.exp(-rate)
          this.killedTotal += b - after
          b = after
        }
        // Dirichlet source (see biomass.wgsl.ts): fixed concentration at the valve.
        if (t === CELL.INLET) b = this.bioRate[y] * CONFIG.biomass.injectPerTick
        if (t === CELL.OUTLET) {
          this.absorbedTotal += b
          b = 0
        }
        next[idx] = b
      }
    }
    const tmp = this.biomass
    this.biomass = next
    this.biomassNext = tmp
  }

  private sampleBiomass(x: number, y: number): number {
    const { width, height } = this.map
    const cx = Math.min(Math.max(x, 0), width - 1)
    const cy = Math.min(Math.max(y, 0), height - 1)
    const x0 = Math.floor(cx)
    const y0 = Math.floor(cy)
    const x1 = Math.min(x0 + 1, width - 1)
    const y1 = Math.min(y0 + 1, height - 1)
    const fx = cx - x0
    const fy = cy - y0
    const b = this.biomass
    return (
      b[y0 * width + x0] * (1 - fx) * (1 - fy) +
      b[y0 * width + x1] * fx * (1 - fy) +
      b[y1 * width + x0] * (1 - fx) * fy +
      b[y1 * width + x1] * fx * fy
    )
  }
}
