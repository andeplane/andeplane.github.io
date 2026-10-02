import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { VoyageSession, generateVoyage, RELICS } from "./game/voyage";
import { readProgress, saveProgress } from "./game/progress";
import { awardVoyage, syncRewards, type VoyageReward } from "./game/rewards";
import { TOTAL_LEVELS, levelUnlocked } from "./game/campaign";
import { Controls } from "./input/controls";
import { CaveWalkControls } from "./input/caveWalk";
import { CaveGesture } from "./input/caveGesture";
import { GameRenderer } from "./render/renderer";
import { TreasureCave } from "./render/cave";
import { FixedStepper } from "./sim/world";
import { angleDiff, clamp } from "./sim/math";
import { VoyageHud } from "./ui/voyageHud";
import { Sound } from "./audio/sound";
import "./ui/voyage.css";
import "./ui/menu.css";
import "./ui/caveWalk.css";
import "./ui/chart.css";

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
  const quality = () =>
    engine.setHardwareScalingLevel(
      Math.max(1, devicePixelRatio / (innerWidth < 700 ? 1.3 : 1.65)),
    );
  quality();
  let storage: Storage | undefined;
  try {
    storage = localStorage;
  } catch {}
  // Development-only visual fixtures. They never read or write the player's save.
  const forceMute = new URLSearchParams(location.search).get("mute") === "true";
  const qaQuery = import.meta.env.DEV
    ? new URLSearchParams(location.search).get("qa")
    : null;
  const qa =
    qaQuery === "collection" ||
    (qaQuery !== null &&
      /^(?:reveal-)?\d+$/.test(qaQuery) &&
      Number(qaQuery.replace("reveal-", "")) < TOTAL_LEVELS);
  if (qa) storage = undefined;
  const progress = readProgress(storage),
    controls = new Controls(),
    sound = new Sound(forceMute);
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
  // Audio is explicitly opt-in on every launch, including development reloads.
  progress.muted = true;
  sound.muted = true;
  sound.voice = progress.narration;
  const cave = new TreasureCave(engine);
  cave.refresh(progress);
  let session = new VoyageSession(generateVoyage(0)),
    renderer: GameRenderer | null = null;
  let mode: "menu" | "cave" | "play" | "result" | "loading" = "menu",
    paused = false,
    heading: number | null = null,
    pendingFire = false,
    loadId = 0,
    tapHeading: number | null = null;
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
    const i = cave.nearby;
    if (i !== null) hud.select(i);
  };
  const home = () => {
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
      cave.walker.feet = 0;
    }
    if (import.meta.env.DEV && mode === "cave")
      canvas.dataset.caveGeometry = JSON.stringify(cave.walkingGeometry);
    sound.pause(false);
    stepper.reset();
  };
  const menu = () => {
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
    sound.pause(false);
    stepper.reset();
  };
  const start = async (index: number) => {
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
    void sound.unlock();
    renderer?.scene.dispose();
    renderer = null;
    sound.resetStorm();
    session = new VoyageSession(generateVoyage(index));
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
    sound.pause(false);
    sound.say(session.level.intro);
    canvas.focus();
  };
  const pause = () => {
    if (mode !== "play") return;
    paused = !paused;
    hud.paused(paused);
    controls.clear();
    heading = null;
    pendingFire = false;
    sound.pause(paused);
  };
  const hud = new VoyageHud(progress, controls, {
    start: (i) => void start(i),
    home,
    menu,
    overview: () => {
      walking.clear();
      cave.overview();
    },
    caveMove: (r, f) => walking.move(r, f),
    caveJump: () => walking.jump(),
    caveInspect: inspect,
    narration: () => {
      progress.narration = !progress.narration;
      sound.voice = progress.narration;
      saveProgress(progress, storage);
      return progress.narration;
    },
    select: (i) => {
      clearWalking();
      cave.select(i);
      sound.click();
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
      sound.click();
    },
    mute: () => {
      if (forceMute) return true;
      void sound.unlock();
      progress.muted = sound.toggle();
      saveProgress(progress, storage);
      return progress.muted;
    },
  });
  hud.root.addEventListener("click", () => {
    void sound.unlock().then(() => sound.click());
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
    sound.handle(session.simEvents, session.events, session.player.id);
    if (session.events.some((e) => e.type === "rescue")) {
      hud.help(
        "Pip patched your ship! Keep sailing, Captain!",
        session.elapsed + 6,
      );
      sound.say("Pip patched your ship! Keep sailing, Captain!");
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
        cave.refresh(progress);
        cave.beginReveal(reward.model);
        sound.chest();
      } else {
        sound.say("Your ship sank. Try again and steer clear of the danger.");
      }
      hud.result(session, reward);
    }
  });
  if (qa)
    hud.root.insertAdjacentHTML(
      "beforeend",
      '<span class="qa-badge">DEVELOPMENT PREVIEW · SAVES DISABLED</span>',
    );
  document.querySelector("#loading")?.remove();
  window.addEventListener("keydown", (e) => {
    if (mode === "cave") {
      if (!cave.inspecting && walking.keyDown(e.code, performance.now()))
        e.preventDefault();
      if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        inspect();
      }
      if (e.code === "Escape") {
        if (cave.inspecting) {
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
    if (mode === "cave") {
      canvas.focus();
      if (document.pointerLockElement === canvas) {
        inspect();
        return;
      }
      gesture.down(e.pointerId, e.clientX, e.clientY);
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (mode !== "cave") return;
    if (document.pointerLockElement === canvas) {
      cave.look(e.movementX, e.movementY);
      return;
    }
    const action = gesture.move(e.pointerId, e.clientX, e.clientY);
    if (action?.type === "look") cave.look(action.dx, action.dy);
    if (action?.type === "pinch" && cave.pinch(action.ratio)) hud.overview();
  });
  canvas.addEventListener("pointerup", (e) => {
    if (mode === "cave") {
      if (document.pointerLockElement === canvas) return;
      const action = gesture.up(e.pointerId, e.clientX, e.clientY);
      if (action?.type === "tap") {
        const i = cave.pick(action.x, action.y);
        if (i !== null) hud.select(i);
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
  canvas.addEventListener("contextmenu", (e) => {
    if (mode === "cave") e.preventDefault();
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
  window.addEventListener("resize", () => {
    quality();
    engine.resize();
    renderer?.resize();
    cave.resize();
  });
  engine.onContextLostObservable.add(() => {
    if (mode === "play" && !paused) pause();
  });
  engine.runRenderLoop(() => {
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    if (mode === "play") {
      controls.setPad(window.navigator.getGamepads?.().find((p) => p) ?? null);
      const alpha = paused ? 1 : stepper.advance(dt);
      if (mode === "play") {
        renderer!.render(session, alpha, dt);
        if (!paused) sound.storm(session.chapter, session.elapsed);
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
      if (mode === "cave") cave.walk(walking.read(), dt);
      const before = cave.revealPose;
      cave.render(dt, mode === "result");
      if (mode === "cave") {
        hud.caveWalk(
          cave.nearby,
          document.pointerLockElement === canvas,
          cave.inspecting,
          cave.room,
        );
        canvas.dataset.cavePosition = [
          cave.walker.x,
          cave.walker.eyeY,
          cave.walker.z,
        ]
          .map((n) => n.toFixed(2))
          .join(",");
        if (import.meta.env.DEV)
          canvas.dataset.caveGoldMeshes = cave.scene
            .getActiveMeshes()
            .data.filter((m) => m?.name.startsWith("dense loose"))
            .map((m) => m.name)
            .join(",");
        canvas.dataset.caveYaw = cave.walker.yaw.toFixed(2);
        canvas.dataset.caveView = cave.inspecting ? "inspect" : "walk";
      }
      if (mode === "result" && session.state === "won") {
        const p = cave.revealPose;
        hud.reveal(p.time, p.discovered, p.ready);
        if (p.opening && !before.opening) sound.chestOpen();
        if (p.discovered && !before.discovered) {
          sound.cheer();
          sound.say(`You found ${RELICS[reward?.model ?? 0]!.name}!`);
        }
      }
    }
    sound.ambience(mode, dt);
    canvas.dataset.fps = String(Math.round(engine.getFps()));
    canvas.dataset.state = mode === "play" ? session.state : mode;
    canvas.dataset.audio = sound.state;
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
    cave.refresh(progress);
    cave.beginReveal(reward.model);
  } else if (qaQuery === "collection") home();
  else if (qa) void start(Number(qaQuery));
}
void main().catch((err) => {
  console.error(err);
  const el = document.querySelector("#loading");
  if (el)
    el.textContent = "The sea could not load. Please reload to try again.";
});
