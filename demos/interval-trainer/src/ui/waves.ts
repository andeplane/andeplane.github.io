/**
 * Draws the wave field defined in `field.ts` across the whole page, underneath the glass
 * panels.
 *
 * Two backends, one field: a WebGL2 fragment shader evaluates it per pixel at full
 * resolution, and where WebGL is unavailable the same function is evaluated into an
 * ImageData at quarter resolution and scaled up with smoothing — the trick
 * `demos/tube-sim/src/render/renderer.ts` uses for its pressure field. The result is
 * blurry rather than absent, which for a soft glow is no loss at all.
 *
 * Source positions are stored as viewport fractions so a resize (or a phone rotating)
 * moves the ripples with the dots that spawned them.
 */

import {
  FIELD_GLSL,
  MAX_SOURCES,
  fieldAt,
  sourceLifetime,
  type Source,
} from './field.ts';

/** Peak opacity of the glow. Deliberately low: this is atmosphere, not the subject. */
const PEAK_ALPHA = 0.4;
/**
 * Above 1 this is a contrast curve, not a lift: only the strong crests near a source
 * register, so the field reads as a few bright rings rather than a grey wash.
 */
const CONTRAST = 1.15;
/** Crest colour (cool blue) and trough colour (violet). */
const CREST = [0.55, 0.8, 1.0] as const;
const TROUGH = [0.42, 0.32, 0.98] as const;
const FALLBACK_SCALE = 0.25;
const MAX_DPR = 2;
/** Stop the loop once nothing has been sounding for this long. */
const IDLE_GRACE_S = 0.4;

interface FractionalSource extends Omit<Source, 'x' | 'y'> {
  fx: number;
  fy: number;
}

const VERTEX_SRC = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

uniform vec2 uResolution;   // css px
uniform float uDpr;
uniform float uNow;
uniform int uCount;
uniform vec4 uSrc[${MAX_SOURCES}];    // xy = position (css px), z = startedAt, w = wavelength
uniform vec2 uParams[${MAX_SOURCES}]; // x = decay, y = amplitude

out vec4 outColor;

${FIELD_GLSL}

void main() {
  // gl_FragCoord counts device pixels from the bottom-left; the field thinks in CSS
  // pixels from the top-left, like every other coordinate in this app.
  vec2 p = vec2(gl_FragCoord.x / uDpr, uResolution.y - gl_FragCoord.y / uDpr);

  float v = 0.0;
  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if (i >= uCount) break;
    v += sourceAt(p, uSrc[i], uParams[i], uNow);
  }

  float signal = clamp(v, -1.0, 1.0);
  float alpha = pow(abs(signal), ${CONTRAST.toFixed(2)}) * ${PEAK_ALPHA.toFixed(3)};
  vec3 rgb = mix(
    vec3(${TROUGH.map((c) => c.toFixed(3)).join(', ')}),
    vec3(${CREST.map((c) => c.toFixed(3)).join(', ')}),
    0.5 + 0.5 * signal
  );
  outColor = vec4(rgb * alpha, alpha); // premultiplied
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('wave shader failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

interface GlBackend {
  kind: 'webgl';
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: {
    resolution: WebGLUniformLocation | null;
    dpr: WebGLUniformLocation | null;
    now: WebGLUniformLocation | null;
    count: WebGLUniformLocation | null;
    src: WebGLUniformLocation | null;
    params: WebGLUniformLocation | null;
  };
}

interface Canvas2dBackend {
  kind: '2d';
  ctx: CanvasRenderingContext2D;
  buffer: HTMLCanvasElement;
  bufferCtx: CanvasRenderingContext2D;
  image: ImageData | null;
}

type Backend = GlBackend | Canvas2dBackend | null;

function initWebgl(canvas: HTMLCanvasElement): GlBackend | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = vs && fs ? gl.createProgram() : null;
  if (!vs || !fs || !program) return null;

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('wave program failed:', gl.getProgramInfoLog(program));
    return null;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  return {
    kind: 'webgl',
    gl,
    program,
    uniforms: {
      resolution: gl.getUniformLocation(program, 'uResolution'),
      dpr: gl.getUniformLocation(program, 'uDpr'),
      now: gl.getUniformLocation(program, 'uNow'),
      count: gl.getUniformLocation(program, 'uCount'),
      src: gl.getUniformLocation(program, 'uSrc'),
      params: gl.getUniformLocation(program, 'uParams'),
    },
  };
}

function init2d(canvas: HTMLCanvasElement): Canvas2dBackend | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const buffer = document.createElement('canvas');
  const bufferCtx = buffer.getContext('2d');
  if (!bufferCtx) return null;
  return { kind: '2d', ctx, buffer, bufferCtx, image: null };
}

export class WaveField {
  private readonly canvas: HTMLCanvasElement;
  private backend: Backend = null;
  private sources: FractionalSource[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private running = false;
  private frame = 0;
  private enabled = true;
  private reducedMotion = false;
  private lastActivity = 0;
  private readonly srcData = new Float32Array(MAX_SOURCES * 4);
  private readonly paramData = new Float32Array(MAX_SOURCES * 2);

  constructor(canvas: HTMLCanvasElement, forceCanvas2d = false) {
    this.canvas = canvas;
    this.backend = forceCanvas2d ? init2d(canvas) : (initWebgl(canvas) ?? init2d(canvas));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Which backend actually came up — surfaced in the settings panel as a readout. */
  get backendName(): string {
    return this.backend?.kind ?? 'none';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.sources = [];
      this.clear();
      this.stop();
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /** `now` is the page clock in seconds, shared with the sequencer. */
  emit(
    fx: number,
    fy: number,
    wavelength: number,
    decay: number,
    amplitude: number,
    now: number,
  ): void {
    if (!this.enabled || !this.backend) return;
    this.sources.push({ fx, fy, wavelength, decay, amplitude, startedAt: now });
    // Oldest first, so the cap drops the faintest.
    if (this.sources.length > MAX_SOURCES) this.sources = this.sources.slice(-MAX_SOURCES);
    this.lastActivity = now;
    this.start();
  }

  clearSources(): void {
    this.sources = [];
  }

  private resize(): void {
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    if (this.backend?.kind === 'webgl') {
      this.backend.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.backend?.kind === '2d') {
      this.backend.buffer.width = Math.max(1, Math.round(this.width * FALLBACK_SCALE));
      this.backend.buffer.height = Math.max(1, Math.round(this.height * FALLBACK_SCALE));
      this.backend.image = this.backend.bufferCtx.createImageData(
        this.backend.buffer.width,
        this.backend.buffer.height,
      );
    }
  }

  private start(): void {
    if (this.running || !this.backend) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const now = performance.now() / 1000;
      this.prune(now);
      this.render(now);
      if (this.sources.length === 0 && now - this.lastActivity > IDLE_GRACE_S) {
        // Nothing left to animate: give the GPU back and wait for the next note.
        this.stop();
        this.clear();
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private prune(now: number): void {
    const maxRadius = Math.hypot(this.width, this.height);
    this.sources = this.sources.filter(
      (s) => now - s.startedAt < sourceLifetime(s, maxRadius),
    );
  }

  private toAbsolute(source: FractionalSource): Source {
    return {
      ...source,
      x: source.fx * this.width,
      y: source.fy * this.height,
    };
  }

  private clear(): void {
    if (this.backend?.kind === 'webgl') {
      this.backend.gl.clear(this.backend.gl.COLOR_BUFFER_BIT);
    } else if (this.backend?.kind === '2d') {
      this.backend.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private render(now: number): void {
    if (!this.backend) return;
    // With reduced motion the field is still drawn — it just doesn't move. Freezing the
    // clock a moment after onset catches the pattern at its most legible.
    const t = this.reducedMotion
      ? (this.sources[0]?.startedAt ?? now) + 1.2
      : now;
    if (this.backend.kind === 'webgl') this.renderGl(this.backend, t);
    else this.render2d(this.backend, t);
  }

  private renderGl(backend: GlBackend, now: number): void {
    const { gl, uniforms } = backend;
    const count = Math.min(MAX_SOURCES, this.sources.length);

    for (let i = 0; i < count; i++) {
      const s = this.toAbsolute(this.sources[i]);
      this.srcData.set([s.x, s.y, s.startedAt, s.wavelength], i * 4);
      this.paramData.set([s.decay, s.amplitude], i * 2);
    }

    gl.useProgram(backend.program);
    gl.uniform2f(uniforms.resolution, this.width, this.height);
    gl.uniform1f(uniforms.dpr, this.dpr);
    gl.uniform1f(uniforms.now, now);
    gl.uniform1i(uniforms.count, count);
    gl.uniform4fv(uniforms.src, this.srcData);
    gl.uniform2fv(uniforms.params, this.paramData);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private render2d(backend: Canvas2dBackend, now: number): void {
    const { ctx, buffer, bufferCtx, image } = backend;
    if (!image) return;

    const sources = this.sources.map((s) => this.toAbsolute(s));
    const data = image.data;
    const invScale = 1 / FALLBACK_SCALE;

    for (let py = 0; py < buffer.height; py++) {
      const y = py * invScale;
      for (let px = 0; px < buffer.width; px++) {
        const v = Math.max(-1, Math.min(1, fieldAt(sources, px * invScale, y, now)));
        const alpha = Math.abs(v) ** CONTRAST * PEAK_ALPHA;
        const mix = 0.5 + 0.5 * v;
        const i = (py * buffer.width + px) * 4;
        // ImageData is straight alpha, not premultiplied like the WebGL path.
        data[i] = (TROUGH[0] + (CREST[0] - TROUGH[0]) * mix) * 255;
        data[i + 1] = (TROUGH[1] + (CREST[1] - TROUGH[1]) * mix) * 255;
        data[i + 2] = (TROUGH[2] + (CREST[2] - TROUGH[2]) * mix) * 255;
        data[i + 3] = alpha * 255;
      }
    }

    bufferCtx.putImageData(image, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(buffer, 0, 0, this.canvas.width, this.canvas.height);
  }
}
