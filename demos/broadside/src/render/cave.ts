import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { RewardChest, revealPose } from "./chest";
import { buildRelic } from "./relics";
import { RELICS } from "../game/voyage";
import { Rng } from "../sim/rng";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

export class TreasureCave {
  readonly scene: Scene;
  readonly camera: FreeCamera;
  selected = 0;
  private x = 0;
  private time = 0;
  private relics: TransformNode[] = [];
  private lamps: PointLight[] = [];
  private motes: {
    node: TransformNode;
    x: number;
    y: number;
    z: number;
    phase: number;
  }[] = [];
  private owned: string = "";
  private chest: RewardChest;
  revealTime = 0;
  private revealing = false;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(engine: Engine) {
    const s = (this.scene = new Scene(engine));
    s.clearColor = new Color4(0.018, 0.038, 0.065, 1);
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogDensity = 0.014;
    s.fogColor = Color3.FromHexString("#081b2b");
    this.camera = new FreeCamera("cave camera", new Vector3(0, 6, -13), s);
    this.camera.inputs.clear();
    this.camera.fov = 0.72;
    this.camera.minZ = 0.1;
    const hemi = new HemisphericLight("cave skylight", new Vector3(0, 1, 0), s);
    hemi.diffuse = Color3.FromHexString("#98ccec");
    hemi.groundColor = Color3.FromHexString("#192332");
    hemi.intensity = 0.6;
    const mat = (name: string, hex: string, glow = 0) => {
      const m = new StandardMaterial(name, s);
      m.diffuseColor = Color3.FromHexString(hex);
      m.emissiveColor = m.diffuseColor.scale(glow);
      m.specularColor.set(0.02, 0.03, 0.04);
      return m;
    };
    const stone = mat("ancient blue slate", "#233d50"),
      edge = mat("pedestal stone", "#426070"),
      gold = mat("gold inlay", "#bd9459", 0.2),
      cyan = mat("luminous crystal", "#42d9d1", 0.8),
      purple = mat("amethyst", "#9270db", 0.7);
    const floor = MeshBuilder.CreateGround(
      "cavern floor",
      { width: 140, height: 35 },
      s,
    );
    floor.position.set(49, -0.3, 0);
    floor.material = stone;
    const rng = new Rng(9124);
    for (let i = 0; i < 12; i++) {
      const x = i * 9;
      const plinth = MeshBuilder.CreateCylinder(
        "treasure pedestal",
        { height: 1.1, diameterTop: 3.5, diameterBottom: 4, tessellation: 12 },
        s,
      );
      plinth.position.set(x, 0.4, 0);
      plinth.material = edge;
      for (const y of [0.02, 0.93]) {
        const rim = MeshBuilder.CreateTorus(
          "gold pedestal inlay",
          { diameter: 3.5, thickness: 0.07, tessellation: 48 },
          s,
        );
        rim.position.set(x, y, 0);
        rim.material = gold;
      }
      const glow = MeshBuilder.CreateTorus(
        "pool of starlight",
        { diameter: 4.4, thickness: 0.04, tessellation: 48 },
        s,
      );
      glow.position.set(x, -0.15, 0);
      glow.material = i % 2 ? purple : cyan;
      const light = new PointLight("treasure light", new Vector3(x, 5, -3), s);
      light.diffuse = Color3.FromHexString(RELICS[i]!.color);
      light.intensity = 1.8;
      light.range = 11;
      this.lamps.push(light);
      for (let j = 0; j < 7; j++) {
        const rock = MeshBuilder.CreateSphere(
          "cavern column",
          { diameter: 1, segments: 5 },
          s,
        );
        rock.position.set(
          x - 4 + j * 1.4,
          rng.range(0, 3),
          5 + rng.range(-0.8, 0.8),
        );
        rock.scaling.set(
          rng.range(1.2, 2.3),
          rng.range(4, 8),
          rng.range(1.5, 3),
        );
        rock.rotation.set(
          rng.range(-0.15, 0.15),
          rng.range(0, 6),
          rng.range(-0.2, 0.2),
        );
        rock.material = stone;
      }
      for (let j = 0; j < 4; j++) {
        const c = MeshBuilder.CreateCylinder(
          "cave crystal",
          {
            height: rng.range(1, 2.7),
            diameterTop: 0,
            diameterBottom: 0.5,
            tessellation: 5,
          },
          s,
        );
        c.position.set(x - 3 + rng.range(0, 1), 0.4, 1.5 + rng.range(0, 2));
        c.rotation.z = rng.range(-0.4, 0.4);
        c.material = j % 2 ? cyan : purple;
        const m = MeshBuilder.CreateSphere(
          "floating firefly",
          { diameter: 0.065, segments: 6 },
          s,
        );
        m.position.set(x + rng.range(-3, 3), rng.range(1, 6), rng.range(-2, 3));
        m.material = cyan;
        this.motes.push({
          node: m,
          x: m.position.x,
          y: m.position.y,
          z: m.position.z,
          phase: rng.range(0, 6),
        });
      }
      const arch = MeshBuilder.CreateTorus(
        "cavern arch",
        { diameter: 9, thickness: 0.75, tessellation: 24 },
        s,
      );
      arch.position.set(x, 3, 4);
      arch.rotation.x = Math.PI / 2;
      arch.scaling.y = 1.3;
      arch.material = stone;
    }
    const pipeline = new DefaultRenderingPipeline("cave bloom", true, s, [
      this.camera,
    ]);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.65;
    pipeline.bloomWeight = 0.22;
    pipeline.bloomKernel = 64;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled=true;
    pipeline.imageProcessing.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure=1.0;
    this.chest = new RewardChest(s);
  }
  refresh(owned: number[]): void {
    const key = owned.join(",");
    if (key === this.owned && this.relics.length) return;
    this.owned = key;
    for (const r of this.relics) r.dispose(false, true);
    this.relics = [];
    for (let i = 0; i < 12; i++) {
      const r = buildRelic(this.scene, i, !owned.includes(i));
      r.position.set(i * 9, 2.3, 0);
      this.relics.push(r);
    }
  }
  select(index: number, snap = false): void {
    this.selected = Math.max(0, Math.min(11, index));
    if (snap) this.x = this.selected * 9;
  }
  beginReveal(index: number): void {
    this.select(index, true);
    this.revealTime = 0;
    this.revealing = true;
  }
  endReveal(): void { this.revealing = false; this.chest.hide(); }
  get revealPose() { return revealPose(this.revealTime, this.reducedMotion); }
  render(dt: number, reveal = false): void {
    this.time += dt;
    const unboxing = reveal && this.revealing;
    if (unboxing) this.revealTime += dt;
    if (unboxing) this.chest.animate(this.revealTime, this.x, this.reducedMotion);
    else this.chest.hide();
    this.x += (this.selected * 9 - this.x) * Math.min(1, dt * 6);
    const portrait = innerWidth < 600,
      distance = reveal ? (innerHeight < 650 && portrait ? 19 : portrait ? 16.5 : innerHeight < 480 ? 16 : 17) : portrait ? 14.5 : 12;
    this.camera.position.set(this.x + 0.4, 5.7, -distance);
    this.camera.setTarget(
      new Vector3(
        this.x,
        reveal ? 3.4 : portrait && innerHeight < 650 ? 1.1 : 2.5,
        0,
      ),
    );
    this.relics.forEach((r, i) => {
      const short = portrait && innerHeight < 650,
        scale = short ? 0.85 : 1;
      r.scaling.setAll(scale * (unboxing ? 0.18 + this.revealPose.rise * 0.67 : 1));
      const offset = {
        gold: 0.1,
        coins: 0.2,
        ring: 0.6,
        pearl: 0.55,
        gem: 0.2,
        compass: 0.2,
        shell: 0.3,
        crown: 0.35,
        lantern: 0.5,
        hourglass: 0,
        egg: 0.3,
        turtle: 0.1,
        ship: 0.05,
        orb: 0.2,
      }[RELICS[i]!.kind];
      const height = unboxing ? 1.7 + this.revealPose.rise * (short ? 1.8 : 2.4) - offset * 0.6 : reveal ? 2.35 : (short ? 2.95 : 3.8) - offset * scale;
      r.rotation.y = this.time * 0.22 + (i === 1 ? 0.5 : 0);
      r.position.y = height + Math.sin(this.time * 1.4 + i) * 0.12;
      r.setEnabled(
        reveal ? i === this.selected && (!unboxing || this.revealPose.rise > 0.08) : Math.abs(i * 9 - this.x) < 24,
      );
    });
    this.lamps.forEach((l, i) => {
      l.setEnabled(Math.abs(i * 9 - this.x) < 13);
      l.intensity = 1.5 + Math.sin(this.time * 1.3 + i) * 0.15;
    });
    for (const m of this.motes)
      m.node.position.set(
        m.x + Math.sin(this.time * 0.3 + m.phase) * 0.3,
        m.y + Math.sin(this.time * 0.65 + m.phase) * 0.3,
        m.z,
      );
    this.scene.render();
  }
}
