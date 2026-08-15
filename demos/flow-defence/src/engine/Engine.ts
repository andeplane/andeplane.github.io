// The game engine: match state, waves, lives, economy, win condition.
// Renderer-free and GPU-free — consumes ObservableSnapshot diffs (monotone
// accumulators, so readback staleness can never lose or double-count) and
// emits SpawnRequests the sim drains.

import { CONFIG } from '../config'
import type { Rng } from '../core/rng'
import type { DeathEvent, ObservableSnapshot, SpawnRequest } from '../sim/types'
import type { LevelConfig } from './levelDefs'
import type { DomainMap, InletState } from './map'
import { SPORE_DEFS, SPORES_BY_INDEX } from './sporeDefs'
import { canPlace, towerCost, type Tower, type TowerType } from './towers'

export type { LevelConfig, WaveConfig } from './levelDefs'

export interface EngineCallbacks {
  onGameOver(winner: 'attacker' | 'defender'): void
  onBreach(newBreaches: number): void
  onBuildRejected(reason: string): void
  onWaveStart(wave: number, surge: boolean): void
  onWaveCleared(wave: number, bonus: number, escaped: number): void
}

export type MatchPhase = 'build' | 'wave' | 'over'

export class Engine {
  readonly level: LevelConfig

  gold: number
  lives: number
  /** Spores destroyed by towers (the only kills that pay bounty). */
  towerKills = 0
  /** Spores drowned in stagnant water (defense, not income). */
  suffocatedTotal = 0
  escapesTotal = 0
  /** Current commanded inlet states (openness always 1; surge per wave). */
  inletStates: InletState[]

  phase: MatchPhase = 'build'
  winner: 'attacker' | 'defender' | null = null
  tickCount = 0
  /** Ticks left before the next wave auto-starts (build phase countdown). */
  buildTicksLeft: number = CONFIG.match.buildTicks
  /** Index of the current/next wave (0-based). */
  waveIndex = 0
  /** Spores still to spawn in the current wave. */
  spawnRemaining = 0
  /** Total spores ever spawned (with kill/escape counters → alive estimate). */
  spawnedTotal = 0
  /** Total wall cells ever built (tutorial hooks). */
  wallCellsBuilt = 0
  /** Jet stamina 0..1: drains while held, recharges while released. */
  jetCharge = 1
  /** Water intake: NET outlet discharge per tick, averaged over a ~10 s
   *  rolling window (−1 until the window fills). Sloshing/seiche moves zero
   *  net volume, so only true throughput registers. The base drinks from the
   *  river — strangle it and the base thirsts. */
  intakeFlux = -1
  /** Ticks spent starved of water (drains lives past the grace period). */
  thirstTicks = 0
  /** Flood escalation 0..1 — ramps while the base is starved, and bursts
   *  blockades via inlet pressure far past the piping threshold. */
  floodPressure = 0

  private nextSpawnIn = 0
  private ticksSinceSpawnDone = 0
  private lastKills = 0
  private lastKillsByType: number[] = SPORES_BY_INDEX.map(() => 0)
  /** Death events already processed (splitter bursts are exactly-once). */
  deathsSeen = 0
  private lastSuffocated = 0
  private lastEscapes = 0
  private escapesAtWaveStart = 0
  private lastBreach = 0
  private lastObsTick = -1
  /** Rolling (tick, out, in) accumulator samples spanning ~intakeWindow ticks.
   *  The window must cover several acoustic round-trips of the domain (~10 s
   *  each at c_s) or basin seiche won't cancel out of the net volume. */
  private readonly fluxHistory: Array<{ tick: number; out: number; inn: number }> = []
  private static readonly intakeWindow = 1800
  private readonly pendingSpawns: SpawnRequest[] = []
  readonly map: DomainMap

  constructor(
    map: DomainMap,
    private readonly callbacks: EngineCallbacks,
    private readonly rng: Rng,
    level?: LevelConfig,
  ) {
    this.level = level ?? CONFIG.levels[0]
    this.gold = this.level.startingGold
    this.lives = this.level.lives
    this.map = map
    this.inletStates = map.inletSegments.map(() => ({ openness: 1, biomass: 0, surge: 0 }))
  }

  /** Waves in this level. */
  get waveTotal(): number {
    return this.level.waves.length
  }

  /** All destroyed spores (towers + drowned) — the feedback stat. */
  get killsTotal(): number {
    return this.towerKills + this.suffocatedTotal
  }

  /** Best CPU-side estimate of spores currently alive (readback-lagged). */
  get aliveEstimate(): number {
    return Math.max(0, this.spawnedTotal - this.killsTotal - this.escapesTotal)
  }

  get surging(): boolean {
    return this.inletStates.some((s) => s.surge > 0)
  }

  /** This arena's natural open-flow intake. */
  get nominalFlux(): number {
    return this.level.nominalFlux ?? CONFIG.match.nominalFlux
  }

  /** The base is starved of water (intake below the thirst threshold). */
  get thirsting(): boolean {
    return this.intakeFlux >= 0 && this.intakeFlux < this.nominalFlux * CONFIG.match.thirstFraction
  }

  /** Skip the build countdown and call the wave now. */
  start(): void {
    if (this.phase === 'build') this.beginWave()
  }

  /** Spawn commands accumulated since the last drain (the sim consumes these). */
  drainSpawns(): SpawnRequest[] {
    return this.pendingSpawns.splice(0)
  }

  /** One fixed 60 Hz tick. Returns the inlet states to command the sim with. */
  tick(obs: ObservableSnapshot | null, jetHeld = false): InletState[] {
    if (this.phase === 'over') return this.inletStates
    this.tickCount++

    // --- Jet stamina ---------------------------------------------------------
    if (jetHeld && this.jetCharge > 0) {
      this.jetCharge = Math.max(0, this.jetCharge - 1 / (CONFIG.jet.drainSeconds * 60))
    } else if (!jetHeld) {
      this.jetCharge = Math.min(1, this.jetCharge + 1 / (CONFIG.jet.rechargeSeconds * 60))
    }

    // --- Ingest observables (diffs of monotone accumulators) -----------------
    if (obs && obs.tick !== this.lastObsTick) {
      this.lastObsTick = obs.tick
      const kills = obs.kills - this.lastKills
      const suffocated = obs.suffocated - this.lastSuffocated
      const escapes = obs.escapes - this.lastEscapes
      const breaches = obs.breachCount - this.lastBreach
      this.lastKills = obs.kills
      this.lastSuffocated = obs.suffocated
      this.lastEscapes = obs.escapes
      this.lastBreach = obs.breachCount
      // Net VOLUME over the rolling window: sloshing (out then back in)
      // integrates to zero, so neither water hammer nor basin seiche can
      // trigger thirst or mask a blockade — only real throughput counts.
      this.fluxHistory.push({ tick: obs.tick, out: obs.outletFlux, inn: obs.outletInflux })
      while (
        this.fluxHistory.length > 2 &&
        obs.tick - this.fluxHistory[1].tick >= Engine.intakeWindow
      ) {
        this.fluxHistory.shift()
      }
      const oldest = this.fluxHistory[0]
      const span = obs.tick - oldest.tick
      if (span >= Engine.intakeWindow / 2) {
        this.intakeFlux = Math.max(0, (obs.outletFlux - oldest.out - (obs.outletInflux - oldest.inn)) / span)
      }
      this.towerKills += kills
      this.suffocatedTotal += suffocated
      this.escapesTotal += escapes
      // Only tower kills pay — drowned spores are defense, not income.
      // Bounty is per spore type (a Barnacle pays more than a Darter).
      for (let t = 0; t < this.lastKillsByType.length; t++) {
        const typed = (obs.killsByType[t] ?? 0) - this.lastKillsByType[t]
        this.lastKillsByType[t] = obs.killsByType[t] ?? 0
        if (typed > 0) this.gold += typed * (SPORES_BY_INDEX[t]?.bounty ?? CONFIG.enemies.bounty)
      }
      this.lives -= escapes
      if (breaches > 0) this.callbacks.onBreach(breaches)
      if (this.lives <= 0) {
        this.lives = 0
        this.end('attacker')
        return this.inletStates
      }
    }

    // Water royalties: the base pays for delivered water. Full river = full
    // trickle; a strangled river pays nothing — the carrot to thirst's stick.
    const delivery = this.intakeFlux < 0 ? 1 : Math.min(1, this.intakeFlux / (this.nominalFlux * 0.5))
    this.gold += (CONFIG.match.goldTrickle / 60) * delivery

    // --- Thirst: the base must keep drinking (anti-blockade rule) ------------
    // Counts for the whole match once the first wave is called — the pre-match
    // build phase alone is free experimentation time.
    const matchLive = this.phase === 'wave' || this.waveIndex > 0
    if (matchLive && this.thirsting) {
      this.thirstTicks++
      // The river's answer: pressure escalates until the blockage bursts.
      this.floodPressure = Math.min(1, this.floodPressure + 1 / CONFIG.match.floodRampTicks)
      const past = this.thirstTicks - CONFIG.match.thirstGraceTicks
      if (past > 0 && past % CONFIG.match.thirstLifeTicks === 0) {
        this.lives--
        if (this.lives <= 0) {
          this.lives = 0
          this.end('attacker')
          return this.inletStates
        }
      }
    } else if (!this.thirsting) {
      if (this.thirstTicks > 0) this.thirstTicks--
      this.floodPressure = Math.max(0, this.floodPressure - 2 / CONFIG.match.floodRampTicks)
    }
    for (const s of this.inletStates) s.flood = this.floodPressure

    if (this.phase === 'build') {
      if (--this.buildTicksLeft <= 0) this.beginWave()
      return this.inletStates
    }

    // --- Wave phase ----------------------------------------------------------
    const wave = this.level.waves[this.waveIndex]
    if (this.spawnRemaining > 0) {
      if (--this.nextSpawnIn <= 0) {
        const seg = this.map.inletSegments[this.rng.pick(wave.arms)]
        const def = SPORE_DEFS[this.rng.pick(wave.types ?? (['standard'] as const))]
        this.pendingSpawns.push({
          x: CONFIG.enemies.spawnX,
          y: this.rng.range(seg.y0 + 2, seg.y1 - 1),
          hp: wave.hp * def.hpMul,
          seed: this.rng.next(),
          type: def.typeIndex,
        })
        this.spawnedTotal++
        this.spawnRemaining--
        this.nextSpawnIn = wave.interval
      }
    } else {
      this.ticksSinceSpawnDone++
    }

    const cleared =
      this.spawnRemaining === 0 &&
      (this.aliveEstimate <= 0 || this.ticksSinceSpawnDone > CONFIG.match.waveTimeoutTicks)
    if (cleared) {
      const bonus = CONFIG.match.clearBonusBase + CONFIG.match.clearBonusPerWave * (this.waveIndex + 1)
      this.gold += bonus
      this.callbacks.onWaveCleared(this.waveIndex + 1, bonus, this.escapesTotal - this.escapesAtWaveStart)
      for (const s of this.inletStates) s.surge = 0
      this.waveIndex++
      if (this.waveIndex >= this.level.waves.length) {
        this.end('defender')
      } else {
        this.phase = 'build'
        this.buildTicksLeft = CONFIG.match.interWaveTicks
      }
    }

    return this.inletStates
  }

  /**
   * Death events from the GPU ring (readback-lagged ~0.25 s): splitters
   * burst into live children flung outward from where they popped. Children
   * enter through the normal spawn path so the alive estimate stays exact.
   */
  processDeaths(events: readonly DeathEvent[]): void {
    if (this.phase === 'over') return
    for (const ev of events) {
      const def = SPORES_BY_INDEX[Math.round(ev.type)]
      if (!def?.split) continue
      const wave = this.level.waves[Math.min(this.waveIndex, this.level.waves.length - 1)]
      for (let c = 0; c < def.split.count; c++) {
        const angle = this.rng.next() * Math.PI * 2
        const fling = 2 + this.rng.next() * 3
        this.pendingSpawns.push({
          x: Math.max(2, ev.x + Math.cos(angle) * fling),
          y: ev.y + Math.sin(angle) * fling,
          hp: wave.hp * SPORE_DEFS[def.split.child].hpMul * def.split.hpMul,
          seed: this.rng.next(),
          type: SPORE_DEFS[def.split.child].typeIndex,
        })
        this.spawnedTotal++
      }
    }
  }

  private beginWave(): void {
    const wave = this.level.waves[this.waveIndex]
    this.phase = 'wave'
    this.escapesAtWaveStart = this.escapesTotal
    this.spawnRemaining = wave.count
    this.nextSpawnIn = 1
    this.ticksSinceSpawnDone = 0
    for (const s of this.inletStates) s.surge = wave.surge ? 1 : 0
    this.callbacks.onWaveStart(this.waveIndex + 1, wave.surge === true)
  }

  /** Placed towers; fields are re-splatted when towersVersion changes. */
  readonly towers: Tower[] = []
  towersVersion = 0
  private nextTowerId = 1

  tryBuildTower(type: TowerType, x: number, y: number, angle: number): Tower | null {
    if (this.phase === 'over') return null
    if (!canPlace(this.map, x, y, this.towers)) {
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

  /** Erase walls for a partial refund (the undo verb). */
  eraseWalls(cells: number[]): number[] {
    if (this.phase === 'over') return []
    this.gold += cells.length * CONFIG.build.wallRefundPerCell
    return cells
  }

  /** Repaint standing walls back to full armor; returns the affordable prefix. */
  tryRepairWalls(cells: number[]): number[] {
    if (this.phase === 'over') return []
    const affordable = Math.floor(this.gold / CONFIG.build.wallRepairCostPerCell)
    const approved = cells.slice(0, affordable)
    this.gold -= approved.length * CONFIG.build.wallRepairCostPerCell
    return approved
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
    this.wallCellsBuilt += approved.length
    return approved
  }

  private end(winner: 'attacker' | 'defender'): void {
    this.phase = 'over'
    this.winner = winner
    this.callbacks.onGameOver(winner)
  }
}
