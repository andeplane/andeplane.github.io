// GPU LBM sim: owns the distribution buffers, cell-state buffers, and the
// fused collide-and-stream compute pass. Ping-pong is handled with two
// ComputeShader instances (A→B, B→A) so bindings never change after setup.

import {
  ComputeShader,
  Constants,
  RawTexture,
  StorageBuffer,
  UniformBuffer,
  type Scene,
  type WebGPUEngine,
} from '@babylonjs/core'
import { CONFIG } from '../../config'
import { Q, W } from '../core/constants'
import { inletProfile, type DomainMap } from '../../engine/map'
import { CELL } from '../core/constants'
import { erosionShaderSource } from './shaders/erosion.wgsl'
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
    this.inletProfileBuffer = new StorageBuffer(engine, map.height * 2 * 4)
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
    for (const name of ['tau0', 'smag', 'uClamp', 'gx', 'gy', 'pad0', 'pad1', 'pad2']) {
      this.params.addUniform(name, 1)
    }
    // Debug overrides: ?tau=0.7&smag=0 for numerical bisection in the browser.
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
    this.params.updateFloat('tau0', Number(q?.get('tau') ?? CONFIG.sim.tau0))
    this.params.updateFloat('smag', Number(q?.get('smag') ?? CONFIG.sim.smagorinsky))
    this.params.updateFloat('uClamp', CONFIG.sim.uClamp)
    this.params.update()

    this.countersBuf = new StorageBuffer(engine, 4 * 4)
    this.countersBuf.update(new Uint32Array(4))

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
  }

  private readonly erosion: ComputeShader
  private readonly countersBuf: StorageBuffer

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

  /** One fixed 60 Hz tick = CONFIG.sim.substeps lattice steps + one erosion pass. */
  tick(): void {
    if (!this.isReady()) return
    this.tickCount++
    for (let k = 0; k < CONFIG.sim.substeps; k++) {
      this.steps[this.parity].dispatch(this.groupsX, this.groupsY, 1)
      this.parity ^= 1
    }
    if (this.erosion.isReady()) this.erosion.dispatch(this.groupsX, this.groupsY, 1)
  }

  /**
   * Paint player walls. Per-cell partial buffer writes — a full upload from the
   * CPU mirror would resurrect walls the GPU erosion pass has already breached.
   */
  paintWall(cells: number[]): void {
    const one = new Float32Array([1])
    const wall = new Uint32Array([CELL.WALL])
    for (const idx of cells) {
      if (this.map.cellType[idx] !== CELL.OPEN && this.map.cellType[idx] !== CELL.WALL) continue
      this.map.cellType[idx] = CELL.WALL
      this.map.solidity[idx] = 1
      this.cellTypeBuf.update(wall, idx * 4)
      this.solidityBuf.update(one, idx * 4)
    }
  }

  /** Attacker seat control: per-segment openness 0..1. */
  setInletOpenness(openness: number[]): void {
    this.inletProfileBuffer.update(inletProfile(this.map, openness))
  }
}
