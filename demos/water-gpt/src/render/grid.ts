/**
 * The valve grid, drawn procedurally in one fragment shader so it scales from a 4 × 8 grid of
 * big brass valve wheels to a 128 × 256 field of glowing cells. Per-valve data lives in float
 * textures: opening, valve flow, row-manifold flow and column flow (texture A), and the
 * advected phase of the flow streaks in each row and column segment (texture B).
 *
 * The visible part is a window onto the grid (in cell units), so a big matrix can be zoomed
 * and panned while the overview map shows where the window is.
 */
import * as THREE from 'three';
import type { Assembly } from './assembly.ts';

const VS = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FS = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tCells;   // opening, valve flow, row flow, column flow
uniform sampler2D tPhase;   // row phase, column phase
uniform sampler2D tRows;    // head, isNegRow
uniform vec4 uWindow;       // x0, y0, w, h in cells (y down from the top row)
uniform vec2 uSize;         // grid rows, cols
uniform float uPx;          // CSS px per cell
uniform float uTime;
uniform float uFront;       // 0..1 wavefront of water through the grid (1 = steady state)
uniform float uHover;       // flat index of the hovered valve, -1 if none

const vec3 POS = vec3(0.36, 0.84, 0.95);
const vec3 NEG = vec3(1.0, 0.62, 0.32);
const vec3 BRASS = vec3(0.89, 0.77, 0.53);
const vec3 WATER = vec3(0.42, 0.83, 1.0);

float band(float d, float r, float aa) { return 1.0 - smoothstep(r - aa, r + aa, d); }

void main() {
  vec2 c = vec2(uWindow.x + vUv.x * uWindow.z, uWindow.y + (1.0 - vUv.y) * uWindow.w);
  vec2 cell = floor(c);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uSize.y || cell.y >= uSize.x) discard;
  vec2 f = c - cell;
  ivec2 ic = ivec2(cell);
  vec4 d = texelFetch(tCells, ic, 0);
  if (d.x < -0.5) discard;
  vec4 ph = texelFetch(tPhase, ic, 0);
  vec4 rw = texelFetch(tRows, ivec2(0, ic.y), 0);
  bool negCol = mod(cell.x, 2.0) > 0.5;
  vec3 sCol = negCol ? NEG : POS;
  float aa = 1.2 / max(uPx, 1.0);

  // wavefront: rows fill left to right first, then columns drain top to bottom
  float actRow = clamp((uFront * 2.0 - cell.x / uSize.y) * 6.0, 0.0, 1.0);
  float actCol = clamp((uFront * 2.0 - 1.0 - cell.y / uSize.x * 0.6) * 5.0, 0.0, 1.0) * actRow;
  float rowF = d.z * actRow;
  float colF = d.w * actCol;
  float valveF = d.y * actRow;

  // -------- low detail: each valve is a glowing tile (the far view of a big matrix)
  float detail = smoothstep(7.0, 16.0, uPx);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  {
    vec2 q = abs(f - 0.5);
    float tile = band(max(q.x, q.y), 0.44, aa);
    float o = d.x;
    vec3 base = mix(vec3(0.06, 0.08, 0.11), sCol * 0.8, pow(o, 0.7));
    float glow = sqrt(valveF);
    float shimmer = 0.75 + 0.25 * sin(uTime * 3.0 + ph.y * 6.283 - cell.y * 0.4);
    vec3 lo = base * (0.45 + 0.55 * o) + WATER * glow * 1.1 * shimmer + vec3(0.6, 0.9, 1.0) * glow * glow * 0.5;
    // faint lines for the manifolds
    float hl = band(q.y, 0.06, aa) * (0.12 + 0.8 * sqrt(rowF));
    float vl = band(q.x, 0.06, aa) * (0.12 + 0.8 * sqrt(colF));
    lo += WATER * max(hl, vl) * 0.35;
    col = lo;
    alpha = tile * 0.95;
  }
  if (detail > 0.0) {
    vec3 hc = vec3(0.0);
    float ha = 0.0;
    float rp = 0.12;  // pipe radius in cells
    // row manifold (horizontal glass tube)
    float dy = abs(f.y - 0.5);
    float rowTube = band(dy, rp, aa) * step(f.x - (cell.x < uSize.y - 1.0 ? 1.0 : 0.0), 0.5 + rp * 1.1);
    float rim = band(abs(dy - rp * 0.86), rp * 0.16, aa);
    float sRow = fract(f.x * 1.5 - ph.x);
    float streakR = smoothstep(0.0, 0.25, sRow) * (1.0 - smoothstep(0.35, 0.6, sRow));
    float flowR = sqrt(rowF);
    vec3 tubeIn = mix(vec3(0.05, 0.08, 0.11), WATER * 0.35, min(1.0, rw.x * 1.4) * actRow);
    tubeIn += WATER * flowR * (0.25 + 0.75 * streakR) * 0.8 * (1.0 - dy / rp * 0.6);
    hc = mix(hc, tubeIn, rowTube);
    ha = max(ha, rowTube);
    hc += vec3(0.75, 0.85, 0.95) * rim * 0.28;
    ha = max(ha, rim * 0.6);
    // column (vertical glass tube), drawn above the row tube where they cross
    float dx = abs(f.x - 0.5);
    float colTube = band(dx, rp, aa) * step(0.5 - rp * 1.1, f.y + (cell.y > 0.0 ? 1.0 : 0.0));
    float rimC = band(abs(dx - rp * 0.86), rp * 0.16, aa) * colTube;
    float sCol2 = fract(f.y * 1.5 - ph.y);
    float streakC = smoothstep(0.0, 0.25, sCol2) * (1.0 - smoothstep(0.35, 0.6, sCol2));
    float flowC = sqrt(colF);
    vec3 colIn = mix(vec3(0.05, 0.08, 0.11), sCol * 0.12, 0.5);
    colIn += mix(WATER, sCol, 0.35) * flowC * (0.25 + 0.75 * streakC) * 0.85 * (1.0 - dx / rp * 0.6);
    hc = mix(hc, colIn, colTube);
    ha = max(ha, colTube);
    hc += vec3(0.75, 0.85, 0.95) * rimC * 0.28;
    // valve wheel at the crossing
    vec2 v = f - 0.5;
    float r = length(v);
    float rv = 0.34;
    float disk = band(r, rv, aa);
    float ring = band(abs(r - rv * 0.9), rv * 0.11, aa);
    float ang = atan(v.x, v.y);           // 0 at the top, clockwise
    float a01 = fract(ang / 6.2831853 + 1.0);
    float o = d.x;
    float arc = step(a01, o) * band(r, rv * 0.78, aa) * (1.0 - band(r, rv * 0.3, aa));
    // spokes turn with the opening
    float sp = 0.0;
    for (int k = 0; k < 3; k++) {
      float th = o * 3.14159 + float(k) * 2.0944;
      vec2 dir = vec2(sin(th), cos(th));
      float along = dot(v, dir);
      float across = abs(dot(v, vec2(-dir.y, dir.x)));
      sp = max(sp, band(across, 0.022, aa) * step(-rv * 0.85, along) * step(along, rv * 0.85));
    }
    float hub = band(r, rv * 0.16, aa);
    vec3 face = vec3(0.07, 0.09, 0.12);
    face = mix(face, sCol * (0.35 + 0.65 * o) + WATER * sqrt(valveF) * 0.45, arc);
    vec3 brass = BRASS * (0.55 + 0.45 * (0.5 - v.y / rv * 0.5));
    face = mix(face, brass, max(ring, max(sp * 0.85, hub)));
    float glint = band(length(v - vec2(-0.09, -0.11)), 0.035, aa) * 0.6;
    face += vec3(1.0, 0.95, 0.85) * glint;
    // the flow through the valve itself: a pulse in the hub
    face += WATER * sqrt(valveF) * 0.55 * band(r, rv * 0.3, aa) * (0.7 + 0.3 * sin(uTime * 6.0 - ph.x * 6.28));
    if (uHover >= 0.0 && abs(uHover - (cell.y * uSize.y + cell.x)) < 0.5) face += vec3(0.25, 0.22, 0.15) * ring;
    hc = mix(hc, face, disk);
    ha = max(ha, disk);
    // drop shadow of the wheel on the wall
    float sh = band(length(v - vec2(0.04, 0.05)), rv * 1.05, 0.06) * (1.0 - disk) * 0.35;
    ha = max(ha, sh);
    col = mix(col, hc, detail);
    alpha = mix(alpha, ha, detail);
  }
  if (alpha < 0.004) discard;
  fragColor = vec4(col, alpha);
}
`;

export class GridLayer {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private cellsTex: THREE.DataTexture;
  private phaseTex: THREE.DataTexture;
  private rowsTex: THREE.DataTexture;
  private phase = new Float32Array(4);
  asm: Assembly | null = null;

  constructor() {
    this.cellsTex = this.tex(new Float32Array([-1, 0, 0, 0]), 1, 1);
    this.phaseTex = this.tex(new Float32Array(4), 1, 1);
    this.rowsTex = this.tex(new Float32Array(4), 1, 1);
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tCells: { value: this.cellsTex },
        tPhase: { value: this.phaseTex },
        tRows: { value: this.rowsTex },
        uWindow: { value: new THREE.Vector4(0, 0, 1, 1) },
        uSize: { value: new THREE.Vector2(1, 1) },
        uPx: { value: 10 },
        uTime: { value: 0 },
        uFront: { value: 1 },
        uHover: { value: -1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.frustumCulled = false;
  }

  private tex(data: Float32Array, w: number, h: number): THREE.DataTexture {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }

  setAssembly(asm: Assembly): void {
    const sizeChanged = !this.asm || this.asm.rows !== asm.rows || this.asm.cols !== asm.cols;
    this.asm = asm;
    if (sizeChanged) {
      this.cellsTex.dispose();
      this.phaseTex.dispose();
      this.rowsTex.dispose();
      this.cellsTex = this.tex(asm.cells.slice(), asm.cols, asm.rows);
      this.phase = new Float32Array(asm.rows * asm.cols * 4);
      this.phaseTex = this.tex(this.phase, asm.cols, asm.rows);
      this.rowsTex = this.tex(new Float32Array(asm.rows * 4), 1, asm.rows);
      this.mat.uniforms.tCells.value = this.cellsTex;
      this.mat.uniforms.tPhase.value = this.phaseTex;
      this.mat.uniforms.tRows.value = this.rowsTex;
    } else {
      (this.cellsTex.image.data as Float32Array).set(asm.cells);
      this.cellsTex.needsUpdate = true;
    }
    const rd = this.rowsTex.image.data as Float32Array;
    for (let i = 0; i < asm.rows; i++) {
      rd[i * 4] = asm.heads[i];
      rd[i * 4 + 1] = asm.negRow[i];
    }
    this.rowsTex.needsUpdate = true;
    this.mat.uniforms.uSize.value.set(asm.rows, asm.cols);
  }

  /** Advance the streak phases: each segment's pattern moves at a speed set by its flow. */
  advance(dt: number, front: number): void {
    const asm = this.asm;
    if (!asm) return;
    const n = asm.rows * asm.cols;
    const c = asm.cells;
    const ph = this.phase;
    const actRowK = Math.min(1, front * 2);
    const actColK = Math.max(0, Math.min(1, front * 2 - 1));
    for (let i = 0; i < n; i++) {
      if (c[i * 4] < -0.5) continue;
      ph[i * 4] = (ph[i * 4] + dt * (0.4 + 3.2 * Math.sqrt(c[i * 4 + 2])) * actRowK) % 1000;
      ph[i * 4 + 1] = (ph[i * 4 + 1] + dt * (0.4 + 3.2 * Math.sqrt(c[i * 4 + 3])) * actColK) % 1000;
    }
    this.phaseTex.needsUpdate = true;
  }

  /** Place the grid quad over a rectangle of the stage (pixel coords, y up). */
  place(x: number, y: number, w: number, h: number, win: { x: number; y: number; w: number; h: number }): void {
    this.mesh.position.set(x + w / 2, y + h / 2, 0);
    this.mesh.scale.set(w, h, 1);
    this.mat.uniforms.uWindow.value.set(win.x, win.y, win.w, win.h);
    this.mat.uniforms.uPx.value = w / win.w;
  }
}
