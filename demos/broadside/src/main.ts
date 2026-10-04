import { GOLD_AREAS } from "./game/goldAreas";
import "@babylonjs/core/Culling/ray.js";
import "@babylonjs/core/Shaders/color.vertex.js";
import "@babylonjs/core/Shaders/color.fragment.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { VoyageSession, generateVoyage, RELICS } from "./game/voyage";
import { newOpenSea, readOpenSea, openSeaVoyage, recordOpenSea, saveOpenSea } from "./game/openSea";
import { readProgress, saveProgress } from "./game/progress";
import { awardVoyage, syncRewards, caveProgress, deliverChest, type VoyageReward } from "./game/rewards";
import { ShipHold } from "./render/shipHold";
import { TOTAL_LEVELS, levelUnlocked } from "./game/campaign";
import { Controls } from "./input/controls";
import { CaveWalkControls } from "./input/caveWalk";
import { CaveGesture } from "./input/caveGesture";
import { installGameSurface } from "./input/gameSurface";
import { installFullscreen } from "./ui/fullscreen";
import { GameRenderer } from "./render/renderer";
import { TreasureCave } from "./render/cave";
import type { Harbour } from "./render/harbour";
import type { PrivateShip } from "./render/privateShip";
import { PRIVATE_PEARL } from "./privatePearl";
import { displayRenderScale, configurePhoneRendering, configureTextureQuality } from "./render/quality";
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
import "./ui/sailing.css";

installGameSurface();

// An utterance started by an older loaded copy can outlive its game state.
// Stop it on reload and exit; this game never creates or queues speech.
const stopLegacySpeech = () => window.speechSynthesis?.cancel();
stopLegacySpeech();
window.addEventListener("pagehide", stopLegacySpeech);

async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const phone = Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const engine = new Engine(
    canvas,
    !phone,
    { stencil: true, powerPreference: "high-performance" },
    false,
  );
  engine.maxFPS = 60;
  engine.renderEvenInBackground = false;
  configurePhoneRendering(engine, phone);
  configureTextureQuality(engine);
  const quality = () => {
    const rect = canvas.getBoundingClientRect();
    // DEV fixture for checking an actual 3x drawing buffer in a narrow browser.
    const params = new URLSearchParams(location.search);
    const fixtureRatio = import.meta.env.DEV && params.has("qa")
      ? Number(params.get("renderDpr")) : 0;
    const ratio = fixtureRatio >= 1 && fixtureRatio <= 4 ? fixtureRatio : devicePixelRatio;
    engine.setHardwareScalingLevel(displayRenderScale(
      rect.width, rect.height, ratio, engine.getCaps().maxRenderTextureSize, phone,
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
    qaQuery === "collection" || qaQuery === "harbour" || qaQuery === "free" ||
    (qaQuery !== null &&
      /^(?:(?:reveal|hold|unload)-)?\d+$/.test(qaQuery) &&
      Number(qaQuery.replace(/^(reveal|hold|unload)-/, "")) < TOTAL_LEVELS);
  if (qa) storage = undefined;
  const carryPreview = qa && new URLSearchParams(location.search).get("preview") === "carry";
  const progress = readProgress(storage),
    controls = new Controls();
  const freeParams = new URLSearchParams(location.search);
  const openSea = qa ? newOpenSea(freeParams.has("seed") ? Number(freeParams.get("seed")) : undefined) : readOpenSea(storage);
  const freePack = qa ? Number(freeParams.get("pack") ?? 0) : 0;
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
  let cave: TreasureCave | null = null;
  const getCave = (): TreasureCave => {
    if (!cave) {
      cave = new TreasureCave(engine, !qa);
      cave.refresh(caveProgress(progress));
    }
    return cave;
  };
  const releaseCave = () => { cave?.scene.dispose(); cave = null; };
  let session = new VoyageSession(generateVoyage(0)),
    renderer: GameRenderer | null = null;
  let harbour: Harbour | PrivateShip | null = null;
  let hold: ShipHold | null = null;
  let holdShowingResult = false;
  let unloadQueue: number[] = [], unloadingIndex: number | null = null, unloadTotal = 0;
  let arrivalDestination: "hold" | "unload" = "hold", arrivalFromHold = false;
  let mode: "menu" | "cave" | "harbour" | "hold" | "unloading" | "play" | "arrival" | "result" | "loading" =
      "menu",
    paused = false,
    heading: number | null = null,
    pendingFire = false,
    loadId = 0,
    tapHeading: number | null = null;
  let arrivalTime = 0,
    arrivalInCave = false;
  let captainPreferred = false, helmTurn = 0;
  let seaChartOpen = false, lastSeaSave = 0;
  const stashSea = () => {
    if (!renderer || !session.voyage.freeSailing || (mode !== "play" && mode !== "result")) return;
    recordOpenSea(openSea, session, renderer.captainCamera.yaw, renderer.captainCamera.pitch);
    saveOpenSea(openSea, storage);
  };
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
  const arrive = (destination: "hold" | "unload" = "hold") => {
    arrivalFromHold = mode === "hold";
    arrivalDestination = destination;
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
  const cancelUnloading = () => {
    if (unloadingIndex !== null) {
      unloadingIndex = null; unloadQueue = [];
      getCave().refresh(caveProgress(progress));
    }
  };
  const prepareChest = () => {
    unloadingIndex = unloadQueue.shift() ?? null;
    if (unloadingIndex === null) { hud.unloading(unloadTotal,unloadTotal,true); return; }
    const banked = caveProgress(progress);
    banked.voyages[unloadingIndex] = progress.voyages[unloadingIndex]!;
    const world = Math.floor(unloadingIndex/10);
    getCave().refresh(banked, world); getCave().beginUnload(world);
    hud.unloading(unloadTotal - unloadQueue.length, unloadTotal);
  };
  const unload = () => {
    if (PRIVATE_PEARL) {
      for (const index of [...progress.cargo]) deliverChest(progress,index);
      saveProgress(progress,storage);
      home(); return;
    }
    if (!progress.cargo.length) { home(); return; }
    unloadQueue = [...progress.cargo].sort((a,b)=>a-b); unloadTotal=unloadQueue.length;
    arrive("unload");
  };
  const visitHold = () => {
    if (PRIVATE_PEARL) { void visitShip(true); return; }
    cancelUnloading(); clearArrival(); clearWalking(); gesture.clear(); controls.clear();
    cave?.endReveal();
    const index=progress.cargo.at(-1) ?? Math.max(0,...Object.keys(progress.voyages).map(Number));
    hold?.scene.dispose();hold = new ShipHold(engine, generateVoyage(index));
    const special = progress.relics.find(id => caveProgress(progress).relics.indexOf(id)<0) ?? null;
    hold.open(progress,special,false);holdShowingResult=false;
    mode="hold";hud.hold();
  };
  const inspect = () => {
    if (mode === "harbour") {
      if (harbour?.atHelm) { menu(); hud.showMenu("worlds"); }
      return;
    }
    const i = getCave().nearby;
    if (i !== null) hud.select(i, getCave().selectedGoldWorld);
  };
  const home = () => {
    stashSea();
    if (PRIVATE_PEARL) { void visitShip(true); return; }
    cancelUnloading();
    clearArrival();
    gesture.clear();
    clearWalking();
    loadId++;
    renderer?.scene.dispose(); renderer = null;
    hold?.scene.dispose(); hold = null;
    mode = "cave";
    cave?.endReveal();
    paused = false;
    hud.root.classList.remove("loading-voyage");
    tapHeading = null;
    controls.clear();
    heading = null;
    pendingFire = false;
    hud.paused(false);
    hud.home();
    getCave().refresh(caveProgress(progress));
    getCave().enter();
    if (import.meta.env.DEV && qaQuery === "collection") {
      const room = new URLSearchParams(location.search).get("room");
      if (room === "vault") {
        getCave().walker.x = 0;
        getCave().walker.z = 31;
      }
      if (room === "coins") {
        getCave().walker.x = -4;
        getCave().walker.z = 42.5;
      }
      if (room === "crown") {
        getCave().walker.x = -5;
        getCave().walker.z = 30;
      }
      if (room === "grotto") {
        getCave().walker.x = 27;
        getCave().walker.z = 34;
      }
      const bank = Number(new URLSearchParams(location.search).get("bank") ?? -1);
      if (bank >= 0 && bank < 4) {
        const a = GOLD_AREAS[bank]!;
        getCave().walker.x = a.x;
        getCave().walker.z = a.z - 6.5;
        getCave().walker.pitch = -.05;
      }
      getCave().walker.feet = 0;
    }
    if (import.meta.env.DEV && mode === "cave")
      canvas.dataset.caveGeometry = JSON.stringify(getCave().walkingGeometry);
    stepper.reset();
  };
  const menu = () => {
    stashSea();
    seaChartOpen = false; hud.seaChart(false);
    lastSeaSave = 0;
    cancelUnloading();
    clearArrival();
    gesture.clear();
    clearWalking();
    loadId++;
    mode = "menu";
    cave?.endReveal();
    paused = false;
    heading = tapHeading = null;
    pendingFire = false;
    controls.clear();
    hud.paused(false);
    hud.root.classList.remove("loading-voyage");
    hud.showMenu();
    stepper.reset();
  };
  const visitShip = async (treasure = false) => {
    stashSea();
    cancelUnloading();
    clearArrival(); gesture.clear(); clearWalking(); controls.clear();
    const id = ++loadId;
    heading = tapHeading = null; pendingFire = false; paused = false;
    cave?.endReveal(); releaseCave();
    hold?.scene.dispose(); hold = null;
    hud.paused(false);
    mode = "loading";
    hud.root.classList.add("loading-voyage");
    try {
      if (PRIVATE_PEARL) {
        // Avoid retaining two copies of the purchased textures on an iPhone.
        renderer?.scene.dispose(); renderer = null;
        const { PrivateShip } = await import("./render/privateShip");
        if (id !== loadId) return;
        if (!harbour) {
          const next = await PrivateShip.load(engine);
          if (id !== loadId) { next.scene.dispose(); return; }
          harbour = next;
        }
        if (harbour instanceof PrivateShip) {
          harbour.refresh(progress);
          harbour.enter(treasure || new URLSearchParams(location.search).get("spot") === "treasure");
        }
      } else {
        const { Harbour } = await import("./render/harbour");
        if (id !== loadId) return;
        harbour ??= new Harbour(engine); harbour.enter();
        if (qaQuery === "harbour") {
          const spot = new URLSearchParams(location.search).get("spot");
          if (spot === "quay") {
            harbour.walker.x=20; harbour.walker.z=-3; harbour.walker.feet=2.4;
            harbour.walker.yaw=-Math.PI/2; harbour.walker.pitch=-.18;
          }
          if (spot === "town") {
            harbour.walker.x=41; harbour.walker.z=-34; harbour.walker.feet=2.4;
            harbour.walker.yaw=0; harbour.walker.pitch=-.08;
          }
        }
      }
    } catch (error) {
      console.error("Could not visit the ship",error);
      if (id === loadId) { menu(); hud.shipLoadFailed(); }
      return;
    }
    if (id !== loadId) return;
    mode = "harbour"; hud.harbour();
    hud.root.classList.remove("loading-voyage");
    stepper.reset(); canvas.focus();
  };
  const start = async (index: number, freeMode = false, pack = 0, respawn = false) => {
    stashSea();
    if (harbour) { harbour.scene.dispose(); harbour = null; }
    if (respawn) {
      openSea.position = { x: 0, z: 0 }; openSea.heading = openSea.yaw = 0; openSea.pitch = .03;
      saveOpenSea(openSea, storage);
    }
    seaChartOpen = false; hud.seaChart(false);
    lastSeaSave = 0;
    cancelUnloading();
    hold?.scene.dispose();hold=null;
    clearArrival();
    gesture.clear();
    clearWalking();
    reward = undefined;
    if (!freeMode && !qa && !levelUnlocked(progress.voyages, index)) return;
    const id = ++loadId;
    mode = "loading";
    cave?.endReveal();
    releaseCave();
    controls.clear();
    heading = null;
    tapHeading = null;
    pendingFire = false;
    helmTurn = 0;
    paused = false;
    hud.paused(false);
    const voyage = freeMode ? openSeaVoyage(openSea, pack) : generateVoyage(index);
    hud.play(index, voyage);
    hud.root.classList.add("loading-voyage");
    renderer?.scene.dispose();
    renderer = null;
    session = new VoyageSession(voyage);
    if (voyage.freeSailing) {
      session.player.sail = 0;
      session.gemsFound = voyage.gems.filter(g => g.found).length;
    }
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
    next.captainCamera.enabled = captainPreferred ||
      (qa && new URLSearchParams(location.search).get("view") === "captain");
    if (freeMode) { next.captainCamera.yaw = openSea.yaw; next.captainCamera.pitch = openSea.pitch; }
    hud.camera(next.captainCamera.enabled);
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
  const freeSail = (respawn = false) => void start(0, true, freePack, respawn);
  const seaChart = (open: boolean) => {
    if (mode !== "play" || !session.voyage.freeSailing) return;
    seaChartOpen = open; paused = open;
    hud.seaChart(open, session);
    controls.clear(); clearWalking(); gesture.clear(); helmTurn = 0;
    heading = tapHeading = null; pendingFire = false;
    if (!open) canvas.focus();
    stashSea();
  };
  const toggleCamera = () => {
    if (mode !== "play" || !renderer) return;
    captainPreferred = renderer.captainCamera.enabled = !renderer.captainCamera.enabled;
    renderer.captainCamera.centre();
    heading = tapHeading = null; helmTurn = 0;
    controls.clear(); walking.clear(); gesture.clear(); releaseMouse();
    hud.camera(captainPreferred);
  };
  const pause = () => {
    if (mode !== "play") return;
    if (seaChartOpen) { seaChart(false); return; }
    paused = !paused;
    hud.paused(paused);
    controls.clear();
    clearWalking(); gesture.clear(); helmTurn = 0;
    heading = null;
    pendingFire = false;
  };
  const hud = new VoyageHud(progress, controls, {
    start: (i) => void start(i),
    freeSail,
    seaChart,
    camera: toggleCamera,
    centreLook: () => renderer?.captainCamera.centre(),
    home,
    harbour: () => void visitShip(),
    hold: visitHold,
    unload,
    menu,
    overview: () => {
      walking.clear();
      getCave().overview();
    },
    caveMove: (r, f) => walking.move(r, f),
    caveJump: () => walking.jump(),
    caveInspect: inspect,
    select: (i, world) => {
      getCave().selectedGoldWorld = world;
      clearWalking();
      getCave().select(i);
    },
    pause,
    fire: () => {
      if (mode === "play" && !paused) pendingFire = true;
    },
    steer: (h) => {
      if (renderer?.captainCamera.enabled) {
        helmTurn = h === null ? 0 : Math.sin(h);
        heading = tapHeading = null;
      } else {
        heading = h;
        if (h !== null) tapHeading = h;
      }
      if (h !== null) session.player.sail = 2;
    },
    anchor: () => {
      session.player.sail = session.player.sail ? 0 : 2;
    },
  });
  const stepper = new FixedStepper(() => {
    if (mode !== "play" || paused) return;
    let intent = controls.readIntent();
    if (renderer!.captainCamera.enabled && helmTurn) intent.turn = helmTurn;
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
      clearWalking(); gesture.clear(); helmTurn = 0;
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
        arrive();
      }
      if (session.state === "lost") {
        stashSea();
        renderer!.captainCamera.enabled = false;
        hud.camera(false);
        hud.result(session, reward);
      }
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
        (mode === "harbour" || !getCave().inspecting || e.code.startsWith("Arrow")) &&
        walking.keyDown(e.code, performance.now())
      )
        e.preventDefault();
      if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        inspect();
      }
      if (e.code === "Escape") {
        if (mode === "cave" && getCave().inspecting) {
          getCave().overview();
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
    if (seaChartOpen && (e.code === "Escape" || e.code === "KeyM")) {
      seaChart(false); e.preventDefault(); return;
    }
    if (e.code === "KeyM" && !e.repeat && mode === "play" && session.voyage.freeSailing) {
      seaChart(true); e.preventDefault(); return;
    }
    if (e.code === "Escape" || e.code === "KeyP") {
      if (!e.repeat) pause();
      return;
    }
    if (mode !== "play" || paused) return;
    if (e.code === "KeyC" && !e.repeat) { toggleCamera(); e.preventDefault(); return; }
    if (e.code === "KeyR" && !e.repeat) { renderer?.captainCamera.centre(); e.preventDefault(); return; }
    if (renderer?.captainCamera.enabled && e.code.startsWith("Arrow")) {
      if (!e.repeat) renderer.captainCamera.look(
        e.code === "ArrowRight" ? 12 : e.code === "ArrowLeft" ? -12 : 0,
        e.code === "ArrowDown" ? 12 : e.code === "ArrowUp" ? -12 : 0,
      );
      walking.keyDown(e.code, performance.now()); e.preventDefault(); return;
    }
    if (e.code === "Space" && !e.repeat) pendingFire = true;
    if (controls.keyDown(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    controls.keyUp(e.code);
    walking.keyUp(e.code);
  });
  window.addEventListener("blur", () => {
    stashSea();
    gesture.clear();
    clearWalking();
    controls.clear();
    heading = null;
    helmTurn = 0;
    pendingFire = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stashSea();
    if (document.hidden) clearWalking();
    if (document.hidden && mode === "play" && !paused) pause();
  });
  window.addEventListener("pagehide", stashSea);
  if (Capacitor.isNativePlatform()) {
    await App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) return;
      gesture.clear();
      clearWalking();
      controls.clear();
      heading = null;
      helmTurn = 0;
      pendingFire = false;
      if (mode === "play" && !paused) pause();
    });
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (mode === "play" && !paused && renderer?.captainCamera.enabled) {
      canvas.focus();
      gesture.down(e.pointerId, e.clientX, e.clientY);
      canvas.setPointerCapture(e.pointerId);
      return;
    }
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
    if (mode === "play" && !paused && renderer?.captainCamera.enabled) {
      if (document.pointerLockElement === canvas) renderer.captainCamera.look(e.movementX, e.movementY);
      else {
        const action = gesture.move(e.pointerId, e.clientX, e.clientY);
        if (action?.type === "look") renderer.captainCamera.look(action.dx, action.dy);
      }
      return;
    }
    if (mode !== "cave" && mode !== "harbour") return;
    const place = mode === "harbour" ? harbour! : getCave();
    if (document.pointerLockElement === canvas) {
      place.look(e.movementX, e.movementY);
      return;
    }
    const action = gesture.move(e.pointerId, e.clientX, e.clientY);
    if (action?.type === "look") place.look(action.dx, action.dy);
    if (mode === "cave" && action?.type === "pinch" && getCave().pinch(action.ratio)) hud.overview();
  });
  canvas.addEventListener("pointerup", (e) => {
    if (mode === "play" && !paused && renderer?.captainCamera.enabled) {
      if (document.pointerLockElement === canvas) return;
      const action = gesture.up(e.pointerId, e.clientX, e.clientY);
      if (action?.type === "tap" && e.pointerType === "mouse")
        void canvas.requestPointerLock?.()?.catch(() => {});
      return;
    }
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
        const i = getCave().pick(action.x, action.y);
        if (i !== null) hud.select(i, getCave().selectedGoldWorld);
        else if (e.pointerType === "mouse" && !getCave().inspecting) {
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
      if (mode === "cave" && getCave().zoom(e.deltaY)) hud.overview();
      else if (mode === "play" && !renderer?.captainCamera.enabled) renderer?.zoomBy(e.deltaY * 0.035);
    },
    { passive: false },
  );
  const resizeGame = () => {
    quality();
    engine.resize();
    renderer?.resize();
    if (mode === "play" && renderer) hud.camera(renderer.captainCamera.enabled);
    cave?.resize();
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
        renderer?.scene.dispose(); renderer = null;
        if (arrivalDestination === "hold") {
          hold?.scene.dispose();hold=new ShipHold(engine,session.voyage);
          hold.open(progress,reward?.special ?? null);holdShowingResult=true;
          hud.result(session,reward);
        } else prepareChest();
        hud.root.classList.remove("arriving");
      }
      // Keep the chest closed while the cave fades in: none of its reveal is lost.
      if (arrivalInCave) {
        if (arrivalDestination === "hold") hold?.render(0,reducedMotion.matches);
        else getCave().render(0,true);
      } else if (arrivalFromHold) hold?.render(dt,reducedMotion.matches);
      else if (unloadingIndex !== null) getCave().render(dt,true);
      else renderer?.render(session, 1, dt);
      if (pose.ready) {
        mode = arrivalDestination === "hold" ? "hold" : "unloading";
        clearArrival();
      }
    } else if (mode === "hold" && hold) {
      hold.render(dt,reducedMotion.matches);
      if (holdShowingResult) {const p=hold.pose;hud.reveal(p.time,p.discovered,p.ready);}
    } else if (mode === "unloading") {
      // DEV-only still frame for inspecting the hands and cabin-to-bank carry.
      if (carryPreview) getCave().revealTime = reducedMotion.matches ? 1.4 : 6.7;
      getCave().render(carryPreview ? 0 : dt,true);
      if (unloadingIndex !== null && getCave().depositComplete) {
        deliverChest(progress,unloadingIndex);saveProgress(progress,storage);
        getCave().refresh(caveProgress(progress));
        if (unloadQueue.length) arrive("unload");
        else {unloadingIndex=null;hud.unloading(unloadTotal,unloadTotal,true);}
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
      if (!paused && renderer!.captainCamera.enabled) {
        const look = walking.readLook();
        renderer!.captainCamera.look(look.right * 500 * dt, look.down * 450 * dt);
      }
      controls.setPad(window.navigator.getGamepads?.().find((p) => p) ?? null);
      const alpha = paused ? 1 : stepper.advance(dt);
      if (mode === "play") {
        renderer!.render(session, alpha, dt);
        hud.update(session, (x, y, z) => renderer!.project(x, y, z),
          renderer!.captainCamera.enabled ? session.player.heading + renderer!.captainCamera.yaw : 0);
        canvas.dataset.cameraView = renderer!.captainCamera.enabled ? "captain" : "overhead";
        canvas.dataset.sailingMode = session.voyage.freeSailing ? "free" : "campaign";
        if (session.voyage.freeSailing && session.elapsed - lastSeaSave > 1) {
          lastSeaSave = session.elapsed; stashSea();
        }
        if (import.meta.env.DEV) {
          canvas.dataset.shipPosition = [session.player.pos.x, session.player.pos.z].map(n => n.toFixed(2)).join(",");
          canvas.dataset.shipHeading = session.player.heading.toFixed(3);
          canvas.dataset.lookYaw = renderer!.captainCamera.yaw.toFixed(3);
          canvas.dataset.cameraPosition = renderer!.rig.camera.position.asArray().map(n => n.toFixed(2)).join(",");
          canvas.dataset.seaSeed = String(session.level.seed);
          canvas.dataset.totalIslands = String(session.level.islands.length);
          canvas.dataset.cannonballs = String(session.world.balls.length);
        }
      }
    } else if (mode === "result" && session.state === "lost" && renderer) {
      renderer.beforeStep(session);
      session.step(undefined, dt);
      renderer.afterStep(session);
      renderer.render(session, 1, dt);
    } else if (mode === "loading" && renderer) {
      renderer.render(session, 1, dt);
    } else if (mode !== "menu" && mode !== "loading") {
      if (mode === "cave") {
        const look = walking.readLook();
        getCave().look(look.right * 500 * dt, look.down * 450 * dt);
        getCave().walk(walking.read(), dt);
      }
      getCave().render(dt, mode === "result");
      if (mode === "cave") {
        hud.caveWalk(
          getCave().nearby,
          document.pointerLockElement === canvas,
          getCave().inspecting,
          getCave().room,
        );
        canvas.dataset.caveCoinCounts = getCave().coinCounts.join(",");
        canvas.dataset.cavePosition = [
          getCave().walker.x,
          getCave().walker.eyeY,
          getCave().walker.z,
        ]
          .map((n) => n.toFixed(2))
          .join(",");
        if (import.meta.env.DEV) {
          canvas.dataset.caveLanterns = getCave().activeLanterns;
          canvas.dataset.caveGoldMeshes = getCave().scene
            .getActiveMeshes()
            .data.filter((m) => m?.name.endsWith("settled gold coins"))
            .map((m) => m.name)
            .join(",");
        }
        canvas.dataset.caveYaw = getCave().walker.yaw.toFixed(2);
        canvas.dataset.caveView = getCave().inspecting ? "inspect" : "walk";
      }
      if (mode === "result" && session.state === "won") {
        const p = getCave().revealPose;
        hud.reveal(p.time, p.discovered, p.ready);
        hud.depositing(!!reward?.gold && p.time > 5.3);
      }
    }
    canvas.dataset.goldPhysics = String(cave?.goldPhysicsActive ?? false);
    canvas.dataset.restingCoins = cave?.restingCoinCounts.join(",") ?? "";
    canvas.dataset.coinCounts = cave?.coinCounts.join(",") ?? "";
    canvas.dataset.fps = String(Math.round(engine.getFps()));
    canvas.dataset.activeScenes = String(engine.scenes.length);
    canvas.dataset.state = mode === "play" ? session.state : mode;
    canvas.dataset.audio = "disabled";
  });
  if (qa && /^(reveal|hold|unload)-/.test(qaQuery!)) {
    const index = Number(qaQuery!.split("-")[1]);
    session = new VoyageSession(generateVoyage(index));
    session.state = "won";
    session.stars = 3;
    session.gemsFound = 2;
    for (let i = 0; i < index; i++) { awardVoyage(progress, i, 3, 2); if (!qaQuery!.startsWith("hold-") && !qaQuery!.startsWith("unload-")) deliverChest(progress,i); }
    reward = awardVoyage(progress, index, 3, 2);
    getCave().refresh(caveProgress(progress));
    if(qaQuery!.startsWith("unload-")) { unload(); }
    else { hold = new ShipHold(engine,session.voyage);hold.open(progress,reward.special);holdShowingResult=true;mode="hold";hud.result(session,reward); }
  } else if (qaQuery === "collection") home();
  else if (qaQuery === "harbour") void visitShip();
  else if (qaQuery === "free") freeSail();
  else if (qa) void start(Number(qaQuery));
}
void main().catch((err) => {
  console.error(err);
  const el = document.querySelector("#loading");
  if (el)
    el.textContent = "The sea could not load. Please reload to try again.";
});
