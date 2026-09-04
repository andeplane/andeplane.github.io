// Owns everything visual: camera, the domain quad + field material, the
// high-res dye system (per-frame advection), and the post pipeline.

import {
  Camera,
  ComputeShader,
  Constants,
  DefaultRenderingPipeline,
  FreeCamera,
  ImageProcessingConfiguration,
  MeshBuilder,
  RawTexture,
  Scene,
  ShaderLanguage,
  ShaderMaterial,
  ShaderStore,
  TextureSampler,
  UniformBuffer,
  Vector3,
  type WebGPUEngine,
} from '@babylonjs/core'
import { CONFIG } from '../config'
import { TICK_MS } from '../core/fixedstep'
import type { GpuSim } from '../sim/gpu/GpuSim'
import { dyeShaderSource } from '../sim/gpu/shaders/dye.wgsl'
import { fieldFragmentSource, fieldVertexSource, type FieldViewMode } from './fieldMaterial.wgsl'

const DYE_BINDINGS = {
  dyeIn: { group: 0, binding: 0 },
  dyeOut: { group: 0, binding: 1 },
  macroTex: { group: 0, binding: 2 },
  linearSampler: { group: 0, binding: 3 },
  params: { group: 0, binding: 4 },
  inletProfile: { group: 0, binding: 5 },
} as const

export class Renderer {
  readonly camera: FreeCamera
  private readonly material: ShaderMaterial
  private readonly dyeTex: [RawTexture, RawTexture]
  private readonly dyePasses: [ComputeShader, ComputeShader]
  private readonly dyeParams: UniformBuffer
  private readonly dyeW: number
  private readonly dyeH: number
  private dyeParity = 0
  private time = 0
  private readonly aspect: number

  constructor(
    engine: WebGPUEngine,
    scene: Scene,
    private readonly sim: GpuSim,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const { width, height } = sim.map
    this.aspect = width / height
    this.dyeW = width * CONFIG.dye.scale
    this.dyeH = height * CONFIG.dye.scale

    this.camera = new FreeCamera('cam', new Vector3(0, 0, -2), scene)
    this.camera.setTarget(Vector3.Zero())
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA
    this.fitOrtho()

    const quad = MeshBuilder.CreatePlane('domain', { width: this.aspect, height: 1 }, scene)

    const makeDye = (): RawTexture => {
      const t = new RawTexture(
        null,
        this.dyeW,
        this.dyeH,
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
    this.dyeTex = [makeDye(), makeDye()]

    this.dyeParams = new UniformBuffer(engine)
    for (const name of ['advScale', 'fade', 'time', 'injectWidth']) this.dyeParams.addUniform(name, 1)
    this.dyeParams.updateFloat('fade', CONFIG.dye.fade)
    this.dyeParams.updateFloat('injectWidth', CONFIG.dye.injectWidth * CONFIG.dye.scale)
    this.dyeParams.update()

    const sampler = new TextureSampler()
    sampler.setParameters(
      Constants.TEXTURE_CLAMP_ADDRESSMODE,
      Constants.TEXTURE_CLAMP_ADDRESSMODE,
      Constants.TEXTURE_CLAMP_ADDRESSMODE,
    )
    sampler.samplingMode = Constants.TEXTURE_BILINEAR_SAMPLINGMODE

    const dyeSource = dyeShaderSource(sim.map, this.dyeW, this.dyeH)
    this.dyePasses = [0, 1].map((p) => {
      const cs = new ComputeShader(`dye${p}`, engine, { computeSource: dyeSource }, { bindingsMapping: DYE_BINDINGS })
      cs.setTexture('dyeIn', this.dyeTex[p], false)
      cs.setStorageTexture('dyeOut', this.dyeTex[1 - p])
      cs.setTexture('macroTex', sim.macroTex, false)
      cs.setTextureSampler('linearSampler', sampler)
      cs.setUniformBuffer('params', this.dyeParams)
      cs.setStorageBuffer('inletProfile', sim.inletProfileBuffer)
      return cs
    }) as [ComputeShader, ComputeShader]

    const mode = (new URLSearchParams(location.search).get('field') ?? 'beauty') as FieldViewMode
    ShaderStore.ShadersStoreWGSL['fieldVertexShader'] = fieldVertexSource()
    ShaderStore.ShadersStoreWGSL['fieldFragmentShader'] = fieldFragmentSource(
      sim.map.width,
      sim.map.height,
      this.dyeW,
      this.dyeH,
      mode,
    )
    this.material = new ShaderMaterial(
      'field',
      scene,
      { vertex: 'field', fragment: 'field' },
      {
        attributes: ['position', 'uv'],
        uniformBuffers: ['Scene', 'Mesh'],
        shaderLanguage: ShaderLanguage.WGSL,
      },
    )
    this.material.setTexture('macroTex', sim.macroTex)
    this.material.setTexture('dyeTex', this.dyeTex[0])
    this.material.setTexture('bioTex', sim.biomassTex)
    this.material.backFaceCulling = false
    quad.material = this.material

    const post = new DefaultRenderingPipeline('post', true, scene, [this.camera])
    post.bloomEnabled = true
    post.bloomThreshold = 0.75
    post.bloomWeight = 0.55
    post.bloomKernel = 96
    post.imageProcessingEnabled = true
    post.imageProcessing.toneMappingEnabled = true
    post.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES
    post.imageProcessing.exposure = 1.25
    post.imageProcessing.contrast = 1.12
    post.imageProcessing.vignetteEnabled = true
    post.imageProcessing.vignetteWeight = 1.6
    post.grainEnabled = true
    post.grain.intensity = 5
    post.grain.animated = true
  }

  /** Advect dye and update material bindings; call once per rendered frame. */
  frame(deltaMs: number): void {
    this.time += deltaMs / 1000
    const pass = this.dyePasses[this.dyeParity]
    if (!pass.isReady()) return
    // Displacement per frame: velocity is in sim-cells per lattice step; the sim
    // runs `substeps` lattice steps per 60 Hz tick, and dye pixels are `scale`×
    // finer than sim cells.
    const advScale = (deltaMs / TICK_MS) * CONFIG.sim.substeps * CONFIG.dye.scale
    this.dyeParams.updateFloat('advScale', advScale)
    this.dyeParams.updateFloat('time', this.time)
    this.dyeParams.update()
    pass.dispatch(Math.ceil(this.dyeW / 8), Math.ceil(this.dyeH / 8), 1)
    this.material.setTexture('dyeTex', this.dyeTex[1 - this.dyeParity])
    this.material.setTexture('bioTex', this.sim.biomassTex)
    this.dyeParity ^= 1
  }

  fitOrtho(): void {
    const canvasAspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)
    let halfW = this.aspect / 2
    let halfH = 0.5
    if (canvasAspect > this.aspect) halfW = halfH * canvasAspect
    else halfH = halfW / canvasAspect
    this.camera.orthoLeft = -halfW
    this.camera.orthoRight = halfW
    this.camera.orthoTop = halfH
    this.camera.orthoBottom = -halfH
  }
}
