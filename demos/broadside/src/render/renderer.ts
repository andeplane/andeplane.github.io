import { antialiasSamples, isPhoneRendering } from "./quality";
import "@babylonjs/core/Shaders/postprocess.vertex.js";
import "@babylonjs/core/Shaders/imageProcessing.fragment.js";
import "@babylonjs/core/Shaders/rgbdDecode.fragment.js";
import "@babylonjs/core/Shaders/bloomMerge.fragment.js";
import "@babylonjs/core/Shaders/extractHighlights.fragment.js";
import "@babylonjs/core/Shaders/kernelBlur.vertex.js";
import "@babylonjs/core/Shaders/kernelBlur.fragment.js";
import "@babylonjs/core/Shaders/fxaa.vertex.js";
import "@babylonjs/core/Shaders/fxaa.fragment.js";
import "@babylonjs/core/Shaders/sharpen.fragment.js";
import "@babylonjs/core/Shaders/pass.fragment.js";
import "@babylonjs/core/Shaders/depthBoxBlur.fragment.js";
import "@babylonjs/core/Shaders/default.vertex.js";
import "@babylonjs/core/Shaders/default.fragment.js";
import "@babylonjs/core/Shaders/pbr.vertex.js";
import "@babylonjs/core/Shaders/pbr.fragment.js";
import "@babylonjs/core/Shaders/shadowMap.vertex.js";
import "@babylonjs/core/Shaders/shadowMap.fragment.js";
import "@babylonjs/core/Shaders/particles.vertex.js";
import "@babylonjs/core/Shaders/particles.fragment.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { type InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import { type Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VoyageSession } from "../game/voyage";
import { VoyageView } from "./voyageView";
import type { Session } from "../game/session";
import { sideVector } from "../sim/cannons";
import { headingTo } from "../sim/math";
import { sailEfficiency } from "../sim/wind";
import { AdventureView } from "./adventureView";
import { Effects } from "./effects";
import { buildIslands, type IslandsView } from "./islands";
import { Ocean } from "./water";
import { WeatherView } from "./weather";
import { PALETTE, SUN_DIRECTION } from "./palette";
import { ShipView } from "./shipView";
import { ShipModels } from "./shipModels";
import { worldStyle } from "./worldStyle";
import { VoyageSky } from "./voyageSky";
import { CaptainCamera } from "./captainCamera";
import { Camera } from "@babylonjs/core/Cameras/camera.js";

const FOG_DENSITY = 0.0014;
const CAMERA_PITCH = (49 * Math.PI) / 180;

/** Smooth top-down follow camera with look-ahead, zoom and screen shake. */
class CameraRig {
  readonly camera: FreeCamera;
  zoom = 92;
  title = true;
  actionTarget: { x: number; z: number } | null = null;
  private currentZoom = 92;
  private readonly target = new Vector3();
  private shake = 0;

  constructor(scene: Scene) {
    this.camera = new FreeCamera("camera", new Vector3(0, 80, -60), scene);
    this.camera.inputs.clear();
    this.camera.fov = 0.78;
    this.camera.minZ = 1;
    this.camera.maxZ = 1500;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  snap(x: number, z: number): void {
    this.target.set(x, 0, z);
  }
  shift(x: number, z: number): void {
    this.target.x += x; this.target.z += z;
    this.camera.position.x += x; this.camera.position.z += z;
  }

  update(dt: number, x: number, z: number, vx: number, vz: number): void {
    const portrait = innerWidth < 600;
    const look = this.title
      ? new Vector3(x - (portrait ? 4 : 28), 1, z + (portrait ? 22 : 2))
      : new Vector3(x + vx * 0.6, 0, z + vz * 1.2 + 10);
    if (!this.title && portrait && this.actionTarget) {
      look.x = x + (this.actionTarget.x - x) * 0.42;
      look.z = z + (this.actionTarget.z - z) * 0.42;
    }
    Vector3.LerpToRef(this.target, look, 1 - Math.exp(-dt * 2.5), this.target);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake;
    const jitter = new Vector3(
      (Math.random() - 0.5) * s,
      (Math.random() - 0.5) * s,
      (Math.random() - 0.5) * s,
    );
    const pitch = this.title ? 0.67 : CAMERA_PITCH;
    const desiredZoom = this.title
      ? portrait
        ? 97
        : 76
      : this.actionTarget && portrait
        ? Math.max(
            this.zoom,
            105 +
              Math.abs(this.actionTarget.x - x) * 1.35 +
              Math.abs(this.actionTarget.z - z) * 0.3,
          )
        : this.zoom;
    this.currentZoom +=
      (desiredZoom - this.currentZoom) * Math.min(1, dt * 2.5);
    const zoom = this.currentZoom;
    const offset = new Vector3(
      this.title && !portrait ? 18 : 0,
      Math.sin(pitch) * zoom,
      -Math.cos(pitch) * zoom,
    );
    this.camera.position
      .copyFrom(this.target)
      .addInPlace(offset)
      .addInPlace(jitter);
    this.camera.setTarget(this.target.add(jitter.scale(0.5)));
  }

  get focus(): Vector3 {
    return this.target;
  }
}

export class GameRenderer {
  readonly scene: Scene;
  readonly rig: CameraRig;
  readonly captainCamera = new CaptainCamera();
  private readonly ocean: Ocean;
  private readonly islands: IslandsView;
  private readonly effects: Effects;
  private readonly shadows: ShadowGenerator;
  private readonly sun: DirectionalLight;
  private readonly sky: HemisphericLight;
  private weatherView?: WeatherView;
  private skyView?: VoyageSky;
  private inspectionIsland?: { pos: { x: number; z: number }; radius: number };
  private sunStrength = 1.35;
  private skyStrength = 0.9;
  private readonly views = new Map<number, ShipView>();
  private readonly ballTemplate: Mesh;
  private readonly ballPool: InstancedMesh[] = [];
  private readonly activeBalls = new Map<number, InstancedMesh>();
  private time = 0;
  private beforePosition = { x: 0, z: 0 };
  private lastChapter = -1;
  private readonly adventure: AdventureView;
  private readonly models: ShipModels;
  private voyageView?: VoyageView;

  constructor(
    readonly engine: Engine,
    session: Session,
  ) {
    const scene = (this.scene = new Scene(engine));
    this.models = new ShipModels(scene);
    scene.clearColor = Color4.FromColor3(PALETTE.fog, 1);
    scene.ambientColor = PALETTE.ambient;
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = PALETTE.fog;
    scene.fogDensity = FOG_DENSITY;

    this.rig = new CameraRig(scene);

    const hemi = this.sky = new HemisphericLight("sky", new Vector3(0.2, 1, -0.3), scene);
    hemi.diffuse = Color3.FromHexString("#a8c1d7");
    hemi.groundColor = Color3.FromHexString("#3d5a80");
    hemi.intensity = 0.9;

    this.sun = new DirectionalLight(
      "sun",
      new Vector3(
        SUN_DIRECTION.x,
        SUN_DIRECTION.y,
        SUN_DIRECTION.z,
      ).normalize(),
      scene,
    );
    this.sun.diffuse = PALETTE.sun;
    this.sun.intensity = 1.35;
    this.sun.shadowFrustumSize = 180;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 500;
    this.shadows = new ShadowGenerator(
      isPhoneRendering(engine) ? 1024 : 2048,
      this.sun,
    );
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = isPhoneRendering(engine) ? ShadowGenerator.QUALITY_LOW : ShadowGenerator.QUALITY_MEDIUM;
    this.shadows.bias = 0.0015;
    this.shadows.normalBias = 0.02;
    this.shadows.darkness = 0.25;

    this.ocean = new Ocean(scene, session.level.islands, FOG_DENSITY, session.world.periodic ? session.level.bounds : undefined);
    if (session instanceof VoyageSession)
      this.ocean.setWhirlpools(session.voyage.whirlpools);
    this.islands = buildIslands(
      scene,
      session.level.islands,
      this.shadows,
      session.level.seed,
      session instanceof VoyageSession ? session.voyage.pack : session.chapter,
      session.world.periodic ? session.player.pos : undefined,
      session.world.periodic ? session.level.bounds : undefined,
    );
    this.effects = new Effects(scene);
    this.adventure = new AdventureView(scene, session, this.shadows);
    if (session instanceof VoyageSession) {
      this.voyageView = new VoyageView(scene, session);
      this.weatherView = new WeatherView(scene, session.voyage.weather, session.level.seed);
      this.skyView = new VoyageSky(scene, session.voyage.pack, session.voyage.weather);
      if (import.meta.env.DEV) {
        const params = new URLSearchParams(location.search);
        if (params.has("qa") && params.get("preview") === "island")
          this.inspectionIsland = session.level.islands[Number(params.get("island") ?? 0)];
      }
    }

    const ballMat = new StandardMaterial("ball", scene);
    ballMat.diffuseColor = Color3.FromHexString("#1b1b1f");
    ballMat.specularColor = new Color3(0.6, 0.6, 0.6);
    this.ballTemplate = MeshBuilder.CreateSphere(
      "ball",
      { diameter: 0.75, segments: 8 },
      scene,
    );
    this.ballTemplate.material = ballMat;
    this.ballTemplate.isVisible = false;

    const pipeline = new DefaultRenderingPipeline("post", !isPhoneRendering(engine), scene, [
      this.rig.camera,
    ]);
    pipeline.samples = antialiasSamples(engine);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.82;
    pipeline.bloomWeight = 0.16;
    pipeline.bloomKernel = isPhoneRendering(engine) ? 32 : 64;
    pipeline.bloomScale = isPhoneRendering(engine) ? 0.25 : 0.5;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType =
      ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure = 1.05;
    pipeline.imageProcessing.contrast = 1.05;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 0.65;
    pipeline.imageProcessing.vignetteColor = new Color4(0.02, 0.05, 0.1, 0);
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.25;

    this.resize();
    this.reset(session);
  }

  /** Load Blender ship models; classes without a .glb use the procedural fallback. */
  loadModels() {
    return this.models.load();
  }

  /** Rebuild ship views after a restart. */
  reset(session: Session): void {
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    for (const b of this.activeBalls.values()) this.releaseBall(b);
    this.activeBalls.clear();
    this.rig.snap(session.player.pos.x, session.player.pos.z);
  }

  private viewFor(session: Session, shipId: number): ShipView | undefined {
    let view = this.views.get(shipId);
    const ship = session.world.getShip(shipId);
    if (!ship) return view;
    if (!view) {
      const livery =
        ship.team === "player"
          ? "player"
          : session.bossIds.has(ship.id)
            ? "boss"
            : "pirate";
      view = new ShipView(
        this.scene,
        this.models,
        this.effects,
        this.shadows,
        ship.id,
        ship,
        livery,
      );
      this.views.set(shipId, view);
    }
    return view;
  }

  /** Must run before every sim step, for interpolation. */
  beforeStep(session: Session): void {
    this.beforePosition = { ...session.player.pos };
    for (const ship of session.world.ships)
      this.viewFor(session, ship.id)?.capture(ship);
  }

  /** Must run after every sim step: react to what just happened. */
  afterStep(session: Session): void {
    const player = session.player;
    if (session.world.periodic && Math.hypot(player.pos.x - this.beforePosition.x, player.pos.z - this.beforePosition.z) > session.level.bounds) {
      this.rig.shift(player.pos.x - this.beforePosition.x, player.pos.z - this.beforePosition.z);
      const view = this.viewFor(session, player.id);
      view?.capture(player); view?.capture(player);
    }
    for (const e of session.simEvents) {
      switch (e.type) {
        case "fire": {
          const ship = session.world.getShip(e.shipId);
          if (!ship) {
            this.effects.broadside(e.muzzles, 0);
            break;
          }
          const out = sideVector(ship.heading, e.side);
          this.effects.broadside(e.muzzles, headingTo({ x: 0, z: 0 }, out));
          const d = Math.hypot(
            ship.pos.x - player.pos.x,
            ship.pos.z - player.pos.z,
          );
          this.rig.addShake(
            ship.id === player.id ? 0.55 : Math.max(0, 0.4 - d / 200),
          );
          break;
        }
        case "splash":
          this.effects.splashAt(e.x, e.z);
          break;
        case "hit":
          this.effects.hitAt(e.x, e.y, e.z);
          if (e.shipId === player.id) this.rig.addShake(0.8);
          break;
        case "sunk": {
          const ship = session.world.getShip(e.shipId);
          if (ship) this.effects.sinkAt(ship.pos.x, ship.pos.z);
          break;
        }
        case "removed":
          this.views.get(e.shipId)?.dispose();
          this.views.delete(e.shipId);
          break;
        case "bump":
          this.effects.splashAt(e.x, e.z);
          if (e.shipId === player.id) this.rig.addShake(0.5);
          break;
      }
    }
    for (const e of session.events)
      if (e.type === "gold") this.effects.goldAt(e.x, e.z);
  }

  render(session: Session, alpha: number, dt: number): void {
    this.time += dt;
    if (this.lastChapter !== session.chapter) {
      this.lastChapter = session.chapter;
      const pack = session instanceof VoyageSession ? session.voyage.pack : session.chapter;
      this.ocean.setChapter(pack);
      const weather = session instanceof VoyageSession ? session.voyage.weather : undefined;
      const style = worldStyle(pack), storm = weather?.kind === "storm";
      const rain = weather?.rain ?? 0;
      this.sunStrength = style.sunStrength * (storm ? .4 : rain ? .58 : 1);
      this.skyStrength = style.skyStrength * (storm ? .9 : 1);
      this.sun.diffuse = Color3.FromHexString(rain ? style.sky : style.sun);
      this.sky.diffuse = Color3.FromHexString(style.sky);
      this.sky.groundColor = Color3.FromHexString(style.ground);
      this.scene.ambientColor = Color3.FromHexString(style.ambient);
      this.scene.fogColor = Color3.FromHexString(style.fog).scale(storm ? .78 : 1);
      this.scene.clearColor = Color4.FromColor3(this.scene.fogColor, 1);
      this.scene.fogDensity = rain ? .0028 : FOG_DENSITY;
      if (weather) this.ocean.setWeather(weather);
    }
    const world = session.world;
    const player = session.player;
    const enemy = session.enemies
      .filter((s) => s.alive)
      .sort(
        (a, b) =>
          Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z) -
          Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z),
      )[0];
    this.rig.actionTarget =
      enemy &&
      Math.hypot(enemy.pos.x - player.pos.x, enemy.pos.z - player.pos.z) < 72
        ? enemy.pos
        : null;
    const pv = Math.max(0, player.speed);
    this.rig.update(
      dt,
      player.pos.x,
      player.pos.z,
      Math.sin(player.heading) * pv,
      Math.cos(player.heading) * pv,
    );

    for (const ship of world.ships) {
      const view = this.viewFor(session, ship.id);
      if (ship.team === "player") view?.setCaptainView(this.captainCamera.enabled);
      const aiming = session.brains.get(ship.id)?.aiming ?? null;
      view?.update(
        ship,
        alpha,
        this.time,
        dt,
        aiming,
        sailEfficiency(ship.heading, world.wind),
        session instanceof VoyageSession ? session.voyage.weather.waves : 1,
      );
      if (view && session instanceof VoyageSession) view.showRange = false;
      if (ship.team === "player")
        view?.setSailColor(
          session instanceof VoyageSession ? "#191d1c" : session.sailColor,
        );
    }

    this.rig.camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
    this.rig.camera.fov = .78;
    this.rig.camera.minZ = 1;
    const playerView = this.views.get(player.id);
    if (playerView) this.captainCamera.apply(this.rig.camera, playerView, dt);
    if (this.inspectionIsland && !this.captainCamera.enabled) {
      const island = this.inspectionIsland, r = island.radius;
      this.rig.camera.position.set(island.pos.x + r * .25, r * 1.6 + 22, island.pos.z - r * 2.2 - 26);
      this.rig.camera.setTarget(new Vector3(island.pos.x, 5, island.pos.z));
    }

    // Cannonballs.
    const seen = new Set<number>();
    for (const b of world.balls) {
      seen.add(b.id);
      let inst = this.activeBalls.get(b.id);
      if (!inst) {
        inst =
          this.ballPool.pop() ??
          this.ballTemplate.createInstance(`ball-${b.id}`);
        inst.isVisible = true;
        this.activeBalls.set(b.id, inst);
      }
      inst.position.set(b.pos.x, b.pos.y, b.pos.z);
    }
    for (const [id, inst] of this.activeBalls) {
      if (seen.has(id)) continue;
      this.releaseBall(inst);
      this.activeBalls.delete(id);
    }

    // Keep the shadow frustum centred on the action.
    const focus = this.rig.focus;
    this.sun.position = focus.subtract(this.sun.direction.scale(200));

    const flash = this.weatherView?.update(this.time, focus, world.wind) ?? 0;
    this.sun.intensity = this.sunStrength + flash * 1.1;
    this.sky.intensity = this.skyStrength + flash * 0.6;
    this.ocean.setFlash(flash);
    this.skyView?.update(this.time, flash);

    this.ocean.update(
      this.time,
      this.rig.camera.position,
      focus,
      world.ships.map((s) => ({
        x: s.pos.x,
        z: s.pos.z,
        heading: s.heading,
        length: s.alive ? s.spec.length : 0,
      })),
    );
    this.islands.update(this.time, world.wind, session.player.pos);
    if (import.meta.env.DEV) this.engine.getRenderingCanvas()!.dataset.activeIslands = String(this.islands.activeCount);
    this.effects.update(dt);
    this.adventure.update(session, this.time, dt);
    this.voyageView?.update(this.time);
    this.scene.render();
  }

  setTitle(title: boolean): void {
    this.rig.title = title;
  }
  resize(): void {
    this.rig.zoom = innerWidth < 600 ? 112 : innerHeight < 560 ? 98 : 92;
  }
  showDestination(x: number, z: number): void {
    this.adventure.showDestination(x, z);
  }

  private releaseBall(inst: InstancedMesh): void {
    inst.isVisible = false;
    this.ballPool.push(inst);
  }

  /** World position to CSS pixels, for HUD elements that track ships. */
  project(
    x: number,
    y: number,
    z: number,
  ): { x: number; y: number; visible: boolean } {
    const engine = this.engine;
    const p = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.rig.camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      ),
    );
    const scale = engine.getHardwareScalingLevel();
    return { x: p.x * scale, y: p.y * scale, visible: p.z > 0 && p.z < 1 };
  }

  zoomBy(delta: number): void {
    this.rig.zoom = Math.min(170, Math.max(50, this.rig.zoom + delta));
  }
}
