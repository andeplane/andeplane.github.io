import { antialiasSamples, isPhoneRendering } from "./quality";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { bindLocalLights } from "./localLights";
import { Cavern } from "./cavern";
import { CoinHoard } from "./coinHoard";
import { GOLD_AREAS } from "../game/goldAreas";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { RewardChest, revealPose } from "./chest";
import { buildRelic } from "./relics";
import { CaveWalker, type WalkIntent } from "../input/caveWalk";
import { caveRoom } from "../input/caveLayout";
import type { Progress } from "../game/progress";
import {
  goldTotal,
  GOLD_PER_LEVEL,
  WORLD_RELICS,
  CAVE_ITEMS,
} from "../game/rewards";
import { RELICS } from "../game/voyage";

/** One continuous cavern. Gold and world keepsakes share a permanent place in the same room. */
export class TreasureCave {
  readonly scene: Scene;
  readonly camera: FreeCamera;
  selected = 0;
  private time = 0;
  private relics: (TransformNode | null)[] = [];
  private closed: TransformNode[] = [];
  private lamps: PointLight[] = [];
  private chamber: Cavern;
  private coins: CoinHoard;
  selectedGoldWorld = 0;
  private depositWorld: number | null = null;
  private pourStarted = false;
  private depositFinishedAt: number | null = null;
  readonly walker: CaveWalker;
  private revealLight: PointLight;
  // Scattered ledges at different depths and heights, with a winding clear floor.
  private spots = [
    [-3.5, 0.9, 1.0],
    [-5.1, 2.0, 14.0],
    [-9.0, 0.85, 12.0],
    [-10.3, 0.9, 4.2],
    [-4.7, 0.75, 6.8],
    [9.0, 1.1, 18.0],
    [9.1, 1.8, 5.0],
    [-7.3, 1.1, -2.0],
    [6.0, 1.35, 43.0],
    [5.7, 1.25, -0.6],
    [-3.9, 1.0, -6.0],
    [29.0, 0.85, 34.0],
  ].map(([x, y, z]) => new Vector3(x!, y!, z!));
  private relief: { lift: number; height: number; width: number }[] = [];
  private owned = "initial";
  private chest: RewardChest;
  private revealDais: TransformNode;
  private focus: Vector3 | null = null;
  private distance = 24;
  revealTime = 0;
  private revealing = false;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  constructor(engine: Engine, persistent = true, strictPhysics = false) {
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
    hemi.intensity = 0.62;
    hemi.renderPriority = 7;
    this.chamber = new Cavern(s, this.spots);
    this.coins = new CoinHoard(s, persistent, () => bindLocalLights(this.chamber.lamps, this.scene.meshes), { strictPhysics });
    this.walker = new CaveWalker(this.chamber.obstacles, (x, z) =>
      Math.max(this.chamber.walkHeight(x, z), this.coins.walkHeight(x, z)),
    );
    const { stone, ledge: plinthMat, gold, wood, iron } = this.chamber;
    // Treasures rest on broad, broken rock shelves, not matching display stands.
    this.spots.forEach((p, i) => {
      const displayed = WORLD_RELICS.includes(i as 2 | 5 | 8 | 11);
      const height = p.y + 0.15,
        sy = height / 1.25;
      const obstacleCount = this.chamber.obstacles.length;
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
      if (!displayed) {
        rock.setEnabled(false);
        this.chamber.obstacles.length = obstacleCount;
      }
      rock.material = i % 3 === 0 ? stone : plinthMat;
      rock.metadata = { relicIndex: i };
      rock.isPickable = displayed;
      this.chamber.shadow.addShadowCaster(rock);
      for (let j = 0; displayed && j < 2; j++)
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
        { height: 2, diameter: 1.3, tessellation: 24, arc: 0.5, enclose: true },
        s,
      );
      // The cylinder's half arc starts below Z=0. Rotate it into an upward
      // dome along the chest's width, rather than a vertical half-tube.
      lid.rotation.set(Math.PI / 2, Math.PI / 2, 0);
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
    const pipeline = new DefaultRenderingPipeline("torch glow", !isPhoneRendering(engine), s, [
      this.camera,
    ]);
    pipeline.samples = antialiasSamples(engine);
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
  }
  refresh(progress: Progress, depositWorld: number | null = null): void {
    const count = goldTotal(progress) / GOLD_PER_LEVEL;
    const owned = [...(count ? [0] : []), ...progress.relics];
    this.coins.refresh(progress, depositWorld);
    const key = `${Object.keys(progress.voyages).sort().join(",")}:${owned.join(",")}`;
    if (key === this.owned) return;
    this.owned = key;
    this.relics.forEach((r) => r?.dispose(false, true));
    this.relief = [];
    this.relics = RELICS.map((_, i) => {
      this.closed[i]!.setEnabled(
        WORLD_RELICS.includes(i as 2 | 5 | 8 | 11) && !owned.includes(i),
      );
      if (!owned.includes(i)) {
        this.relief[i] = { lift: 0, height: 1.3, width: 1.5 };
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
        width: Math.max(
          bounds.max.x - bounds.min.x,
          bounds.max.z - bounds.min.z,
        ),
      };
      r.position.set(
        this.spots[i]!.x,
        this.spots[i]!.y + this.relief[i]!.lift,
        this.spots[i]!.z,
      );
      r.getChildMeshes().forEach((m) => {
        m.metadata = { relicIndex: i };
        this.chamber.shadow.addShadowCaster(m);
      });
      return r;
    });
    // Stable assignments belong to geometry, not the visitor's current position.
    // Local lanterns and the skylight stay fixed as the visitor walks around.
    bindLocalLights(this.chamber.lamps, this.scene.meshes);
    this.lamps.forEach((light, i) => {
      light.includedOnlyMeshes = [
        ...this.closed[i]!.getChildMeshes(),
        ...(this.relics[i]?.getChildMeshes() ?? []),
      ];
    });
  }
  private bankView(world: number): Vector3 {
    const a = GOLD_AREAS[world]!, span = this.coins.span(world);
    return new Vector3(world === 3 ? 28 : 0, Math.min(6.1, span.height + 2.7), a.z - (world === 3 ? 9 : 8));
  }
  get activeLanterns(): string {
    return this.chamber.lamps
      .filter((light) => light.isEnabled())
      .map((light) => `${light.position.x},${light.position.z}`)
      .join(";");
  }
  get coinCounts(): number[] { return this.coins.counts; }
  get restingCoinCounts(): number[] { return this.coins.restingCounts; }
  get goldPhysicsActive(): boolean { return this.coins.physicsActive; }
  /** Debug-only controller supplies temporary banks, never player progress. */
  debugCoinBank(world: number, add = false): void {
    if (add) this.coins.addBatch(world);
    this.beginUnload(world);
  }
  get coinError(): string | null { return this.depositWorld === null ? null : this.coins.pouring(this.depositWorld).error; }
  get walkingGeometry() {
    return this.chamber.walkingGeometry;
  }
  get inspecting(): boolean {
    return this.focus !== null;
  }
  get room(): string {
    return caveRoom(this.walker.x, this.walker.z);
  }
  enter(): void {
    this.coins.finishPours();
    this.walker.reset();
    this.overview();
  }
  walk(intent: WalkIntent, dt: number): void {
    if (!this.inspecting) this.walker.step(intent, dt);
  }
  overview(): void {
    this.focus = null;
  }
  select(index: number, _snap = false): void {
    this.selected = Math.max(0, Math.min(11, index));
    if (this.selected === 0) {
      this.focus = this.coins.center(this.selectedGoldWorld);
      this.distance = 8;
      return;
    }
    this.focus = this.spots[this.selected]!.add(
      new Vector3(0, (this.relief[this.selected]?.height ?? 1.3) * 0.5, 0),
    );
    this.distance = 8;
  }
  look(dx: number, dy: number): void {
    if (!this.focus) this.walker.look(dx, dy);
    else {
      // Turn the keepsake in your hands without orbiting through a cave wall.
      const relic = this.relics[this.selected];
      if (relic && this.selected !== 0) relic.rotation.y += dx * 0.008;
    }
  }
  private overviewRadius(): number {
    return innerWidth < 600 ? 34 : 28;
  }
  resize(): void {}
  private pullBack(): boolean {
    if (this.focus && this.distance >= 17) {
      this.overview();
      return true;
    }
    return false;
  }
  zoom(dy: number): boolean {
    if (!this.focus) return false;
    this.distance = Math.max(
      6,
      Math.min(this.overviewRadius(), this.distance + dy * 0.025),
    );
    return this.pullBack();
  }
  // Spreading two fingers pulls back from a treasure, as requested.
  pinch(ratio: number): boolean {
    if (!this.focus) return false;
    this.distance = Math.max(
      6,
      Math.min(this.overviewRadius(), this.distance * ratio * ratio),
    );
    return this.pullBack();
  }
  pick(x: number, y: number): number | null {
    const hit = this.scene.pick(x, y);
    const i = hit?.pickedMesh?.metadata?.relicIndex;
    if (i === 0) this.selectedGoldWorld = hit!.pickedMesh!.metadata.goldWorld ?? 0;
    return !this.inspecting &&
      hit &&
      hit.distance <= 5.5 &&
      typeof i === "number" &&
      CAVE_ITEMS.includes(i)
      ? i
      : null;
  }
  get nearby(): number | null {
    const hit = this.scene.pickWithRay(this.camera.getForwardRay(5.5));
    const i = hit?.pickedMesh?.metadata?.relicIndex;
    if (i === 0) this.selectedGoldWorld = hit!.pickedMesh!.metadata.goldWorld ?? 0;
    return hit &&
      hit.distance <= 5.5 &&
      typeof i === "number" &&
      CAVE_ITEMS.includes(i)
      ? i
      : null;
  }
  beginReveal(index: number, depositWorld: number | null = null): void {
    this.depositWorld = depositWorld;
    this.pourStarted = false;
    this.depositFinishedAt = null;
    this.selected = index;
    this.revealTime = 0;
    this.revealing = true;
  }
  beginUnload(world: number): void { this.beginReveal(0, world); this.revealTime = this.reducedMotion ? 1.4 : 5.3; }
  get depositComplete(): boolean { return this.depositFinishedAt !== null && this.revealTime - this.depositFinishedAt > 1; }
  endReveal(): void {
    this.revealing = false;
    this.coins.finishPours();
    this.depositWorld = null;
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
    const showDeposit = unboxing && this.depositWorld !== null && this.revealTime >= (this.reducedMotion ? 1.4 : 5.3);
    const depositAge = this.revealTime - (this.reducedMotion ? 1.4 : 5.3);
    if (showDeposit && depositAge > (this.reducedMotion ? .1 : 4.8) && !this.pourStarted && this.coins.pouring(this.depositWorld!).ready) {
      this.coins.startPour(this.depositWorld!);
      this.pourStarted = true;
    }
    if (reveal) {
      // The walking cave has a front wall and ceiling; keep the reward camera
      // inside the chamber so neither can obscure the chest.
      this.camera.fov = portrait ? (innerHeight < 650 ? 1.55 : 1.4) : 0.8;
      this.camera.position.set(0.4, 4.8, -11.8);
      this.camera.setTarget(new Vector3(0, 3.3, -5));
      if (showDeposit) {
        const world = this.depositWorld!, center = this.coins.center(world), span = this.coins.span(world);
        const elapsed = this.revealTime - (this.reducedMotion ? 1.4 : 5.3);
        const t = this.reducedMotion ? 1 : Math.min(1, elapsed / 3.8), blend = t * t * (3 - 2 * t);
        const area = GOLD_AREAS[world]!, pour = this.coins.pouring(world);
        // Arrive in the correct room. Carry a chest from its walking path to
        // the bank, rather than flying through walls to a deeper chamber.
        const approach = world === 2 ? new Vector3(0,.5,43) : world === 3 ? new Vector3(28,.5,35) : new Vector3(0,.5,area.z-5);
        const direction = new Vector3(area.x-approach.x,0,area.z-approach.z).normalize();
        const carryCamera = approach.subtract(direction.scale(4.8)).add(new Vector3(0,2.7,0));
        this.camera.position.copyFrom(Vector3.Lerp(carryCamera, this.bankView(world).add(new Vector3(0,1.2,0)), blend));
        this.camera.fov = (portrait ? 1.6 : .95) + ((portrait ? 1.35 : .9) - (portrait ? 1.6 : .95)) * blend;
        this.camera.setTarget(Vector3.Lerp(approach.add(new Vector3(0,1.25,0)), center.add(new Vector3(0, span.height * .1, 0)), blend));
        const travel = this.reducedMotion ? 1 : Math.min(1, elapsed / 3.8), lift = travel * travel * (3 - 2 * travel);
        this.chest.root.position.copyFrom(Vector3.Lerp(approach, new Vector3(area.x, pour.chestY, area.z), lift));
        if (!this.reducedMotion && travel < 1) this.chest.root.position.y += Math.sin(elapsed*8)*.035*Math.sin(travel*Math.PI);
        this.chest.root.scaling.setAll(1);
        const turn = this.reducedMotion ? 1 : Math.max(0, Math.min(1, (elapsed - 3.8) / 1));
        this.chest.root.rotation.set(0, Math.atan2(direction.x,direction.z) * (1 - lift), -Math.PI * turn * turn * (3 - 2 * turn));
        this.chest.carry(!this.reducedMotion && elapsed < 4.2,Math.max(0,Math.min(1,(4.2-elapsed)/.4)));
        this.chest.open(this.reducedMotion ? 1 : Math.max(0, Math.min(1, (elapsed-3.4)/.6)));
        this.chest.setCoinCount(1000 - pour.spawned);
        if (pour.done) {
          this.depositFinishedAt ??= this.revealTime;
          const fade = Math.min(1, (this.revealTime - this.depositFinishedAt) / .7);
          this.chest.root.position.y += fade * .35;
          this.chest.fade(1 - fade);
          if (fade === 1) this.chest.hide();
        }
        this.revealDais.setEnabled(false);
        this.revealLight.setEnabled(false);
      }
    } else {
      const w = this.walker;
      this.camera.position.set(
        w.x,
        w.eyeY + (this.reducedMotion ? 0 : w.bob),
        w.z,
      );
      if (this.focus) {
        const relief = this.selected === 0 ? this.coins.span(this.selectedGoldWorld) : this.relief[this.selected]!;
        if (this.selected === 0) this.camera.position.copyFrom(this.bankView(this.selectedGoldWorld));
        const span = Math.max(
          relief.height,
          relief.width / (innerWidth / innerHeight),
        );
        const distance = Vector3.Distance(this.camera.position, this.focus);
        this.camera.fov = Math.max(
          0.5,
          Math.min(
            1.8,
            (2 * Math.atan((span * 0.65) / distance) * this.distance) / 8,
          ),
        );
      } else this.camera.fov = 1.1;
      this.camera.setTarget(
        this.focus ??
          this.camera.position.add(
            new Vector3(
              Math.sin(w.yaw) * Math.cos(w.pitch),
              -Math.sin(w.pitch),
              Math.cos(w.yaw) * Math.cos(w.pitch),
            ),
          ),
      );
    }
    this.relics.forEach((r, i) => {
      this.closed[i]!.setEnabled(
        WORLD_RELICS.includes(i as 2 | 5 | 8 | 11) && !r && !reveal,
      );
      if (!r) return;
      if (reveal) {
        r.position.set(
          0,
          unboxing ? 1.7 + this.revealPose.rise * 2.4 : 3.6,
          -5,
        );
        r.scaling.setAll(0.18 + this.revealPose.rise * 0.67);
        r.setEnabled(!showDeposit && i !== 0 && i === this.selected && this.revealPose.discovered);
      } else {
        r.position.set(
          this.spots[i]!.x,
          this.spots[i]!.y + this.relief[i]!.lift,
          this.spots[i]!.z,
        );
        r.scaling.setAll(0.78);
        r.setEnabled(i !== 0);
      }
      if (reveal) r.rotation.y = this.time * 0.12 + i * 0.4;
    });
    this.lamps.forEach((l, i) => {
      l.setEnabled(!reveal && i === this.selected);
      l.intensity =
        (this.relics[i] ? 1 : 0.4) + Math.sin(this.time * 1.3 + i) * 0.06;
    });
    this.coins.animate(dt, this.reducedMotion);
    this.chamber.animate(dt);
    this.scene.render();
  }
}
