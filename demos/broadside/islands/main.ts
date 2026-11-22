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
import { resolveLight, type LightSetting } from "../src/render/landfallSky";
import { LandfallView } from "../src/render/landfallView";
import { buildHarbor, type HarborDeck } from "../src/render/landfallHarbor";
import { buildGrotto } from "../src/render/landfallGrotto";
import { buildSettlement } from "../src/render/landfallTown";
import { LandfallHud } from "../src/ui/landfallHud";
import { HuntChart } from "./huntChart";
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
  const requestedLight = new URLSearchParams(location.search).get("light");
  let lightSetting: LightSetting = requestedLight === "day" || requestedLight === "sunset" || requestedLight === "night" ? requestedLight : "pack";
  let muted = false;
  try { muted = localStorage.getItem("atlas-muted") === "true"; } catch { /* Storage is optional. */ }
  let ready = false;
  let current = initial;
  let island = generateIsland(current.world, current.seed, current.settings);
  let view: LandfallView | null = null,
    walker: CaveWalker | null = null;
  let mode: "survey" | "walk" = "survey";
  let yaw = -0.45,
    tilt = 0.6,
    distance = 75;
  const chart = new HuntChart(walk);
  const progress = new Map<string, number>();
  let recipe = "";
  let feedbackUntil = 0;
  let feedbackText = "";
  let harbor: HarborDeck | null = null;
  let harborTime = 0;
  const landingQuery = new URLSearchParams(location.search);
  let enterOnLoad = landingQuery.get("mode") === "walk";
  let digs = 0,
    lastDig = -Infinity,
    buildTimer = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  const stopMoving = () => {
    view?.cancelSwing();
    controls.clear();
    for (const id of pointers.keys()) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    pointers.clear();
  };
  const nearby = () =>
    !!walker &&
    Math.hypot(walker.x - island.site.dig.x, walker.z - island.site.dig.z) <=
      2.8;
  const refreshClue = () => hud.update(
    island.site.clue, nearby(), digs, island.site.treasure,
    performance.now() < feedbackUntil ? feedbackText : "",
  );
  const blocked = () => chart.open || hud.confirmingLeave;
  function showChart() {
    if (!ready || !view || buildTimer || blocked()) return;
    hud.releaseStick();
    stopMoving();
    chart.show(island, current.world, current.seed, mode === "walk" ? walker : null, digs >= 3);
  }
  const dig = () => {
    if (mode !== "walk" || blocked() || !walker || !view || digs >= 3) return;
    const now = performance.now();
    if (now - lastDig < 300) return;
    lastDig = now;
    const hit = nearby();
    // Break the ground ahead of the player's feet so a missed strike can be inspected.
    const forward = 1.05;
    let x = walker.x + Math.sin(walker.yaw) * forward;
    let z = walker.z + Math.cos(walker.yaw) * forward;
    if (harbor?.heightAt(x, z) !== undefined || harbor?.heightAt(walker.x, walker.z) !== undefined) {
      feedbackText = "Dig ashore, away from the dock.";
      feedbackUntil = now + 2600;
      refreshClue();
      return;
    }
    if (island.heightAt(x, z) < .32) { x = walker.x; z = walker.z; }
    if (hit) ({ x, z } = island.site.dig);
    view.strikeGround(x, z, hit, reducedMotion.matches, () => {
      if (hit) progress.set(recipe, ++digs);
      feedbackText = "Nothing buried here. Check the X on your map.";
      feedbackUntil = hit ? 0 : performance.now() + 2600;
      refreshClue();
    });
  };
  const hud = new LandfallHud(document.body, {
    move: (right, forward) => controls.move(right, forward),
    dig,
    sound() {
      muted = !muted;
      view?.setMuted(muted);
      hud.setMuted(muted);
      try { localStorage.setItem("atlas-muted", String(muted)); } catch { /* Session-only audio settings. */ }
    },
    leave: survey,
    chart: showChart,
    pauseInputs: stopMoving,
  });

  hud.setMuted(muted);

  function walk(landing: string | null = null) {
    if (!ready || !view || !walker || buildTimer) return;
    stopMoving();
    const { spawn, dig: target } = island.site;
    const villageLane = landing === "village" ? island.site.town.paths[1] : undefined;
    const grotto = landing === "cave" ? island.site.grotto : null;
    const pier = landing === "harbor" ? harbor?.center : null;
    const aboard = landing === "ship" ? harbor?.onDeck : null;
    const start = aboard ?? pier ?? grotto?.entry ?? villageLane?.a ?? spawn;
    walker.reset();
    walker.x = start.x;
    walker.z = start.z;
    walker.feet = Math.max(view.groundHeight(start.x, start.z), harbor?.heightAt(start.x, start.z) ?? -Infinity);
    const { landmark } = island.site;
    const bearing = (p: { x: number; z: number }) =>
      Math.atan2(p.x - spawn.x, p.z - spawn.z);
    walker.yaw = villageLane
      ? Math.atan2(villageLane.b.x - start.x, villageLane.b.z - start.z)
      : bearing(landmark) * 0.57 + bearing(target) * 0.43;
    if (grotto) walker.yaw = grotto.yaw;
    if (pier) walker.yaw = Math.PI;
    if (aboard) walker.yaw = 0;
    walker.pitch = -0.06;
    feedbackUntil = 0;
    lastDig = -Infinity;
    mode = "walk";
    setWalkUrl(true);
    studio.hide();
    hud.show(ISLAND_PACKS[current.world]!, island.site.name);
    refreshClue();
    canvas.focus({ preventScroll: true });
  }

  function survey() {
    stopMoving();
    mode = "survey";
    setWalkUrl(false);
    hud.hide();
    studio.show();
    canvas.focus({ preventScroll: true });
  }

  function setWalkUrl(active: boolean) {
    const url = new URL(location.href);
    if (active) url.searchParams.set("mode", "walk");
    else {
      url.searchParams.delete("mode");
      url.searchParams.delete("start");
    }
    history.replaceState(null, "", url);
  }

  function build() {
    buildTimer = 0;
    try {
      view?.dispose();
      view = null;
      walker = null;
      island = generateIsland(current.world, current.seed, current.settings);
      recipe = JSON.stringify(current);
      digs = progress.get(recipe) ?? 0;
      feedbackUntil = 0;
      chart.reset();
      const light = resolveLight(lightSetting, current.world);
      view = new LandfallView(engine, current.world, island, current.seed, light);
      const built = view;
      built.setMuted(muted);
      built.restoreTreasure(island.site.dig.x, island.site.dig.z, digs);
      const obstacles = [
        ...view.obstacles,
        ...buildGrotto(view.scene, island, view.shadows, light === "night"),
        ...buildSettlement(view.scene, island.site, island.heightAt, view.shadows, light === "night"),
      ];
      harbor = buildHarbor(built.scene, island, built.shadows);
      obstacles.push(...harbor.obstacles);
      harborTime = 0;
      walker = new CaveWalker(
        obstacles,
        (x, z) => Math.max(built.groundHeight(x, z), harbor?.heightAt(x, z) ?? -Infinity),
        (x, z) => island.heightAt(x, z) >= 0.32 || harbor?.heightAt(x, z) !== undefined,
      );
      const url = new URL(location.href);
      const q = url.searchParams;
      q.set("seed", String(current.seed));
      if (lightSetting === "pack") q.delete("light");
      else q.set("light", lightSetting);
      q.set("pack", String(current.world + 1));
      for (const [k, v] of Object.entries(current.settings))
        q.set(k, String(v));
      history.replaceState(null, "", url);
      built.scene.executeWhenReady(() => {
        if (view !== built || buildTimer) return;
        ready = true;
        status.hidden = true;
        studio.setReady(true);
        if (enterOnLoad) {
          enterOnLoad = false;
          walk(landingQuery.get("start"));
        }
      });
    } catch (error) {
      console.error(error);
      status.textContent =
        "This island could not be drawn. Try another seed or reload the page.";
      status.hidden = false;
    }
  }
  function rebuild() {
    ready = false;
    status.textContent = "Drawing the island…";
    status.hidden = false;
    studio.setReady(false);
    clearTimeout(buildTimer);
    buildTimer = window.setTimeout(build, 110);
  }
  const studio = createStudio({ ...initial, light: lightSetting }, {
    light(value) { lightSetting = value; rebuild(); },
    change(world, seed, settings) {
      current = {
        world,
        seed: seed >>> 0,
        settings: normalizeIslandSettings(settings),
      };
      rebuild();
    },
    walk,
    chart: showChart,
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
    if (blocked() || e.button !== 0) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || blocked()) return;
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
      yaw += dx * 0.007;
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
      if (mode !== "survey" || blocked()) return;
      e.preventDefault();
      orbitZoom(Math.exp(Math.max(-200, Math.min(200, e.deltaY)) * 0.0014));
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    if (
      blocked() ||
      e.metaKey ||
      e.altKey ||
      (mode === "survey" && e.ctrlKey)
    )
      return;
    if (e.code === "KeyM" && !e.repeat && !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      showChart();
      return;
    }
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
    if (!reducedMotion.matches) harborTime += dt;
    harbor?.animate(harborTime);
    if (mode === "walk") {
      if (!blocked()) {
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
        digs,
        reducedMotion.matches,
      );
    }
    canvas.dataset.state = ready ? mode : "loading";
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
