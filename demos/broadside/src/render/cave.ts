import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Cavern } from "./cavern";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { RewardChest, revealPose } from "./chest";
import { buildRelic } from "./relics";
import { RELICS } from "../game/voyage";

/** One continuous cavern. Every level has a permanent place in the same room. */
export class TreasureCave {
  readonly scene: Scene;
  readonly camera: FreeCamera;
  selected = 0;
  private time = 0;
  private relics: (TransformNode | null)[] = [];
  private closed: TransformNode[] = [];
  private lamps: PointLight[] = [];
  private chamber: Cavern;
  private revealLight: PointLight;
  // Scattered ledges at different depths and heights, with a winding clear floor.
  private spots = [
    [-8.8, 1.35, 11.2],
    [-2.1, 2.0, 14.0],
    [6.8, 1.15, 12.0],
    [-10.3, 0.9, 4.2],
    [-4.7, 0.75, 6.8],
    [2.0, 1.4, 8.4],
    [9.1, 1.8, 5.0],
    [-7.3, 1.1, -2.0],
    [-1.2, 0.65, 1.1],
    [5.7, 1.25, -0.6],
    [-3.9, 1.0, -6.0],
    [5.0, 0.85, -5.5],
  ].map(([x, y, z]) => new Vector3(x!, y!, z!));
  private relief: { lift: number; height: number }[] = [];
  private viewDistance = 24;
  private owned = "initial";
  private discovered: number[] = [];
  private chest: RewardChest;
  private revealDais: TransformNode;
  private focus: Vector3 | null = null;
  private target = new Vector3(0, 1, 4);
  private viewCenter = new Vector3(0, 1.2, 4);
  private orbit = -Math.PI / 2;
  private elevation = 0.2;
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
      new Vector3(-0.35, 0.9, -0.8),
      s,
    );
    hemi.diffuse = Color3.FromHexString("#91b8cd");
    hemi.groundColor = Color3.FromHexString("#16121a");
    hemi.intensity = 0.45;
    this.chamber = new Cavern(s, this.spots);
    const { stone, ledge: plinthMat, gold, wood, iron } = this.chamber;
    // Treasures rest on broad, broken rock shelves, not matching display stands.
    this.spots.forEach((p, i) => {
      const height = p.y + 0.15,
        sy = height / 1.25;
      const rock = this.chamber.rock(
        "treasure rock ledge " + i,
        new Vector3(p.x, p.y - 0.55 * sy, p.z),
        new Vector3(
          [2.7, 1.8, 1.9, 2.3, 2.8, 2.1, 1.7, 2.45, 2.6, 1.85, 2.5, 2.25][i]!,
          sy,
          [1.6, 2.05, 1.55, 1.85, 1.5, 1.9, 1.65, 2.1, 1.55, 1.7, 1.8, 2.15][
            i
          ]!,
        ),
        i,
        true,
      );
      rock.material = i % 3 === 0 ? stone : plinthMat;
      rock.metadata = { relicIndex: i };
      rock.isPickable = true;
      this.chamber.shadow.addShadowCaster(rock);
      for (let j = 0; j < 2; j++)
        this.chamber.rock(
          "ledge rubble",
          new Vector3(p.x + (j ? 1.4 : -1.3), 0.15, p.z + 0.5),
          new Vector3(0.8, 0.45, 0.7),
          i + j,
        );
      const light = new PointLight(
        "treasure glow " + i,
        new Vector3(p.x, p.y + 2.5, p.z - 0.8),
        s,
      );
      light.renderPriority = 2;
      light.diffuse = Color3.FromHexString(RELICS[i]!.color);
      light.range = 5;
      light.intensity = 0.65;
      light.setEnabled(false);
      this.lamps.push(light);
      const root = new TransformNode("unopened chest " + i, s);
      root.position.set(p.x, p.y + 0.04, p.z);
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
    const dais = (this.revealDais = MeshBuilder.CreateIcoSphere(
      "chest opening rock",
      { radius: 1, subdivisions: 2, updatable: true },
      s,
    ));
    const rockVertices = dais.getVerticesData("position")!;
    for (let i = 1; i < rockVertices.length; i += 3)
      if (rockVertices[i]! > 0.1) rockVertices[i] = 0.45;
    dais.updateVerticesData("position", rockVertices);
    dais.convertToFlatShadedMesh();
    dais.scaling.set(3.3, 1.4, 2.4);
    dais.position.set(0, 0.35, -5);
    dais.material = stone;
    dais.isPickable = false;
    this.revealLight = new PointLight(
      "warm light on the reward chest",
      new Vector3(-2, 5, -10),
      s,
    );
    this.revealLight.diffuse = Color3.FromHexString("#ffe0a0");
    this.revealLight.intensity = 2.4;
    this.revealLight.range = 16;
    this.revealLight.renderPriority = 3;
    this.revealLight.setEnabled(false);
    this.chest = new RewardChest(s);
    this.distance = this.overviewRadius();
    this.viewDistance = this.distance;
  }
  refresh(owned: number[]): void {
    if (owned.join(",") === this.owned) return;
    this.owned = owned.join(",");
    this.discovered = [...owned];
    this.relics.forEach((r) => r?.dispose(false, true));
    this.chamber.refresh(owned.length);
    this.relief = [];
    this.relics = RELICS.map((_, i) => {
      this.closed[i]!.setEnabled(!owned.includes(i));
      if (!owned.includes(i)) {
        this.relief[i] = { lift: 0, height: 1.3 };
        return null;
      }
      const r = buildRelic(this.scene, i);
      r.scaling.setAll(0.78);
      r.rotation.y = i * 0.4;
      r.computeWorldMatrix(true);
      r.getChildMeshes().forEach((m) => m.computeWorldMatrix(true));
      const bounds = r.getHierarchyBoundingVectors(true);
      this.relief[i] = {
        lift: -bounds.min.y + 0.025,
        height: bounds.max.y - bounds.min.y,
      };
      r.getChildMeshes().forEach((m) => {
        m.metadata = { relicIndex: i };
        this.chamber.shadow.addShadowCaster(m);
      });
      return r;
    });
  }
  overview(): void {
    this.focus = null;
    this.viewCenter.set(0, 1.2, 4);
    // Keep early finds visible when the phone only shows part of the chamber.
    if (
      innerWidth < 600 &&
      this.discovered.length > 0 &&
      this.discovered.length < 6
    ) {
      const points = this.discovered.map((i) => this.spots[i]!);
      this.viewCenter.x =
        points.reduce((sum, p) => sum + p.x, 0) / points.length;
      this.viewCenter.z = Math.min(
        8,
        Math.max(1, points.reduce((sum, p) => sum + p.z, 0) / points.length),
      );
    }
    this.orbit = -Math.PI / 2;
    this.elevation = 0.2;
    this.distance = this.overviewRadius();
  }
  select(index: number, _snap = false): void {
    this.selected = Math.max(0, Math.min(11, index));
    this.focus = this.spots[this.selected]!.add(
      new Vector3(0, (this.relief[this.selected]?.height ?? 1.3) * 0.5, 0),
    );
    this.distance = innerWidth < 600 ? 10 : 8;
  }
  look(dx: number, dy: number): void {
    if (!this.focus && innerWidth < 600) {
      this.viewCenter.x = Math.max(
        -9,
        Math.min(9, this.viewCenter.x - dx * 0.055),
      );
      this.viewCenter.z = Math.max(
        -3,
        Math.min(13, this.viewCenter.z + dy * 0.05),
      );
      return;
    }
    this.orbit = Math.max(-1.95, Math.min(-1.2, this.orbit - dx * 0.005));
    this.elevation = Math.max(0.2, Math.min(0.95, this.elevation + dy * 0.003));
  }
  private overviewRadius(): number {
    return innerWidth < 600 ? 34 : 28;
  }
  resize(): void {
    if (!this.focus) this.distance = this.overviewRadius();
  }
  private pullBack(): boolean {
    if (this.focus && this.distance >= 17) {
      this.overview();
      return true;
    }
    return false;
  }
  zoom(dy: number): boolean {
    this.distance = Math.max(
      6,
      Math.min(this.overviewRadius(), this.distance + dy * 0.025),
    );
    return this.pullBack();
  }
  // Spreading two fingers pulls back from a treasure, as requested.
  pinch(ratio: number): boolean {
    this.distance = Math.max(
      6,
      Math.min(this.overviewRadius(), this.distance * ratio * ratio),
    );
    return this.pullBack();
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
    this.revealLight.setEnabled(reveal);
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
      const dest = this.focus ?? this.viewCenter;
      Vector3.LerpToRef(this.target, dest, Math.min(1, dt * 5), this.target);
      this.viewDistance +=
        (this.distance - this.viewDistance) * Math.min(1, dt * 5);
      const d = this.viewDistance;
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
      if (reveal) {
        r.position.set(
          0,
          unboxing ? 1.7 + this.revealPose.rise * 2.4 : 3.6,
          -5,
        );
        r.scaling.setAll(0.18 + this.revealPose.rise * 0.67);
        r.setEnabled(i === this.selected && this.revealPose.rise > 0.08);
      } else {
        r.position.set(
          this.spots[i]!.x,
          this.spots[i]!.y + this.relief[i]!.lift,
          this.spots[i]!.z,
        );
        r.scaling.setAll(0.78);
        r.setEnabled(true);
      }
      r.rotation.y = reveal ? this.time * 0.12 + i * 0.4 : i * 0.4;
    });
    this.lamps.forEach((l, i) => {
      l.setEnabled(!reveal && i === this.selected);
      l.intensity =
        (this.relics[i] ? 1 : 0.4) + Math.sin(this.time * 1.3 + i) * 0.06;
    });
    this.chamber.animate(dt);
    this.scene.render();
  }
}
