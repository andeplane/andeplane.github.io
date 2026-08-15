// Attacker AI: epoch decisions over observables. Routes are a bandit over
// inlet arms (leak attributed to arms in proportion to their current release),
// cadence is drip vs bank-and-surge per the profile. Pure module; the only
// state it touches is engine.inletStates.

import { CONFIG } from '../config'
import type { Rng } from '../core/rng'
import type { Engine } from '../engine/Engine'
import type { DomainMap } from '../engine/map'
import type { ObservableSnapshot } from '../sim/types'
import type { AIProfile } from './profiles'

export class AttackerAI {
  /** EMA of leak-per-release efficiency per arm. */
  private readonly efficiency: number[]
  private lastOutlet = 0
  private surgeTicksLeft = 0
  private surgeArm = 0
  private ticksToEpoch = 0

  constructor(
    private readonly profile: AIProfile,
    map: DomainMap,
    private readonly rng: Rng,
  ) {
    this.efficiency = map.inletSegments.map(() => 0.5)
  }

  /** Call every tick, after engine.tick(). */
  tick(obs: ObservableSnapshot | null, engine: Engine): void {
    if (engine.phase === 'over') return

    // Attribute new leaks to arms in proportion to their current release mix.
    if (obs && obs.outletBiomass > this.lastOutlet) {
      const leaked = obs.outletBiomass - this.lastOutlet
      this.lastOutlet = obs.outletBiomass
      const releases = engine.inletStates.map((s) => s.biomass * (s.openness + s.surge))
      const total = releases.reduce((a, b) => a + b, 0)
      if (total > 0) {
        for (let i = 0; i < this.efficiency.length; i++) {
          const share = releases[i] / total
          this.efficiency[i] = this.efficiency[i] * 0.97 + (leaked * share) * 0.03
        }
      }
    }

    // Surge countdown.
    if (this.surgeTicksLeft > 0) {
      this.surgeTicksLeft--
      if (this.surgeTicksLeft === 0) {
        const s = engine.inletStates[this.surgeArm]
        s.surge = 0
        s.biomass = this.profile.dripLevel
      }
    }

    if (--this.ticksToEpoch > 0) return
    this.ticksToEpoch = Math.round(this.profile.epochSeconds * 60)
    this.epoch(engine)
  }

  private epoch(engine: Engine): void {
    const p = this.profile
    const states = engine.inletStates
    const nArms = states.length

    // Rank arms by efficiency; exploration occasionally re-tests a random one.
    let best = this.efficiency.indexOf(Math.max(...this.efficiency))
    if (this.rng.next() < p.explore) best = this.rng.int(nArms)

    // Distribute drip: best arm gets extra share by focus, rest share the rest.
    for (let i = 0; i < nArms; i++) {
      const base = p.dripLevel * (1 - p.focus)
      states[i].openness = 1
      if (this.surgeTicksLeft === 0) {
        states[i].biomass = i === best ? p.dripLevel : base
        states[i].surge = 0
      }
    }

    // Bank-and-surge: when the tank is full enough, dump it down the best arm.
    if (
      p.surgeThreshold !== null &&
      this.surgeTicksLeft === 0 &&
      engine.tank >= p.surgeThreshold * CONFIG.attacker.tankCap
    ) {
      this.surgeArm = best
      this.surgeTicksLeft = CONFIG.attacker.surgeTicks
      states[best].surge = 1
      states[best].biomass = p.surgeBiomass
    }
  }
}
