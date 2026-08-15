// GPU LBM sim: owns the distribution buffers, cell-state buffers, and the
// fused collide-and-stream compute pass, plus the enemy-spore particle pass
// and the glow field they stamp into. Ping-pong is handled with two
// ComputeShader instances (A→B, B→A) so bindings never change after setup.

import {
  ComputeShader,
  Constants,
  RawTexture,
  StorageBuffer,
  TextureSampler,
  UniformBuffer,
  type Scene,
  type WebGPUEngine,
} from '@babylonjs/core'
import { CONFIG } from '../../config'
import { Q, W } from '../core/constants'
import { inletProfile, type DomainMap, type InletState } from '../../engine/map'
import { CELL } from '../core/constants'
import type { EnemyView, ObservableSnapshot, SpawnRequest } from '../types'
import { ENEMY_STRIDE, enemiesShaderSource } from './shaders/enemies.wgsl'
import { erosionShaderSource } from './shaders/erosion.wgsl'
import { FLUX_SCALE, glowShaderSource } from './shaders/glow.wgsl'
import { lbmShaderSource } from './shaders/lbm.wgsl'

const LBM_BINDINGS = {
  fA: { group: 0, binding: 0 },
  fB: { group: 0, binding: 1 },
  cellType: { group: 0, binding: 2 },
  solidity: { group: 0, binding: 3 },
  cellForce: { group: 0, binding: 4 },
  inletProfile: { group: 0, binding: 5 },
  params: { group: 0, binding: 6 },
  macroTex: { group: 0, binding: 7 },
} as const

export class GpuSim {
  readonly map: DomainMap
  /** Macro output (ux, uy, rho, solidity), bilinear-sampleable. */
  readonly macroTex: RawTexture

  private readonly f: [StorageBuffer, StorageBuffer]
  private readonly steps: [ComputeShader, ComputeShader]
  private readonly cellTypeBuf: StorageBuffer
  private readonly solidityBuf: StorageBuffer
  private readonly cellForceBuf: StorageBuffer
  /** Public: the dye pass reads per-row inlet state for injection strength. */
  readonly inletProfileBuffer: StorageBuffer
  private readonly params: UniformBuffer
  private parity = 0
  private readonly groupsX: number
  private readonly groupsY: number

  constructor(engine: WebGPUEngine, scene: Scene, map: DomainMap) {
    this.map = map
    const n = map.width * map.height
    this.groupsX = Math.ceil(map.width / 8)
    this.groupsY = Math.ceil(map.height / 8)

    // Distributions initialised to rest equilibrium (f_i = w_i).
    const fInit = new Float32Array(Q * n)
    for (let i = 0; i < Q; i++) fInit.fill(W[i], i * n, (i + 1) * n)
    this.f = [
      new StorageBuffer(engine, fInit.byteLength),
      new StorageBuffer(engine, fInit.byteLength),
    ]
    this.f[0].update(fInit)
    this.f[1].update(fInit)

    this.cellTypeBuf = new StorageBuffer(engine, map.cellType.byteLength)
    this.cellTypeBuf.update(map.cellType)
    this.solidityBuf = new StorageBuffer(engine, map.solidity.byteLength)
    this.solidityBuf.update(map.solidity)
    this.cellForceBuf = new StorageBuffer(engine, n * 2 * 4)
    this.cellForceBuf.update(new Float32Array(n * 2))
    this.inletProfileBuffer = new StorageBuffer(engine, map.height * 4 * 4)
    this.inletProfileBuffer.update(inletProfile(map, []))

    this.macroTex = new RawTexture(
      null,
      map.width,
      map.height,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      false,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_HALF_FLOAT,
      Constants.TEXTURE_CREATIONFLAG_STORAGE,
    )
    this.macroTex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE
    this.macroTex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE

    this.params = new UniformBuffer(engine)
    for (const name of ['tau0', 'smag', 'uClamp', 'gx', 'gy', 'jetX', 'jetY', 'jetPow']) {
      this.params.addUniform(name, 1)
    }
    // Debug overrides: ?tau=0.7&smag=0 for numerical bisection in the browser.
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
    this.params.updateFloat('tau0', Number(q?.get('tau') ?? CONFIG.sim.tau0))
    this.params.updateFloat('smag', Number(q?.get('smag') ?? CONFIG.sim.smagorinsky))
    this.params.updateFloat('uClamp', CONFIG.sim.uClamp)
    this.params.update()

    this.countersBuf = new StorageBuffer(engine, 16 * 4)
    this.countersBuf.update(new Uint32Array(16))

    const source = lbmShaderSource(map.width, map.height)
    this.steps = [0, 1].map((p) => {
      const cs = new ComputeShader(`lbm${p}`, engine, { computeSource: source }, { bindingsMapping: LBM_BINDINGS })
      cs.setStorageBuffer('fA', this.f[p])
      cs.setStorageBuffer('fB', this.f[1 - p])
      cs.setStorageBuffer('cellType', this.cellTypeBuf)
      cs.setStorageBuffer('solidity', this.solidityBuf)
      cs.setStorageBuffer('cellForce', this.cellForceBuf)
      cs.setStorageBuffer('inletProfile', this.inletProfileBuffer)
      cs.setUniformBuffer('params', this.params)
      cs.setStorageTexture('macroTex', this.macroTex)
      return cs
    }) as [ComputeShader, ComputeShader]

    this.erosion = new ComputeShader(
      'erosion',
      engine,
      { computeSource: erosionShaderSource(map.width, map.height) },
      {
        bindingsMapping: {
          cellType: { group: 0, binding: 0 },
          solidity: { group: 0, binding: 1 },
          macroTex: { group: 0, binding: 2 },
          counters: { group: 0, binding: 3 },
        },
      },
    )
    this.erosion.setStorageBuffer('cellType', this.cellTypeBuf)
    this.erosion.setStorageBuffer('solidity', this.solidityBuf)
    this.erosion.setTexture('macroTex', this.macroTex, false)
    this.erosion.setStorageBuffer('counters', this.countersBuf)

    // --- Enemies + glow ------------------------------------------------------
    const makeGlowTex = (): RawTexture => {
      const t = new RawTexture(
        null,
        map.width,
        map.height,
        Constants.TEXTUREFORMAT_RGBA,
        scene,
        false,
        false,
        Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_HALF_FLOAT,
        Constants.TEXTURE_CREATIONFLAG_STORAGE,
      )
      t.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE
      t.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE
      return t
    }
    this.glowTexPair = [makeGlowTex(), makeGlowTex()]

    this.towerFieldBuf = new StorageBuffer(engine, n * 4)
    this.towerFieldBuf.update(new Float32Array(n))

    this.enemyBuf = new StorageBuffer(engine, CONFIG.enemies.max * ENEMY_STRIDE * 4)
    this.enemyBuf.update(new Float32Array(CONFIG.enemies.max * ENEMY_STRIDE))
    this.glowStampBuf = new StorageBuffer(engine, n * 4)
    this.glowStampBuf.update(new Uint32Array(n))

    this.enemyParams = new UniformBuffer(engine)
    for (const name of ['time', 'pad0', 'pad1', 'pad2']) this.enemyParams.addUniform(name, 1)
    this.enemyParams.update()

    const sampler = new TextureSampler()
    sampler.setParameters(
      Constants.TEXTURE_CLAMP_ADDRESSMODE,
      Constants.TEXTURE_CLAMP_ADDRESSMODE,
      Constants.TEXTURE_CLAMP_ADDRESSMODE,
    )
    sampler.samplingMode = Constants.TEXTURE_BILINEAR_SAMPLINGMODE

    this.enemyPass = new ComputeShader(
      'enemies',
      engine,
      { computeSource: enemiesShaderSource(map.width, map.height) },
      {
        bindingsMapping: {
          enemies: { group: 0, binding: 0 },
          macroTex: { group: 0, binding: 1 },
          linearSampler: { group: 0, binding: 2 },
          cellType: { group: 0, binding: 3 },
          solidity: { group: 0, binding: 4 },
          towerField: { group: 0, binding: 5 },
          counters: { group: 0, binding: 6 },
          glow: { group: 0, binding: 7 },
          params: { group: 0, binding: 8 },
        },
      },
    )
    this.enemyPass.setStorageBuffer('enemies', this.enemyBuf)
    this.enemyPass.setTexture('macroTex', this.macroTex, false)
    this.enemyPass.setTextureSampler('linearSampler', sampler)
    this.enemyPass.setStorageBuffer('cellType', this.cellTypeBuf)
    this.enemyPass.setStorageBuffer('solidity', this.solidityBuf)
    this.enemyPass.setStorageBuffer('towerField', this.towerFieldBuf)
    this.enemyPass.setStorageBuffer('counters', this.countersBuf)
    this.enemyPass.setStorageBuffer('glow', this.glowStampBuf)
    this.enemyPass.setUniformBuffer('params', this.enemyParams)

    this.glowParams = new UniformBuffer(engine)
    for (const name of ['advScale', 'pad0', 'pad1', 'pad2']) this.glowParams.addUniform(name, 1)
    this.glowParams.updateFloat('advScale', CONFIG.sim.substeps)
    this.glowParams.update()

    const glowSource = glowShaderSource(map.width, map.height)
    const GLOW_BINDINGS = {
      bioIn: { group: 0, binding: 0 },
      bioOut: { group: 0, binding: 1 },
      macroTex: { group: 0, binding: 2 },
      linearSampler: { group: 0, binding: 3 },
      params: { group: 0, binding: 4 },
      cellType: { group: 0, binding: 5 },
      glow: { group: 0, binding: 6 },
      counters: { group: 0, binding: 7 },
    } as const
    this.glowPasses = [0, 1].map((p) => {
      const cs = new ComputeShader(`glow${p}`, engine, { computeSource: glowSource }, { bindingsMapping: GLOW_BINDINGS })
      cs.setTexture('bioIn', this.glowTexPair[p], false)
      cs.setStorageTexture('bioOut', this.glowTexPair[1 - p])
      cs.setTexture('macroTex', this.macroTex, false)
      cs.setTextureSampler('linearSampler', sampler)
      cs.setUniformBuffer('params', this.glowParams)
      cs.setStorageBuffer('cellType', this.cellTypeBuf)
      cs.setStorageBuffer('glow', this.glowStampBuf)
      cs.setStorageBuffer('counters', this.countersBuf)
      return cs
    }) as [ComputeShader, ComputeShader]
  }

  private readonly erosion: ComputeShader
  private readonly countersBuf: StorageBuffer
  private readonly glowTexPair: [RawTexture, RawTexture]
  private readonly glowPasses: [ComputeShader, ComputeShader]
  private readonly glowParams: UniformBuffer
  private readonly towerFieldBuf: StorageBuffer
  private readonly enemyBuf: StorageBuffer
  private readonly enemyPass: ComputeShader
  private readonly enemyParams: UniformBuffer
  private readonly glowStampBuf: StorageBuffer
  private glowParity = 0
  private readbackInFlight = false
  private enemyReadbackInFlight = false
  private nextSlot = 0
  private lastEnemyData: Float32Array | null = null
  private lastEnemyTick = 0

  /** Latest observables snapshot (stale by 0–3 ticks; null until the first readback). */
  latest: ObservableSnapshot | null = null

  /** The glow texture holding the most recent tick's output (for rendering). */
  get biomassTex(): RawTexture {
    return this.glowTexPair[this.glowParity]
  }

  isReady(): boolean {
    return this.steps[0].isReady() && this.steps[1].isReady()
  }

  /** Debug: which pieces are holding readiness up. */
  readiness(): string {
    return `lbm0=${this.steps[0].isReady()} lbm1=${this.steps[1].isReady()} ticks=${this.tickCount}`
  }

  /** Debug: read back rho/u at probe columns (y = mid-height). */
  async debugProbe(): Promise<string> {
    const view = await this.f[this.parity].read()
    const data = new Float32Array(view.buffer, view.byteOffset, (view.byteLength / 4) | 0)
    const n = this.map.width * this.map.height
    const y = this.map.height >> 1
    const out: string[] = []
    for (const x of [2, 64, 128, 256, 384, 470, 500, 510]) {
      const idx = y * this.map.width + x
      let r = 0
      let mx = 0
      for (let i = 0; i < Q; i++) {
        const v = data[i * n + idx]
        r += v
        mx += [0, 1, 0, -1, 0, 1, -1, -1, 1][i] * v
      }
      out.push(`x${x}: rho=${r.toFixed(4)} ux=${(mx / r).toFixed(4)}`)
    }
    return out.join('  ')
  }

  private tickCount = 0

  /**
   * One fixed 60 Hz tick = substeps lattice steps + erosion + enemies + glow
   * + readback. carrierOnly (warmup/menu): just the flow — no enemies.
   */
  tick(carrierOnly = false): void {
    if (!this.isReady()) return
    this.tickCount++
    for (let k = 0; k < CONFIG.sim.substeps; k++) {
      this.steps[this.parity].dispatch(this.groupsX, this.groupsY, 1)
      this.parity ^= 1
    }
    if (this.erosion.isReady()) this.erosion.dispatch(this.groupsX, this.groupsY, 1)
    if (carrierOnly) return
    if (this.enemyPass.isReady()) {
      this.enemyParams.updateFloat('time', this.tickCount)
      this.enemyParams.update()
      this.enemyPass.dispatch(Math.ceil(CONFIG.enemies.max / 64), 1, 1)
    }
    const glow = this.glowPasses[this.glowParity]
    if (glow.isReady()) {
      glow.dispatch(this.groupsX, this.groupsY, 1)
      this.glowParity ^= 1
    }
    if (this.readbackEvery > 0 && this.tickCount % this.readbackEvery === 0) this.requestObservables()
    if (this.tickCount % 10 === 0) this.requestEnemyPositions()
  }

  /** Observables cadence in ticks (0 disables readback; ?readback=N overrides). */
  readbackEvery = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('readback') ?? 15) : 15

  /** Fire-and-forget counters readback; keeps `latest` fresh within a few ticks. */
  private requestObservables(): void {
    if (this.readbackInFlight) return
    this.readbackInFlight = true
    const tick = this.tickCount
    void this.countersBuf
      .read()
      .then((view) => {
        const u = new Uint32Array(view.buffer, view.byteOffset, 16)
        this.latest = {
          tick,
          breachCount: u[0],
          kills: u[1],
          suffocated: u[5],
          escapes: u[2],
          outletFlux: u[3] / FLUX_SCALE,
          outletInflux: u[4] / FLUX_SCALE,
        }
      })
      .finally(() => {
        this.readbackInFlight = false
      })
  }

  /** Fire-and-forget enemy-position readback (32 KB; feeds beams/overlay). */
  private requestEnemyPositions(): void {
    if (this.enemyReadbackInFlight) return
    this.enemyReadbackInFlight = true
    const tick = this.tickCount
    void this.enemyBuf
      .read()
      .then((view) => {
        this.lastEnemyData = new Float32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
        this.lastEnemyTick = tick
      })
      .finally(() => {
        this.enemyReadbackInFlight = false
      })
  }

  /**
   * Live enemies, extrapolated from the last position readback by their own
   * per-tick velocity — smooth enough for beams and core dots at 6 Hz reads.
   */
  liveEnemies(): EnemyView[] {
    const data = this.lastEnemyData
    if (!data) return []
    const ahead = this.tickCount - this.lastEnemyTick
    const out: EnemyView[] = []
    for (let i = 0; i < data.length; i += ENEMY_STRIDE) {
      if (data[i + 5] !== 1) continue
      out.push({
        slot: i / ENEMY_STRIDE,
        x: data[i] + data[i + 2] * ahead,
        y: data[i + 1] + data[i + 3] * ahead,
        vx: data[i + 2],
        vy: data[i + 3],
        hp: data[i + 4],
      })
    }
    return out
  }

  /** Inject new spores. Slots are monotonic — a match never exceeds capacity. */
  spawnEnemies(spawns: SpawnRequest[]): void {
    for (const s of spawns) {
      const slot = this.nextSlot % CONFIG.enemies.max
      this.nextSlot++
      const data = new Float32Array([s.x, s.y, 0, 0, s.hp, 1, s.seed, 0])
      this.enemyBuf.update(data, slot * ENEMY_STRIDE * 4)
    }
  }

  /** The player's jet: cursor position (cells) + strength; 0 turns it off. */
  setJet(x: number, y: number, power: number): void {
    this.params.updateFloat('jetX', x)
    this.params.updateFloat('jetY', y)
    this.params.updateFloat('jetPow', power)
    this.params.update()
  }

  /**
   * Paint player walls. Per-cell partial buffer writes — a full upload from the
   * CPU mirror would resurrect walls the GPU erosion pass has already breached.
   */
  paintWall(cells: number[]): void {
    const fresh = new Float32Array([CONFIG.erosion.freshSolidity])
    const wall = new Uint32Array([CELL.WALL])
    for (const idx of cells) {
      if (this.map.cellType[idx] !== CELL.OPEN && this.map.cellType[idx] !== CELL.WALL) continue
      this.map.cellType[idx] = CELL.WALL
      this.map.solidity[idx] = CONFIG.erosion.freshSolidity
      this.cellTypeBuf.update(wall, idx * 4)
      this.solidityBuf.update(fresh, idx * 4)
    }
  }

  /** Erase player walls (the undo verb). Bedrock is untouchable. */
  eraseWall(cells: number[]): void {
    const zero = new Float32Array([0])
    const open = new Uint32Array([CELL.OPEN])
    for (const idx of cells) {
      if (this.map.cellType[idx] !== CELL.WALL) continue
      this.map.cellType[idx] = CELL.OPEN
      this.map.solidity[idx] = 0
      this.cellTypeBuf.update(open, idx * 4)
      this.solidityBuf.update(zero, idx * 4)
    }
  }

  /** Carrier control: per-segment openness and surge (waves slam the hammer). */
  setInletStates(states: InletState[]): void {
    this.inletProfileBuffer.update(inletProfile(this.map, states))
  }

  /** Defender towers, splatted CPU-side into damage + force fields. */
  setTowerFields(damage: Float32Array, force: Float32Array): void {
    this.towerFieldBuf.update(damage)
    this.cellForceBuf.update(force)
  }
}
