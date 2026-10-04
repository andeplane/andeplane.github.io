import { antialiasSamples, isPhoneRendering } from "./quality";
import { Scene } from "@babylonjs/core/scene.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { CaveWalker, type WalkIntent } from "../input/caveWalk";
import { harbourFloor, harbourWalkable, harbourObstacles, harbourRoom } from "../input/harbourLayout";
import { Ocean } from "./water";
import { buildHarbourScenery } from "./harbourScenery";

/** A quiet dockside world shares the cave's grounded first-person controller. */
export class Harbour {
  readonly scene: Scene;
  readonly walker = new CaveWalker(harbourObstacles(), harbourFloor, harbourWalkable);
  readonly camera: FreeCamera;
  private ocean: Ocean;
  private animate: (time: number) => void;
  private time = 0;
  constructor(engine: Engine) {
    const s = this.scene = new Scene(engine);
    s.clearColor = Color4.FromHexString("#667c85ff");
    s.fogMode = Scene.FOGMODE_EXP2; s.fogDensity = 0.0035;
    s.fogColor = Color3.FromHexString("#667c85");
    this.camera = new FreeCamera("aboard the Pearl", new Vector3(2, 8, -19), s);
    this.camera.inputs.clear(); this.camera.minZ = 0.06; this.camera.maxZ = 700;
    this.camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED; this.camera.fov = 1.25;
    const sky = new HemisphericLight("harbour blue hour", new Vector3(0, 1, 0), s);
    sky.diffuse = Color3.FromHexString("#bfccd4"); sky.groundColor = Color3.FromHexString("#48413b"); sky.intensity = 0.85;
    const sun = new DirectionalLight("warm harbour sunset", new Vector3(-0.6, -0.7, 0.25).normalize(), s);
    sun.position.set(60, 80, -50); sun.diffuse = Color3.FromHexString("#ffcf92"); sun.intensity = 1.5;
    sun.shadowFrustumSize = 180; sun.shadowMinZ = 1; sun.shadowMaxZ = 250;
    const shadows = new ShadowGenerator(2048, sun);
    shadows.usePercentageCloserFiltering = true; shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    shadows.bias = 0.003; shadows.normalBias = 0.18;
    this.ocean = new Ocean(s, [], s.fogDensity); this.ocean.setChapter(0);
    this.animate = buildHarbourScenery(s, shadows);
    // The harbour and sun are stationary. Keep a stable cached shadow map.
    shadows.getShadowMap()!.refreshRate = 0;
    const pipeline = new DefaultRenderingPipeline("harbour lantern glow", !isPhoneRendering(engine), s, [this.camera]);
    pipeline.bloomEnabled = true; pipeline.bloomThreshold = 0.8;
    pipeline.bloomWeight = 0.12; pipeline.bloomKernel = 32; pipeline.bloomScale = 0.5;
    pipeline.samples = antialiasSamples(engine);
    pipeline.fxaaEnabled = true; s.imageProcessingConfiguration.exposure = 1.1;
    this.enter();
  }
  enter(): void {
    this.walker.reset(); this.walker.x = 2; this.walker.z = -19;
    this.walker.feet = harbourFloor(2, -19); this.walker.yaw = 0.62; this.walker.pitch = 0.1;
  }
  get room(): string { return harbourRoom(this.walker.x, this.walker.z); }
  get atHelm(): boolean { return Math.hypot(this.walker.x, this.walker.z + 21) < 3.5; }
  walk(intent: WalkIntent, dt: number): void { this.walker.step(intent, dt); }
  look(dx: number, dy: number): void { this.walker.look(dx, dy); }
  render(dt: number): void {
    this.time += dt; this.animate(this.time);
    const w = this.walker;
    this.camera.position.set(w.x, w.eyeY + w.bob, w.z);
    this.camera.setTarget(this.camera.position.add(new Vector3(
      Math.sin(w.yaw) * Math.cos(w.pitch), -Math.sin(w.pitch), Math.cos(w.yaw) * Math.cos(w.pitch),
    )));
    this.ocean.update(this.time, this.camera.position, w, []);
    this.scene.render();
  }
}
