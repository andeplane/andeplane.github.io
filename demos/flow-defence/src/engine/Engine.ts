// The game engine: match state, both seats' economies, win condition.
// Renderer-free and GPU-free — consumes ObservableSnapshot diffs (monotone
// accumulators, so readback staleness can never lose or double-count mass).

import { CONFIG } from '../config'
import type { ObservableSnapshot } from '../sim/types'
import type { DomainMap, InletState } from './map'
import { canPlace, towerCost, type Tower, type TowerType } from './towers'

export interface EngineCallbacks {
  onGameOver(winner: 'attacker' | 'defender'): void
  onBreach(newBreaches: number): void
  onBuildRejected(reason: string): void
}

export type MatchPhase = 'running' | 'over'

export class Engine {
  // Defender seat.
  gold: number = CONFIG.match.startingGold
  leakBudget: number = CONFIG.match.leakBudget

  // Attacker seat: reservoir → (pump) → tank → (valve/surge) → the domain.
  reservoir: number = CONFIG.match.attackerReservoir
  tank = 0
  /** Current commanded inlet states (the attacker AI writes these). */
  inletStates: InletState[]

  phase: MatchPhase = 'running'
  winner: 'attacker' | 'defender' | null = null
  tickCount = 0

  private lastOutlet = 0
  private lastNeutralized = 0
  private lastBreach = 0
  private lastObsTick = -1
  /** Rows × mean u per segment, for metering commanded release. */
  private readonly segmentFlux: number[]

  private readonly mapRef: DomainMap

  constructor(map: DomainMap, private readonly callbacks: EngineCallbacks) {
    this.mapRef = map
    this.inletStates = map.inletSegments.map(() => ({ openness: 1, biomass: 0, surge: 0 }))
    this.segmentFlux = map.inletSegments.map((s) => {
      // Mean of the parabolic mouth shape (0.35 + 0.65·4t(1−t)) ≈ 0.78.
      return (s.y1 - s.y0 + 1) * CONFIG.inlet.u * 0.78
    })
  }

  /** One fixed 60 Hz tick. Returns the inlet states to command the sim with. */
  tick(obs: ObservableSnapshot | null): InletState[] {
    if (this.phase === 'over') return this.inletStates
    this.tickCount++

    // --- Ingest observables (diffs of monotone accumulators) -----------------
    if (obs && obs.tick !== this.lastObsTick) {
      this.lastObsTick = obs.tick
      const leaked = obs.outletBiomass - this.lastOutlet
      const killed = obs.neutralized - this.lastNeutralized
      const breaches = obs.breachCount - this.lastBreach
      this.lastOutlet = obs.outletBiomass
      this.lastNeutralized = obs.neutralized
      this.lastBreach = obs.breachCount
      this.leakBudget -= leaked
      this.gold += killed * CONFIG.match.bountyPerBiomass
      if (breaches > 0) this.callbacks.onBreach(breaches)

      // --- Win conditions ----------------------------------------------------
      if (this.leakBudget <= 0) {
        this.leakBudget = 0
        this.end('attacker')
      } else if (
        this.reservoir <= 0 &&
        this.tank <= 0 &&
        obs.totalBiomass < CONFIG.match.winDrainEpsilon
      ) {
        this.end('defender')
      }
    }

    // --- Economies -----------------------------------------------------------
    this.gold += CONFIG.match.goldTrickle / 60

    // Pump reservoir → tank.
    const pumped = Math.min(CONFIG.attacker.pumpRate, this.reservoir, CONFIG.attacker.tankCap - this.tank)
    this.reservoir -= pumped
    this.tank += pumped

    // Meter the attacker's commanded release from the tank: conc × u × rows,
    // per segment; surges push more flux. If the tank can't cover the command,
    // the valve starves proportionally.
    let demanded = 0
    for (const [s, state] of this.inletStates.entries()) {
      const uFactor = state.openness + CONFIG.inlet.surgeU * state.surge
      demanded += state.biomass * CONFIG.biomass.injectPerTick * this.segmentFlux[s] * uFactor
    }
    if (demanded > 0) {
      const supply = Math.min(demanded, this.tank)
      this.tank -= supply
      const starve = supply / demanded
      if (starve < 1) {
        for (const state of this.inletStates) state.biomass *= starve
      }
    }

    return this.inletStates
  }

  /** Placed towers; fields are re-splatted when towersVersion changes. */
  readonly towers: Tower[] = []
  towersVersion = 0
  private nextTowerId = 1

  tryBuildTower(type: TowerType, x: number, y: number, angle: number): Tower | null {
    if (this.phase === 'over') return null
    if (!canPlace(this.mapRef, x, y)) {
      this.callbacks.onBuildRejected('blocked')
      return null
    }
    const cost = towerCost(type)
    if (this.gold < cost) {
      this.callbacks.onBuildRejected('not enough gold')
      return null
    }
    this.gold -= cost
    const tower: Tower = { id: this.nextTowerId++, type, x, y, angle }
    this.towers.push(tower)
    this.towersVersion++
    return tower
  }

  /** Defender build attempt; returns the affordable prefix of cells (may be empty). */
  tryBuildWalls(cells: number[]): number[] {
    if (this.phase === 'over') return []
    const affordable = Math.floor(this.gold / CONFIG.build.wallCostPerCell)
    if (affordable <= 0) {
      this.callbacks.onBuildRejected('not enough gold')
      return []
    }
    const approved = cells.slice(0, affordable)
    this.gold -= approved.length * CONFIG.build.wallCostPerCell
    return approved
  }

  private end(winner: 'attacker' | 'defender'): void {
    this.phase = 'over'
    this.winner = winner
    this.callbacks.onGameOver(winner)
  }
}
