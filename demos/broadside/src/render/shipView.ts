import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { type AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { type ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { type ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { AIM_ARC } from "../sim/cannons";
import { forward, lerp, starboard, wrapAngle } from "../sim/math";
import { SINK_DURATION, type Ship, type Side } from "../sim/ships";
import { sampleWaves } from "../sim/waves";
import type { Effects } from "./effects";
import { PALETTE } from "./palette";
import type { Livery, ShipModels } from "./shipModels";

const lerpAngle = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;

/** Visual representation of one ship: bobbing, heeling, sails, damage FX, sinking. */
export class ShipView {
  readonly root: TransformNode;
  private readonly sails: AbstractMesh[];
  private readonly sailBase = new Map<AbstractMesh, Vector3>();
  private sailAmount = 1;
  private sailColor = "";
  private readonly emitters: {
    wake: ParticleSystem;
    fire: ParticleSystem;
    smoke: ParticleSystem;
  };
  private readonly aimStrips: Record<Side, Mesh>;
  showRange = true;
  private readonly rangeArcs: Record<Side, Mesh> | null;
  private prev = { x: 0, z: 0, heading: 0 };
  private curr = { x: 0, z: 0, heading: 0 };

  constructor(
    scene: Scene,
    models: ShipModels,
    effects: Effects,
    shadows: ShadowGenerator,
    readonly shipId: number,
    ship: Ship,
    livery: Livery,
  ) {
    const name = `ship-${shipId}`;
    this.root = new TransformNode(name, scene);
    const model = models.create(ship.spec.class, livery, name);
    model.parent = this.root;
    for (const m of model.getChildMeshes(false)) {
      shadows.addShadowCaster(m, false);
      m.receiveShadows = true;
    }
    this.sails = model
      .getChildMeshes(false)
      .filter((m) => m.name.toLowerCase().includes("sail"));
    for (const s of this.sails) this.sailBase.set(s, s.scaling.clone());

    const flagMat = new StandardMaterial(`${name}-Jolly-Roger`, scene);
    const texture = new DynamicTexture(
      `${name}-pirate-flag`,
      { width: 256, height: 160 },
      scene,
      false,
    );
    const c = texture.getContext() as CanvasRenderingContext2D;
    c.fillStyle = livery === "boss" ? "#70272b" : "#171c26";
    c.fillRect(0, 0, 256, 160);
    c.strokeStyle = "#ede1bd";
    c.lineWidth = 9;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(91, 115);
    c.lineTo(165, 143);
    c.moveTo(91, 143);
    c.lineTo(165, 115);
    c.stroke();
    c.fillStyle = "#ede1bd";
    c.beginPath();
    c.ellipse(128, 63, 34, 36, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(111, 85, 34, 23);
    c.fillStyle = "#171c26";
    for (const x of [114, 142]) {
      c.beginPath();
      c.ellipse(x, 62, 9, 13, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.beginPath();
    c.moveTo(128, 77);
    c.lineTo(122, 88);
    c.lineTo(134, 88);
    c.fill();
    texture.update();
    flagMat.diffuseTexture = texture;
    flagMat.emissiveColor = Color3.FromHexString("#615a48");
    flagMat.backFaceCulling = false;
    const pole = MeshBuilder.CreateCylinder(
      `${name}-flagpole`,
      { height: 7, diameter: 0.14, tessellation: 8 },
      scene,
    );
    pole.parent = this.root;
    pole.position.set(0, 5, -ship.spec.length * 0.32);
    pole.material = flagMat;
    const flag = MeshBuilder.CreatePlane(
      `${name}-pirate-flag`,
      {
        width: ship.spec.beam * 0.8,
        height: ship.spec.beam * 0.5,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
    );
    flag.parent = this.root;
    flag.position.set(ship.spec.beam * 0.4, 8, -ship.spec.length * 0.32);
    flag.rotation.y = -0.45;
    flag.material = flagMat;
    shadows.addShadowCaster(flag);

    const stern = new Mesh(`${name}-stern`, scene);
    stern.isVisible = false;
    stern.parent = this.root;
    stern.position.set(0, 0.3, -ship.spec.length * 0.5);
    this.emitters = effects.createShipEmitters(name, stern);

    this.aimStrips = {
      port: this.makeAimStrip(scene, ship, "port"),
      starboard: this.makeAimStrip(scene, ship, "starboard"),
    };
    this.rangeArcs =
      ship.team === "player"
        ? {
            port: this.makeRangeArc(scene, ship, "port"),
            starboard: this.makeRangeArc(scene, ship, "starboard"),
          }
        : null;
    this.capture(ship);
    this.capture(ship);
  }

  /** Red glowing gunports: the enemy is about to fire this side. */
  private makeAimStrip(scene: Scene, ship: Ship, side: Side): Mesh {
    const mat = new StandardMaterial(`aim-${this.shipId}-${side}`, scene);
    mat.emissiveColor = PALETTE.danger;
    mat.diffuseColor = Color3.Black();
    mat.disableLighting = true;
    mat.alpha = 0;
    const strip = MeshBuilder.CreateBox(
      `aim-${this.shipId}-${side}`,
      { width: 0.25, height: 0.55, depth: ship.spec.length * 0.6 },
      scene,
    );
    strip.material = mat;
    strip.parent = this.root;
    strip.position.set(
      (side === "starboard" ? 1 : -1) * (ship.spec.beam * 0.5 + 0.1),
      1.6,
      0,
    );
    strip.isPickable = false;
    return strip;
  }

  /** Arc on the water showing where the player's broadside will reach. */
  private makeRangeArc(scene: Scene, ship: Ship, side: Side): Mesh {
    const r = ship.spec.cannonRange;
    const sign = side === "starboard" ? 1 : -1;
    const inner: Vector3[] = [];
    const outer: Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = -AIM_ARC * 0.6 + (i / 24) * AIM_ARC * 1.2;
      const dx = Math.cos(a) * sign;
      const dz = Math.sin(a);
      inner.push(new Vector3(dx * (r - 1.2), 0.6, dz * (r - 1.2)));
      outer.push(new Vector3(dx * (r + 1.2), 0.6, dz * (r + 1.2)));
    }
    const arc = MeshBuilder.CreateRibbon(
      `range-${side}`,
      { pathArray: [inner, outer], sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    const mat = new StandardMaterial(`range-${side}`, scene);
    mat.emissiveColor = PALETTE.brass;
    mat.disableLighting = true;
    mat.alpha = 0.35;
    arc.material = mat;
    arc.isPickable = false;
    return arc;
  }

  setSailColor(hex: string): void {
    if (this.sailColor === hex) return;
    this.sailColor = hex;
    for (const sail of this.sails) {
      const m = sail.material as unknown as {
        albedoColor?: Color3;
        diffuseColor?: Color3;
      } | null;
      if (m?.albedoColor) m.albedoColor = Color3.FromHexString(hex);
      if (m?.diffuseColor) m.diffuseColor = Color3.FromHexString(hex);
    }
  }

  /** Call before each sim step so rendering can interpolate between steps. */
  capture(ship: Ship): void {
    this.prev = this.curr;
    this.curr = { x: ship.pos.x, z: ship.pos.z, heading: ship.heading };
  }

  update(
    ship: Ship,
    alpha: number,
    time: number,
    dt: number,
    aiming: Side | null,
    windEfficiency: number,
    waveAmplitude = 1,
  ): void {
    const x = lerp(this.prev.x, this.curr.x, alpha);
    const z = lerp(this.prev.z, this.curr.z, alpha);
    const heading = lerpAngle(this.prev.heading, this.curr.heading, alpha);
    const L = ship.spec.length;

    // Average the waves over the hull so big ships ride more steadily.
    const f = forward(heading);
    const r = starboard(heading);
    const bow = sampleWaves(
      x + f.x * L * 0.35,
      z + f.z * L * 0.35,
      time,
      undefined,
      waveAmplitude,
    ).height;
    const sternH = sampleWaves(
      x - f.x * L * 0.35,
      z - f.z * L * 0.35,
      time,
      undefined,
      waveAmplitude,
    ).height;
    const centre = sampleWaves(x, z, time, undefined, waveAmplitude);
    const slopeR = centre.slopeX * r.x + centre.slopeZ * r.z;
    let y = (bow + sternH + centre.height * 2) / 4;
    let pitch = -Math.atan2(bow - sternH, L * 0.7) * 0.8;
    let roll =
      Math.atan(slopeR) * 0.6 + ship.angularVelocity * ship.speed * 0.035;

    if (!ship.alive) {
      const t = Math.min(1, ship.sinkTime / SINK_DURATION);
      y -= t * t * ship.spec.length * 1.2;
      pitch += t * 0.35;
      roll += t * 0.6;
    }

    this.root.position.set(x, y, z);
    this.root.rotation.set(pitch, heading, roll);

    // Sails: furl up to the yard, billow with the wind.
    const target = ship.alive
      ? [ship.team === "player" ? 0.12 : 0.48, 0.6, 1][ship.sail]!
      : 0.3;
    this.sailAmount += (target - this.sailAmount) * Math.min(1, dt * 3);
    for (const s of this.sails) {
      const base = this.sailBase.get(s)!;
      const flutter = 1 + Math.sin(time * 7 + s.uniqueId) * 0.02;
      s.scaling.set(
        base.x,
        base.y * this.sailAmount,
        base.z * (0.6 + 0.5 * windEfficiency) * flutter,
      );
    }

    // Wake grows with speed; fire and smoke grow with damage.
    const damage = 1 - ship.hull / ship.spec.maxHull;
    this.emitters.wake.emitRate = ship.alive ? ship.speed * 6 : 0;
    this.emitters.fire.emitRate =
      ship.alive && damage > 0.45
        ? (damage - 0.45) * 160
        : !ship.alive
          ? 40
          : 0;
    this.emitters.smoke.emitRate = damage > 0.3 ? damage * 40 : 0;

    for (const side of ["port", "starboard"] as const) {
      const mat = this.aimStrips[side].material as StandardMaterial;
      mat.alpha = aiming === side ? 0.55 + 0.45 * Math.sin(time * 18) : 0;
    }
    if (this.rangeArcs) {
      for (const side of ["port", "starboard"] as const) {
        const arc = this.rangeArcs[side];
        arc.position.set(x, 0, z);
        arc.rotation.y = heading;
        arc.isVisible = this.showRange && ship.alive && innerWidth > 600;
        const ready = ship.reload[side] <= 0;
        const mat = arc.material as StandardMaterial;
        mat.emissiveColor = ready ? PALETTE.brass : PALETTE.danger.scale(0.6);
        mat.alpha = ready ? 0.12 + 0.025 * Math.sin(time * 4) : 0.04;
      }
    }
  }

  dispose(): void {
    this.emitters.wake.stop();
    this.emitters.fire.stop();
    this.emitters.smoke.stop();
    const { wake, fire, smoke } = this.emitters;
    // Let live particles finish before disposing.
    wake.dispose(false);
    fire.dispose(false);
    smoke.dispose(false);
    if (this.rangeArcs) {
      this.rangeArcs.port.dispose();
      this.rangeArcs.starboard.dispose();
    }
    this.root.dispose(false, true);
  }
}
