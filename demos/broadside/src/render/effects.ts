import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { type Texture } from "@babylonjs/core/Materials/Textures/texture.js";

const makeTexture = (
  scene: Scene,
  name: string,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
): Texture => {
  const size = 64;
  const tex = new DynamicTexture(name, size, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
};

const softPuff = (ctx: CanvasRenderingContext2D, size: number) => {
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
};

/** Chunky cartoon cloud puff made of overlapping circles. */
const cartoonPuff = (ctx: CanvasRenderingContext2D, size: number) => {
  ctx.fillStyle = "rgba(255,255,255,1)";
  const blobs = [
    [0.5, 0.55, 0.3],
    [0.33, 0.5, 0.2],
    [0.67, 0.48, 0.22],
    [0.5, 0.36, 0.2],
    [0.42, 0.66, 0.18],
  ];
  for (const [x, y, r] of blobs) {
    ctx.beginPath();
    ctx.arc(x! * size, y! * size, r! * size, 0, Math.PI * 2);
    ctx.fill();
  }
};

const spark = (ctx: CanvasRenderingContext2D, size: number) => {
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
};

const chip = (ctx: CanvasRenderingContext2D, size: number) => {
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fillRect(size * 0.3, size * 0.15, size * 0.4, size * 0.7);
};

interface Burst {
  system: ParticleSystem;
  emitter: Mesh;
}

/** A round-robin pool of particle systems for one effect, so bursts never steal each other's emitter. */
class BurstPool {
  private next = 0;
  private readonly bursts: Burst[] = [];

  constructor(
    scene: Scene,
    name: string,
    size: number,
    configure: (ps: ParticleSystem) => void,
  ) {
    for (let i = 0; i < size; i++) {
      const emitter = new Mesh(`${name}-emitter-${i}`, scene);
      emitter.isVisible = false;
      const system = new ParticleSystem(`${name}-${i}`, 400, scene);
      system.emitter = emitter;
      system.manualEmitCount = 0;
      configure(system);
      system.start();
      this.bursts.push({ system, emitter });
    }
  }

  emit(position: Vector3, count: number, heading = 0): Burst {
    const burst = this.bursts[this.next]!;
    this.next = (this.next + 1) % this.bursts.length;
    burst.emitter.position.copyFrom(position);
    burst.emitter.rotation.y = heading;
    burst.emitter.computeWorldMatrix(true);
    burst.system.manualEmitCount = count;
    return burst;
  }
}

export class Effects {
  private readonly smoke: BurstPool;
  private readonly flash: BurstPool;
  private readonly splash: BurstPool;
  private readonly splinters: BurstPool;
  private readonly gold: BurstPool;
  private readonly bigSplash: BurstPool;
  private readonly flashLight: PointLight;
  private flashLevel = 0;
  readonly puffTexture: Texture;
  readonly sparkTexture: Texture;
  private readonly wakeTexture: Texture;

  constructor(private readonly scene: Scene) {
    this.puffTexture = makeTexture(scene, "fx-puff", cartoonPuff);
    const soft = (this.wakeTexture = makeTexture(scene, "fx-soft", softPuff));
    this.sparkTexture = makeTexture(scene, "fx-spark", spark);
    const chipTex = makeTexture(scene, "fx-chip", chip);

    this.smoke = new BurstPool(scene, "fx-smoke", 10, (ps) => {
      ps.particleTexture = this.puffTexture;
      ps.createBoxEmitter(
        new Vector3(0.6, 0.15, -0.15),
        new Vector3(1.2, 0.5, 0.15),
        new Vector3(0, 0, -5),
        new Vector3(0, 0, 5),
      );
      ps.minLifeTime = 1.6;
      ps.maxLifeTime = 3.2;
      ps.minEmitPower = 2;
      ps.maxEmitPower = 6;
      ps.addSizeGradient(0, 1.2, 1.8);
      ps.addSizeGradient(1, 4.5, 6);
      ps.addColorGradient(0, new Color4(1, 0.97, 0.92, 0.95));
      ps.addColorGradient(0.6, new Color4(0.85, 0.82, 0.8, 0.6));
      ps.addColorGradient(1, new Color4(0.7, 0.68, 0.68, 0));
      ps.addDragGradient(0, 0.9);
      ps.addDragGradient(1, 0.95);
      ps.gravity = new Vector3(0, 0.6, 0);
      ps.minAngularSpeed = -0.5;
      ps.maxAngularSpeed = 0.5;
      ps.minInitialRotation = 0;
      ps.maxInitialRotation = Math.PI * 2;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.emitRate = 0;
    });

    this.flash = new BurstPool(scene, "fx-flash", 10, (ps) => {
      ps.particleTexture = this.sparkTexture;
      ps.createBoxEmitter(
        new Vector3(1, 0.1, -0.1),
        new Vector3(1.6, 0.4, 0.1),
        new Vector3(0, 0, -5),
        new Vector3(0, 0, 5),
      );
      ps.minLifeTime = 0.08;
      ps.maxLifeTime = 0.22;
      ps.minEmitPower = 6;
      ps.maxEmitPower = 14;
      ps.minSize = 1.2;
      ps.maxSize = 2.6;
      ps.color1 = new Color4(1, 0.85, 0.4, 1);
      ps.color2 = new Color4(1, 0.55, 0.15, 1);
      ps.colorDead = new Color4(1, 0.3, 0, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.emitRate = 0;
    });

    this.splash = new BurstPool(scene, "fx-splash", 16, (ps) => {
      ps.particleTexture = soft;
      ps.createConeEmitter(0.6, 0.25);
      ps.minLifeTime = 0.6;
      ps.maxLifeTime = 1.2;
      ps.minEmitPower = 7;
      ps.maxEmitPower = 13;
      ps.minSize = 0.5;
      ps.maxSize = 1.3;
      ps.gravity = new Vector3(0, -18, 0);
      ps.color1 = new Color4(1, 1, 1, 1);
      ps.color2 = new Color4(0.75, 0.95, 1, 0.9);
      ps.colorDead = new Color4(0.8, 0.95, 1, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.emitRate = 0;
    });

    this.bigSplash = new BurstPool(scene, "fx-bigsplash", 3, (ps) => {
      ps.particleTexture = soft;
      ps.createCylinderEmitter(5, 1, 0.5, 0.3);
      ps.minLifeTime = 1;
      ps.maxLifeTime = 2.2;
      ps.minEmitPower = 8;
      ps.maxEmitPower = 16;
      ps.minSize = 1;
      ps.maxSize = 3;
      ps.gravity = new Vector3(0, -14, 0);
      ps.color1 = new Color4(1, 1, 1, 1);
      ps.color2 = new Color4(0.7, 0.92, 1, 0.9);
      ps.colorDead = new Color4(0.8, 0.95, 1, 0);
      ps.emitRate = 0;
    });

    this.splinters = new BurstPool(scene, "fx-splinters", 10, (ps) => {
      ps.particleTexture = chipTex;
      ps.createSphereEmitter(0.6, 1);
      ps.minLifeTime = 0.8;
      ps.maxLifeTime = 1.6;
      ps.minEmitPower = 5;
      ps.maxEmitPower = 11;
      ps.minSize = 0.25;
      ps.maxSize = 0.6;
      ps.gravity = new Vector3(0, -16, 0);
      ps.color1 = new Color4(0.55, 0.35, 0.2, 1);
      ps.color2 = new Color4(0.75, 0.52, 0.3, 1);
      ps.colorDead = new Color4(0.4, 0.25, 0.15, 0);
      ps.minAngularSpeed = -8;
      ps.maxAngularSpeed = 8;
      ps.emitRate = 0;
    });

    this.gold = new BurstPool(scene, "fx-gold", 4, (ps) => {
      ps.particleTexture = this.sparkTexture;
      ps.createSphereEmitter(2, 1);
      ps.minLifeTime = 1.2;
      ps.maxLifeTime = 2.4;
      ps.minEmitPower = 4;
      ps.maxEmitPower = 9;
      ps.minSize = 0.4;
      ps.maxSize = 1;
      ps.gravity = new Vector3(0, -5, 0);
      ps.color1 = new Color4(1, 0.88, 0.35, 1);
      ps.color2 = new Color4(1, 0.7, 0.15, 1);
      ps.colorDead = new Color4(1, 0.6, 0, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.emitRate = 0;
    });

    this.flashLight = new PointLight("fx-flash-light", Vector3.Zero(), scene);
    this.flashLight.diffuse = Color3.FromHexString("#ffb14a");
    this.flashLight.range = 45;
    this.flashLight.intensity = 0;
  }

  /** Broadside: flash + smoke along the hull side. `outHeading` points out of the firing side. */
  broadside(
    muzzles: readonly { x: number; y: number; z: number }[],
    outHeading: number,
  ): void {
    if (muzzles.length === 0) return;
    const cx = muzzles.reduce((s, m) => s + m.x, 0) / muzzles.length;
    const cz = muzzles.reduce((s, m) => s + m.z, 0) / muzzles.length;
    const centre = new Vector3(cx, muzzles[0]!.y, cz);
    // Box emitters point along local +X; rotate so +X faces out of the firing side.
    const yaw = outHeading - Math.PI / 2;
    this.flash.emit(centre, 18 * muzzles.length, yaw);
    this.smoke.emit(centre, 9 * muzzles.length, yaw);
    this.flashLight.position.copyFrom(centre).addInPlace(new Vector3(0, 2, 0));
    this.flashLevel = 2.5;
  }

  splashAt(x: number, z: number): void {
    this.splash.emit(new Vector3(x, 0.2, z), 40);
  }

  hitAt(x: number, y: number, z: number): void {
    const p = new Vector3(x, y, z);
    this.splinters.emit(p, 26);
    this.smoke.emit(p, 6);
  }

  sinkAt(x: number, z: number): void {
    this.bigSplash.emit(new Vector3(x, 0, z), 160);
  }

  goldAt(x: number, z: number): void {
    this.gold.emit(new Vector3(x, 3, z), 90);
  }

  update(dt: number): void {
    this.flashLevel = Math.max(0, this.flashLevel - dt * 14);
    this.flashLight.intensity = this.flashLevel;
  }

  /** Continuous emitters that follow a ship: wake foam and fire when damaged. */
  createShipEmitters(
    name: string,
    anchor: Mesh,
  ): { wake: ParticleSystem; fire: ParticleSystem; smoke: ParticleSystem } {
    const wake = new ParticleSystem(`${name}-wake`, 600, this.scene);
    wake.particleTexture = this.wakeTexture;
    wake.emitter = anchor;
    wake.isLocal = false;
    wake.createBoxEmitter(
      new Vector3(-0.4, 0, -0.6),
      new Vector3(0.4, 0.1, -0.2),
      new Vector3(-1.5, 0, -0.5),
      new Vector3(1.5, 0.2, 0.5),
    );
    wake.minLifeTime = 1.8;
    wake.maxLifeTime = 3.2;
    wake.minEmitPower = 0.3;
    wake.maxEmitPower = 1;
    wake.addSizeGradient(0, 0.7, 1.1);
    wake.addSizeGradient(1, 1.8, 2.5);
    wake.addColorGradient(0, new Color4(0.7, 0.82, 0.84, 0.42));
    wake.addColorGradient(1, new Color4(1, 1, 1, 0));
    wake.minInitialRotation = 0;
    wake.maxInitialRotation = Math.PI * 2;
    wake.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    wake.emitRate = 0;
    wake.start();

    const fire = new ParticleSystem(`${name}-fire`, 300, this.scene);
    fire.particleTexture = this.sparkTexture;
    fire.emitter = anchor;
    fire.createBoxEmitter(
      new Vector3(-0.3, 1, -0.3),
      new Vector3(0.3, 2.5, 0.3),
      new Vector3(-1.5, 0, -3),
      new Vector3(1.5, 0.5, 3),
    );
    fire.minLifeTime = 0.3;
    fire.maxLifeTime = 0.8;
    fire.minEmitPower = 1;
    fire.maxEmitPower = 2;
    fire.minSize = 0.8;
    fire.maxSize = 2;
    fire.color1 = new Color4(1, 0.75, 0.25, 1);
    fire.color2 = new Color4(1, 0.4, 0.1, 1);
    fire.colorDead = new Color4(0.4, 0.05, 0, 0);
    fire.gravity = new Vector3(0, 6, 0);
    fire.blendMode = ParticleSystem.BLENDMODE_ADD;
    fire.emitRate = 0;
    fire.start();

    const smoke = new ParticleSystem(`${name}-smoke`, 300, this.scene);
    smoke.particleTexture = this.puffTexture;
    smoke.emitter = anchor;
    smoke.createBoxEmitter(
      new Vector3(-0.3, 1, -0.3),
      new Vector3(0.3, 2, 0.3),
      new Vector3(-1.5, 2, -3),
      new Vector3(1.5, 3, 3),
    );
    smoke.minLifeTime = 2;
    smoke.maxLifeTime = 4;
    smoke.minEmitPower = 1;
    smoke.maxEmitPower = 2;
    smoke.addSizeGradient(0, 1.2, 2);
    smoke.addSizeGradient(1, 5, 7);
    smoke.addColorGradient(0, new Color4(0.25, 0.22, 0.2, 0.8));
    smoke.addColorGradient(1, new Color4(0.35, 0.33, 0.32, 0));
    smoke.gravity = new Vector3(0, 1.5, 0);
    smoke.emitRate = 0;
    smoke.start();
    return { wake, fire, smoke };
  }
}
