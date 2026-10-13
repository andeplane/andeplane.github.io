// WebGL2 GPGPU lattice Boltzmann: ping-pong float textures, one fragment pass
// per lattice step (MRT writes all nine populations), plus dye advection,
// probe-flux readback and the glowing composite.

import type { Board } from '../sim/board.ts'
import { CELL, EX, EY, PHYS, Q, W } from '../sim/d2q9.ts'
import { BLUR_FS, COMPOSITE_FS, FULLSCREEN_VS, GLOW_FS, dyeFS, lbmFS, probeFS } from './shaders.ts'

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

export interface View {
  /** pixels per cell */
  scale: number
  /** pixel offset of the board's top-left corner */
  ox: number
  oy: number
}

export class GpuFluid {
  readonly gl: WebGL2RenderingContext
  readonly board: Board
  private readonly W: number
  private readonly H: number
  private readonly lbm: Prog
  private readonly dye: Prog
  private readonly probe: Prog
  private readonly glow: Prog
  private readonly blur: Prog
  private readonly comp: Prog
  private readonly geoTex: WebGLTexture
  private readonly sdfTex: WebGLTexture
  private fA: WebGLTexture[]
  private fB: WebGLTexture[]
  private fbA: WebGLFramebuffer
  private fbB: WebGLFramebuffer
  private dyeA: WebGLTexture
  private dyeB: WebGLTexture
  private dyeFbA: WebGLFramebuffer
  private dyeFbB: WebGLFramebuffer
  private readonly probeTex: WebGLTexture
  private readonly probeFb: WebGLFramebuffer
  private readonly glowTex: WebGLTexture[]
  private readonly glowFb: WebGLFramebuffer[]
  private readonly glowW: number
  private readonly glowH: number
  private readonly noz: Float32Array
  private readonly probeBuf: Float32Array
  private readonly probeData: Int32Array
  private sinceDye = 0
  steps = 0

  constructor(canvas: HTMLCanvasElement, board: Board) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 is not available in this browser.')
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This GPU cannot render to float textures (EXT_color_buffer_float).')
    this.gl = gl
    this.board = board
    this.W = board.w
    this.H = board.h
    const nN = board.nozzles.length
    const nP = board.probes.length
    this.lbm = this.program(lbmFS(nN), ['uF0', 'uF1', 'uF2', 'uGeo', 'uNoz'])
    this.dye = this.program(dyeFS(nN), ['uDye', 'uF2', 'uGeo', 'uNoz', 'uSize', 'uDt', 'uDecay'])
    this.probe = this.program(probeFS(nP), ['uF2', 'uGeo', 'uProbe'])
    this.glow = this.program(GLOW_FS, ['uDye', 'uSdf', 'uOut'])
    this.blur = this.program(BLUR_FS, ['uSrc', 'uDir'])
    this.comp = this.program(COMPOSITE_FS, ['uDye', 'uSdf', 'uF2', 'uGlow', 'uBoard', 'uView', 'uCanvas', 'uTime', 'uMode'])

    const r = board.raster
    const geo = new Uint8Array(this.W * this.H * 4)
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const i = y * this.W + x
        geo[i * 4] = r.type[i]
        geo[i * 4 + 1] = r.nozzle[i] === 255 ? 0 : r.nozzle[i]
        // link mask: bit (k-1) set when the pull source for direction k is solid
        let mask = 0
        let nearNozzle = false
        for (let k = 1; k < Q; k++) {
          const sx = x - EX[k]
          const sy = y - EY[k]
          if (sx < 0 || sy < 0 || sx >= this.W || sy >= this.H) {
            mask |= 1 << (k - 1)
            continue
          }
          const t = r.type[sy * this.W + sx]
          if (t === CELL.SOLID) mask |= 1 << (k - 1)
          if (t === CELL.NOZZLE) nearNozzle = true
        }
        geo[i * 4 + 2] = r.drainDir[i] | (nearNozzle ? 16 : 0)
        geo[i * 4 + 3] = mask
      }
    }
    this.geoTex = this.tex(gl.RGBA8UI, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, geo, false, this.W, this.H)
    this.sdfTex = this.tex(gl.R16F, gl.RED, gl.FLOAT, r.sdf, true, this.W, this.H)

    const rest0 = new Float32Array(this.W * this.H * 4)
    const rest1 = new Float32Array(this.W * this.H * 4)
    const rest2 = new Float32Array(this.W * this.H * 4)
    for (let i = 0; i < this.W * this.H; i++) {
      for (let k = 0; k < 4; k++) {
        rest0[i * 4 + k] = W[k]
        rest1[i * 4 + k] = W[k + 4]
      }
      rest2[i * 4] = W[8]
      rest2[i * 4 + 1] = 1
    }
    const mkSet = () => [rest0, rest1, rest2].map((d) => this.tex(gl.RGBA32F, gl.RGBA, gl.FLOAT, d, false, this.W, this.H))
    this.fA = mkSet()
    this.fB = mkSet()
    this.fbA = this.fbo(this.fA)
    this.fbB = this.fbo(this.fB)
    this.dyeA = this.tex(gl.RGBA16F, gl.RGBA, gl.FLOAT, null, true, this.W, this.H)
    this.dyeB = this.tex(gl.RGBA16F, gl.RGBA, gl.FLOAT, null, true, this.W, this.H)
    this.dyeFbA = this.fbo([this.dyeA])
    this.dyeFbB = this.fbo([this.dyeB])
    this.probeTex = this.tex(gl.RGBA32F, gl.RGBA, gl.FLOAT, null, false, nP, 1)
    this.probeFb = this.fbo([this.probeTex])
    this.glowW = Math.ceil(this.W / 2)
    this.glowH = Math.ceil(this.H / 2)
    this.glowTex = [0, 1].map(() => this.tex(gl.RGBA16F, gl.RGBA, gl.FLOAT, null, true, this.glowW, this.glowH))
    this.glowFb = this.glowTex.map((t) => this.fbo([t]))

    this.noz = new Float32Array(nN * 4)
    board.nozzles.forEach((n, k) => (this.noz[k * 4 + 3] = n.dye))
    this.probeBuf = new Float32Array(nP * 4)
    this.probeData = new Int32Array(nP * 3)
    board.probes.forEach((p, k) => this.probeData.set([p.x0, p.x1, p.y], k * 3))
    if (Q !== 9) throw new Error('D2Q9 only')
  }

  private program(fs: string, uniforms: string[]): Prog {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader compile failed: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, FULLSCREEN_VS))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`program link failed: ${gl.getProgramInfoLog(p)}`)
    const u: Prog['u'] = {}
    for (const name of uniforms) u[name] = gl.getUniformLocation(p, name)
    return { p, u }
  }

  private tex(
    internal: number,
    format: number,
    type: number,
    data: ArrayBufferView | null,
    linear: boolean,
    w: number,
    h: number,
  ): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data)
    const filt = linear ? gl.LINEAR : gl.NEAREST
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  private fbo(texs: WebGLTexture[]): WebGLFramebuffer {
    const gl = this.gl
    const fb = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0))
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i))
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer incomplete (${st})`)
    return fb
  }

  private bind(unit: number, t: WebGLTexture, loc: WebGLUniformLocation | null): void {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.uniform1i(loc, unit)
  }

  /** Run `n` lattice steps with the given valve openings. */
  step(n: number, valves: Float32Array): void {
    const gl = this.gl
    const nozzles = this.board.nozzles
    for (let k = 0; k < nozzles.length; k++) {
      const s = valves[k] * PHYS.jetSpeed
      this.noz[k * 4] = nozzles[k].dx * s
      this.noz[k * 4 + 1] = nozzles[k].dy * s
      this.noz[k * 4 + 2] = valves[k]
    }
    gl.disable(gl.BLEND)
    for (let s = 0; s < n; s++) {
      gl.viewport(0, 0, this.W, this.H)
      gl.useProgram(this.lbm.p)
      gl.uniform4fv(this.lbm.u.uNoz, this.noz)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbB)
      this.bind(0, this.fA[0], this.lbm.u.uF0)
      this.bind(1, this.fA[1], this.lbm.u.uF1)
      this.bind(2, this.fA[2], this.lbm.u.uF2)
      this.bind(3, this.geoTex, this.lbm.u.uGeo)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      ;[this.fA, this.fB] = [this.fB, this.fA]
      ;[this.fbA, this.fbB] = [this.fbB, this.fbA]
      this.steps++
      this.sinceDye++
      if (this.sinceDye >= 2) {
        this.advectDye(this.sinceDye)
        this.sinceDye = 0
      }
    }
  }

  private advectDye(dt: number): void {
    const gl = this.gl
    gl.useProgram(this.dye.p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dyeFbB)
    gl.uniform4fv(this.dye.u.uNoz, this.noz)
    gl.uniform2f(this.dye.u.uSize, this.W, this.H)
    gl.uniform1f(this.dye.u.uDt, dt)
    gl.uniform1f(this.dye.u.uDecay, Math.pow(0.99985, dt))
    this.bind(0, this.dyeA, this.dye.u.uDye)
    this.bind(1, this.fA[2], this.dye.u.uF2)
    this.bind(2, this.geoTex, this.dye.u.uGeo)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    ;[this.dyeA, this.dyeB] = [this.dyeB, this.dyeA]
    ;[this.dyeFbA, this.dyeFbB] = [this.dyeFbB, this.dyeFbA]
  }

  /** Σρu_y through each probe line (board.probes order). */
  readProbes(): Float32Array {
    const gl = this.gl
    const nP = this.board.probes.length
    gl.useProgram(this.probe.p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeFb)
    gl.viewport(0, 0, nP, 1)
    gl.uniform3iv(this.probe.u.uProbe, this.probeData)
    this.bind(0, this.fA[2], this.probe.u.uF2)
    this.bind(1, this.geoTex, this.probe.u.uGeo)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.readPixels(0, 0, nP, 1, gl.RGBA, gl.FLOAT, this.probeBuf)
    const out = new Float32Array(nP)
    for (let k = 0; k < nP; k++) out[k] = this.probeBuf[k * 4]
    return out
  }

  render(view: View, canvasW: number, canvasH: number, time: number, mode: number): void {
    const gl = this.gl
    // glow source + separable blur at half board resolution
    gl.viewport(0, 0, this.glowW, this.glowH)
    gl.useProgram(this.glow.p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFb[0])
    this.bind(0, this.dyeA, this.glow.u.uDye)
    this.bind(1, this.sdfTex, this.glow.u.uSdf)
    gl.uniform2f(this.glow.u.uOut, this.glowW, this.glowH)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.useProgram(this.blur.p)
    for (let pass = 0; pass < 2; pass++) {
      const spread = 1 + pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFb[1])
      this.bind(0, this.glowTex[0], this.blur.u.uSrc)
      gl.uniform2f(this.blur.u.uDir, spread / this.glowW, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFb[0])
      this.bind(0, this.glowTex[1], this.blur.u.uSrc)
      gl.uniform2f(this.blur.u.uDir, 0, spread / this.glowH)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvasW, canvasH)
    gl.useProgram(this.comp.p)
    this.bind(0, this.dyeA, this.comp.u.uDye)
    this.bind(1, this.sdfTex, this.comp.u.uSdf)
    this.bind(2, this.fA[2], this.comp.u.uF2)
    this.bind(3, this.glowTex[0], this.comp.u.uGlow)
    gl.uniform2f(this.comp.u.uBoard, this.W, this.H)
    gl.uniform4f(this.comp.u.uView, view.scale, view.ox, view.oy, 1)
    gl.uniform2f(this.comp.u.uCanvas, canvasW, canvasH)
    gl.uniform1f(this.comp.u.uTime, time)
    gl.uniform1f(this.comp.u.uMode, mode)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}
