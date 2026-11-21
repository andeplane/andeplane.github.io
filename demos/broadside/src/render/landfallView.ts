import { Scene } from "@babylonjs/core/scene.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { buildRelic } from "../shared/pirate-world/render/relics";
import type { CaveObstacle } from "../shared/pirate-world/input/caveWalk";
import { WORLD_RELICS } from "../game/rewards";
import { voyageWeather } from "../game/weather";
import type { GeneratedIsland } from "../game/landfall";
import { VoyageSky } from "./voyageSky";
import { IslandScenery, vec } from "./landfallScenery";
import { buildLandfallWater } from "./landfallWater";
import { buildLandmark } from "./landfallLandmarks";

type WalkingPose = { x: number; z: number; eyeY: number; bob: number; yaw: number; pitch: number };

function buildDig(s: IslandScenery) {
  const { x, z } = s.site.dig,
    ground = s.floor(x, z),
    base = new TransformNode("buried strongbox", s.scene);
  const material = (name: string, color: string) => {
    const m = new StandardMaterial(name, s.scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.setAll(0.18);
    return m;
  };
  const wood = material("buried teak", "#674335"),
    brass = material("worn brass bindings", "#d2a354");
  const earth = material("fresh sand beneath the crust", "#8c7155");
  const charcoal = material("red ochre on driftwood", "#9e4537");
  const box = (
    name: string,
    w: number,
    h: number,
    d: number,
    px: number,
    py: number,
    pz: number,
    m: StandardMaterial,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, s.scene);
    mesh.position.set(px, py, pz);
    mesh.material = m;
    mesh.isPickable = false;
    mesh.parent = base;
    return mesh;
  };
  const hull = box("old salt chest", 1.42, 0.64, 0.82, 0, 0.34, 0, wood);
  hull.receiveShadows = true;
  const lid = MeshBuilder.CreateCylinder(
    "rounded chest lid",
    { height: 1.45, diameter: 0.83, tessellation: 16 },
    s.scene,
  );
  lid.rotation.z = Math.PI / 2;
  lid.parent = base;
  lid.position.y = 0.62;
  lid.material = wood;
  for (const dx of [-0.48, 0.48]) {
    const strap = MeshBuilder.CreateCylinder(
      "brass chest strap",
      { height: 0.105, diameter: 0.86, tessellation: 16 },
      s.scene,
    );
    strap.rotation.z = Math.PI / 2;
    strap.parent = base;
    strap.position.set(dx, 0.62, 0);
    strap.material = brass;
    for (const side of [-1, 1]) box("brass binding", 0.11, 0.51, 0.033, dx, 0.3, side * 0.413, brass);
  }
  box("chest escutcheon", 0.22, 0.21, 0.04, 0, 0.61, -0.43, brass);
  const spoil = MeshBuilder.CreateIcoSphere("turned sand", { subdivisions: 2, radius: 1, flat: true }, s.scene);
  spoil.material = earth;
  spoil.position.set(x, ground + 0.012, z);
  spoil.isPickable = false;
  const cross: Mesh[] = [];
  for (const sign of [-1, 1]) {
    const path = Array.from({ length: 9 }, (_, i) => {
      const t = (i / 8 - 0.5) * 1.5,
        xx = x + t,
        zz = z + t * sign;
      return vec(xx, s.floor(xx, zz) + 0.045, zz);
    });
    const stick = MeshBuilder.CreateTube(
      "crossed red driftwood",
      { path, radius: 0.064, tessellation: 6 },
      s.scene,
    );
    stick.material = charcoal;
    stick.isPickable = false;
    cross.push(stick);
  }
  const relic = buildRelic(s.scene, WORLD_RELICS[s.world]!);
  relic.scaling.setAll(0.55);
  relic.setEnabled(false);
  base.setEnabled(false);
  spoil.setEnabled(false);
  let progress = 0,
    previous = -1;
  return (digs: number, dt: number, time: number, reduced: boolean) => {
    if (digs !== previous) {
      for (const mark of cross) mark.setEnabled(digs === 0);
      base.setEnabled(digs > 0);
      spoil.setEnabled(digs > 0);
      relic.setEnabled(digs >= 3);
      previous = digs;
    }
    progress += (digs - progress) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
    base.position.set(x, ground - 0.97 + progress * 0.33, z);
    spoil.scaling.set(0.58 + progress * 0.29, 0.1 + progress * 0.018, 0.52 + progress * 0.15);
    if (digs >= 3) {
      relic.position.set(
        x,
        ground + 1.2 + Math.max(0, progress - 2) * 0.64 + (reduced ? 0 : Math.sin(time * 2) * 0.06),
        z,
      );
      relic.rotation.y = reduced ? 0.25 : time * 0.42;
    }
  };
}

function buildBirds(s: IslandScenery) {
  const material = new StandardMaterial("sea birds in the wind", s.scene);
  material.diffuseColor = Color3.FromHexString(s.world === 3 ? "#b4bcd8" : "#ede5cf");
  material.backFaceCulling = false;
  const birds = Array.from({ length: 5 }, (_, i) => {
    const mesh = MeshBuilder.CreateRibbon(
      "gliding tern",
      {
        pathArray: [
          [
            vec(-0.7, 0.16, 0.07),
            vec(-0.34, 0.2, -0.09),
            vec(0, 0, 0),
            vec(0.34, 0.2, -0.09),
            vec(0.7, 0.16, 0.07),
          ],
          [
            vec(-0.7, 0.16, 0.08),
            vec(-0.32, 0.19, 0.065),
            vec(0, 0.018, 0.19),
            vec(0.32, 0.19, 0.065),
            vec(0.7, 0.16, 0.08),
          ],
        ],
        sideOrientation: Mesh.DOUBLESIDE,
      },
      s.scene,
    );
    mesh.material = material;
    mesh.isPickable = false;
    return { mesh, phase: s.rng.range(0, 6.283), radius: s.rng.range(14, 27), height: 7 + i * 1.21 };
  });
  return (time: number) => {
    for (const b of birds) {
      const a = b.phase + time * 0.098;
      b.mesh.position.set(
        Math.cos(a) * b.radius,
        b.height + Math.sin(time * 0.36 + b.phase) * 0.45,
        Math.sin(a) * b.radius + 12,
      );
      b.mesh.rotation.set(0, -a, Math.sin(a * 0.9) * 0.22);
    }
  };
}

export class LandfallView {
  readonly scene: Scene;
  readonly camera: FreeCamera;
  readonly obstacles: CaveObstacle[];
  readonly shadows: ShadowGenerator;
  private sky: VoyageSky;
  private water: (time: number) => void;
  private landmark: (time: number) => void;
  private birds: (time: number) => void;
  private treasure: ReturnType<typeof buildDig>;
  private time = 0;
  private direction = Vector3.Zero();
  constructor(engine: Engine, world: number, island: GeneratedIsland, seed: number) {
    const scene = (this.scene = new Scene(engine));
    this.camera = new FreeCamera("island explorer", vec(0, 3, -18), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.055;
    this.camera.maxZ = 790;
    this.camera.fov = 1.12;
    const skyLight = new HemisphericLight("light off the sea", Vector3.Up(), scene);
    const sun = new DirectionalLight("coastal sunlight", vec(0.65, -1, 0.46).normalize(), scene);
    sun.position.set(-48, 76, -34);
    sun.shadowFrustumSize = 95;
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = 190;
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    this.shadows.bias = 0.002;
    this.shadows.normalBias = 0.055;
    const scenery = new IslandScenery(scene, world, island.site, seed, this.shadows, island.heightAt),
      style = scenery.style;
    scene.clearColor = Color4.FromHexString(style.fog + "ff");
    scene.fogColor = Color3.FromHexString(style.fog);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0065;
    skyLight.diffuse = Color3.FromHexString("#e3edef");
    skyLight.groundColor = Color3.FromHexString("#88948b");
    skyLight.intensity = 0.84;
    sun.diffuse = Color3.FromHexString(style.sun);
    sun.intensity = world === 0 ? 0.98 : 0.84;
    this.sky = new VoyageSky(scene, world, voyageWeather(world * 10 + 9));
    scenery.terrain();
    this.water = buildLandfallWater(scene, (x, z) => scenery.floor(x, z), style);
    this.landmark = buildLandmark(scenery);
    scenery.populate();
    scenery.finish();
    this.obstacles = scenery.obstacles;
    this.birds = buildBirds(scenery);
    this.treasure = buildDig(scenery);
    this.shadows.getShadowMap()!.refreshRate = 0;
  }
  render(dt: number, walker: WalkingPose, digs: number, reducedMotion = false) {
    this.time += dt;
    this.camera.position.set(walker.x, walker.eyeY + (reducedMotion ? 0 : walker.bob), walker.z);
    const cp = Math.cos(walker.pitch);
    this.direction.set(Math.sin(walker.yaw) * cp, -Math.sin(walker.pitch), Math.cos(walker.yaw) * cp);
    this.camera.setTarget(this.direction.addInPlace(this.camera.position));
    const t = reducedMotion ? 0 : this.time;
    this.sky.update(t, 0);
    this.water(t);
    this.landmark(t);
    this.birds(t);
    this.treasure(digs, dt, t, reducedMotion);
    this.scene.render();
  }
  dispose() {
    this.scene.dispose();
  }
}
