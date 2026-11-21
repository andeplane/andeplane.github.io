import { Engine } from "@babylonjs/core/Engines/engine.js";
import {
  generateIsland,
  normalizeIslandSettings,
  DEFAULT_SETTINGS,
  ISLAND_PACKS,
  type IslandSettings,
} from "../src/game/landfall";
import {
  CaveWalker,
  CaveWalkControls,
} from "../src/shared/pirate-world/input/caveWalk";
import { LandfallView } from "../src/render/landfallView";
import { buildSettlement } from "../src/render/landfallTown";
import { LandfallHud } from "../src/ui/landfallHud";
import { createStudio } from "./studio";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const status = document.querySelector<HTMLElement>("#status")!;

function fromUrl() {
  const q = new URLSearchParams(location.search);
  const world = Number(q.get("pack")) - 1;
  const rawSeed = q.get("seed");
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of ["relief", "beach", "vegetation"] as const) {
    const raw = q.get(key);
    if (raw?.trim()) settings[key] = Number(raw);
  }
  settings.biome =
    (q.get("biome") as IslandSettings["biome"]) ?? settings.biome;
  settings.settlement =
    (q.get("settlement") as IslandSettings["settlement"]) ??
    settings.settlement;
  return {
    world:
      Number.isInteger(world) && world >= 0 && world < ISLAND_PACKS.length
        ? world
        : 0,
    seed:
      rawSeed && /^\d{1,10}$/.test(rawSeed) && Number(rawSeed) <= 0xffffffff
        ? Number(rawSeed)
        : 82417,
    settings: normalizeIslandSettings(settings),
  };
}

function run() {
  const initial = fromUrl();
  const engine = new Engine(
    canvas,
    true,
    { powerPreference: "high-performance", stencil: true },
    false,
  );
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const controls = new CaveWalkControls();
  let current = initial;
  let island = generateIsland(current.world, current.seed, current.settings);
  let view: LandfallView | null = null,
    walker: CaveWalker | null = null;
  let mode: "survey" | "walk" = "survey";
  let yaw = -0.45,
    tilt = 0.6,
    distance = 75;
  let digs = 0,
    lastDig = -Infinity,
    buildTimer = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  const stopMoving = () => {
    controls.clear();
    pointers.clear();
  };
  const nearby = () =>
    !!walker &&
    Math.hypot(walker.x - island.site.dig.x, walker.z - island.site.dig.z) <=
      2.8;
  const refreshClue = () => hud.update(island.site.clue, nearby(), digs, island.site.treasure);
  const dig = () => {
    if (
      mode !== "walk" ||
      hud.confirmingLeave ||
      !nearby() ||
      digs === 3 ||
      performance.now() - lastDig < 300
    )
      return;
    digs++;
    lastDig = performance.now();
    refreshClue();
  };
  const hud = new LandfallHud(document.body, {
    move: (right, forward) => controls.move(right, forward),
    dig,
    leave: survey,
    pauseInputs: stopMoving,
  });

  function walk() {
    if (!view || !walker || buildTimer) return;
    stopMoving();
    const { spawn, dig: target } = island.site;
    walker.reset();
    walker.x = spawn.x;
    walker.z = spawn.z;
    walker.feet = island.heightAt(spawn.x, spawn.z);
    const { landmark } = island.site;
    const bearing = (p: { x: number; z: number }) =>
      Math.atan2(p.x - spawn.x, p.z - spawn.z);
    walker.yaw = bearing(landmark) * 0.57 + bearing(target) * 0.43;
    walker.pitch = -0.06;
    digs = 0;
    lastDig = -Infinity;
    mode = "walk";
    studio.hide();
    hud.show(ISLAND_PACKS[current.world]!, island.site.name);
    refreshClue();
    canvas.focus({ preventScroll: true });
  }

  function survey() {
    stopMoving();
    mode = "survey";
    digs = 0;
    hud.hide();
    studio.show();
    canvas.focus({ preventScroll: true });
  }

  function build() {
    buildTimer = 0;
    try {
      view?.dispose();
      view = null;
      walker = null;
      island = generateIsland(current.world, current.seed, current.settings);
      view = new LandfallView(engine, current.world, island, current.seed);
      const obstacles = [
        ...view.obstacles,
        ...buildSettlement(view.scene, island.site, island.heightAt, view.shadows),
      ];
      walker = new CaveWalker(
        obstacles,
        island.heightAt,
        (x, z) => island.heightAt(x, z) >= 0.32,
      );
      const url = new URL(location.href);
      const q = url.searchParams;
      q.set("seed", String(current.seed));
      q.set("pack", String(current.world + 1));
      for (const [k, v] of Object.entries(current.settings))
        q.set(k, String(v));
      history.replaceState(null, "", url);
      status.hidden = true;
      studio.setReady(true);
    } catch (error) {
      console.error(error);
      status.textContent =
        "This island could not be drawn. Try another seed or reload the page.";
      status.hidden = false;
    }
  }
  const studio = createStudio(initial, {
    change(world, seed, settings) {
      current = {
        world,
        seed: seed >>> 0,
        settings: normalizeIslandSettings(settings),
      };
      studio.setReady(false);
      clearTimeout(buildTimer);
      buildTimer = window.setTimeout(build, 110);
    },
    walk,
  });
  studio.show();
  studio.setReady(false);

  function orbitZoom(amount: number) {
    distance = Math.max(38, Math.min(150, distance * amount));
  }
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (hud.confirmingLeave || e.button !== 0) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || hud.confirmingLeave) return;
    const before = pinchDistance(),
      dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (mode === "walk") walker?.look(dx, dy);
    else if (pointers.size > 1) {
      const after = pinchDistance();
      if (before > 1 && after > 1) orbitZoom(before / after);
    } else {
      yaw -= dx * 0.007;
      tilt = Math.max(0.15, Math.min(1.44, tilt + dy * 0.006));
    }
  });
  for (const event of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const)
    canvas.addEventListener(event, (e) => pointers.delete(e.pointerId));
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (mode !== "survey") return;
      e.preventDefault();
      orbitZoom(Math.exp(Math.max(-200, Math.min(200, e.deltaY)) * 0.0014));
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    if (
      hud.confirmingLeave ||
      e.metaKey ||
      e.altKey ||
      (mode === "survey" && e.ctrlKey)
    )
      return;
    if (mode === "walk") {
      if (e.code === "Escape" && !e.repeat) {
        e.preventDefault();
        hud.requestLeave();
      } else if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        dig();
      } else if (
        (e.code !== "Space" || e.target === canvas) &&
        controls.keyDown(e.code, performance.now())
      )
        e.preventDefault();
    } else if (e.target === canvas) {
      if (e.code === "Equal") orbitZoom(0.92);
      else if (e.code === "Minus") orbitZoom(1.08);
      else if (e.code === "ArrowLeft") yaw -= 0.08;
      else if (e.code === "ArrowRight") yaw += 0.08;
      else if (e.code === "ArrowUp") tilt = Math.min(1.44, tilt + 0.06);
      else if (e.code === "ArrowDown") tilt = Math.max(0.15, tilt - 0.06);
      else return;
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => controls.keyUp(e.code));
  window.addEventListener("blur", stopMoving);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopMoving();
  });
  new ResizeObserver(() => engine.resize()).observe(canvas);
  engine.setHardwareScalingLevel(
    1 / Math.min(1.65, window.devicePixelRatio || 1),
  );
  engine.runRenderLoop(() => {
    if (!view || !walker || document.hidden) return;
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    if (mode === "walk") {
      if (!hud.confirmingLeave) {
        const look = controls.readLook();
        walker.look(look.right * 500 * dt, look.down * 450 * dt);
        walker.step(controls.read(), dt);
        refreshClue();
      }
      view.render(dt, walker, digs, reducedMotion.matches);
    } else {
      // Fit both horizontal and vertical extents on narrow phone viewports.
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      const range = distance * Math.max(1, 0.99 / aspect);
      const flat = range * Math.cos(tilt);
      view.render(
        dt,
        {
          x: -Math.sin(yaw) * flat,
          z: -Math.cos(yaw) * flat,
          eyeY: 3 + range * Math.sin(tilt),
          bob: 0,
          yaw,
          pitch: tilt,
        },
        0,
        reducedMotion.matches,
      );
    }
    canvas.dataset.state = mode;
    canvas.dataset.fps = String(Math.round(engine.getFps()));
    if (mode === "walk") {
      canvas.dataset.position = [walker.x, walker.z, walker.yaw, walker.pitch]
        .map((n) => n.toFixed(2))
        .join(",");
      canvas.dataset.digs = String(digs);
    }
  });
  requestAnimationFrame(build);
}

try {
  run();
} catch (error) {
  console.error(error);
  status.hidden = false;
  status.textContent =
    "This island viewer needs WebGL. Enable hardware acceleration or open it in another browser.";
}
