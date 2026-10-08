/**
 * Screen-space liquid rendering in Three.js (WebGL2).
 *
 * 1. Field pass: every particle is splatted as a soft Gaussian, and every tank's water body is
 *    drawn as a mesh whose top edge follows the rippling surface, into a half-resolution
 *    half-float target: R = "how much water", G = foam, B = depth below the surface,
 *    A = 1 inside a tank body.
 * 2. A separable blur turns the splats into one continuous metaball field.
 * 3. Composite: threshold the field, take its gradient as a surface normal, refract the
 *    painted background through it, absorb light with depth (Beer–Lambert), and add
 *    caustics, a Fresnel rim and a specular glint.
 */
import * as THREE from 'three';
import type { VisualWorld } from '../fluid/visual.ts';
import { MAX_PARTICLES, SPACING } from '../fluid/particles.ts';
import { widthAt, heightOf } from '../model/vessel.ts';
import type { View } from './view.ts';

const NX = 48;
const NY = 10;

const additive = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquation: THREE.AddEquation,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BLUR_FS = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(tSrc, vUv) * 0.2270270270;
  s += texture2D(tSrc, vUv + uDir * 1.3846153846) * 0.3162162162;
  s += texture2D(tSrc, vUv - uDir * 1.3846153846) * 0.3162162162;
  s += texture2D(tSrc, vUv + uDir * 3.2307692308) * 0.0702702703;
  s += texture2D(tSrc, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = s;
}
`;

const COMPOSITE_FS = /* glsl */ `
precision highp float;
uniform sampler2D tBg;
uniform sampler2D tField;
uniform vec2 uTexel;
uniform float uTime;
uniform vec4 uWorld;   // world = uWorld.xy + vUv * uWorld.zw
uniform float uRefract;
varying vec2 vUv;

// A classic cheap water-caustic pattern: iterated warps of a coordinate grid.
float caustic(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

void main() {
  vec4 f = texture2D(tField, vUv);
  vec3 bg = texture2D(tBg, vUv).rgb;
  float m = smoothstep(0.3, 0.55, f.r);
  if (m <= 0.0) { gl_FragColor = vec4(bg, 1.0); return; }

  float l = texture2D(tField, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(tField, vUv + vec2(uTexel.x, 0.0)).r;
  float b = texture2D(tField, vUv - vec2(0.0, uTexel.y)).r;
  float t = texture2D(tField, vUv + vec2(0.0, uTexel.y)).r;
  vec2 g = vec2(r - l, t - b);
  vec3 n = normalize(vec3(-g * mix(4.0, 2.2, clamp(f.a, 0.0, 1.0)), 1.0));

  vec2 wp = uWorld.xy + vUv * uWorld.zw;
  float body = clamp(f.a, 0.0, 1.0);
  float depth = max(f.b, 0.0);

  vec2 wob = vec2(sin(wp.y * 7.0 + uTime * 1.4 + sin(wp.x * 3.1 + uTime)),
                  cos(wp.x * 6.0 - uTime * 1.2)) * 0.0022 * body;
  vec2 off = n.xy * uRefract + wob;
  vec3 seen = texture2D(tBg, vUv + off).rgb;

  float th = clamp(f.r, 0.0, 1.4) * 0.22 + depth * 0.9;
  vec3 absorb = exp(-th * vec3(1.9, 0.62, 0.36));
  vec3 col = seen * absorb * vec3(0.92, 1.04, 1.08) + (1.0 - absorb) * vec3(0.035, 0.17, 0.24);
  // Free streams catch the light: a luminous core plus a cool rim.
  float stream = 1.0 - body;
  col += stream * (vec3(0.035, 0.10, 0.13) + vec3(0.05, 0.12, 0.14) * clamp(f.r - 0.4, 0.0, 1.0));

  // Light scattered just under the surface, and caustic lace on the back of the tank.
  col += body * exp(-depth * 7.0) * vec3(0.10, 0.30, 0.34) * 0.55;
  float c = caustic(wp * 2.2 + vec2(0.0, uTime * 0.05), uTime * 0.55 + 23.0);
  col += body * clamp(c, 0.0, 1.0) * exp(-depth * 0.7) * vec3(0.30, 0.55, 0.58) * 0.28;

  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 60.0) * 1.3;
  float fres = pow(1.0 - n.z, 2.0) * mix(0.55, 0.75, clamp(f.a, 0.0, 1.0));
  col += spec * vec3(1.0, 0.97, 0.92) + fres * vec3(0.55, 0.78, 0.92);

  col = mix(col, vec3(0.86, 0.94, 1.0), clamp(f.g * 0.9, 0.0, 0.75));
  gl_FragColor = vec4(mix(bg, col, m), 1.0);
}
`;

interface Body {
  mesh: THREE.Mesh;
  pos: Float32Array;
  depth: Float32Array;
}

export class WaterRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private camera = new THREE.OrthographicCamera(-8, 8, 10, 0, -1, 1);
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fieldScene = new THREE.Scene();
  private fieldRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  private blurMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private points: THREE.Points;
  private pointPos: Float32Array;
  private pointFoam: Float32Array;
  private pointVel: Float32Array;
  private pointMat: THREE.ShaderMaterial;
  private bodies = new Map<string, Body>();
  private bodyMat: THREE.ShaderMaterial;
  readonly bgTexture: THREE.CanvasTexture;
  private world?: VisualWorld;

  constructor(canvas: HTMLCanvasElement, bgCanvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const rtOpts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    };
    this.fieldRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.blurRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);

    this.bgTexture = new THREE.CanvasTexture(bgCanvas);
    this.bgTexture.colorSpace = THREE.NoColorSpace;
    this.bgTexture.minFilter = THREE.LinearFilter;
    this.bgTexture.generateMipmaps = false;

    const max = MAX_PARTICLES;
    this.pointPos = new Float32Array(max * 3);
    this.pointFoam = new Float32Array(max);
    this.pointVel = new Float32Array(max * 2);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pointPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aFoam', new THREE.BufferAttribute(this.pointFoam, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aVel', new THREE.BufferAttribute(this.pointVel, 2).setUsage(THREE.DynamicDrawUsage));
    this.pointMat = new THREE.ShaderMaterial({
      ...additive,
      uniforms: { uSize: { value: 8 } },
      vertexShader: /* glsl */ `
        attribute float aFoam;
        attribute vec2 aVel;
        uniform float uSize;
        varying float vFoam;
        varying vec2 vDir;
        varying float vStretch;
        void main() {
          vFoam = aFoam;
          float sp = length(aVel);
          vDir = sp > 1e-4 ? aVel / sp : vec2(0.0, 1.0);
          vStretch = clamp(1.0 + sp * 0.16, 1.0, 1.85);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vFoam;
        varying vec2 vDir;
        varying float vStretch;
        void main() {
          // Splats are stretched along the velocity, a little like motion blur, so a fast
          // falling stream reads as one ribbon rather than a string of beads.
          vec2 d = gl_PointCoord * 2.0 - 1.0;
          d.y = -d.y;
          float along = dot(d, vDir) / (0.54 * vStretch);
          float across = dot(d, vec2(-vDir.y, vDir.x)) / 0.54;
          float r2 = along * along + across * across;
          if (r2 > 1.0) discard;
          float a = (exp(-r2 * 2.6) - 0.0743) / 0.9257;
          gl_FragColor = vec4(a * 0.62, a * vFoam * 0.6, 0.0, 0.0);
        }`,
    });
    this.points = new THREE.Points(pg, this.pointMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.fieldScene.add(this.points);

    this.bodyMat = new THREE.ShaderMaterial({
      ...additive,
      vertexShader: /* glsl */ `
        attribute float aDepth;
        varying float vDepth;
        void main() {
          vDepth = aDepth;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vDepth;
        void main() { gl_FragColor = vec4(1.0, 0.0, vDepth, 1.0); }`,
    });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS,
      fragmentShader: BLUR_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tBg: { value: this.bgTexture },
        tField: { value: this.blurRT.texture },
        uTexel: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uWorld: { value: new THREE.Vector4() },
        uRefract: { value: 0.02 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: COMPOSITE_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setWorld(world: VisualWorld): void {
    for (const b of this.bodies.values()) {
      this.fieldScene.remove(b.mesh);
      b.mesh.geometry.dispose();
    }
    this.bodies.clear();
    this.world = world;
    for (const v of world.machine.scene.vessels) {
      const nv = (NX + 1) * (NY + 1);
      const pos = new Float32Array(nv * 3);
      const depth = new Float32Array(nv);
      const idx: number[] = [];
      for (let j = 0; j < NY; j++)
        for (let i = 0; i < NX; i++) {
          const a = j * (NX + 1) + i;
          const b = a + 1;
          const c = a + NX + 1;
          const d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, this.bodyMat);
      mesh.frustumCulled = false;
      this.fieldScene.add(mesh);
      this.bodies.set(v.id, { mesh, pos, depth });
    }
  }

  resize(view: View): void {
    const dpr = view.dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(view.w, view.h, false);
    const fw = Math.max(4, Math.round((view.w * dpr) / 2));
    const fh = Math.max(4, Math.round((view.h * dpr) / 2));
    this.fieldRT.setSize(fw, fh);
    this.blurRT.setSize(fw, fh);
    this.camera.left = view.left;
    this.camera.right = view.right;
    this.camera.top = view.top;
    this.camera.bottom = view.bottom;
    this.camera.updateProjectionMatrix();
    const pxPerWorldField = (view.s * dpr) / 2;
    this.pointMat.uniforms.uSize.value = Math.max(2, SPACING * 3.9 * 1.85 * pxPerWorldField);
    this.compMat.uniforms.uTexel.value.set(1.6 / fw, 1.6 / fh);
    this.compMat.uniforms.uWorld.value.set(view.left, view.bottom, view.right - view.left, view.top - view.bottom);
    this.compMat.uniforms.uRefract.value = 0.012 * Math.min(1.5, 900 / Math.max(view.w, 400));
  }

  private updateBodies(): void {
    const world = this.world!;
    for (const v of world.machine.scene.vessels) {
      const b = this.bodies.get(v.id)!;
      const L = heightOf(v.profile, world.net.vessel(v.id).V);
      if (L < 2e-4) {
        b.mesh.visible = false;
        continue;
      }
      b.mesh.visible = true;
      const wave = world.waves.get(v.id)!;
      const wTop = widthAt(v.profile, L);
      let k = 0;
      for (let j = 0; j <= NY; j++) {
        const t = j / NY;
        const h = t * L;
        const w = widthAt(v.profile, h);
        for (let i = 0; i <= NX; i++) {
          const s = i / NX;
          const x = v.x + (s - 0.5) * w;
          // The ripple is defined across the surface width; follow it down the column.
          const sTop = wTop > 1e-6 ? (x - (v.x - wTop / 2)) / wTop : 0.5;
          const eta = wave.sample(sTop);
          const y = v.y0 + h + eta * t * t;
          b.pos[k * 3] = x;
          b.pos[k * 3 + 1] = y;
          b.pos[k * 3 + 2] = 0;
          b.depth[k] = (L + eta - h - eta * t * t) * (v.infinite ? 0.6 : 1);
          k++;
        }
      }
      const g = b.mesh.geometry;
      g.attributes.position.needsUpdate = true;
      (g.attributes.aDepth as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private updatePoints(): void {
    const p = this.world!.particles;
    const n = p.count;
    for (let i = 0; i < n; i++) {
      this.pointPos[i * 3] = p.x[i];
      this.pointPos[i * 3 + 1] = p.y[i];
      this.pointPos[i * 3 + 2] = 0;
      const speed = Math.hypot(p.vx[i], p.vy[i]);
      this.pointVel[i * 2] = p.vx[i];
      this.pointVel[i * 2 + 1] = p.vy[i];
      this.pointFoam[i] = Math.min(1, p.foam[i] + Math.max(0, speed - 4.5) * 0.08);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    (g.attributes.aFoam as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aVel as THREE.BufferAttribute).needsUpdate = true;
  }

  render(time: number): void {
    if (!this.world) return;
    this.updateBodies();
    this.updatePoints();
    const r = this.renderer;
    r.setRenderTarget(this.fieldRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.fieldScene, this.camera);

    // Separable blur: field → blur (H) → field (V) → read the result from fieldRT.
    this.quad.material = this.blurMat;
    this.blurMat.uniforms.tSrc.value = this.fieldRT.texture;
    this.blurMat.uniforms.uDir.value.set(1 / this.fieldRT.width, 0);
    r.setRenderTarget(this.blurRT);
    r.render(this.quadScene, this.quadCam);
    this.blurMat.uniforms.tSrc.value = this.blurRT.texture;
    this.blurMat.uniforms.uDir.value.set(0, 1 / this.fieldRT.height);
    r.setRenderTarget(this.fieldRT);
    r.render(this.quadScene, this.quadCam);

    this.quad.material = this.compMat;
    this.compMat.uniforms.tField.value = this.fieldRT.texture;
    this.compMat.uniforms.uTime.value = time;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
