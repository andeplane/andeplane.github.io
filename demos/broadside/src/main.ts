import { GOLD_AREAS } from "./game/goldAreas";
import "@babylonjs/core/Culling/ray.js";
import "@babylonjs/core/Shaders/color.vertex.js";
import "@babylonjs/core/Shaders/color.fragment.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { VoyageSession, generateVoyage, RELICS } from "./game/voyage";
import { readProgress, saveProgress } from "./game/progress";
import { awardVoyage, syncRewards, type VoyageReward } from "./game/rewards";
import { TOTAL_LEVELS, levelUnlocked } from "./game/campaign";
import { Controls } from "./input/controls";
import { CaveWalkControls } from "./input/caveWalk";
import { CaveGesture } from "./input/caveGesture";
import { installGameSurface } from "./input/gameSurface";
import { installFullscreen } from "./ui/fullscreen";
import { GameRenderer } from "./render/renderer";
import { TreasureCave } from "./render/cave";
import type { Harbour } from "./render/harbour";
import { displayRenderScale, configureTextureQuality } from "./render/quality";
import { FixedStepper } from "./sim/world";
import { angleDiff, clamp } from "./sim/math";
import { VoyageHud } from "./ui/voyageHud";
import { arrivalPose } from "./ui/arrival";
import "./ui/voyage.css";
import "./ui/menu.css";
import "./ui/caveWalk.css";
import "./ui/harbour.css";
import "./ui/chart.css";
import "./ui/reward.css";
import "./ui/gameSurface.css";
import "./ui/fullscreen.css";

installGameSurface();

// An utterance started by an older loaded copy can outlive its game state.
// Stop it on reload and exit; this game never creates or queues speech.
const stopLegacySpeech = () => window.speechSynthesis?.cancel();
stopLegacySpeech();
window.addEventListener("pagehide", stopLegacySpeech);

async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const engine = new Engine(
    canvas,
    true,
    { stencil: true, powerPreference: "high-performance" },
    false,
  );
  engine.maxFPS = 60;
  engine.renderEvenInBackground = false;
  configureTextureQuality(engine);
  const quality = () => {
    const rect = canvas.getBoundingClientRect();
    // DEV fixture for checking an actual 3x drawing buffer in a narrow browser.
    const params = new URLSearchParams(location.search);
    const fixtureRatio = import.meta.env.DEV && params.has("qa")
      ? Number(params.get("renderDpr")) : 0;
    const ratio = fixtureRatio >= 1 && fixtureRatio <= 4 ? fixtureRatio : devicePixelRatio;
    engine.setHardwareScalingLevel(displayRenderScale(
      rect.width, rect.height, ratio, engine.getCaps().maxRenderTextureSize,
    ));
    canvas.dataset.renderResolution = `${engine.getRenderWidth()}x${engine.getRenderHeight()}`;
    canvas.dataset.renderPixelRatio = (1 / engine.getHardwareScalingLevel()).toFixed(2);
  };
  quality();
  let storage: Storage | undefined;
  try {
    storage = localStorage;
  } catch {}
  // Development-only visual fixtures. They never read or write the player's save.
  const qaQuery = import.meta.env.DEV
    ? new URLSearchParams(location.search).get("qa")
    : null;
  const qa =
    qaQuery === "collection" || qaQuery === "harbour" ||
    (qaQuery !== null &&
      /^(?:reveal-)?\d+$/.test(qaQuery) &&
      Number(qaQuery.replace("reveal-", "")) < TOTAL_LEVELS);
  if (qa) storage = undefined;
  const progress = readProgress(storage),
    controls = new Controls();
  if (qaQuery === "collection") {
    const cleared = new URLSearchParams(location.search).get("cleared");
    const count =
      cleared !== null && /^\d+$/.test(cleared)
        ? Math.min(TOTAL_LEVELS, Number(cleared))
        : TOTAL_LEVELS;
    progress.voyages = Object.fromEntries(
      Array.from({ length: count }, (_, i) => [i, { stars: 3, gems: 3 }]),
    );
  }
  syncRewards(progress);
  let reward: VoyageReward | undefined;
  const cave = new TreasureCave(engine, !qa);
  cave.refresh(progress);
  let session = new VoyageSession(generateVoyage(0)),
    renderer: GameRenderer | null = null;
  let harbour: Harbour | null = null;
  let mode: "menu" | "cave" | "harbour" | "play" | "arrival" | "result" | "loading" =
      "menu",
    paused = false,
    heading: number | null = null,
    pendingFire = false,
    loadId = 0,
    tapHeading: number | null = null;
  let arrivalTime = 0,
    arrivalInCave = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const curtain = document.createElement("div");
  curtain.className = "reward-curtain";
  curtain.hidden = true;
  curtain.setAttribute("aria-hidden", "true");
  document.body.append(curtain);
  const clearArrival = () => {
    curtain.hidden = true;
    hud.root.classList.remove("arriving");
    hud.root.inert = false;
    arrivalTime = 0;
    arrivalInCave = false;
  };
  const arrive = () => {
    mode = "arrival";
    arrivalTime = 0;
    arrivalInCave = false;
    curtain.style.opacity = "0";
    curtain.hidden = false;
    hud.root.classList.add("arriving");
    hud.root.inert = true;
  };
  const gesture = new CaveGesture(),
    walking = new CaveWalkControls();
  const releaseMouse = () => {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };
  const clearWalking = () => {
    walking.clear();
    releaseMouse();
  };
  const inspect = () => {
    if (mode === "harbour") {
      if (harbour?.atHelm) { menu(); hud.showMenu("worlds"); }
      return;
    }
    const i = cave.nearby;
    if (i !== null) hud.select(i, cave.selectedGoldWorld);
  };
  const home = () => {
    clearArrival();
    gesture.clear();
    clearWalking();
    loadId++;
    mode = "cave";
    cave.endReveal();
    paused = false;
    hud.root.classList.remove("loading-voyage");
    tapHeading = null;
    controls.clear();
    heading = null;
    pendingFire = false;
    hud.paused(false);
    hud.home();
    cave.refresh(progress);
    cave.enter();
    if (import.meta.env.DEV && qaQuery === "collection") {
      const room = new URLSearchParams(location.search).get("room");
      if (room === "vault") {
        cave.walker.x = 0;
        cave.walker.z = 31;
      }
      if (room === "coins") {
        cave.walker.x = -4;
        cave.walker.z = 42.5;
      }
      if (room === "crown") {
        cave.walker.x = -5;
        cave.walker.z = 30;
      }
      if (room === "grotto") {
        cave.walker.x = 27;
        cave.walker.z = 34;
      }
      const bank = Number(new URLSearchParams(location.search).get("bank") ?? -1);
      if (bank >= 0 && bank < 4) {
        const a = GOLD_AREAS[bank]!;
        cave.walker.x = a.x;
        cave.walker.z = a.z - 6.5;
        cave.walker.pitch = -.05;
      }
      cave.walker.feet = 0;
    }
    if (import.meta.env.DEV && mode === "cave")
      canvas.dataset.caveGeometry = JSON.stringify(cave.walkingGeometry);
    stepper.reset();
  };
  const menu = () => {
    clearArrival();
    gesture.clear();
    clearWalking();
    loadId++;
    mode = "menu";
    cave.endReveal();
    paused = false;
    heading = tapHeading = null;
    pendingFire = false;
    controls.clear();
    hud.paused(false);
    hud.root.classList.remove("loading-voyage");
    hud.showMenu();
    stepper.reset();
  };
  const visitShip = async () => {
    clearArrival(); gesture.clear(); clearWalking(); controls.clear();
    const id = ++loadId;
    heading = tapHeading = null; pendingFire = false; paused = false;
    cave.endReveal(); hud.paused(false);
    mode = "loading";
    const { Harbour } = await import("./render/harbour");
    if (id !== loadId) return;
    harbour ??= new Harbour(engine);
    harbour.enter();
    if (qaQuery === "harbour") {
      const spot = new URLSearchParams(location.search).get("spot");
      if (spot === "quay") {
        harbour.walker.x = 20; harbour.walker.z = -3; harbour.walker.feet = 2.4;
        harbour.walker.yaw = -Math.PI / 2; harbour.walker.pitch = -.18;
      }
      if (spot === "town") {
        harbour.walker.x = 41; harbour.walker.z = -34; harbour.walker.feet = 2.4;
        harbour.walker.yaw = 0; harbour.walker.pitch = -.08;
      }
    }
    mode = "harbour"; hud.harbour();
    hud.root.classList.remove("loading-voyage");
    stepper.reset(); canvas.focus();
  };
  const start = async (index: number) => {
    clearArrival();
    gesture.clear();
    clearWalking();
    reward = undefined;
    if (!qa && !levelUnlocked(progress.voyages, index)) return;
    const id = ++loadId;
    mode = "loading";
    cave.endReveal();
    controls.clear();
    heading = null;
    tapHeading = null;
    pendingFire = false;
    paused = false;
    hud.paused(false);
    hud.play(index);
    hud.root.classList.add("loading-voyage");
    renderer?.scene.dispose();
    renderer = null;
    session = new VoyageSession(generateVoyage(index));
    // DEV-only anchored views let us check island detail without racing the ship.
    const islandPreview = qa && new URLSearchParams(location.search).get("island");
    if (islandPreview !== false && islandPreview !== null && /^\d+$/.test(islandPreview)) {
      const island = session.level.islands[Number(islandPreview)];
      if (island) {
        session.player.pos = { x: island.pos.x, z: island.pos.z - island.radius - 20 };
        session.player.heading = 0;
        session.player.sail = 0;
      }
    }
    session.sailColor = progress.paint;
    const next = new GameRenderer(engine, session);
    next.setTitle(false);
    renderer = next;
    const result = await next.loadModels();
    if (id !== loadId) {
      hud.root.classList.remove("loading-voyage");
      return;
    }
    canvas.dataset.models = result.loaded.join(",");
    canvas.dataset.playerModel = result.blackPearl ? "black-pearl" : "galleon";
    // Loading frames may have created fallback views. Rebuild once assets exist.
    next.reset(session);
    stepper.reset();
    mode = "play";
    hud.root.classList.remove("loading-voyage");
    canvas.focus();
  };
  const pause = () => {
    if (mode !== "play") return;
    paused = !paused;
    hud.paused(paused);
    controls.clear();
    heading = null;
    pendingFire = false;
  };
  const hud = new VoyageHud(progress, controls, {
    start: (i) => void start(i),
    home,
    harbour: () => void visitShip(),
    menu,
    overview: () => {
      walking.clear();
      cave.overview();
    },
    caveMove: (r, f) => walking.move(r, f),
    caveJump: () => walking.jump(),
    caveInspect: inspect,
    select: (i, world) => {
      cave.selectedGoldWorld = world;
      clearWalking();
      cave.select(i);
    },
    pause,
    fire: () => {
      if (mode === "play" && !paused) pendingFire = true;
    },
    steer: (h) => {
      heading = h;
      if (h !== null) tapHeading = h;
      if (h !== null) session.player.sail = 2;
    },
    anchor: () => {
      session.player.sail = session.player.sail ? 0 : 2;
    },
  });
  const stepper = new FixedStepper(() => {
    if (mode !== "play" || paused) return;
    let intent = controls.readIntent();
    if (intent.turn) tapHeading = null;
    const direction = heading ?? tapHeading;
    if (direction !== null)
      intent.turn = clamp(
        angleDiff(session.player.heading, direction) * 3,
        -1,
        1,
      );
    if (
      tapHeading !== null &&
      Math.abs(angleDiff(session.player.heading, tapHeading)) < 0.04
    )
      tapHeading = null;
    if (pendingFire) {
      intent.firePort = true;
      intent.fireStarboard = true;
      pendingFire = false;
    }
    renderer!.beforeStep(session);
    session.step(intent);
    renderer!.afterStep(session);
    if (session.events.some((e) => e.type === "rescue")) {
      hud.help(
        "Your crew patched the ship! Keep sailing, Captain!",
        session.elapsed + 6,
      );
    }
    if (session.state === "won" || session.state === "lost") {
      controls.clear();
      heading = null;
      mode = "result";
      if (session.state === "won") {
        reward = awardVoyage(
          progress,
          session.voyage.index,
          session.stars,
          session.gemsFound,
        );
        saveProgress(progress, storage);
        cave.refresh(progress, reward.gold ? Math.floor(session.voyage.index / 10) : null);
        arrive();
      }
      if (session.state === "lost") hud.result(session, reward);
    }
  });
  if (qa)
    hud.root.insertAdjacentHTML(
      "beforeend",
      '<span class="qa-badge">DEVELOPMENT PREVIEW · SAVES DISABLED</span>',
    );
  document.querySelector("#loading")?.remove();
  window.addEventListener("keydown", (e) => {
    if (mode === "cave" || mode === "harbour") {
      if (
        (mode === "harbour" || !cave.inspecting || e.code.startsWith("Arrow")) &&
        walking.keyDown(e.code, performance.now())
      )
        e.preventDefault();
      if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        inspect();
      }
      if (e.code === "Escape") {
        if (mode === "cave" && cave.inspecting) {
          cave.overview();
          hud.overview();
        } else if (document.pointerLockElement === canvas) releaseMouse();
        else menu();
      }
      return;
    }
    if (mode === "menu") {
      if (e.code === "Escape") hud.showMenu("main");
      return;
    }
    if (e.code === "Escape" || e.code === "KeyP") {
      if (!e.repeat) pause();
      return;
    }
    if (mode !== "play" || paused) return;
    if (e.code === "Space" && !e.repeat) pendingFire = true;
    if (controls.keyDown(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    controls.keyUp(e.code);
    walking.keyUp(e.code);
  });
  window.addEventListener("blur", () => {
    gesture.clear();
    clearWalking();
    controls.clear();
    heading = null;
    pendingFire = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearWalking();
    if (document.hidden && mode === "play" && !paused) pause();
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (mode === "cave" || mode === "harbour") {
      canvas.focus();
      if (document.pointerLockElement === canvas) {
        if (mode === "cave") inspect();
        return;
      }
      gesture.down(e.pointerId, e.clientX, e.clientY);
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (mode !== "cave" && mode !== "harbour") return;
    const place = mode === "harbour" ? harbour! : cave;
    if (document.pointerLockElement === canvas) {
      place.look(e.movementX, e.movementY);
      return;
    }
    const action = gesture.move(e.pointerId, e.clientX, e.clientY);
    if (action?.type === "look") place.look(action.dx, action.dy);
    if (mode === "cave" && action?.type === "pinch" && cave.pinch(action.ratio)) hud.overview();
  });
  canvas.addEventListener("pointerup", (e) => {
    if (mode === "harbour") {
      if (document.pointerLockElement === canvas) return;
      const action = gesture.up(e.pointerId, e.clientX, e.clientY);
      if (action?.type === "tap" && e.pointerType === "mouse")
        void canvas.requestPointerLock?.()?.catch(() => {});
      return;
    }
    if (mode === "cave") {
      if (document.pointerLockElement === canvas) return;
      const action = gesture.up(e.pointerId, e.clientX, e.clientY);
      if (action?.type === "tap") {
        const i = cave.pick(action.x, action.y);
        if (i !== null) hud.select(i, cave.selectedGoldWorld);
        else if (e.pointerType === "mouse" && !cave.inspecting) {
          void canvas.requestPointerLock?.()?.catch(() => {});
        }
      }
      return;
    }
    if (mode === "play" && !paused) {
      const ray = renderer!.scene.createPickingRay(
          e.clientX,
          e.clientY,
          null,
          renderer!.rig.camera,
        ),
        d = -ray.origin.y / ray.direction.y,
        pos = ray.origin.add(ray.direction.scale(d));
      if (d > 0) {
        tapHeading = Math.atan2(
          pos.x - session.player.pos.x,
          pos.z - session.player.pos.z,
        );
        session.player.sail = 2;
        renderer!.showDestination(pos.x, pos.z);
      }
    }
  });
  document.addEventListener("pointerlockchange", () => {
    gesture.clear();
    walking.clear();
  });
  canvas.addEventListener("pointercancel", (e) => gesture.cancel(e.pointerId));
  canvas.addEventListener("lostpointercapture", (e) =>
    gesture.cancel(e.pointerId),
  );
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (mode === "cave" && cave.zoom(e.deltaY)) hud.overview();
      else if (mode === "play") renderer?.zoomBy(e.deltaY * 0.035);
    },
    { passive: false },
  );
  const resizeGame = () => {
    quality();
    engine.resize();
    renderer?.resize();
    cave.resize();
  };
  window.addEventListener("resize", resizeGame);
  window.visualViewport?.addEventListener("resize", resizeGame);
  installFullscreen(hud.root, resizeGame);
  engine.onContextLostObservable.add(() => {
    if (mode === "play" && !paused) pause();
  });
  engine.runRenderLoop(() => {
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    if (mode === "arrival") {
      arrivalTime += dt;
      const pose = arrivalPose(arrivalTime, reducedMotion.matches);
      curtain.style.opacity = String(pose.opacity);
      if (pose.inCave && !arrivalInCave) {
        arrivalInCave = true;
        cave.beginReveal(reward!.model, reward!.gold ? Math.floor(session.voyage.index / 10) : null);
        hud.result(session, reward);
        hud.root.classList.remove("arriving");
      }
      // Keep the chest closed while the cave fades in: none of its reveal is lost.
      if (arrivalInCave) cave.render(0, true);
      else renderer?.render(session, 1, dt);
      if (pose.ready) {
        mode = "result";
        clearArrival();
      }
    } else if (mode === "harbour" && harbour) {
      const look = walking.readLook();
      harbour.look(look.right * 500 * dt, look.down * 450 * dt);
      harbour.walk(walking.read(), dt);
      harbour.render(dt);
      hud.harbourWalk(document.pointerLockElement === canvas, harbour.room, harbour.atHelm);
      if (import.meta.env.DEV) {
        canvas.dataset.harbourPosition = [harbour.walker.x, harbour.walker.eyeY, harbour.walker.z].map(n => n.toFixed(2)).join(",");
        canvas.dataset.harbourYaw = harbour.walker.yaw.toFixed(2);
        canvas.dataset.harbourRoom = harbour.room;
      }
    } else if (mode === "play") {
      controls.setPad(window.navigator.getGamepads?.().find((p) => p) ?? null);
      const alpha = paused ? 1 : stepper.advance(dt);
      if (mode === "play") {
        renderer!.render(session, alpha, dt);
        hud.update(session, (x, y, z) => renderer!.project(x, y, z));
      }
    } else if (mode === "result" && session.state === "lost" && renderer) {
      renderer.beforeStep(session);
      session.step(undefined, dt);
      renderer.afterStep(session);
      renderer.render(session, 1, dt);
    } else if (mode === "loading" && renderer) {
      renderer.render(session, 1, dt);
    } else if (mode !== "menu") {
      if (mode === "cave") {
        const look = walking.readLook();
        cave.look(look.right * 500 * dt, look.down * 450 * dt);
        cave.walk(walking.read(), dt);
      }
      cave.render(dt, mode === "result");
      if (mode === "cave") {
        hud.caveWalk(
          cave.nearby,
          document.pointerLockElement === canvas,
          cave.inspecting,
          cave.room,
        );
        canvas.dataset.caveCoinCounts = cave.coinCounts.join(",");
        canvas.dataset.cavePosition = [
          cave.walker.x,
          cave.walker.eyeY,
          cave.walker.z,
        ]
          .map((n) => n.toFixed(2))
          .join(",");
        if (import.meta.env.DEV) {
          canvas.dataset.caveLanterns = cave.activeLanterns;
          canvas.dataset.caveGoldMeshes = cave.scene
            .getActiveMeshes()
            .data.filter((m) => m?.name.endsWith("settled gold coins"))
            .map((m) => m.name)
            .join(",");
        }
        canvas.dataset.caveYaw = cave.walker.yaw.toFixed(2);
        canvas.dataset.caveView = cave.inspecting ? "inspect" : "walk";
      }
      if (mode === "result" && session.state === "won") {
        const p = cave.revealPose;
        hud.reveal(p.time, p.discovered, p.ready);
        hud.depositing(!!reward?.gold && p.time > 5.3);
      }
    }
    canvas.dataset.goldPhysics = String(cave.goldPhysicsActive);
    canvas.dataset.restingCoins = cave.restingCoinCounts.join(",");
    canvas.dataset.coinCounts = cave.coinCounts.join(",");
    canvas.dataset.fps = String(Math.round(engine.getFps()));
    canvas.dataset.state = mode === "play" ? session.state : mode;
    canvas.dataset.audio = "disabled";
  });
  if (qa && qaQuery?.startsWith("reveal-")) {
    const index = Number(qaQuery.slice(7));
    session = new VoyageSession(generateVoyage(index));
    session.state = "won";
    session.stars = 3;
    session.gemsFound = 2;
    for (let i = 0; i < index; i++) awardVoyage(progress, i, 3, 2);
    reward = awardVoyage(progress, index, 3, 2);
    mode = "result";

    hud.result(session, reward);
    cave.refresh(progress, Math.floor(index / 10));
    cave.beginReveal(reward.model, Math.floor(index / 10));
  } else if (qaQuery === "collection") home();
  else if (qaQuery === "harbour") void visitShip();
  else if (qa) void start(Number(qaQuery));
}
void main().catch((err) => {
  console.error(err);
  const el = document.querySelector("#loading");
  if (el)
    el.textContent = "The sea could not load. Please reload to try again.";
});
