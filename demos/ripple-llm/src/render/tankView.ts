/**
 * Three.js view of a programmable ripple tank: a refractive, reflective water
 * surface over a sculpted seabed lit by real-time caustics, with wave-makers on the
 * left wall and probes on the right, in a dark gallery.
 *
 * Passes per frame:
 *   1. caustics: a fine grid over the surface is refracted down to the (sculpted)
 *      floor and splatted additively into a floor-space texture; each triangle's
 *      brightness is the ratio of its area before and after refraction;
 *   2. refraction: everything except the water, from the camera, into a texture;
 *   3. main: the water surface samples (2) bent by its slope, mixed with the
 *      reflected gallery by Fresnel.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { C2_DEEP, PADDLE_X, PROBE_X, paddleHalf, type TankSpec } from '../sim/tank.ts';
import {
  causticsFragment,
  causticsVertex,
  floorFragment,
  floorVertex,
  seabedFragment,
  seabedVertex,
  waterFragment,
  waterVertex,
} from './shaders.ts';

export const TANK_W = 3.2;
const DEPTH = 0.3;
const RIM = 0.07;
const TO_LIGHT = new THREE.Vector3(0.32, 1, 0.22).normalize();
const LIGHT_COLOR = new THREE.Color(1.0, 0.96, 0.9);
export const AMBER = new THREE.Color(0xffa040);
export const BLUE = new THREE.Color(0x6f9cff);
export const CYAN = new THREE.Color(0x66e0ff);

export interface PortVisual {
  /** 0..1 activity. */
  level: number;
  color: THREE.Color;
  /** Unused ports are drawn dark. */
  used: boolean;
}

export class TankView {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly scene = new THREE.Scene();
  private readonly nx: number;
  private readonly ny: number;
  private readonly size: THREE.Vector2;
  private readonly cell: number;
  private spec: TankSpec | null = null;

  private readonly heightData: Uint16Array;
  private readonly heightTex: THREE.DataTexture;
  private readonly floorData: Uint16Array;
  private readonly floorTex: THREE.DataTexture;
  private readonly causticsRT: THREE.WebGLRenderTarget;
  private readonly refractionRT: THREE.WebGLRenderTarget;
  private readonly causticsScene = new THREE.Scene();
  private readonly causticsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly heightUniforms: Record<string, THREE.IUniform>;
  private readonly floorUniforms: Record<string, THREE.IUniform>;
  private readonly hideInRefraction: THREE.Object3D[] = [];
  private readonly plaqueCanvas = document.createElement('canvas');
  private plaqueTex!: THREE.CanvasTexture;

  private ports = new THREE.Group();
  private paddles: THREE.Mesh[] = [];
  private paddleGlows: THREE.Sprite[] = [];
  private probeHeads: THREE.Mesh[] = [];
  private probeRings: THREE.Mesh[] = [];
  private probeGlows: THREE.Sprite[] = [];

  constructor(canvas: HTMLCanvasElement, nx: number, ny: number) {
    this.nx = nx;
    this.ny = ny;
    const W = TANK_W;
    const D = (W * ny) / nx;
    this.size = new THREE.Vector2(W, D);
    this.cell = W / nx;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x04060a, 1);
    this.renderer = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    this.scene.background = new THREE.Color(0x04060a);
    this.scene.fog = new THREE.Fog(0x04060a, 7, 16);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
    this.camera.position.set(0.1, 4.6, 2.9);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0.06, -0.32, 0.2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.8;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.25;
    this.controls.update();

    this.heightData = new Uint16Array(nx * ny);
    this.heightTex = new THREE.DataTexture(this.heightData, nx, ny, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.needsUpdate = true;
    this.floorData = new Uint16Array(nx * ny);
    this.floorTex = new THREE.DataTexture(this.floorData, nx, ny, THREE.RedFormat, THREE.HalfFloatType);
    this.floorTex.magFilter = THREE.LinearFilter;
    this.floorTex.minFilter = THREE.LinearFilter;

    this.heightUniforms = {
      uHeight: { value: this.heightTex },
      uTexel: { value: new THREE.Vector2(1 / nx, 1 / ny) },
      uSize: { value: this.size },
      uHScale: { value: 0.05 },
      uCell: { value: this.cell },
    };
    this.floorUniforms = {
      uFloor: { value: this.floorTex },
      uDepth: { value: DEPTH },
      uFloorTexel: { value: new THREE.Vector2(1 / nx, 1 / ny) },
    };

    const rtOpts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    };
    this.causticsRT = new THREE.WebGLRenderTarget(1024, Math.round((1024 * D) / W), rtOpts);
    this.refractionRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: true });

    this.buildCaustics();
    const underwater = {
      uCaustics: { value: this.causticsRT.texture },
      uSize: { value: this.size },
      uToLight: { value: TO_LIGHT },
      uLightColor: { value: LIGHT_COLOR },
      uWaterLevel: { value: 0 },
    };
    const softbox = {
      uSoftbox: { value: new THREE.Vector3(0.2, 3.2, -3.6) },
      uSoftboxSize: { value: new THREE.Vector2(2.8, 1.6) },
    };
    this.buildTank(underwater);

    this.waterMat = new THREE.ShaderMaterial({
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      uniforms: {
        ...this.heightUniforms,
        ...softbox,
        uRefraction: { value: this.refractionRT.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uToLight: { value: TO_LIGHT },
        uLightColor: { value: LIGHT_COLOR },
        uDeepColor: { value: new THREE.Color(0.012, 0.075, 0.09) },
        uRefract: { value: 0.09 },
        ...this.floorUniforms,
      },
    });
    const wgeo = new THREE.PlaneGeometry(W, D, nx * 2, ny * 2);
    wgeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(wgeo, this.waterMat);
    this.scene.add(water);
    this.hideInRefraction.push(water);

    this.scene.add(this.ports);
    this.buildGallery();

    const key = new THREE.DirectionalLight(0xfff3e6, 2.2);
    key.position.copy(TO_LIGHT).multiplyScalar(6);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0x8aa4c8, 0x1a1410, 0.35));
  }

  // ------------------------------------------------------------------ building

  private buildCaustics(): void {
    const geo = new THREE.PlaneGeometry(2, 2, this.nx * 2, this.ny * 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: causticsVertex,
      fragmentShader: causticsFragment,
      uniforms: {
        ...this.heightUniforms,
        ...this.floorUniforms,
        uLightRay: { value: TO_LIGHT.clone().negate() },
      },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.causticsScene.add(mesh);
  }

  private buildTank(underwater: Record<string, THREE.IUniform>): void {
    const { x: W, y: D } = this.size;
    const seabedMat = new THREE.ShaderMaterial({
      vertexShader: seabedVertex,
      fragmentShader: seabedFragment,
      uniforms: { ...underwater, ...this.floorUniforms, uContours: { value: 1 } },
    });
    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(W, D, this.nx * 2, this.ny * 2), seabedMat);
    seabed.geometry.rotateX(-Math.PI / 2);
    seabed.frustumCulled = false;
    this.scene.add(seabed);

    const wallMat = new THREE.ShaderMaterial({
      vertexShader: floorVertex,
      fragmentShader: floorFragment,
      uniforms: { ...underwater, uIsWall: { value: 1 } },
    });
    const h = DEPTH + RIM;
    const walls: [number, number, number, number][] = [
      [0, -D / 2, 0, W],
      [0, D / 2, Math.PI, W],
      [-W / 2, 0, Math.PI / 2, D],
      [W / 2, 0, -Math.PI / 2, D],
    ];
    for (const [x, z, ry, w] of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, -DEPTH + h / 2, z);
      m.rotation.y = ry;
      this.scene.add(m);
    }

    // Walnut frame, brass inlay, a dark plinth and a plaque.
    const wood = new THREE.MeshStandardMaterial({ color: 0x2b1b12, roughness: 0.42, metalness: 0.0 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.3, metalness: 1.0 });
    const t = 0.13;
    const frameY = RIM - 0.02;
    const frame = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), wood);
      m.position.set(x, frameY, z);
      this.scene.add(m);
    };
    frame(W + 2 * t, t, 0, -D / 2 - t / 2);
    frame(W + 2 * t, t, 0, D / 2 + t / 2);
    frame(t, D, -W / 2 - t / 2, 0);
    frame(t, D, W / 2 + t / 2, 0);
    const inlay = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, d), brass);
      m.position.set(x, frameY + 0.031, z);
      this.scene.add(m);
    };
    inlay(W + 0.02, 0.012, 0, -D / 2 - 0.012);
    inlay(W + 0.02, 0.012, 0, D / 2 + 0.012);
    inlay(0.012, D + 0.02, -W / 2 - 0.012, 0);
    inlay(0.012, D + 0.02, W / 2 + 0.012, 0);

    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.75 });
    const base = -DEPTH - 0.005;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * t, 0.9, D + 2 * t), plinthMat);
    plinth.position.y = base - 0.45;
    this.scene.add(plinth);
    const sideH = frameY - 0.03 - base;
    const side = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, sideH, d), wood);
      m.position.set(x, base + sideH / 2, z);
      this.scene.add(m);
    };
    side(W + 2 * t, t, 0, -D / 2 - t / 2);
    side(W + 2 * t, t, 0, D / 2 + t / 2);
    side(t, D, -W / 2 - t / 2, 0);
    side(t, D, W / 2 + t / 2, 0);
    this.plaqueCanvas.width = 1024;
    this.plaqueCanvas.height = 136;
    this.plaqueTex = new THREE.CanvasTexture(this.plaqueCanvas);
    this.plaqueTex.colorSpace = THREE.SRGBColorSpace;
    this.plaqueTex.anisotropy = 4;
    this.setPlaque('THE RIPPLE LLM', 'a sculpted floor that multiplies matrices');
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.01), [
      brass,
      brass,
      brass,
      brass,
      new THREE.MeshStandardMaterial({ map: this.plaqueTex, metalness: 1, roughness: 0.32 }),
      brass,
    ]);
    plaque.position.set(0, base - 0.2, D / 2 + t + 0.005);
    this.scene.add(plaque);
  }

  setPlaque(title: string, subtitle: string): void {
    const c = this.plaqueCanvas;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#c9a25e');
    grad.addColorStop(1, '#9a7638');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(60,40,15,0.6)';
    g.lineWidth = 3;
    g.strokeRect(10, 10, c.width - 20, c.height - 20);
    g.fillStyle = '#3b2a12';
    g.textAlign = 'center';
    g.font = '600 46px Georgia, serif';
    g.fillText(title, c.width / 2, 66);
    g.font = 'italic 26px Georgia, serif';
    g.fillText(subtitle, c.width / 2, 108);
    this.plaqueTex.needsUpdate = true;
  }

  private sharedGlow?: THREE.Texture;
  private makeGlow(scale: number): THREE.Sprite {
    if (!this.sharedGlow) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.2, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.sharedGlow = new THREE.CanvasTexture(c);
      this.sharedGlow.colorSpace = THREE.SRGBColorSpace;
    }
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.sharedGlow,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      }),
    );
    s.scale.setScalar(scale);
    return s;
  }

  /** Show a different tank: its floor, its wave-makers and its probes. */
  setTank(spec: TankSpec): void {
    if (this.spec === spec) return;
    this.spec = spec;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < spec.c2.length; i++) this.floorData[i] = toHalf(spec.c2[i] / C2_DEEP);
    this.floorTex.needsUpdate = true;

    // Rebuild the ports.
    this.scene.remove(this.ports);
    this.ports.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) (o.material as THREE.Material).dispose();
    });
    for (const o of [...this.probeRings, ...this.paddleGlows, ...this.probeGlows]) {
      const k = this.hideInRefraction.indexOf(o);
      if (k >= 0) this.hideInRefraction.splice(k, 1);
    }
    this.ports = new THREE.Group();
    this.paddles = [];
    this.paddleGlows = [];
    this.probeHeads = [];
    this.probeRings = [];
    this.probeGlows = [];
    const { x: W, y: D } = this.size;
    const half = paddleHalf(spec);
    for (const p of spec.paddles) {
      const width = half * 2.6 * this.cell;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9c7b45,
        metalness: 0.9,
        roughness: 0.35,
        emissive: AMBER.clone(),
        emissiveIntensity: 0,
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, width), mat);
      const z = (p.y / this.ny - 0.5) * D;
      m.position.set(-W / 2 + ((PADDLE_X + 0.5) / this.nx) * W, 0.0, z);
      this.ports.add(m);
      this.paddles.push(m);
      const glow = this.makeGlow(0.3);
      glow.position.set(m.position.x, 0.03, z);
      this.ports.add(glow);
      this.paddleGlows.push(glow);
      this.hideInRefraction.push(glow);
    }
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 1, roughness: 0.25 });
    const rodGeo = new THREE.CylinderGeometry(0.0055, 0.0055, DEPTH + 0.1, 10);
    const headGeo = new THREE.SphereGeometry(0.021, 20, 12);
    const ringGeo = new THREE.TorusGeometry(0.03, 0.0035, 8, 40);
    spec.probes.forEach((_, k) => {
      const wp = this.probeWorld(k);
      const rod = new THREE.Mesh(rodGeo, rodMat);
      rod.position.set(wp.x, -DEPTH + (DEPTH + 0.1) / 2, wp.z);
      this.ports.add(rod);
      const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0x66e0ff }));
      head.position.set(wp.x, 0.1, wp.z);
      this.ports.add(head);
      this.probeHeads.push(head);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(wp.x, 0.004, wp.z);
      this.ports.add(ring);
      this.hideInRefraction.push(ring);
      this.probeRings.push(ring);
      const glow = this.makeGlow(0.16);
      glow.position.set(wp.x, 0.1, wp.z);
      this.ports.add(glow);
      this.probeGlows.push(glow);
      this.hideInRefraction.push(glow);
    });
    this.scene.add(this.ports);
  }

  private buildGallery(): void {
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          float r = length(vWorld.xz * vec2(0.55, 0.75));
          float pool = exp(-r * r * 0.9);
          vec2 g = abs(fract(vWorld.xz * 1.2) - 0.5);
          float plank = smoothstep(0.0, 0.02, min(g.x, 0.5)) * 0.15 + 0.85;
          vec3 c = vec3(0.05, 0.045, 0.04) * pool * plank + vec3(0.004, 0.005, 0.007);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = RIM - 0.05 - 0.9;
    this.scene.add(ground);
  }

  // ------------------------------------------------------------------ per frame

  setHeightScale(s: number): void {
    this.heightUniforms.uHScale.value = s;
  }

  setHeights(u: Float32Array): void {
    const d = this.heightData;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < u.length; i++) d[i] = toHalf(u[i]);
    this.heightTex.needsUpdate = true;
  }

  /**
   * Wave-makers: displacement now (−1..1) and the visual for each. A negative
   * input is the same motion half a period later, drawn blue.
   */
  setPaddles(disp: ArrayLike<number>, vis: PortVisual[]): void {
    const x0 = -this.size.x / 2 + ((PADDLE_X + 0.5) / this.nx) * this.size.x;
    this.paddles.forEach((m, k) => {
      const v = vis[k];
      m.position.x = x0 + 0.02 * disp[k];
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(v.color);
      mat.emissiveIntensity = v.used ? 0.15 + 1.6 * v.level * (0.55 + 0.45 * Math.abs(disp[k])) : 0;
      mat.color.setHex(v.used ? 0x9c7b45 : 0x3a3530);
      const glow = this.paddleGlows[k].material as THREE.SpriteMaterial;
      glow.color.copy(v.color);
      glow.opacity = v.used ? 0.1 + 0.6 * v.level * (0.5 + 0.5 * Math.abs(disp[k])) : 0;
    });
  }

  setProbes(vis: PortVisual[]): void {
    vis.forEach((v, k) => {
      if (!this.probeHeads[k]) return;
      const head = this.probeHeads[k].material as THREE.MeshBasicMaterial;
      head.color.copy(v.color).multiplyScalar(v.used ? 0.35 + 1.4 * v.level : 0.12);
      const ring = this.probeRings[k].material as THREE.MeshBasicMaterial;
      ring.color.copy(v.color).multiplyScalar(v.used ? 0.12 + 0.6 * v.level : 0.03);
      const glow = this.probeGlows[k].material as THREE.SpriteMaterial;
      glow.color.copy(v.color);
      glow.opacity = v.used ? 0.15 + 0.75 * v.level : 0;
      this.probeGlows[k].scale.setScalar(0.1 + 0.14 * v.level);
    });
  }

  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    const el = this.renderer.domElement;
    return {
      x: (v.x * 0.5 + 0.5) * el.clientWidth,
      y: (-v.y * 0.5 + 0.5) * el.clientHeight,
      visible: v.z < 1,
    };
  }

  paddleWorld(k: number): THREE.Vector3 {
    const p = this.spec!.paddles[k];
    return new THREE.Vector3(-this.size.x / 2 + ((PADDLE_X + 0.5) / this.nx) * this.size.x, 0.1, (p.y / this.ny - 0.5) * this.size.y);
  }

  probeWorld(k: number): THREE.Vector3 {
    const p = this.spec!.probes[k];
    return new THREE.Vector3(
      ((PROBE_X + 0.5) / this.nx - 0.5) * this.size.x,
      0.1,
      ((Math.floor(p.y) + 0.5) / this.ny - 0.5) * this.size.y,
    );
  }

  /** Ray-cast a screen point onto the resting water plane; returns grid coords. */
  pickWater(clientX: number, clientY: number): { gx: number; gy: number } | null {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const gx = (hit.x / this.size.x + 0.5) * this.nx;
    const gy = (hit.z / this.size.y + 0.5) * this.ny;
    if (gx < 2 || gy < 2 || gx > this.nx - 2 || gy > this.ny - 2) return null;
    return { gx, gy };
  }

  /**
   * @param leftInset, rightInset pixels covered by UI on each side; the tank is
   *   centred in the remaining space by rendering an off-centre window.
   */
  resize(width: number, height: number, leftInset = 0, rightInset = 0, bottomInset = 0): void {
    this.renderer.setSize(width, height, false);
    const fullW = width + Math.abs(rightInset - leftInset);
    const fullH = height + bottomInset;
    this.camera.aspect = fullW / fullH;
    const aspect = (width - leftInset - rightInset) / Math.max(1, height - bottomInset);
    this.camera.fov = aspect < 1.45 ? Math.min(75, (32 * 1.45) / Math.max(0.45, aspect)) : 32;
    const offX = rightInset > leftInset ? rightInset - leftInset : 0;
    if (fullW !== width || fullH !== height) this.camera.setViewOffset(fullW, fullH, offX, bottomInset, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.refractionRT.setSize(Math.round(width * pr), Math.round(height * pr));
    (this.waterMat.uniforms.uResolution.value as THREE.Vector2).set(width * pr, height * pr);
  }

  render(): void {
    const r = this.renderer;
    this.controls.update();

    r.setRenderTarget(this.causticsRT);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(this.causticsScene, this.causticsCam);

    for (const o of this.hideInRefraction) o.visible = false;
    r.setRenderTarget(this.refractionRT);
    r.setClearColor(0x04060a, 1);
    r.clear();
    r.render(this.scene, this.camera);
    for (const o of this.hideInRefraction) o.visible = true;

    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
