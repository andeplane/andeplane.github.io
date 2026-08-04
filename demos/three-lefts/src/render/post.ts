import * as THREE from 'three'

/**
 * Post chain (SPEC §6.4).
 *
 * Everything here runs *after* the portal pass has resolved, so it never sees
 * stencil or portal structure and physically cannot leak across a portal
 * boundary. That constraint is why there is no SSAO, SSR, TAA, or DOF in this
 * file — all of them sample neighbouring pixels, and across a doorway the
 * neighbouring pixel is in a different room.
 */

const QUAD_VERT = /* glsl */ `
  in vec3 position;
  in vec2 uv;
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

class Pass {
  readonly material: THREE.RawShaderMaterial
  private static scene: THREE.Scene | null = null
  private static camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private static mesh: THREE.Mesh | null = null

  constructor(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
    if (!Pass.scene) {
      Pass.scene = new THREE.Scene()
      Pass.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
      Pass.mesh.frustumCulled = false
      Pass.scene.add(Pass.mesh)
    }
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    Pass.mesh!.material = this.material
    renderer.setRenderTarget(target)
    renderer.render(Pass.scene!, Pass.camera)
  }
}

const PREFILTER = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D tSrc;
  uniform float threshold;
  uniform float knee;
  void main() {
    vec3 c = texture(tSrc, vUv).rgb;
    float b = max(c.r, max(c.g, c.b));
    float soft = clamp(b - threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-5);
    float w = max(soft, b - threshold) / max(b, 1e-5);
    fragColor = vec4(c * w, 1.0);
  }
`

const DOWNSAMPLE = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D tSrc;
  uniform vec2 texel;
  void main() {
    vec3 s = texture(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb;
    s += texture(tSrc, vUv + texel * vec2( 1.0, -1.0)).rgb;
    s += texture(tSrc, vUv + texel * vec2(-1.0,  1.0)).rgb;
    s += texture(tSrc, vUv + texel * vec2( 1.0,  1.0)).rgb;
    s += 4.0 * texture(tSrc, vUv).rgb;
    s += 2.0 * texture(tSrc, vUv + texel * vec2( 1.0, 0.0)).rgb;
    s += 2.0 * texture(tSrc, vUv + texel * vec2(-1.0, 0.0)).rgb;
    s += 2.0 * texture(tSrc, vUv + texel * vec2( 0.0, 1.0)).rgb;
    s += 2.0 * texture(tSrc, vUv + texel * vec2( 0.0,-1.0)).rgb;
    fragColor = vec4(s / 16.0, 1.0);
  }
`

const UPSAMPLE = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D tLow;
  uniform sampler2D tHigh;
  uniform vec2 texel;
  void main() {
    vec3 s = texture(tLow, vUv + texel * vec2(-1.0,  0.0)).rgb;
    s += texture(tLow, vUv + texel * vec2( 1.0,  0.0)).rgb;
    s += texture(tLow, vUv + texel * vec2( 0.0, -1.0)).rgb;
    s += texture(tLow, vUv + texel * vec2( 0.0,  1.0)).rgb;
    s = s * 0.25 * 0.5 + texture(tLow, vUv).rgb * 0.5;
    fragColor = vec4(s + texture(tHigh, vUv).rgb, 1.0);
  }
`

const COMPOSITE = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D tSrc;
  uniform sampler2D tBloom;
  uniform float bloomStrength;
  uniform float exposure;
  uniform float time;
  uniform float vignette;
  uniform float grain;
  uniform float fade;

  // Narkowicz ACES approximation.
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 c = texture(tSrc, vUv).rgb;
    c += texture(tBloom, vUv).rgb * bloomStrength;
    c *= exposure;

    c = aces(c);

    // sRGB encode.
    c = mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));

    vec2 d = vUv - 0.5;
    float v = 1.0 - vignette * dot(d, d) * 1.6;
    c *= clamp(v, 0.0, 1.0);

    // Fine grain, mostly to break up banding in the big flat plaster gradients
    // that this kind of soft indirect lighting produces.
    float n = hash(vUv * 1024.0 + fract(time) * 91.7) - 0.5;
    c += n * grain;

    fragColor = vec4(c * fade, 1.0);
  }
`

export interface PipelineOptions {
  bloomStrength?: number
  exposure?: number
  vignette?: number
  grain?: number
}

export class Pipeline {
  /** The scene target the portal renderer draws into. Has depth + stencil. */
  sceneTarget!: THREE.WebGLRenderTarget
  msaa = true
  private msaaSupported: boolean | null = null
  private samples = 4
  /** Extra resolution used when MSAA is unavailable (SPEC R1 fallback). */

  private bloomA: THREE.WebGLRenderTarget[] = []
  private bloomB: THREE.WebGLRenderTarget[] = []

  private prefilter: Pass
  private down: Pass
  private up: Pass
  private composite: Pass

  private width = 1
  private height = 1

  /** 0 = black, 1 = fully visible. Used for menu/level transitions. */
  fade = 1

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    opts: PipelineOptions = {},
  ) {
    this.prefilter = new Pass(PREFILTER, {
      tSrc: { value: null },
      threshold: { value: 1.05 },
      knee: { value: 0.6 },
    })
    this.down = new Pass(DOWNSAMPLE, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } })
    this.up = new Pass(UPSAMPLE, {
      tLow: { value: null },
      tHigh: { value: null },
      texel: { value: new THREE.Vector2() },
    })
    this.composite = new Pass(COMPOSITE, {
      tSrc: { value: null },
      tBloom: { value: null },
      bloomStrength: { value: opts.bloomStrength ?? 0.42 },
      exposure: { value: opts.exposure ?? 1.3 },
      time: { value: 0 },
      vignette: { value: opts.vignette ?? 0.85 },
      grain: { value: opts.grain ?? 0.014 },
      fade: { value: 1 },
    })
  }

  /**
   * SPEC R1: a multisampled render target with a stencil buffer is the single
   * assumption the whole rendering design rests on, and driver support is not
   * guaranteed. Probe it, and fall back to supersampling if it is not there.
   */
  resize(cssWidth: number, cssHeight: number, pixelRatio: number, samples = 4) {
    const w = Math.max(2, Math.floor(cssWidth * pixelRatio))
    const h = Math.max(2, Math.floor(cssHeight * pixelRatio))
    if (this.sceneTarget && w === this.width && h === this.height && samples === this.samples) return
    this.width = w
    this.height = h
    this.samples = samples

    this.disposeTargets()

    const make = (samples: number, scale: number) =>
      new THREE.WebGLRenderTarget(Math.floor(w * scale), Math.floor(h * scale), {
        type: THREE.HalfFloatType,
        colorSpace: THREE.LinearSRGBColorSpace,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: true,
        samples,
      })

    // Whether the driver can give us a multisampled target with a stencil
    // buffer is fixed for the life of the context, so probe it once. Adaptive
    // quality resizes these targets roughly once a second, and re-probing each
    // time would mean allocating a 4× target only to throw it away.
    if (this.msaaSupported === null) {
      const trial = make(4, 1)
      this.msaaSupported = this.probe(trial)
      trial.dispose()
    }

    // Without MSAA, supersample by 1.5 instead — the only other anti-aliasing
    // that does not sample across a portal edge (SPEC §6.4).
    this.sceneTarget = make(this.msaaSupported ? samples : 0, this.msaaSupported ? 1 : 1.5)
    this.msaa = this.msaaSupported

    const bw = Math.max(2, Math.floor(w / 2))
    const bh = Math.max(2, Math.floor(h / 2))
    for (let i = 0; i < 3; i++) {
      const s = 1 << i
      const opts = {
        type: THREE.HalfFloatType,
        colorSpace: THREE.LinearSRGBColorSpace,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }
      this.bloomA.push(new THREE.WebGLRenderTarget(Math.max(2, bw / s), Math.max(2, bh / s), opts))
      if (i < 2) this.bloomB.push(new THREE.WebGLRenderTarget(Math.max(2, bw / s), Math.max(2, bh / s), opts))
    }
  }

  private probe(target: THREE.WebGLRenderTarget): boolean {
    const prev = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(target)
    const gl = this.renderer.getContext()
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    this.renderer.setRenderTarget(prev)
    return status === gl.FRAMEBUFFER_COMPLETE
  }

  get renderWidth() {
    return this.sceneTarget.width
  }

  get renderHeight() {
    return this.sceneTarget.height
  }

  /** Runs bloom + tonemap + grade, ending on the default framebuffer. */
  present(timeSeconds: number) {
    const r = this.renderer

    this.prefilter.material.uniforms.tSrc.value = this.sceneTarget.texture
    this.prefilter.render(r, this.bloomA[0])

    for (let i = 1; i < this.bloomA.length; i++) {
      const src = this.bloomA[i - 1]
      this.down.material.uniforms.tSrc.value = src.texture
      ;(this.down.material.uniforms.texel.value as THREE.Vector2).set(1 / src.width, 1 / src.height)
      this.down.render(r, this.bloomA[i])
    }

    let low = this.bloomA[this.bloomA.length - 1]
    for (let i = this.bloomA.length - 2; i >= 0; i--) {
      const dst = this.bloomB[i]
      this.up.material.uniforms.tLow.value = low.texture
      this.up.material.uniforms.tHigh.value = this.bloomA[i].texture
      ;(this.up.material.uniforms.texel.value as THREE.Vector2).set(1 / dst.width, 1 / dst.height)
      this.up.render(r, dst)
      low = dst
    }

    this.composite.material.uniforms.tSrc.value = this.sceneTarget.texture
    this.composite.material.uniforms.tBloom.value = low.texture
    this.composite.material.uniforms.time.value = timeSeconds
    this.composite.material.uniforms.fade.value = this.fade
    this.composite.render(r, null)
  }

  private disposeTargets() {
    if (this.sceneTarget) this.sceneTarget.dispose()
    for (const t of this.bloomA) t.dispose()
    for (const t of this.bloomB) t.dispose()
    this.bloomA = []
    this.bloomB = []
  }
}
