/**
 * The WebGL stage. Everything is drawn in CSS-pixel coordinates (y up).
 *
 * 1. Scene pass into a render target: the painted wall, the valve grid, the glass vessels.
 * 2. Field pass: falling water (particles) is splatted as soft, velocity-stretched blobs into a
 *    half-resolution field, then blurred into one metaball surface (after the water-tanks demo).
 * 3. Composite: where the field is dense enough it is water — refract the scene through its
 *    normal, absorb with thickness, add a Fresnel rim and a glint; elsewhere show the scene.
 */
import * as THREE from 'three';
import { GridLayer } from './grid.ts';
import { TankLayer } from './tanks.ts';

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
uniform sampler2D tScene;
uniform sampler2D tField;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec4 f = texture2D(tField, vUv);
  vec3 bg = texture2D(tScene, vUv).rgb;
  float m = smoothstep(0.22, 0.5, f.r);
  if (m <= 0.0) { gl_FragColor = vec4(bg, 1.0); return; }
  float l = texture2D(tField, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(tField, vUv + vec2(uTexel.x, 0.0)).r;
  float b = texture2D(tField, vUv - vec2(0.0, uTexel.y)).r;
  float t = texture2D(tField, vUv + vec2(0.0, uTexel.y)).r;
  vec2 g = vec2(r - l, t - b);
  vec3 n = normalize(vec3(-g * 3.5, 1.0));
  vec3 seen = texture2D(tScene, vUv + n.xy * 0.012).rgb;
  float th = clamp(f.r, 0.0, 1.4) * 0.3;
  vec3 absorb = exp(-th * vec3(1.9, 0.62, 0.36));
  vec3 col = seen * absorb * vec3(0.92, 1.04, 1.08) + (1.0 - absorb) * vec3(0.035, 0.17, 0.24);
  col += vec3(0.05, 0.13, 0.16) + vec3(0.06, 0.14, 0.16) * clamp(f.r - 0.4, 0.0, 1.0);
  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 60.0) * 1.2;
  float fres = pow(1.0 - n.z, 2.0) * 0.6;
  col += spec * vec3(1.0, 0.97, 0.92) + fres * vec3(0.55, 0.78, 0.92);
  gl_FragColor = vec4(mix(bg, col, m), 1.0);
}
`;

const MAX_P = 6000;

export class Particles {
  x = new Float32Array(MAX_P);
  y = new Float32Array(MAX_P);
  vx = new Float32Array(MAX_P);
  vy = new Float32Array(MAX_P);
  /** y below which the particle is absorbed (the water surface it falls into). */
  floor = new Float32Array(MAX_P);
  count = 0;

  spawn(x: number, y: number, vx: number, vy: number, floor: number): void {
    if (this.count >= MAX_P) return;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.floor[i] = floor;
  }

  step(dt: number, gravity: number): void {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      this.vy[i] -= gravity * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      if (this.y[i] < this.floor[i]) continue;
      if (n !== i) {
        this.x[n] = this.x[i];
        this.y[n] = this.y[i];
        this.vx[n] = this.vx[i];
        this.vy[n] = this.vy[i];
        this.floor[n] = this.floor[i];
      }
      n++;
    }
    this.count = n;
  }

  clear(): void {
    this.count = 0;
  }
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly scene = new THREE.Scene();
  private fieldScene = new THREE.Scene();
  private quadScene = new THREE.Scene();
  private sceneRT: THREE.WebGLRenderTarget;
  private fieldRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  private blurMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private bgTex: THREE.CanvasTexture;
  private bgMesh: THREE.Mesh;
  private points: THREE.Points;
  private pPos = new Float32Array(MAX_P * 3);
  private pVel = new Float32Array(MAX_P * 2);
  private pointMat: THREE.ShaderMaterial;
  readonly grid = new GridLayer();
  readonly tanks = new TankLayer();
  readonly particles = new Particles();
  w = 1;
  h = 1;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement, readonly bgCanvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: false });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const rt = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    };
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { ...rt, type: THREE.UnsignedByteType });
    this.fieldRT = new THREE.WebGLRenderTarget(4, 4, rt);
    this.blurRT = new THREE.WebGLRenderTarget(4, 4, rt);

    this.bgTex = new THREE.CanvasTexture(bgCanvas);
    this.bgTex.colorSpace = THREE.NoColorSpace;
    this.bgTex.minFilter = THREE.LinearFilter;
    this.bgTex.generateMipmaps = false;
    this.bgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.bgTex, depthTest: false, depthWrite: false }),
    );
    this.bgMesh.renderOrder = 0;
    this.grid.mesh.renderOrder = 1;
    this.tanks.mesh.renderOrder = 2;
    this.scene.add(this.bgMesh, this.grid.mesh, this.tanks.mesh);

    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aVel', new THREE.BufferAttribute(this.pVel, 2).setUsage(THREE.DynamicDrawUsage));
    this.pointMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      uniforms: { uSize: { value: 8 } },
      vertexShader: /* glsl */ `
        attribute vec2 aVel;
        uniform float uSize;
        varying vec2 vDir;
        varying float vStretch;
        void main() {
          float sp = length(aVel);
          vDir = sp > 1e-4 ? aVel / sp : vec2(0.0, 1.0);
          vStretch = clamp(1.0 + sp * 0.004, 1.0, 1.9);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vDir;
        varying float vStretch;
        void main() {
          vec2 d = gl_PointCoord * 2.0 - 1.0;
          d.y = -d.y;
          float along = dot(d, vDir) / (0.54 * vStretch);
          float across = dot(d, vec2(-vDir.y, vDir.x)) / 0.54;
          float r2 = along * along + across * across;
          if (r2 > 1.0) discard;
          float a = (exp(-r2 * 2.6) - 0.0743) / 0.9257;
          gl_FragColor = vec4(a * 0.62, 0.0, 0.0, 0.0);
        }`,
    });
    this.points = new THREE.Points(pg, this.pointMat);
    this.points.frustumCulled = false;
    this.fieldScene.add(this.points);

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS,
      fragmentShader: BLUR_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tField: { value: this.blurRT.texture },
        uTexel: { value: new THREE.Vector2() },
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

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.sceneRT.setSize(Math.round(w * dpr), Math.round(h * dpr));
    const fw = Math.max(4, Math.round((w * dpr) / 2));
    const fh = Math.max(4, Math.round((h * dpr) / 2));
    this.fieldRT.setSize(fw, fh);
    this.blurRT.setSize(fw, fh);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    this.bgMesh.position.set(w / 2, h / 2, 0);
    this.bgMesh.scale.set(w, h, 1);
    this.compMat.uniforms.uTexel.value.set(1.6 / fw, 1.6 / fh);
  }

  /** Call after repainting the background canvas. */
  bgChanged(): void {
    this.bgTex.needsUpdate = true;
  }

  /** Particle splat size in CSS px. */
  setDropSize(px: number): void {
    this.pointMat.uniforms.uSize.value = Math.max(2, (px * this.dpr) / 2);
  }

  render(time: number): void {
    const r = this.renderer;
    this.grid.mat.uniforms.uTime.value = time;
    this.tanks.mat.uniforms.uTime.value = time;
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x0a0f18, 1);
    r.clear();
    r.render(this.scene, this.camera);

    const p = this.particles;
    const n = p.count;
    for (let i = 0; i < n; i++) {
      this.pPos[i * 3] = p.x[i];
      this.pPos[i * 3 + 1] = p.y[i];
      this.pPos[i * 3 + 2] = 0;
      this.pVel[i * 2] = p.vx[i];
      this.pVel[i * 2 + 1] = p.vy[i];
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aVel.needsUpdate = true;
    r.setRenderTarget(this.fieldRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    if (n > 0) r.render(this.fieldScene, this.camera);
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
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(this.quadScene, this.quadCam);
  }
}
