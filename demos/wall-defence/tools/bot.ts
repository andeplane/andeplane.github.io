// Profile-driven self-play bots. Profiles model both skill tiers (novice /
// average / expert) and strategy archetypes (sliver-spam, turtle, no-tower)
// so the balance suite can assert that skill matters and degenerate
// strategies lose. Bot heuristics may use floats — only the emitted events
// touch the sim, and each bot's own RNG is a private Stream, so runs stay
// reproducible per (seed, profile).

import {
  BALL_HALF,
  CELLS,
  GRID_H,
  GRID_W,
  Q,
  QUOTA_PCT,
  TowerType,
  WALL_SPEED,
} from '../src/sim/constants'
import type { SimEvent } from '../src/sim/events'
import { Stream } from '../src/sim/rng'
import { CLAIMED, DRAINING, OPEN, WALL, cellX, cellY, type GameState } from '../src/sim/state'
import { placeCost, towerCost } from '../src/sim/towers'

export interface BotProfile {
  name: string
  reactEvery: number // ticks between decisions
  cutSamples: number
  minSafetyCells: number // min distance (cells) from any ball to commit a cut
  errorRate: number // chance (0-1) to commit a random valid cut instead of the best
  claimWeight: number // how much estimated claimable area matters
  sliverMode: boolean // prefer many tiny claims over big ones (degenerate probe)
  plugsBreaches: boolean
  buildsTowers: boolean
  towerEvery: number // ticks between tower decisions
  slowRatio: number // build 1 slow field per this many towers (0 = never)
  upgradesTowers: boolean
  rationalTowers: boolean // applies the cheaper-of-upgrade-vs-place rule (expert habit)
  quotaMargin: number // stop cutting when pct >= next quota + margin (Infinity = never stop)
  pickOrder: number[] // upgrade preference (ids); fall back to offer[0]
}

// Upgrade ids (see constants.Upgrade): 0 spark, 1 twin, 2 detonate, 3 armor,
// 4 fast hands, 5 fresh paint, 6 garrison, 7 overclaim.
const EXPERT_PICKS = [1, 4, 5, 6, 2, 0, 3, 7]

export const PROFILES: Record<string, BotProfile> = {
  novice: {
    name: 'novice',
    rationalTowers: false,
    reactEvery: 120,
    cutSamples: 8,
    minSafetyCells: 0.8,
    errorRate: 0.4,
    claimWeight: 0.2,
    sliverMode: false,
    plugsBreaches: false,
    buildsTowers: true,
    towerEvery: 240,
    slowRatio: 0,
    upgradesTowers: false,
    quotaMargin: Infinity,
    pickOrder: [],
  },
  average: {
    name: 'average',
    rationalTowers: false,
    reactEvery: 60,
    cutSamples: 24,
    minSafetyCells: 1.6,
    errorRate: 0.3,
    claimWeight: 1,
    sliverMode: false,
    plugsBreaches: true,
    buildsTowers: true,
    towerEvery: 150,
    slowRatio: 4,
    upgradesTowers: true,
    quotaMargin: Infinity,
    pickOrder: [], // hasn't learned synergies: takes the first offer
  },
  expert: {
    name: 'expert',
    rationalTowers: true,
    reactEvery: 30,
    cutSamples: 48,
    minSafetyCells: 2.4,
    errorRate: 0,
    claimWeight: 1.4,
    sliverMode: false,
    plugsBreaches: true,
    buildsTowers: true,
    towerEvery: 60,
    slowRatio: 4,
    upgradesTowers: true,
    quotaMargin: Infinity,
    pickOrder: EXPERT_PICKS,
  },
  sliver: {
    name: 'sliver',
    rationalTowers: true,
    reactEvery: 30,
    cutSamples: 48,
    minSafetyCells: 2.4,
    errorRate: 0,
    claimWeight: 0.15,
    sliverMode: true,
    plugsBreaches: true,
    buildsTowers: true,
    towerEvery: 60,
    slowRatio: 4,
    upgradesTowers: true,
    quotaMargin: Infinity,
    pickOrder: EXPERT_PICKS,
  },
  turtle: {
    name: 'turtle',
    rationalTowers: true,
    reactEvery: 30,
    cutSamples: 48,
    minSafetyCells: 2.4,
    errorRate: 0,
    claimWeight: 1.4,
    sliverMode: false,
    plugsBreaches: true,
    buildsTowers: true,
    towerEvery: 60,
    slowRatio: 4,
    upgradesTowers: true,
    quotaMargin: 3,
    pickOrder: EXPERT_PICKS,
  },
  notower: {
    name: 'notower',
    rationalTowers: true,
    reactEvery: 30,
    cutSamples: 48,
    minSafetyCells: 2.4,
    errorRate: 0,
    claimWeight: 1.4,
    sliverMode: false,
    plugsBreaches: true,
    buildsTowers: false,
    towerEvery: 60,
    slowRatio: 0,
    upgradesTowers: false,
    quotaMargin: Infinity,
    pickOrder: EXPERT_PICKS,
  },
}

const solid = (v: number) => v === WALL || v === CLAIMED

export class Bot {
  private rng: Stream
  private p: BotProfile

  constructor(seed: number, profile: BotProfile) {
    this.rng = new Stream(seed ^ 0x5eedb07)
    this.p = profile
  }

  act(s: GameState): SimEvent[] {
    const events: SimEvent[] = []

    if (s.currentOffer.length > 0) {
      events.push({ kind: 'PickUpgrade', choice: this.pickChoice(s.currentOffer) })
      return events
    }

    // Emergency: plug an active breach (overrides other cuts, but reaction
    // time is still bounded by the profile's decision cadence).
    if (
      this.p.plugsBreaches &&
      s.cuts.length === 0 &&
      s.tick >= s.cutCooldownUntil &&
      s.tick % this.p.reactEvery === 0
    ) {
      const plug = this.findPlug(s)
      if (plug) {
        events.push(plug)
        return events
      }
    }

    if (s.cuts.length === 0 && s.tick >= s.cutCooldownUntil && s.tick % this.p.reactEvery === 0) {
      if (!this.turtled(s)) {
        const cut = this.pickCut(s)
        if (cut) events.push(cut)
      }
    }

    if (this.p.buildsTowers && s.tick % this.p.towerEvery === 0) {
      const e = this.pickTowerAction(s)
      if (e) events.push(e)
    }

    return events
  }

  private pickChoice(offer: number[]): number {
    for (const want of this.p.pickOrder) {
      const i = offer.indexOf(want)
      if (i >= 0) return i
    }
    return 0
  }

  private turtled(s: GameState): boolean {
    if (!isFinite(this.p.quotaMargin)) return false
    const pct = (s.claimedCells * 100) / CELLS
    const nextQuota = QUOTA_PCT[Math.min(Math.max(s.wave, 1) - 1, QUOTA_PCT.length - 1)]
    return pct >= nextQuota + this.p.quotaMargin
  }

  // ---- Cuts ----

  private span(s: GameState, cx: number, cy: number, orient: 0 | 1): [number, number] {
    let lo = orient === 0 ? cy : cx
    let hi = lo
    const max = orient === 0 ? GRID_H - 1 : GRID_W - 1
    while (lo > 0) {
      const c = orient === 0 ? (lo - 1) * GRID_W + cx : cy * GRID_W + (lo - 1)
      if (solid(s.grid[c])) break
      lo--
    }
    while (hi < max) {
      const c = orient === 0 ? (hi + 1) * GRID_W + cx : cy * GRID_W + (hi + 1)
      if (solid(s.grid[c])) break
      hi++
    }
    return [lo, hi]
  }

  // Component labels for open+draining space; recomputed per decision.
  private label(s: GameState): { label: Int32Array; sizes: number[] } {
    const label = new Int32Array(CELLS).fill(-1)
    const sizes: number[] = []
    for (let c = 0; c < CELLS; c++) {
      if (solid(s.grid[c]) || label[c] >= 0) continue
      const id = sizes.length
      let size = 0
      const stack = [c]
      label[c] = id
      while (stack.length > 0) {
        const cur = stack.pop()!
        size++
        const x = cellX(cur)
        const y = cellY(cur)
        const nbs = [
          y > 0 ? cur - GRID_W : -1,
          y < GRID_H - 1 ? cur + GRID_W : -1,
          x > 0 ? cur - 1 : -1,
          x < GRID_W - 1 ? cur + 1 : -1,
        ]
        for (const n of nbs) {
          if (n >= 0 && !solid(s.grid[n]) && label[n] < 0) {
            label[n] = id
            stack.push(n)
          }
        }
      }
      sizes.push(size)
    }
    return { label, sizes }
  }

  private pickCut(s: GameState): SimEvent | null {
    const { label } = this.label(s)
    // Per-component ball tallies on each side of a candidate line are
    // approximated with component-filtered counts.
    let best: SimEvent | null = null
    let bestScore = -Infinity
    const valid: SimEvent[] = []
    for (let i = 0; i < this.p.cutSamples; i++) {
      const cx = this.rng.int(GRID_W)
      const cy = this.rng.int(GRID_H)
      const orient = this.rng.int(2) as 0 | 1
      const cell = cy * GRID_W + cx
      if (s.grid[cell] !== OPEN) continue
      const [lo, hi] = this.span(s, cx, cy, orient)
      const spanLen = hi - lo + 1
      const comp = label[cell]

      // Geometry of the would-be line segment (board units).
      const lineCoord = orient === 0 ? cx * Q + Q / 2 : cy * Q + Q / 2
      const a1 = lo * Q
      const a2 = (hi + 1) * Q

      let minDist = Infinity
      let ballsA = 0
      let ballsB = 0
      let compBalls = 0
      for (const b of s.balls) {
        const bcell =
          Math.min(GRID_H - 1, Math.max(0, Math.floor(b.y / Q))) * GRID_W +
          Math.min(GRID_W - 1, Math.max(0, Math.floor(b.x / Q)))
        const inComp = label[bcell] === comp
        const along = orient === 0 ? b.y : b.x
        const cross = orient === 0 ? b.x : b.y
        // Distance from ball to the segment.
        const clamped = Math.max(a1, Math.min(a2, along))
        const dx = cross - lineCoord
        const dy = along - clamped
        const d = Math.sqrt(dx * dx + dy * dy) - BALL_HALF
        if (d < minDist) minDist = d
        if (inComp) {
          compBalls++
          if (cross < lineCoord) ballsA++
          else ballsB++
        }
      }

      // Estimated claimable area: component cells on a side with no balls.
      let areaA = 0
      let areaB = 0
      if (compBalls === ballsA + ballsB) {
        for (let c = 0; c < CELLS; c++) {
          if (label[c] !== comp) continue
          const cross = orient === 0 ? cellX(c) * Q + Q / 2 : cellY(c) * Q + Q / 2
          if (cross < lineCoord) areaA++
          else if (cross > lineCoord) areaB++
        }
      }
      const claimable = (ballsA === 0 ? areaA : 0) + (ballsB === 0 ? areaB : 0)

      const safetyCells = minDist / Q
      if (safetyCells < this.p.minSafetyCells) continue
      valid.push({ kind: 'StartCut', cx, cy, orient })
      const exposure = (spanLen * Q) / 2 / WALL_SPEED / 60 // seconds to finish
      const score = this.p.sliverMode
        ? // sliver-spam probe: any claim is good, big claims are NOT preferred
          safetyCells * 1.0 + (claimable > 0 ? 3 : 0) - claimable * 0.02 - exposure * 1.2
        : safetyCells * 1.0 + claimable * this.p.claimWeight * 0.05 - exposure * 1.2
      if (score > bestScore) {
        bestScore = score
        best = { kind: 'StartCut', cx, cy, orient }
      }
    }
    // Human error: sometimes commit a merely-valid cut instead of the best.
    if (best && valid.length > 1 && this.rng.int(100) < this.p.errorRate * 100) {
      return valid[this.rng.int(valid.length)]
    }
    return best
  }

  // Find an OPEN cell adjacent to a DRAINING cell and cut across the hole —
  // the Rampart repair move.
  private findPlug(s: GameState): SimEvent | null {
    let bestCell = -1
    let bestOrient: 0 | 1 = 0
    let bestSpan = Infinity
    for (let c = 0; c < CELLS; c++) {
      if (s.grid[c] !== OPEN) continue
      const x = cellX(c)
      const y = cellY(c)
      const nbs = [
        y > 0 ? c - GRID_W : -1,
        y < GRID_H - 1 ? c + GRID_W : -1,
        x > 0 ? c - 1 : -1,
        x < GRID_W - 1 ? c + 1 : -1,
      ]
      if (!nbs.some((n) => n >= 0 && s.grid[n] === DRAINING)) continue
      for (const orient of [0, 1] as const) {
        const [lo, hi] = this.span(s, x, y, orient)
        const spanLen = hi - lo + 1
        if (spanLen < bestSpan) {
          bestSpan = spanLen
          bestCell = c
          bestOrient = orient
        }
      }
    }
    // Only worth it when the hole is genuinely small (a real plug, not a
    // desperate long cut through ball space).
    if (bestCell >= 0 && bestSpan <= 4) {
      return { kind: 'StartCut', cx: cellX(bestCell), cy: cellY(bestCell), orient: bestOrient }
    }
    return null
  }

  // ---- Towers ----

  private pickTowerAction(s: GameState): SimEvent | null {
    const wantSlow =
      this.p.slowRatio > 0 && s.towers.length > 0 && s.towers.length % this.p.slowRatio === 0
    const type = wantSlow ? TowerType.Slow : TowerType.Turret
    const newCost = placeCost(s, type)
    const up = this.p.upgradesTowers
      ? s.towers.find((t) => t.tier < 2 && s.money >= towerCost(t.type, t.tier + 1))
      : undefined
    // Rational (expert habit): with escalating placement prices, upgrade an
    // existing tower whenever that's cheaper than a new one. Non-rational
    // profiles place-first and eat the escalation premium.
    if (this.p.rationalTowers && up && towerCost(up.type, up.tier + 1) <= newCost) {
      return { kind: 'UpgradeTower', id: up.id }
    }
    if (s.money >= newCost) {
      const cell = this.pickTowerCell(s)
      if (cell >= 0) return { kind: 'PlaceTower', cell, tower: type }
    }
    if (up) return { kind: 'UpgradeTower', id: up.id }
    return null
  }

  // Frontier placement: claimed cells with open space nearby score highest.
  private pickTowerCell(s: GameState): number {
    let best = -1
    let bestScore = 0
    for (let i = 0; i < 40; i++) {
      const cell = this.rng.int(CELLS)
      if (s.grid[cell] !== CLAIMED) continue
      if (s.towers.some((t) => t.cell === cell)) continue
      const x = cellX(cell)
      const y = cellY(cell)
      let open = 0
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue
          const v = s.grid[ny * GRID_W + nx]
          if (v === OPEN || v === DRAINING) open++
        }
      }
      if (open > bestScore) {
        bestScore = open
        best = cell
      }
    }
    return best
  }
}
