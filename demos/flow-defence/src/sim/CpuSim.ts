// CPU sim: LbmRef + erosion + enemy spores, mirroring the GPU tick exactly
// (enemies.wgsl.ts is the shader twin of tickEnemies below — same steering,
// blocking, damage, and escape rules, minus the cosmetic glow stamps).
// Pure TypeScript (no DOM/Babylon) — powers vitest and headless checks.

import { CONFIG } from '../config'
import { inletProfile, type DomainMap, type InletState } from '../engine/map'
import { CELL } from './core/constants'
import { erosionStress } from './core/erosionRule'
import { LbmRef } from './core/lbmRef'

export interface CpuEnemy {
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  seed: number
  alive: boolean
}

export class CpuSim {
  readonly ref: LbmRef
  readonly map: DomainMap
  readonly towerField: Float32Array
  readonly enemies: CpuEnemy[] = []

  // Monotone accumulators, same semantics as the GPU counters.
  towerKillsTotal = 0
  suffocatedTotal = 0
  escapesTotal = 0
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
    this.towerField = new Float32Array(map.width * map.height)
  }

  setInletStates(states: InletState[]): void {
    const profile = inletProfile(this.map, states)
    for (let y = 0; y < this.map.height; y++) {
      this.ref.inletRho[y] = profile[y * 4]
      this.ref.inletU[y] = profile[y * 4 + 1]
    }
  }

  spawn(x: number, y: number, hp: number, seed: number): void {
    this.enemies.push({ x, y, vx: 0, vy: 0, hp, seed, alive: true })
  }

  aliveCount(): number {
    return this.enemies.filter((e) => e.alive).length
  }

  tick(carrierOnly = false): void {
    this.tickCount++
    for (let k = 0; k < CONFIG.sim.substeps; k++) this.ref.step()
    this.erode()
    if (!carrierOnly) this.tickEnemies()
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
        const head = Math.max(maxRho - 1, 0)
        const stress = erosionStress({ integrity: sol[idx], shear, head })
        // Self-healing competes with erosion, but not under piping pressure or
        // shear scouring, and never rebuilds armor above 1 (see erosion.wgsl.ts).
        const cure =
          head > CONFIG.erosion.pipeThreshold || shear > CONFIG.erosion.shearThreshold
            ? 0
            : CONFIG.erosion.cureRate
        const next = Math.max(sol[idx], Math.min(sol[idx] + cure, 1)) - stress
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

  private blocked(x: number, y: number): boolean {
    const { width, height } = this.map
    if (x < 1 || x >= width || y < 1 || y >= height - 1) return true
    const idx = Math.min(Math.max(Math.floor(y), 0), height - 1) * width + Math.min(Math.max(Math.floor(x), 0), width - 1)
    const t = this.ref.cellType[idx]
    if (t === CELL.BEDROCK) return true
    if (t === CELL.WALL && this.ref.solidity[idx] >= 0.6) return true
    return false
  }

  private tickEnemies(): void {
    const { width, height } = this.map
    const e = CONFIG.enemies
    const adv = CONFIG.sim.substeps
    for (const s of this.enemies) {
      if (!s.alive) continue
      const [ux, uy] = this.sampleVelocity(s.x, s.y)
      const speed = Math.hypot(ux, uy)
      // Becalmed spores hunt for current (shader twin of the seek block):
      // crawl up the speed gradient, holding breath while water is in reach.
      let seekX = 0
      let seekY = 0
      let suffocating = speed < e.stagnantU
      if (speed < e.seekU) {
        // Line-of-sight probe (shader twin of speedAt): a path a spore cannot
        // pass reports dead water — no smelling current through intact walls.
        const sp = (dx: number, dy: number) => {
          for (const f of [0.25, 0.5, 0.75, 1]) {
            if (this.blocked(s.x + dx * f, s.y + dy * f)) return 0
          }
          const [px, py] = this.sampleVelocity(s.x + dx, s.y + dy)
          return Math.hypot(px, py)
        }
        const gx = sp(e.seekRadius, 0) - sp(-e.seekRadius, 0)
        const gy = sp(0, e.seekRadius) - sp(0, -e.seekRadius)
        const gl = Math.hypot(gx, gy)
        if (gl > e.seekGradEps) {
          seekX = (gx / gl) * e.seek
          seekY = (gy / gl) * e.seek
          if (suffocating) {
            suffocating = false
            s.hp -= e.suffocate * e.seekBreath
          }
        }
      }
      const wanderAngle = s.seed * 6.2832 + Math.sin(this.tickCount * 0.045 + s.seed * 37.0) * 2.4
      const tx = (ux * e.carry + e.swim + Math.cos(wanderAngle) * e.wander + seekX) * adv
      const ty = (uy * e.carry + Math.sin(wanderAngle) * e.wander + seekY) * adv
      s.vx += (tx - s.vx) * e.steer
      s.vy += (ty - s.vy) * e.steer
      const cx = s.x + s.vx
      const cy = s.y + s.vy
      if (!this.blocked(cx, cy)) {
        s.x = cx
        s.y = cy
      } else if (!this.blocked(cx, s.y)) {
        s.x = cx
        s.vy = 0
      } else if (!this.blocked(s.x, cy)) {
        s.y = cy
        s.vx = 0
      } else {
        s.vx *= 0.2
        s.vy *= 0.2
      }

      const idx =
        Math.min(Math.max(Math.floor(s.y), 0), height - 1) * width +
        Math.min(Math.max(Math.floor(s.x), 0), width - 1)
      const towerDmg = this.towerField[idx]
      s.hp -= towerDmg * e.towerDamage
      if (suffocating) s.hp -= e.suffocate
      if (s.hp <= 0) {
        s.alive = false
        if (towerDmg > 0) this.towerKillsTotal++
        else this.suffocatedTotal++
        continue
      }
      if (this.ref.cellType[idx] === CELL.OUTLET || s.x >= width - 2) {
        s.alive = false
        this.escapesTotal++
      }
    }
  }

  private sampleVelocity(x: number, y: number): [number, number] {
    const { width, height } = this.map
    const cx = Math.min(Math.max(x, 0), width - 1)
    const cy = Math.min(Math.max(y, 0), height - 1)
    const x0 = Math.floor(cx)
    const y0 = Math.floor(cy)
    const x1 = Math.min(x0 + 1, width - 1)
    const y1 = Math.min(y0 + 1, height - 1)
    const fx = cx - x0
    const fy = cy - y0
    const lerp = (f: Float32Array): number =>
      f[y0 * width + x0] * (1 - fx) * (1 - fy) +
      f[y0 * width + x1] * fx * (1 - fy) +
      f[y1 * width + x0] * (1 - fx) * fy +
      f[y1 * width + x1] * fx * fy
    return [lerp(this.ref.ux), lerp(this.ref.uy)]
  }
}
