// The game engine: match state, both seats' economies, win condition.
// Renderer-free and GPU-free — consumes ObservableSnapshot diffs (monotone
// accumulators, so readback staleness can never lose or double-count mass).

import { CONFIG } from '../config'
import type { ObservableSnapshot } from '../sim/types'
import type { DomainMap, InletState } from './map'

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

  // Attacker seat.
  reservoir: number = CONFIG.match.attackerReservoir
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

  constructor(map: DomainMap, private readonly callbacks: EngineCallbacks) {
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
      } else if (this.reservoir <= 0 && obs.totalBiomass < CONFIG.match.winDrainEpsilon) {
        this.end('defender')
      }
    }

    // --- Economies -----------------------------------------------------------
    this.gold += CONFIG.match.goldTrickle / 60

    // Meter the attacker's commanded release: conc × u × rows, per segment.
    let released = 0
    for (const [s, state] of this.inletStates.entries()) {
      released += state.biomass * CONFIG.biomass.injectPerTick * this.segmentFlux[s]
    }
    if (released > 0) {
      this.reservoir -= released
      if (this.reservoir <= 0) {
        this.reservoir = 0
        // Valve runs dry: stop releasing (carrier keeps flowing).
        for (const state of this.inletStates) state.biomass = 0
      }
    }

    return this.inletStates
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
