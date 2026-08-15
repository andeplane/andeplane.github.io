// The game engine: match state, waves, lives, economy, win condition.
// Renderer-free and GPU-free — consumes ObservableSnapshot diffs (monotone
// accumulators, so readback staleness can never lose or double-count) and
// emits SpawnRequests the sim drains.

import { CONFIG } from '../config'
import type { Rng } from '../core/rng'
import type { ObservableSnapshot, SpawnRequest } from '../sim/types'
import type { DomainMap, InletState } from './map'
import { canPlace, towerCost, type Tower, type TowerType } from './towers'

export interface EngineCallbacks {
  onGameOver(winner: 'attacker' | 'defender'): void
  onBreach(newBreaches: number): void
  onBuildRejected(reason: string): void
  onWaveStart(wave: number, surge: boolean): void
  onWaveCleared(wave: number, bonus: number): void
}

export type MatchPhase = 'build' | 'wave' | 'over'

export interface WaveConfig {
  count: number
  hp: number
  /** Ticks between spawns. */
  interval: number
  /** Inlet arms (segment indices) this wave rides. */
  arms: readonly number[]
  /** Surge waves slam the water hammer while spores ride the faster current. */
  surge?: boolean
}

export interface LevelConfig {
  name: string
  description: string
  lives: number
  startingGold: number
  waves: readonly WaveConfig[]
}

export class Engine {
  readonly level: LevelConfig

  gold: number
  lives: number
  killsTotal = 0
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

  private nextSpawnIn = 0
  private ticksSinceSpawnDone = 0
  private lastKills = 0
  private lastEscapes = 0
  private lastBreach = 0
  private lastObsTick = -1
  private readonly pendingSpawns: SpawnRequest[] = []
  private readonly mapRef: DomainMap

  constructor(
    map: DomainMap,
    private readonly callbacks: EngineCallbacks,
    private readonly rng: Rng,
    level?: LevelConfig,
  ) {
    this.level = level ?? CONFIG.levels[0]
    this.gold = this.level.startingGold
    this.lives = this.level.lives
    this.mapRef = map
    this.inletStates = map.inletSegments.map(() => ({ openness: 1, biomass: 0, surge: 0 }))
  }

  /** Waves in this level. */
  get waveTotal(): number {
    return this.level.waves.length
  }

  /** Best CPU-side estimate of spores currently alive (readback-lagged). */
  get aliveEstimate(): number {
    return Math.max(0, this.spawnedTotal - this.killsTotal - this.escapesTotal)
  }

  get surging(): boolean {
    return this.inletStates.some((s) => s.surge > 0)
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
      const escapes = obs.escapes - this.lastEscapes
      const breaches = obs.breachCount - this.lastBreach
      this.lastKills = obs.kills
      this.lastEscapes = obs.escapes
      this.lastBreach = obs.breachCount
      this.killsTotal += kills
      this.escapesTotal += escapes
      this.gold += kills * CONFIG.enemies.bounty
      this.lives -= escapes
      if (breaches > 0) this.callbacks.onBreach(breaches)
      if (this.lives <= 0) {
        this.lives = 0
        this.end('attacker')
        return this.inletStates
      }
    }

    this.gold += CONFIG.match.goldTrickle / 60

    if (this.phase === 'build') {
      if (--this.buildTicksLeft <= 0) this.beginWave()
      return this.inletStates
    }

    // --- Wave phase ----------------------------------------------------------
    const wave = this.level.waves[this.waveIndex]
    if (this.spawnRemaining > 0) {
      if (--this.nextSpawnIn <= 0) {
        const seg = this.mapRef.inletSegments[this.rng.pick(wave.arms)]
        this.pendingSpawns.push({
          x: CONFIG.enemies.spawnX,
          y: this.rng.range(seg.y0 + 2, seg.y1 - 1),
          hp: wave.hp,
          seed: this.rng.next(),
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
      this.callbacks.onWaveCleared(this.waveIndex + 1, bonus)
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

  private beginWave(): void {
    const wave = this.level.waves[this.waveIndex]
    this.phase = 'wave'
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
