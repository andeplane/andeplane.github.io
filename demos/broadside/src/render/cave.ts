import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { RewardChest, revealPose } from "./chest";
import { buildRelic } from "./relics";
import { RELICS } from "../game/voyage";
import { Rng } from "../sim/rng";

/** One continuous cavern. Every level has a permanent place in the same room. */
export class TreasureCave {
  readonly scene: Scene;
  readonly camera: FreeCamera;
  selected = 0;
  private time = 0;
  private relics: (TransformNode | null)[] = [];
  private closed: TransformNode[] = [];
  private lamps: PointLight[] = [];
  private flames: TransformNode[] = [];
  private motes: TransformNode[] = [];
  private spots = Array.from(
    { length: 12 },
    (_, i) =>
      new Vector3(
        Math.cos((i * Math.PI) / 6 + 0.15) * 10,
        0,
        Math.sin((i * Math.PI) / 6 + 0.15) * 8.5 + 5,
      ),
  );
  private owned = "initial";
  private chest: RewardChest;
  private revealDais: TransformNode;
  private focus: Vector3 | null = null;
  private target = new Vector3(0, 1, 4);
  private orbit = -Math.PI / 2;
  private elevation = 0.6;
  private distance = 24;
  revealTime = 0;
  private revealing = false;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  constructor(engine: Engine) {
    const s = (this.scene = new Scene(engine));
    s.clearColor = new Color4(0.012, 0.02, 0.035, 1);
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogDensity = 0.009;
    s.fogColor = Color3.FromHexString("#07111c");
    this.camera = new FreeCamera("cave camera", new Vector3(0, 14, -22), s);
    this.camera.inputs.clear();
    this.camera.fov = 0.8;
    this.camera.minZ = 0.1;
    const hemi = new HemisphericLight(
      "moon through the cave mouth",
      new Vector3(-0.5, 1, -0.2),
      s,
    );
    hemi.diffuse = Color3.FromHexString("#91b8cd");
    hemi.groundColor = Color3.FromHexString("#16121a");
    hemi.intensity = 0.75;
    const mat = (name: string, hex: string, glow = 0) => {
      const m = new StandardMaterial(name, s);
      m.diffuseColor = Color3.FromHexString(hex);
      m.emissiveColor = m.diffuseColor.scale(glow);
      m.specularColor.set(0.08, 0.1, 0.12);
      return m;
    };
    const stone = mat("weathered basalt", "#323c49"),
      floorMat = mat("wet cavern slate", "#20333e"),
      plinthMat = mat("old carved sandstone", "#6e6253"),
      gold = mat("aged brass", "#bc9050", 0.08),
      wood = mat("sealed teak chests", "#794927"),
      iron = mat("chest iron", "#323743"),
      fire = mat("amber fire", "#ffba53", 1.3),
      crystal = mat("sea crystal", "#6eb8ae", 0.5);
    const texture = new DynamicTexture(
      "hand worn cavern floor",
      { width: 1024, height: 1024 },
      s,
      false,
    );
    const c = texture.getContext() as CanvasRenderingContext2D;
    c.fillStyle = "#40525b";
    c.fillRect(0, 0, 1024, 1024);
    const textureRng = new Rng(7182);
    for (let i = 0; i < 14000; i++) {
      const n = Math.floor(textureRng.range(60, 110));
      c.fillStyle = `rgba(${n},${n + 9},${n + 15},.18)`;
      c.fillRect(
        textureRng.range(0, 1024),
        textureRng.range(0, 1024),
        textureRng.range(1, 4),
        textureRng.range(1, 4),
      );
    }
    for (let i = 0; i < 55; i++) {
      let x = textureRng.range(0, 1024),
        y = textureRng.range(0, 1024);
      c.strokeStyle = "#111b2540";
      c.lineWidth = textureRng.range(1, 3);
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += textureRng.range(-30, 30);
        y += textureRng.range(5, 40);
        c.lineTo(x, y);
      }
      c.stroke();
    }
    texture.update();
    floorMat.diffuseTexture = texture;
    floorMat.diffuseColor = Color3.FromHexString("#788c99");
    floorMat.specularColor = Color3.FromHexString("#476775");
    floorMat.specularPower = 60;
    const floor = MeshBuilder.CreateDisc(
      "one cavern floor",
      { radius: 21, tessellation: 80 },
      s,
    );
    floor.rotation.x = Math.PI / 2;
    floor.position.set(0, -0.1, 5);
    floor.scaling.y = 0.95;
    floor.material = floorMat;
    // Irregular stone walls, with a real opening at the front of the chamber.
    const rng = new Rng(9124);
    for (let i = 0; i < 45; i++) {
      const a = (i / 44) * (Math.PI + 0.5) - 0.25;
      const x = Math.cos(a) * 19,
        z = Math.sin(a) * 17 + 5;
      for (let layer = 0; layer < 3; layer++) {
        const rock = MeshBuilder.CreateIcoSphere(
          "natural cavern wall",
          { radius: 1, subdivisions: 2 },
          s,
        );
        rock.position.set(
          x + rng.range(-0.5, 0.5),
          layer * 3 + 1,
          z + rng.range(-0.5, 0.5),
        );
        rock.scaling.set(
          rng.range(2, 3.2),
          rng.range(2.1, 3.5),
          rng.range(1.5, 2.7),
        );
        rock.rotation.set(rng.range(0, 1), a, rng.range(0, 1));
        rock.material = stone;
        rock.isPickable = false;
      }
      if (i % 3 === 0) {
        const tooth = MeshBuilder.CreateCylinder(
          "stalactite",
          {
            height: rng.range(2, 4),
            diameterTop: 1.3,
            diameterBottom: 0,
            tessellation: 7,
          },
          s,
        );
        tooth.position.set(x * 0.86, 8, z * 0.86);
        tooth.material = stone;
        tooth.isPickable = false;
      }
    }
    // Twelve display stands coexist in this room, not separate galleries.
    this.spots.forEach((p, i) => {
      const base = MeshBuilder.CreateCylinder(
        "treasure stand " + i,
        {
          height: 0.65,
          diameterTop: 2.5,
          diameterBottom: 2.9,
          tessellation: 16,
        },
        s,
      );
      base.position.set(p.x, 0.23, p.z);
      base.material = plinthMat;
      base.metadata = { relicIndex: i };
      const lip = MeshBuilder.CreateTorus(
        "brass display rim",
        { diameter: 2.5, thickness: 0.065, tessellation: 40 },
        s,
      );
      lip.position.set(p.x, 0.57, p.z);
      lip.material = gold;
      lip.isPickable = false;
      const light = new PointLight(
        "treasure glow " + i,
        new Vector3(p.x, 3.5, p.z - 0.8),
        s,
      );
      light.diffuse = Color3.FromHexString(RELICS[i]!.color);
      light.range = 6;
      light.intensity = 0.65;
      light.setEnabled(false);
      this.lamps.push(light);
      const root = new TransformNode("unopened chest " + i, s);
      root.position.set(p.x, 0.66, p.z);
      root.scaling.setAll(0.75);
      this.closed.push(root);
      const part = (
        name: string,
        opts: object,
        m: StandardMaterial,
        x = 0,
        y = 0,
        z = 0,
      ) => {
        const b = MeshBuilder.CreateBox(name, opts, s);
        b.parent = root;
        b.position.set(x, y, z);
        b.material = m;
        b.metadata = { relicIndex: i };
        return b;
      };
      part(
        "solid closed chest",
        { width: 2, height: 0.85, depth: 1.3 },
        wood,
        0,
        0.4,
      );
      const lid = MeshBuilder.CreateCylinder(
        "arched chest lid",
        { height: 2, diameter: 1.3, tessellation: 16, arc: 0.5 },
        s,
      );
      lid.rotation.z = Math.PI / 2;
      lid.rotation.y = Math.PI;
      lid.parent = root;
      lid.position.y = 0.8;
      lid.material = wood;
      lid.metadata = { relicIndex: i };
      for (const x of [-0.72, 0.72]) {
        part(
          "iron chest binding",
          { width: 0.12, height: 0.95, depth: 1.34 },
          iron,
          x,
          0.48,
        );
        const band = MeshBuilder.CreateTorus(
          "arched brass strap",
          { diameter: 1.34, thickness: 0.07, tessellation: 24 },
          s,
        );
        band.parent = root;
        band.rotation.z = Math.PI / 2;
        band.position.set(x, 0.82, 0);
        band.material = gold;
        band.metadata = { relicIndex: i };
      }
      part(
        "brass chest lock",
        { width: 0.25, height: 0.32, depth: 0.1 },
        gold,
        0,
        0.76,
        -0.7,
      );
    });
    // Torches and tiny crystal clusters illuminate the room without neon hoops.
    for (const x of [-12, 12])
      for (const z of [-1, 8, 16]) {
        const pole = MeshBuilder.CreateCylinder(
          "torch bracket",
          { height: 2.7, diameter: 0.18, tessellation: 8 },
          s,
        );
        pole.position.set(x, 1.2, z);
        pole.material = iron;
        const cup = MeshBuilder.CreateCylinder(
          "torch bowl",
          {
            height: 0.35,
            diameterTop: 0.7,
            diameterBottom: 0.25,
            tessellation: 10,
          },
          s,
        );
        cup.position.set(x, 2.5, z);
        cup.material = gold;
        const f = MeshBuilder.CreateSphere(
          "living torch flame",
          { diameter: 0.6, segments: 10 },
          s,
        );
        f.position.set(x, 2.9, z);
        f.scaling.set(0.65, 1.6, 0.65);
        f.material = fire;
        f.isPickable = false;
        this.flames.push(f);
        if (z === 8) {
          const l = new PointLight(
            "warm chamber light",
            new Vector3(x * 0.65, 8, 2),
            s,
          );
          l.diffuse = Color3.FromHexString("#ffc585");
          l.intensity = 1.0;
          l.range = 38;
        }
        for (let j = 0; j < 4; j++) {
          const c = MeshBuilder.CreateCylinder(
            "quartz cluster",
            {
              height: rng.range(0.4, 1),
              diameterTop: 0,
              diameterBottom: 0.22,
              tessellation: 6,
            },
            s,
          );
          c.position.set(x + rng.range(-1, 1), 0.2, z + rng.range(-1, 1));
          c.rotation.z = rng.range(-0.3, 0.3);
          c.material = crystal;
        }
      }
    for (let i = 0; i < 10; i++) {
      const x = i % 2 === 0 ? -14 : 14,
        z = -1 + Math.floor(i / 2) * 3;
      const barrel = MeshBuilder.CreateCylinder(
        "old rum barrel",
        { height: 1.7, diameter: 1.2, tessellation: 12 },
        s,
      );
      barrel.position.set(x, 0.7, z);
      barrel.material = wood;
      for (const y of [-0.5, 0.5]) {
        const band = MeshBuilder.CreateTorus(
          "barrel binding",
          { diameter: 1.23, thickness: 0.075, tessellation: 20 },
          s,
        );
        band.parent = barrel;
        band.position.y = y;
        band.material = iron;
      }
      const crate = MeshBuilder.CreateBox("captain's supplies", { size: 1 }, s);
      crate.position.set(x + (x < 0 ? 1.1 : -1.1), 0.4, z + 0.7);
      crate.rotation.y = 0.3;
      crate.material = wood;
    }
    for (let i = 0; i < 40; i++) {
      const coin = MeshBuilder.CreateCylinder(
        "scattered doubloon",
        { height: 0.035, diameter: 0.17, tessellation: 16 },
        s,
      );
      coin.position.set(rng.range(-4, 4), 0.03, rng.range(2, 8));
      coin.material = gold;
      coin.isPickable = false;
    }
    for (let i = 0; i < 30; i++) {
      const m = MeshBuilder.CreateSphere(
        "cavern dust",
        { diameter: 0.025, segments: 4 },
        s,
      );
      m.position.set(rng.range(-14, 14), rng.range(0.5, 7), rng.range(-4, 16));
      m.material = gold;
      m.isPickable = false;
      this.motes.push(m);
    }
    const pool = MeshBuilder.CreateDisc(
      "still moonlit pool",
      { radius: 4, tessellation: 64 },
      s,
    );
    pool.rotation.x = Math.PI / 2;
    pool.scaling.set(0.8, 0.5, 1);
    pool.position.set(0, -0.06, 5);
    pool.material = mat("dark reflecting pool", "#204659", 0.1);
    const pipeline = new DefaultRenderingPipeline("torch glow", true, s, [
      this.camera,
    ]);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.7;
    pipeline.bloomWeight = 0.22;
    pipeline.bloomKernel = 64;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType =
      ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure = 1.05;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.3;
    const dais = (this.revealDais = MeshBuilder.CreateCylinder(
      "chest opening dais",
      { height: 0.7, diameterTop: 4, diameterBottom: 4.5, tessellation: 24 },
      s,
    ));
    dais.position.set(0, 0.25, -5);
    dais.material = plinthMat;
    dais.isPickable = false;
    this.chest = new RewardChest(s);
  }
  refresh(owned: number[]): void {
    if (owned.join(",") === this.owned) return;
    this.owned = owned.join(",");
    this.relics.forEach((r) => r?.dispose(false, true));
    this.relics = RELICS.map((_, i) => {
      this.closed[i]!.setEnabled(!owned.includes(i));
      if (!owned.includes(i)) return null;
      const r = buildRelic(this.scene, i);
      r.getChildMeshes().forEach((m) => (m.metadata = { relicIndex: i }));
      return r;
    });
  }
  overview(): void {
    this.focus = null;
    this.orbit = -Math.PI / 2;
    this.elevation = 0.6;
    this.distance = 24;
  }
  select(index: number, _snap = false): void {
    this.selected = Math.max(0, Math.min(11, index));
    this.focus = this.spots[this.selected]!.add(new Vector3(0, 1.7, 0));
    this.distance = 10;
  }
  look(dx: number, dy: number): void {
    this.orbit = Math.max(-1.95, Math.min(-1.2, this.orbit - dx * 0.005));
    this.elevation = Math.max(0.2, Math.min(0.95, this.elevation + dy * 0.003));
  }
  zoom(dy: number): void {
    this.distance = Math.max(7, Math.min(34, this.distance + dy * 0.018));
  }
  pick(x: number, y: number): number | null {
    const hit = this.scene.pick(x, y);
    const i = hit?.pickedMesh?.metadata?.relicIndex;
    return typeof i === "number" ? i : null;
  }
  beginReveal(index: number): void {
    this.selected = index;
    this.revealTime = 0;
    this.revealing = true;
  }
  endReveal(): void {
    this.revealing = false;
    this.chest.hide();
  }
  get revealPose() {
    return revealPose(this.revealTime, this.reducedMotion);
  }
  render(dt: number, reveal = false): void {
    this.time += dt;
    const unboxing = reveal && this.revealing;
    this.revealDais.setEnabled(reveal);
    if (unboxing) {
      this.revealTime += dt;
      this.chest.animate(this.revealTime, 0, this.reducedMotion);
      this.chest.root.position.z = -5;
    } else this.chest.hide();
    const portrait = innerWidth < 600;
    if (reveal) {
      this.camera.position.set(0.4, 6.5, -(portrait ? 22 : 18));
      this.camera.setTarget(new Vector3(0, 3.3, -5));
    } else {
      const dest = this.focus ?? new Vector3(0, 1.2, 4);
      Vector3.LerpToRef(this.target, dest, Math.min(1, dt * 5), this.target);
      const d = this.distance * (portrait && !this.focus ? 2.4 : 1);
      this.camera.position.set(
        this.target.x + Math.cos(this.orbit) * d * Math.cos(this.elevation),
        this.target.y + Math.sin(this.elevation) * d,
        this.target.z + Math.sin(this.orbit) * d * Math.cos(this.elevation),
      );
      this.camera.setTarget(this.target);
    }
    this.relics.forEach((r, i) => {
      this.closed[i]!.setEnabled(!r && !reveal);
      if (!r) return;
      const offset =
        RELICS[i]!.kind === "gem"
          ? 0.9
          : RELICS[i]!.kind === "gold"
            ? 0.5
            : 0.65;
      if (reveal) {
        r.position.set(
          0,
          unboxing ? 1.7 + this.revealPose.rise * 2.4 : 3.6,
          -5,
        );
        r.scaling.setAll(0.18 + this.revealPose.rise * 0.67);
        r.setEnabled(i === this.selected && this.revealPose.rise > 0.08);
      } else {
        r.position.set(this.spots[i]!.x, 1 + offset, this.spots[i]!.z);
        r.scaling.setAll(0.78);
        r.setEnabled(true);
      }
      r.rotation.y = this.time * 0.12 + i * 0.4;
    });
    this.lamps.forEach((l, i) => {
      l.setEnabled(i === this.selected);
      l.intensity =
        (this.relics[i] ? 1 : 0.4) + Math.sin(this.time * 1.3 + i) * 0.06;
    });
    this.flames.forEach(
      (f, i) => (f.scaling.y = 1.5 + Math.sin(this.time * 11 + i) * 0.18),
    );
    this.motes.forEach(
      (m, i) => (m.position.y += Math.sin(this.time * 0.8 + i) * dt * 0.05),
    );
    this.scene.render();
  }
}
