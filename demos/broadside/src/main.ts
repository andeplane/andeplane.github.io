import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { VoyageSession, generateVoyage, RELICS } from "./game/voyage";
import { readProgress, saveProgress } from "./game/progress";
import { Controls } from "./input/controls";
import { GameRenderer } from "./render/renderer";
import { TreasureCave } from "./render/cave";
import { FixedStepper } from "./sim/world";
import { angleDiff, clamp } from "./sim/math";
import { VoyageHud } from "./ui/voyageHud";
import { Sound } from "./audio/sound";
import "./ui/voyage.css";

async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const engine = new Engine(
    canvas,
    true,
    { stencil: true, powerPreference: "high-performance" },
    false,
  );
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
  const qaQuery = import.meta.env.DEV
    ? new URLSearchParams(location.search).get("qa")
    : null;
  const qa =
    qaQuery === "collection" ||
    (qaQuery !== null && /^(?:[0-9]|1[01]|reveal-(?:[0-9]|1[01]))$/.test(qaQuery));
  if (qa) storage = undefined;
  const progress = readProgress(storage),
    controls = new Controls(),
    sound = new Sound();
  if (qaQuery === "collection") {
    progress.relics = RELICS.map((_, i) => i);
    progress.voyages = Object.fromEntries(
      RELICS.map((_, i) => [i, { stars: 3, gems: 3 }]),
    );
  }
  sound.muted = progress.muted;
  sound.voice = progress.narration;
  const cave = new TreasureCave(engine);
  cave.refresh(progress.relics);
  let session = new VoyageSession(generateVoyage(0)),
    renderer: GameRenderer | null = null;
  let mode: "cave" | "play" | "result" | "loading" = "cave",
    paused = false,
    heading: number | null = null,
    pendingFire = false,
    loadId = 0,
    tapHeading: number | null = null;
  const home = () => {
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
    cave.refresh(progress.relics);
    cave.select(hud.selected);
    sound.pause(false);
    stepper.reset();
  };
  const start = async (index: number) => {
    if (!qa && index > 0 && !progress.voyages[index - 1]) return;
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
    stepper.reset();
    mode = "play";
    hud.root.classList.remove("loading-voyage");
    sound.pause(false);
    sound.say(
      index === 0
        ? "Ahoy, Captain! Drag the wheel to steer. Find the golden treasure at the far sea."
        : session.level.intro,
    );
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
    select: (i) => {
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
      void sound.unlock();
      progress.muted = sound.toggle();
      saveProgress(progress, storage);
      return progress.muted;
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
        const i = session.voyage.index,
          previous = progress.voyages[i];
        progress.voyages[i] = {
          stars: Math.max(previous?.stars ?? 0, session.stars),
          gems: Math.max(previous?.gems ?? 0, session.gemsFound),
        };
        progress.relics = [...new Set([...progress.relics, i])];
        saveProgress(progress, storage);
        cave.refresh(progress.relics);
        cave.beginReveal(i);
        sound.chest();
      } else {
        cave.select(hud.selected, true);
        sound.say("Pip brought you home. Your treasures are safe.");
      }
      hud.result(session);
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
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        hud.select(hud.selected + (e.code === "ArrowLeft" ? -1 : 1));
      }
      if (e.code === "Enter") void start(hud.selected);
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
  window.addEventListener("keyup", (e) => controls.keyUp(e.code));
  window.addEventListener("blur", () => {
    controls.clear();
    heading = null;
    pendingFire = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "play" && !paused) pause();
  });
  let drag: { x: number; y: number; index: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (mode === "cave") {
      drag = { x: e.clientX, y: e.clientY, index: hud.selected };
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const steps = Math.round((drag.x - e.clientX) / 100);
    if (drag.index + steps !== hud.selected) hud.select(drag.index + steps);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (drag) {
      drag = null;
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
  canvas.addEventListener("pointercancel", () => (drag = null));
  let lastScroll = 0;
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (mode === "cave") {
        if (performance.now() - lastScroll > 300) {
          hud.select(hud.selected + (e.deltaY > 0 ? 1 : -1));
          lastScroll = performance.now();
        }
      } else renderer?.zoomBy(e.deltaY * 0.035);
    },
    { passive: false },
  );
  window.addEventListener("resize", () => {
    quality();
    engine.resize();
    renderer?.resize();
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
        hud.update(session, (x, y, z) => renderer!.project(x, y, z));
      }
    } else if (mode === "loading" && renderer) {
      renderer.render(session, 1, dt);
    } else {
      const before = cave.revealPose;
      cave.render(dt, mode === "result");
      if (mode === "result" && session.state === "won") {
        const p = cave.revealPose;
        hud.reveal(p.time, p.discovered, p.ready);
        if (p.opening && !before.opening) sound.chestOpen();
        if (p.discovered && !before.discovered) { sound.cheer(); sound.say(`You found ${RELICS[session.voyage.index]!.name}!`); }
      }
    }
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
    progress.relics = [index];
    mode = "result";
    hud.selected = index;
    hud.result(session);
    cave.refresh(progress.relics);
    cave.beginReveal(index);
  } else if (qa && qaQuery !== "collection") void start(Number(qaQuery));
}
void main().catch((err) => {
  console.error(err);
  const el = document.querySelector("#loading");
  if (el)
    el.textContent = "The sea could not load. Please reload to try again.";
});
