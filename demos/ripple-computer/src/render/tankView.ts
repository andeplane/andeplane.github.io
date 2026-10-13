/**
 * Three.js view of the ripple tank: a refractive, reflective water surface over a
 * tiled floor lit by real-time caustics, stone pillars, wave-makers and probes,
 * in a dark gallery.
 *
 * Passes per frame:
 *   1. caustics: a fine grid over the surface is refracted down to the floor and
 *      splatted additively into a floor-space texture; each triangle's brightness
 *      is the ratio of its area before and after refraction (light focused into a
 *      smaller area is brighter);
 *   2. refraction: everything except the water, from the camera, into a texture;
 *   3. main: the water surface samples (2) bent by its slope, mixed with the
 *      reflected gallery by Fresnel.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TankLayout } from '../sim/tank.ts';
import { mulberry32 } from '../sim/rng.ts';
import {
  causticsFragment,
  causticsVertex,
  floorFragment,
  floorVertex,
  stoneFragment,
  stoneVertex,
  waterFragment,
  waterVertex,
} from './shaders.ts';

export const TANK_W = 3.2;
const DEPTH = 0.3;
const RIM = 0.07;
const TO_LIGHT = new THREE.Vector3(0.32, 1, 0.22).normalize();
const LIGHT_COLOR = new THREE.Color(1.0, 0.96, 0.9);

export interface ProbeVisual {
  /** 0..1 activity, drives the glow. */
  level: number;
  color: THREE.Color;
}

export class TankView {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly scene = new THREE.Scene();
  private readonly layout: TankLayout;
  private readonly size: THREE.Vector2;
  private readonly cell: number;

  private readonly heightData: Uint16Array;
  private readonly heightTex: THREE.DataTexture;
  private readonly solidTex: THREE.DataTexture;
  private readonly causticsRT: THREE.WebGLRenderTarget;
  private readonly refractionRT: THREE.WebGLRenderTarget;
  private readonly causticsScene = new THREE.Scene();
  private readonly causticsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly water: THREE.Mesh;
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly heightUniforms: Record<string, THREE.IUniform>;
  private readonly hideInRefraction: THREE.Object3D[] = [];

  private readonly paddles: THREE.Mesh[] = [];
  private readonly paddleGlows: THREE.Sprite[] = [];
  private readonly probeHeads: THREE.Mesh[] = [];
  private readonly probeRings: THREE.Mesh[] = [];
  private readonly probeGlows: THREE.Sprite[] = [];

  constructor(canvas: HTMLCanvasElement, layout: TankLayout) {
    this.layout = layout;
    const W = TANK_W;
    const D = (W * layout.ny) / layout.nx;
    this.size = new THREE.Vector2(W, D);
    this.cell = W / layout.nx;

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
    this.camera.position.set(0.22, 3.62, 4.12);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0.1, -0.31, 0.2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = 1.25;
    this.controls.update();

    // ---- textures from the solver
    const { nx, ny } = layout;
    this.heightData = new Uint16Array(nx * ny);
    this.heightTex = new THREE.DataTexture(this.heightData, nx, ny, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.wrapS = this.heightTex.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTex.needsUpdate = true;
    const solid = new Uint8Array(nx * ny);
    for (let i = 0; i < solid.length; i++) solid[i] = layout.solid[i] ? 255 : 0;
    // The tank walls are not pillars; only stones should shadow the caustics.
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        if (x === 0 || y === 0 || x === nx - 1 || y === ny - 1) solid[y * nx + x] = 0;
      }
    }
    this.solidTex = new THREE.DataTexture(solid, nx, ny, THREE.RedFormat, THREE.UnsignedByteType);
    this.solidTex.magFilter = THREE.LinearFilter;
    this.solidTex.minFilter = THREE.LinearFilter;
    this.solidTex.needsUpdate = true;

    this.heightUniforms = {
      uHeight: { value: this.heightTex },
      uTexel: { value: new THREE.Vector2(1 / nx, 1 / ny) },
      uSize: { value: this.size },
      uHScale: { value: 0.2 },
      uCell: { value: this.cell },
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
    this.buildStones({ ...underwater, ...softbox });

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
      },
    });
    const wgeo = new THREE.PlaneGeometry(W, D, layout.nx * 2, layout.ny * 2);
    wgeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wgeo, this.waterMat);
    this.scene.add(this.water);
    this.hideInRefraction.push(this.water);

    this.buildPaddles();
    this.buildProbes();
    this.buildGallery();

    const key = new THREE.DirectionalLight(0xfff3e6, 2.2);
    key.position.copy(TO_LIGHT).multiplyScalar(6);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0x8aa4c8, 0x1a1410, 0.35));
  }

  // ------------------------------------------------------------------ building

  private buildCaustics(): void {
    const { nx, ny } = this.layout;
    const geo = new THREE.PlaneGeometry(2, 2, nx * 2, ny * 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: causticsVertex,
      fragmentShader: causticsFragment,
      uniforms: {
        ...this.heightUniforms,
        uSolid: { value: this.solidTex },
        uLightRay: { value: TO_LIGHT.clone().negate() },
        uDepth: { value: DEPTH },
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
    const floorMat = new THREE.ShaderMaterial({
      vertexShader: floorVertex,
      fragmentShader: floorFragment,
      uniforms: { ...underwater, uIsWall: { value: 0 } },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -DEPTH;
    this.scene.add(floor);

    const wallMat = new THREE.ShaderMaterial({
      vertexShader: floorVertex,
      fragmentShader: floorFragment,
      uniforms: { ...underwater, uIsWall: { value: 1 } },
    });
    const h = DEPTH + RIM;
    const walls: [number, number, number, number, number][] = [
      // x, z, rotationY, width
      [0, -D / 2, 0, W, 0],
      [0, D / 2, Math.PI, W, 0],
      [-W / 2, 0, Math.PI / 2, D, 0],
      [W / 2, 0, -Math.PI / 2, D, 0],
    ];
    for (const [x, z, ry, w] of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, -DEPTH + h / 2, z);
      m.rotation.y = ry;
      this.scene.add(m);
    }

    // Walnut frame around the top of the tank, a dark plinth below it.
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
    // Thin brass inlay on the inner edge of the frame.
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
    // The tank's own walls, wrapping the water between the plinth and the frame.
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
    // A brass plaque on the front of the plinth.
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.01), [
      brass,
      brass,
      brass,
      brass,
      new THREE.MeshStandardMaterial({ map: this.plaqueTexture(), metalness: 1, roughness: 0.32 }),
      brass,
    ]);
    plaque.position.set(0, base - 0.2, D / 2 + t + 0.005);
    this.scene.add(plaque);
  }

  private plaqueTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 136;
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
    g.fillText('THE RIPPLE COMPUTER', c.width / 2, 66);
    g.font = 'italic 26px Georgia, serif';
    g.fillText('water, stones, sixteen probes and one linear readout', c.width / 2, 108);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private buildStones(uniforms: Record<string, THREE.IUniform>): void {
    const rand = mulberry32(99);
    const geos: THREE.BufferGeometry[] = [];
    for (const p of this.layout.pillars) {
      // Basalt columns: irregular 5–7 sided prisms with a chamfered, tilted top.
      const r = p.r * this.cell * 1.06;
      const sides = 5 + Math.floor(rand() * 3);
      const top = 0.035 + rand() * 0.12;
      const bottom = -DEPTH - 0.01;
      const ch = 0.18 * r;
      const prof = [
        new THREE.Vector2(r * 1.03, bottom),
        new THREE.Vector2(r * 1.01, bottom + 0.4 * (top - bottom)),
        new THREE.Vector2(r, top - ch),
        new THREE.Vector2(r * 0.82, top),
        new THREE.Vector2(0.0001, top + 0.02 * r),
      ];
      const phase = rand() * Math.PI * 2;
      const g0 = new THREE.LatheGeometry(prof, sides, phase);
      const corner = Array.from({ length: sides + 1 }, () => 0.86 + rand() * 0.26);
      corner[sides] = corner[0];
      const tx = (rand() - 0.5) * 0.35;
      const tz = (rand() - 0.5) * 0.35;
      const pos0 = g0.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos0.count; i++) {
        const x = pos0.getX(i);
        let y = pos0.getY(i);
        const z = pos0.getZ(i);
        let ang = Math.atan2(x, z) - phase;
        ang = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const k = Math.round(ang / ((2 * Math.PI) / sides)) % sides;
        const f = corner[k];
        if (y > top - ch - 1e-4) y += x * tx + z * tz;
        pos0.setXYZ(i, x * f, y, z * f);
      }
      const g = g0.toNonIndexed();
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const tone = rand();
      g.setAttribute('aTone', new THREE.BufferAttribute(new Float32Array(pos.count).fill(tone), 1));
      g.translate((p.x / this.layout.nx - 0.5) * this.size.x, 0, (p.y / this.layout.ny - 0.5) * this.size.y);
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    const mat = new THREE.ShaderMaterial({ vertexShader: stoneVertex, fragmentShader: stoneFragment, uniforms });
    this.scene.add(new THREE.Mesh(merged, mat));
  }

  private glowTexture(): THREE.Texture {
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
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private sharedGlow?: THREE.Texture;
  private makeGlow(scale: number): THREE.Sprite {
    this.sharedGlow ??= this.glowTexture();
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
    this.hideInRefraction.push(s);
    return s;
  }

  private buildPaddles(): void {
    const { x: W, y: D } = this.size;
    const L = this.layout;
    for (const p of L.paddles) {
      const width = p.half * 2.4 * this.cell;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9c7b45,
        metalness: 0.9,
        roughness: 0.35,
        emissive: new THREE.Color(0xffa040),
        emissiveIntensity: 0,
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, width), mat);
      const z = (p.y / L.ny - 0.5) * D;
      m.position.set(-W / 2 + (L.paddleX / L.nx) * W, 0.0, z);
      this.scene.add(m);
      this.paddles.push(m);
      const glow = this.makeGlow(0.32);
      glow.position.set(m.position.x, 0.03, z);
      this.scene.add(glow);
      this.paddleGlows.push(glow);
    }
  }

  private buildProbes(): void {
    const { x: W, y: D } = this.size;
    const L = this.layout;
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 1, roughness: 0.25 });
    const rodGeo = new THREE.CylinderGeometry(0.0055, 0.0055, DEPTH + 0.1, 10);
    const headGeo = new THREE.SphereGeometry(0.021, 20, 12);
    const ringGeo = new THREE.TorusGeometry(0.03, 0.0035, 8, 40);
    for (const p of L.probes) {
      const x = (p.x / L.nx - 0.5) * W;
      const z = (p.y / L.ny - 0.5) * D;
      const rod = new THREE.Mesh(rodGeo, rodMat);
      rod.position.set(x, -DEPTH + (DEPTH + 0.1) / 2, z);
      this.scene.add(rod);
      const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0x66e0ff }));
      head.position.set(x, 0.1, z);
      this.scene.add(head);
      this.probeHeads.push(head);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.004, z);
      this.scene.add(ring);
      this.hideInRefraction.push(ring);
      this.probeRings.push(ring);
      const glow = this.makeGlow(0.16);
      glow.position.set(x, 0.1, z);
      this.scene.add(glow);
      this.probeGlows.push(glow);
    }
  }

  private buildGallery(): void {
    // A dark gallery floor with a pool of light around the plinth.
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

  /** Upload the solver's surface. */
  setHeights(u: Float32Array): void {
    const d = this.heightData;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < u.length; i++) d[i] = toHalf(u[i]);
    this.heightTex.needsUpdate = true;
  }

  /** Paddle displacement (−1..1-ish) and whether each paddle is in use. */
  setPaddles(disp: Float32Array, active: boolean[], tint: THREE.Color[]): void {
    const L = this.layout;
    const x0 = -this.size.x / 2 + (L.paddleX / L.nx) * this.size.x;
    this.paddles.forEach((m, k) => {
      const d = disp[k];
      m.position.x = x0 + 0.018 * d;
      const mat = m.material as THREE.MeshStandardMaterial;
      const on = Math.min(1, Math.abs(d) * 1.4);
      mat.emissive.copy(tint[k]);
      mat.emissiveIntensity = active[k] ? 0.25 + 1.8 * on : 0.0;
      const glow = this.paddleGlows[k];
      (glow.material as THREE.SpriteMaterial).color.copy(tint[k]);
      (glow.material as THREE.SpriteMaterial).opacity = active[k] ? 0.15 + 0.7 * on : 0;
    });
  }

  setProbes(vis: ProbeVisual[]): void {
    vis.forEach((v, k) => {
      const head = this.probeHeads[k].material as THREE.MeshBasicMaterial;
      head.color.copy(v.color).multiplyScalar(0.35 + 1.4 * v.level);
      const ring = this.probeRings[k].material as THREE.MeshBasicMaterial;
      ring.color.copy(v.color).multiplyScalar(0.12 + 0.6 * v.level);
      const glow = this.probeGlows[k].material as THREE.SpriteMaterial;
      glow.color.copy(v.color);
      glow.opacity = 0.18 + 0.75 * v.level;
      this.probeGlows[k].scale.setScalar(0.12 + 0.12 * v.level);
    });
  }

  /** World → CSS pixel position for HTML labels. */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const el = this.renderer.domElement;
    return {
      x: (v.x * 0.5 + 0.5) * el.clientWidth,
      y: (-v.y * 0.5 + 0.5) * el.clientHeight,
      visible: v.z < 1,
    };
  }

  paddleWorld(k: number): THREE.Vector3 {
    const L = this.layout;
    return new THREE.Vector3(
      -this.size.x / 2 + (L.paddleX / L.nx) * this.size.x,
      0.12,
      (L.paddles[k].y / L.ny - 0.5) * this.size.y,
    );
  }

  probeWorld(k: number): THREE.Vector3 {
    const L = this.layout;
    const p = L.probes[k];
    return new THREE.Vector3((p.x / L.nx - 0.5) * this.size.x, 0.1, (p.y / L.ny - 0.5) * this.size.y);
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
    const gx = (hit.x / this.size.x + 0.5) * this.layout.nx;
    const gy = (hit.z / this.size.y + 0.5) * this.layout.ny;
    if (gx < 2 || gy < 2 || gx > this.layout.nx - 2 || gy > this.layout.ny - 2) return null;
    return { gx, gy };
  }

  /**
   * @param rightInset pixels on the right covered by UI; the tank is centred in
   *   the remaining space by rendering an off-centre window of a wider view.
   */
  resize(width: number, height: number, rightInset = 0): void {
    this.renderer.setSize(width, height, false);
    const fullW = width + rightInset;
    this.camera.aspect = fullW / height;
    // Keep the whole tank in frame on narrow or tall screens.
    const aspect = (width - rightInset) / height;
    this.camera.fov = aspect < 1.3 ? Math.min(70, (34 * 1.3) / Math.max(0.5, aspect)) : 34;
    if (rightInset > 0) this.camera.setViewOffset(fullW, height, rightInset, 0, width, height);
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
    // ?debug=caustics or ?debug=refraction shows an intermediate pass.
    const debug = this.debugPass;
    if (debug) {
      if (!this.debugScene) {
        this.debugScene = new THREE.Scene();
        const tex = debug === 'caustics' ? this.causticsRT.texture : this.refractionRT.texture;
        this.debugScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex })));
      }
      r.render(this.debugScene, this.causticsCam);
      return;
    }
    r.render(this.scene, this.camera);
  }
  private debugScene?: THREE.Scene;
  private readonly debugPass = new URLSearchParams(location.search).get('debug');
}
