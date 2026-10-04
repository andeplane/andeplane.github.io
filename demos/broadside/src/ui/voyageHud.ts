import { PACKS, RELICS, type VoyageSession, type VoyageDef } from "../game/voyage";
import {
  goldTotal,
  worldGold,
  caveProgress,
  CAVE_ITEMS,
  WORLD_RELICS,
  type VoyageReward,
} from "../game/rewards";
import {
  LEVELS_PER_WORLD,
  TOTAL_LEVELS,
  worldOf,
  stageOf,
  worldLevels,
  worldStars,
  levelUnlocked,
} from "../game/campaign";
import { generateVoyage } from "../game/voyage";
import type { Progress } from "../game/progress";
import { icon } from "./icons";
import { PRIVATE_PEARL } from "../privatePearl";
import { worldArt, pirateShipArt } from "./worldArt";
import { Controls } from "../input/controls";
import { angleDiff, headingTo, distance, seaDistance, wrapCoordinate } from "../sim/math";
import { SEA_LANDMARKS } from "../game/freeSailing";
interface Handlers {
  start: (index: number) => void;
  freeSail: (respawn?: boolean) => void;
  seaChart: (open: boolean) => void;
  camera: () => void;
  centreLook: () => void;
  home: () => void;
  harbour: () => void;
  hold: () => void;
  unload: () => void;
  menu: () => void;
  overview: () => void;
  caveMove: (right: number, forward: number) => void;
  caveJump: () => void;
  caveInspect: () => void;
  select: (index: number, goldWorld: number) => void;
  pause: () => void;
  fire: () => void;
  steer: (heading: number | null) => void;
  anchor: () => void;
}
export class VoyageHud {
  readonly root: HTMLElement;
  selected = 0;
  private goldWorld = 0;
  pack = 0;
  private progress: Progress;
  private messageUntil = 0;
  private activeLevel = 0;
  private freeSeed: number | null = null;
  private chartTime = 0;
  private resultLost = false;
  private revealName = "";
  private revealStars = 0;
  private revealCaption = "";
  constructor(
    progress: Progress,
    controls: Controls,
    private h: Handlers,
  ) {
    this.progress = progress;
    const r = (this.root = document.createElement("div"));
    r.id = "voyage-ui";
    r.innerHTML = `<header class="voyage-header"><span class="voyage-brand">${icon("wheel")} <b>BROADSIDE<small>A LITTLE CAPTAIN’S COLLECTION</small></b></span><div><button id="v-home" class="round" aria-label="Choose levels">${icon("map")}</button><button id="v-pause" class="round" aria-label="Pause voyage">${icon("pause")}</button></div></header>
    <section id="captain-menu" class="captain-menu">
      <div class="menu-atmosphere" aria-hidden="true"><div class="moon"></div><div class="distant-rocks"></div><div class="hero-ship">${pirateShipArt()}</div><div class="ocean-mist"></div><div class="menu-embers"></div></div>
      <div id="main-menu" class="menu-page"><div class="title-crest">${icon("wheel")}</div><span class="eyebrow">A PIRATE’S TREASURE ADVENTURE</span><h1>Broadside</h1><p class="menu-tagline">Brave the seas. Bring home the treasure.</p><nav class="main-actions" aria-label="Main menu"><button id="menu-play" class="wood-button prominent">Play ${icon("play")}</button><button id="menu-settings" class="wood-button">Settings ${icon("wheel")}</button><button id="menu-cave" class="wood-button">Cave ${icon("chest")}</button></nav><button id="visit-ship" class="text-button">${icon("anchor")} Visit your ship</button></div>
      <div id="world-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow">CHART YOUR COURSE</span><h1>The pirate seas</h1><p>Choose an island. Chart your adventure.</p></div><div class="world-map" role="group" aria-label="Pirate sea chart"><svg class="map-route" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path class="route-wide" d="M370 930 C280 885 90 720 170 520 S250 90 410 190 S440 650 650 480 S735 90 865 135"/><path class="route-tall" d="M170 930 C110 810 110 710 245 635 S815 810 755 545 S80 525 245 185 S570 290 755 150"/></svg><button id="map-cave" class="map-cave" aria-label="Visit treasure cave"><img class="cave-art" src="${import.meta.env.BASE_URL}assets/map/treasure-cave.webp" width="640" height="640" alt="" draggable="false" decoding="async" /><span>Your cave</span></button><div id="world-packs"></div></div><p class="map-footnote">Gold in every level. A special treasure in every world.</p></div>
      <div id="level-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow" id="world-number"></span><h1 id="world-name"></h1><p id="pack-caption"></p></div><div class="level-board"><div id="level-world-art"></div><div id="voyage-levels"></div><p class="level-note">1,000 gold per level · Complete the world for its special treasure.</p></div></div>
      <div id="settings-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow">THE CAPTAIN’S ORDERS</span><h1>Settings</h1></div><div class="settings-board"><p>Steer with the wheel. Tap BOOM to fire.<br>Your treasures and stars are saved automatically.</p><p class="art-credit">Black Pearl model by <a href="https://www.thingiverse.com/thing:4951578" target="_blank" rel="noopener">DeltaX_F</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a><br>Adapted for Broadside.</p></div></div>
      <button id="menu-back" class="menu-back" hidden>‹ <span>Back</span></button>
    </section>
    <section id="cave-ui" hidden><div class="cave-title"><span class="eyebrow">YOUR SECRET HIDEOUT</span><h1>The treasure cave</h1><p id="cave-count"></p></div><div id="relic-info"><span class="eyebrow" id="relic-number"></span><h2 id="relic-title"></h2><p id="relic-story"></p><div id="relic-stars"></div><button id="cave-sail" class="text-button">Find this treasure ${icon("arrow")}</button></div><div class="gallery-hint">WASD walk · Arrows look · Space jump</div><button id="cave-overview" class="cave-overview">‹ Keep exploring</button><div id="cave-crosshair" aria-hidden="true">+</div><div id="cave-pad" role="group" aria-label="Move around the cave"><span id="cave-thumb"></span><small>MOVE</small></div><button id="cave-jump" aria-label="Jump">↑<small>JUMP</small></button><button id="cave-inspect" hidden>Inspect treasure</button><button id="harbour-chart" class="harbour-chart" hidden>Set sail ${icon("map")}</button><button id="cave-back" class="menu-back">‹ <span>Back</span></button></section>
    <section id="voyage-play" hidden><div class="voyage-status"><span>${icon("heart")}<div class="health-track"><i id="v-hull"></i></div><b id="v-health">100%</b></span><span class="gem-count">◆ <b id="v-gems">0 / 3</b></span></div><div class="voyage-mission"><small id="v-level"></small><strong id="v-objective"></strong><div class="voyage-track"><i id="v-travel"></i><span>✦</span></div></div><div id="v-weather" aria-label="Weather and wind"><span id="v-wind-arrow" aria-hidden="true">↑</span><span id="v-weather-name"></span><small id="v-gust"></small></div><div id="v-targets"></div><div id="v-wheel" aria-label="Drag the wheel to steer" role="group"><div class="wheel-ring"></div><span id="v-stick">${icon("wheel")}</span><small>STEER</small></div><button id="v-anchor" class="round" aria-label="Stop or start sailing">${icon("anchor")}</button><button id="v-fire" aria-label="Fire cannons"><span>${icon("cannon")}</span><b>BOOM!</b><small id="v-fire-label">TAP TO FIRE</small></button><div id="v-compass"><span id="v-arrow">↑</span><b>TREASURE</b><small id="v-distance"></small></div><div id="v-tip"></div></section>
    <section id="v-result" class="voyage-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-top"><span class="eyebrow" id="result-eyebrow">A NEW TREASURE FOR YOUR CAVE</span><h1 id="result-title"></h1><div id="result-stars"></div><p id="result-detail"></p></div><div class="result-bottom"><p class="collection-confirmation">${icon("chest")} Added to your cave</p><div class="result-actions"><button id="result-retry" class="secondary">Retry</button><button id="result-next" class="primary">Next level ${icon("arrow")}</button><button id="result-menu" class="text-button">Back to menu</button></div></div></section>
    <section id="v-paused" class="voyage-overlay pause-screen" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title"><div><span class="eyebrow">A LITTLE SHORE LEAVE</span><h1 id="pause-title">Ready when you are.</h1><button id="v-resume" class="primary">Keep sailing ${icon("play")}</button><button id="v-return" class="secondary">Choose levels</button></div></section>`;
    document.body.append(r);
    const q = (id: string) => r.querySelector<HTMLElement>(id)!;
    q(".voyage-header > div").insertAdjacentHTML("afterbegin", `<button id="v-camera" class="round" aria-label="Switch to captain view" title="Captain view · C" hidden>${icon("ship")}</button>`);
    q("#world-menu").insertAdjacentHTML("beforeend", `<button id="menu-free" class="free-chart-button">${icon("compass")} <span>Open world<small>Resume your voyage</small></span></button>`);
    q("#voyage-play").insertAdjacentHTML("beforeend", `<div id="v-captain-help" hidden><span id="v-look-hint"></span><button id="v-look-centre" aria-label="Look ahead">${icon("compass")} Ahead</button></div><div id="v-sea-chart" hidden><canvas width="240" height="240" aria-label="Nearby islands navigation chart"></canvas><button id="v-chart-open">Sea chart</button></div>`);
    r.insertAdjacentHTML("beforeend", `<section id="sea-chart-menu" hidden role="dialog" aria-modal="true" aria-labelledby="sea-chart-title"><div class="sea-chart-heading"><span class="eyebrow">THE CAPTAIN’S CHART</span><h1 id="sea-chart-title">The open sea</h1><p>One world. Your own adventure.</p></div><canvas width="1024" height="1024" aria-label="Full open world sea chart"></canvas><p class="sea-chart-note">East meets west. North meets south. Keep sailing to circle the world.</p><div class="sea-chart-actions"><button id="sea-chart-close" class="primary">Keep sailing ${icon("ship")}</button><button id="sea-chart-back" class="text-button">Back to menu</button></div></section>`);
    q("#menu-free").onclick = () => h.freeSail();
    q("#v-camera").onclick = h.camera;
    q("#v-look-centre").onclick = h.centreLook;
    q("#v-chart-open").onclick = () => h.seaChart(true);
    q("#sea-chart-close").onclick = () => h.seaChart(false);
    q("#sea-chart-back").onclick = h.menu;
    q("#main-menu").insertAdjacentHTML("beforeend", '<button id="menu-hold" class="text-button">Treasure hold</button>');
    q(".result-actions").insertAdjacentHTML("beforeend", '<button id="result-unload" class="hold-unload primary" hidden>Return to cave</button>');
    r.insertAdjacentHTML("beforeend", `<section id="hold-ui" hidden><div class="hold-heading"><span class="eyebrow">ABOARD THE BLACK PEARL</span><h1>The treasure hold</h1><p id="hold-count"></p></div><div class="hold-actions"><button id="hold-unload" class="primary">Return to cave ${icon("chest")}</button><button id="hold-sail" class="secondary">Keep sailing ${icon("map")}</button><button id="hold-back" class="text-button">Back to menu</button></div></section><section id="unload-ui" hidden><div class="hold-heading"><span class="eyebrow">BRINGING YOUR FORTUNE HOME</span><h1 id="unload-title">Unloading the ship</h1><p id="unload-count"></p></div><div class="hold-actions"><button id="unload-explore" class="primary" hidden>Explore your cave</button><button id="unload-menu" class="text-button">Back to menu</button><small id="unload-safe">Any unopened chests stay safely aboard.</small></div></section>`);
    q("#cave-ui").insertAdjacentHTML("beforeend", `<button id="harbour-unload" class="harbour-chart" hidden>Return to cave ${icon("chest")}</button>`);
    if (PRIVATE_PEARL) {
      q(".art-credit").innerHTML = 'Black Pearl model by <a href="https://www.cgtrader.com/3d-models/watercraft/recreational-watercraft/black-pearl-pirate-ship" target="_blank" rel="noopener">CrispierCone</a> · purchased for private family use.<br>Cabin and treasure display adapted for Broadside.';
    }
    q("#menu-hold").onclick = h.hold;
    q("#result-unload").onclick = q("#hold-unload").onclick = h.unload;
    q("#hold-sail").onclick = () => { h.menu(); this.showMenu("worlds"); };
    q("#hold-back").onclick = q("#unload-menu").onclick = h.menu;
    q("#harbour-unload").onclick = h.unload;
    q("#unload-explore").onclick = h.home;
    q("#v-home").onclick = () => {
      if (this.freeSeed !== null) { h.seaChart(true); return; }
      h.menu();
      this.showMenu("levels");
    };
    q("#v-return").onclick = () => {
      h.menu();
      this.showMenu(this.freeSeed === null ? "levels" : "worlds");
    };
    q("#v-pause").onclick = h.pause;
    q("#v-resume").onclick = h.pause;
    q("#v-anchor").onclick = h.anchor;
    q("#menu-play").onclick = () => this.showMenu("worlds");
    q("#menu-settings").onclick = () => this.showMenu("settings");
    q("#menu-cave").onclick = q("#map-cave").onclick = h.home;
    q("#visit-ship").onclick = h.harbour;
    q("#harbour-chart").onclick = () => { h.menu(); this.showMenu("worlds"); };
    q("#menu-back").onclick = () =>
      this.showMenu(this.menuPage === "levels" ? "worlds" : "main");
    q("#cave-back").onclick = () => {
      const page = this.root.dataset.walkPlace === "harbour" ? "main" : "worlds";
      h.menu();
      this.showMenu(page);
    };
    q("#cave-overview").onclick = () => {
      h.overview();
      this.overview();
    };
    q("#cave-inspect").onclick = h.caveInspect;
    q("#cave-jump").onpointerdown = (e) => {
      e.preventDefault();
      h.caveJump();
    };
    q("#cave-jump").onclick = (e) => {
      if (e.detail === 0) h.caveJump();
    };
    const pad = q("#cave-pad");
    let stickPointer: number | null = null;
    const moveStick = (e: PointerEvent) => {
      const rect = pad.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / 34;
      const y = (e.clientY - rect.top - rect.height / 2) / 34;
      const length = Math.max(1, Math.hypot(x, y));
      h.caveMove(x / length, -y / length);
      q("#cave-thumb").style.transform =
        `translate(${(x / length) * 34}px, ${(y / length) * 34}px)`;
    };
    pad.onpointerdown = (e) => {
      if (stickPointer !== null) return;
      e.preventDefault();
      stickPointer = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      moveStick(e);
    };
    pad.onpointermove = (e) => {
      if (e.pointerId === stickPointer) moveStick(e);
    };
    const releaseStick = () => {
      stickPointer = null;
      h.caveMove(0, 0);
      q("#cave-thumb").style.transform = "translate(0,0)";
    };
    pad.onpointerup =
      pad.onpointercancel =
      pad.onlostpointercapture =
        releaseStick;
    window.addEventListener("blur", releaseStick);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) releaseStick();
    });
    q("#cave-sail").onclick = () => {
      h.menu();
      this.pack = Math.max(
        0,
        WORLD_RELICS.indexOf(this.selected as 2 | 5 | 8 | 11),
      );
      this.showMenu("levels");
    };
    q("#world-packs").onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pack]");
      if (b) {
        this.pack = Number(b.dataset.pack);
        this.showMenu("levels");
      }
    };
    q("#voyage-levels").onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-level]",
      );
      if (b && !b.disabled) h.start(Number(b.dataset.level));
    };
    q("#result-retry").onclick = () => this.freeSeed === null
      ? h.start(this.activeLevel) : h.freeSail(true);
    q("#result-next").onclick = () => {
      if (!this.resultLost && this.activeLevel + 1 < TOTAL_LEVELS)
        h.start(this.activeLevel + 1);
    };
    q("#result-menu").onclick = () => h.menu();
    const fire = q("#v-fire");
    fire.onpointerdown = (e) => {
      e.preventDefault();
      fire.setPointerCapture(e.pointerId);
      h.fire();
      controls.setVirtual("fireBoth", true);
      fire.classList.add("pressed");
    };
    fire.onclick = (e) => {
      if (e.detail === 0) h.fire();
    };
    const release = () => {
      controls.setVirtual("fireBoth", false);
      fire.classList.remove("pressed");
    };
    fire.onpointerup = release;
    fire.onpointercancel = release;
    fire.onlostpointercapture = release;
    const wheel = q("#v-wheel"),
      stick = q("#v-stick");
    let pointer: number | null = null;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const rect = wheel.getBoundingClientRect(),
        x = e.clientX - rect.left - rect.width / 2,
        y = e.clientY - rect.top - rect.height / 2,
        d = Math.hypot(x, y);
      stick.style.transform = `translate(${x * Math.min(1, 27 / Math.max(d, 1))}px,${y * Math.min(1, 27 / Math.max(d, 1))}px)`;
      h.steer(d < 10 ? null : Math.atan2(x, -y));
    };
    wheel.onpointerdown = (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      wheel.setPointerCapture(pointer);
      move(e);
    };
    wheel.onpointermove = move;
    const stop = () => {
      pointer = null;
      stick.style.transform = "";
      h.steer(null);
    };
    wheel.onpointerup = stop;
    wheel.onpointercancel = stop;
    wheel.onlostpointercapture = stop;
    this.showMenu("main");
  }
  private q(id: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(id)!;
  }
  select(index: number, goldWorld = 0): void {
    this.goldWorld = goldWorld;
    this.selected = Math.max(0, Math.min(11, index));
    this.pack = Math.max(
      0,
      WORLD_RELICS.indexOf(this.selected as 2 | 5 | 8 | 11),
    );
    this.root.dataset.caveView = "inspect";
    this.h.select(this.selected, this.goldWorld);
    this.renderRelic();
    this.renderLevels();
  }
  private menuPage: "main" | "worlds" | "levels" | "settings" = "main";
  showMenu(page: "main" | "worlds" | "levels" | "settings" = "main"): void {
    this.q("#v-camera").hidden = true;
    this.q("#hold-ui").hidden = this.q("#unload-ui").hidden = true;
    this.q("#menu-hold").textContent = `${PRIVATE_PEARL ? "Treasure room" : "Treasure hold"}${this.progress.cargo.length ? ` · ${(this.progress.cargo.length * 1000).toLocaleString()} gold aboard` : ""}`;
    this.menuPage = page;
    this.q("#captain-menu").hidden = false;
    this.q("#cave-ui").hidden =
      this.q("#voyage-play").hidden =
      this.q("#v-result").hidden =
      this.q("#v-paused").hidden =
        true;
    this.q("#v-pause").hidden = this.q("#v-home").hidden = true;
    for (const [name, id] of Object.entries({
      main: "main-menu",
      worlds: "world-menu",
      levels: "level-menu",
      settings: "settings-menu",
    }))
      this.q("#" + id).hidden = name !== page;
    this.q("#menu-back").hidden = page === "main";
    this.renderLevels();
    this.root.dataset.screen = page;
  }
  home(): void {
    this.q("#v-camera").hidden = true;
    this.q("#hold-ui").hidden = this.q("#unload-ui").hidden = true;
    this.root.dataset.walkPlace = "cave";
    this.q(".cave-title .eyebrow").textContent = "YOUR SECRET HIDEOUT";
    this.q("#harbour-chart").hidden = true;
    this.q("#harbour-unload").hidden = true;
    this.q("#cave-pad").setAttribute("aria-label", "Move around the cave");
    if (!CAVE_ITEMS.includes(this.selected)) this.selected = 0;
    this.q("#captain-menu").hidden = true;
    this.root.dataset.screen = "cave";
    this.pack = Math.max(
      0,
      WORLD_RELICS.indexOf(this.selected as 2 | 5 | 8 | 11),
    );
    this.q("#cave-ui").hidden = false;
    this.q("#voyage-play").hidden = true;
    this.q("#v-result").hidden = true;
    this.q("#v-result").classList.remove("unboxing", "revealed");
    this.q("#v-paused").hidden = true;
    this.q("#v-pause").hidden = true;
    this.q("#v-home").hidden = true;
    this.renderRelic();
    this.renderLevels();
    this.overview();
  }
  shipLoadFailed(): void {
    this.q('.menu-tagline').textContent = 'The ship could not load. Please try again.';
  }
  harbour(): void {
    this.home();
    this.root.dataset.walkPlace = "harbour";
    this.q("#cave-overview").hidden = true;
    this.q("#harbour-chart").hidden = false;
    this.q("#harbour-unload").hidden = !this.progress.cargo.length;
    this.q("#cave-pad").setAttribute("aria-label", PRIVATE_PEARL ? "Walk on the Black Pearl" : "Walk on the ship and quay");
    this.q(".cave-title .eyebrow").textContent = "YOUR SHIP · PORT BLACKWATER";
    this.q("#cave-count").textContent = PRIVATE_PEARL
      ? `${goldTotal(this.progress).toLocaleString()} gold · ${this.progress.relics.filter(id => WORLD_RELICS.includes(id as 2|5|8|11)).length} keepsakes · Treasure room under the quarterdeck`
      : "Explore the decks. Cross the gangplank to town.";
    this.harbourWalk(false, "Aboard the Black Pearl", false);
  }
  harbourWalk(locked: boolean, room: string, helm: boolean): void {
    this.q(".cave-title h1").textContent = room;
    this.q("#cave-inspect").hidden = !helm;
    this.q("#cave-inspect").textContent = "Set sail · open chart";
    this.q(".gallery-hint").textContent = innerWidth < 700 || matchMedia("(pointer: coarse)").matches
      ? "Left stick to walk · swipe to look · jump to explore"
      : `${locked ? "Mouse" : "Drag"} or arrows look · WASD walk · Space jump · E chart`;
  }
  overview(): void {
    this.root.dataset.caveView = "walk";
    this.q("#relic-info").hidden = true;
  }
  caveWalk(
    nearby: number | null,
    locked: boolean,
    inspecting: boolean,
    room: string,
  ): void {
    this.root.dataset.caveView = inspecting ? "inspect" : "walk";
    this.q("#cave-overview").hidden = !inspecting;
    this.q("#cave-inspect").hidden = inspecting || nearby === null;
    this.q("#cave-inspect").textContent =
      nearby === null ? "" : `Inspect · ${RELICS[nearby]!.name}`;
    this.q(".cave-title h1").textContent = room;
    this.q(".gallery-hint").textContent = inspecting
      ? this.selected === 0 ? "Scroll or pinch to zoom · spread fingers or Esc to return" : "Drag to turn · spread fingers or Esc to return"
      : innerWidth < 700 ||
          (innerWidth < 1000 && innerHeight < 500) ||
          matchMedia("(pointer: coarse)").matches
        ? "Left stick to move · swipe to look · tap a treasure"
        : `${locked ? "Mouse" : "Drag"} or arrows look · WASD walk · Space jump · E inspect`;
  }
  private renderRelic(): void {
    const banked = caveProgress(this.progress);
    this.q("#relic-info").hidden = false;
    const gold = this.selected === 0;
    const world = gold
      ? this.goldWorld
      : WORLD_RELICS.indexOf(this.selected as 2 | 5 | 8 | 11);
    const relic = RELICS[this.selected]!;
    const owned = gold
      ? worldGold(banked, world) > 0
      : banked.relics.includes(this.selected);
    this.q("#cave-count").textContent =
      `${goldTotal(banked).toLocaleString()} gold · ${banked.relics.length} / 4 world treasures${this.progress.cargo.length?` · ${(this.progress.cargo.length*1000).toLocaleString()} aboard`:""}`;
    this.q("#relic-number").textContent = gold
      ? `${PACKS[world]!.name.toUpperCase()} · GOLD BANK`
      : `WORLD ${world + 1} · ${owned ? "FOUND & FOREVER YOURS" : "WAITING TO BE DISCOVERED"}`;
    this.q("#relic-title").textContent = gold
      ? `${worldGold(banked, world).toLocaleString()} gold`
      : owned
        ? relic.name
        : "A world’s secret treasure";
    this.q("#relic-story").textContent = gold
      ? `Every new level in ${PACKS[world]!.name} pours 1,000 doubloons into this bank. Every coin stays where it landed.`
      : owned
        ? relic.story
        : `Complete all ten levels in ${PACKS[world]!.name} to open this chest.`;
    this.q("#relic-stars").textContent = gold
      ? ""
      : owned
        ? `★ ${worldStars(this.progress.voyages, world)} / 30 world stars`
        : "✧ ✧ ✧";
    this.q("#cave-sail").hidden = owned;
  }
  private renderLevels(): void {
    const next =
      worldLevels(this.pack).find((i) => !this.progress.voyages[i]) ??
      (this.pack + 1) * LEVELS_PER_WORLD - 1;
    const stars = (pack: number) => worldStars(this.progress.voyages, pack);
    this.q("#world-packs").innerHTML = PACKS.map(
      (p, i) =>
        `<button data-pack="${i}" class="world-island world-${i}" aria-label="${p.name}, world ${i + 1}">${worldArt(i)}<span class="world-label"><small>WORLD ${i + 1}</small><b>${p.name}</b><span>${!levelUnlocked(this.progress.voyages, i * LEVELS_PER_WORLD) ? icon("lock") + " Uncharted" : "★ " + stars(i) + " / 30"}</span></span></button>`,
    ).join("");
    const pack = PACKS[this.pack]!;
    this.q("#world-number").textContent = `WORLD ${this.pack + 1}`;
    this.q("#world-name").textContent = pack.name;
    this.q("#pack-caption").textContent = pack.subtitle;
    this.q(".level-note").textContent =
      `1,000 gold per level · World treasure: ${RELICS[WORLD_RELICS[this.pack]!]!.name}`;
    this.q("#level-world-art").innerHTML = worldArt(this.pack, "level");
    this.q("#voyage-levels").innerHTML = Array.from(
      { length: LEVELS_PER_WORLD },
      (_, n) => {
        const i = this.pack * LEVELS_PER_WORLD + n,
          v = this.progress.voyages[i],
          locked = !levelUnlocked(this.progress.voyages, i);
        return `<button data-level="${i}" ${locked ? "disabled" : ""} aria-label="Level ${n + 1}${locked ? ", locked" : v ? ", " + v.stars + " stars" : ", set sail"}" class="level-tile ${locked ? "locked" : ""} ${i === next ? "next-level" : ""}"><span class="tile-number">${n + 1}</span>${locked ? icon("lock", "tile-lock") : ""}<span class="tile-stars">${[0, 1, 2].map((s) => `<i class="${s < (v?.stars ?? 0) ? "earned" : ""}">★</i>`).join("")}</span><span class="tile-treasure" title="${n === LEVELS_PER_WORLD - 1 ? RELICS[WORLD_RELICS[this.pack]!]!.name : "1,000 gold"}">${icon(n === LEVELS_PER_WORLD - 1 ? "gem" : "chest")}</span></button>`;
      },
    ).join("");
  }

  play(index: number, voyage: VoyageDef = generateVoyage(index)): void {
    this.q("#hold-ui").hidden = this.q("#unload-ui").hidden = true;
    this.q("#captain-menu").hidden = true;
    this.root.dataset.screen = "play";
    this.activeLevel = index;
    this.freeSeed = voyage.freeSailing ? voyage.level.seed : null;
    this.chartTime = -Infinity;
    this.root.dataset.freeSailing = String(!!voyage.freeSailing);
    this.pack = voyage.pack;
    this.messageUntil = 0;
    this.q("#cave-ui").hidden = true;
    this.q("#v-result").hidden = true;
    this.q("#v-result").classList.remove("unboxing", "revealed");
    this.q("#v-paused").hidden = true;
    this.q("#voyage-play").hidden = false;
    this.q("#v-pause").hidden = false;
    this.q("#v-home").hidden = false;
    this.q("#v-home").setAttribute("aria-label", voyage.freeSailing ? "Open sea chart" : "Choose levels");
    this.q("#v-camera").hidden = false;
    this.q("#v-fire").hidden = !voyage.freeSailing && voyage.level.waves[0]!.enemies.length === 0 && !voyage.forts.length;
    this.q("#v-tip").textContent = voyage.level.intro + (voyage.weather.drift ? " Gusts push your ship — steer into the wind to hold your course." : "");
    this.q("#v-weather").hidden = voyage.pack === 0 && !voyage.freeSailing;
    this.q("#v-compass").hidden = !!voyage.freeSailing;
    this.q("#v-sea-chart").hidden = !voyage.freeSailing;
    this.q(".voyage-track").hidden = !!voyage.freeSailing;
    this.q("#v-weather-name").textContent = voyage.weather.name;
    this.root.dataset.weather = voyage.weather.kind;
  }
  camera(captain: boolean): void {
    this.root.dataset.camera = captain ? "captain" : "overview";
    const b = this.q("#v-camera");
    b.setAttribute("aria-pressed", String(captain));
    b.setAttribute("aria-label", captain ? "Switch to overhead view" : "Switch to captain view");
    b.innerHTML = icon("eye");
    b.title = `${captain ? "Overhead" : "Captain"} view · C`;
    this.q("#v-captain-help").hidden = !captain;
    this.q("#v-look-hint").textContent = innerWidth < 700 || matchMedia("(pointer: coarse)").matches
      ? "Swipe to look · wheel to steer"
      : "Drag / arrows look · A D steer · W S sails · Space fire · C view";
  }
  paused(value: boolean): void {
    this.q("#v-paused").hidden = !value;
    this.q("#voyage-play").inert = value;
  }
  seaChart(open: boolean, session?: VoyageSession): void {
    this.q("#sea-chart-menu").hidden = !open;
    this.q("#voyage-play").inert = open;
    if (open && session) this.drawWorldChart(session);
  }
  result(s: VoyageSession, reward?: VoyageReward): void {
    this.q("#v-camera").hidden = true;
    this.q("#hold-ui").hidden = this.q("#unload-ui").hidden = true;
    this.q("#result-unload").hidden = s.state !== "won" || !this.progress.cargo.length;
    this.activeLevel = s.voyage.index;
    this.resultLost = s.state === "lost";
    this.q("#result-next").hidden =
      !!s.voyage.freeSailing || this.resultLost || this.activeLevel === TOTAL_LEVELS - 1;
    this.q(".result-actions").classList.toggle(
      "last-result",
      this.q("#result-next").hidden,
    );
    this.q("#captain-menu").hidden = true;
    this.root.dataset.screen = "result";
    this.q("#cave-ui").hidden = true;
    this.q("#voyage-play").hidden = true;
    this.q("#v-result").hidden = false;
    this.q("#v-pause").hidden = true;
    this.q("#v-home").hidden = false;
    this.revealName =
      reward?.special !== null && reward?.special !== undefined
        ? RELICS[reward.special]!.name
        : reward?.gold
          ? `+${reward.gold} gold`
          : "The captain’s gold";
    this.revealCaption =
      reward?.special !== null && reward?.special !== undefined
        ? "WORLD COMPLETE · A SPECIAL TREASURE"
        : reward?.gold
          ? "YOUR HOARD IS GROWING"
          : "VOYAGE COMPLETE";
    this.q(".collection-confirmation").innerHTML =
      `${icon("chest")} ${reward?.gold ? `${reward.gold.toLocaleString()} gold safely aboard${reward.special !== null ? " · Special treasure collected" : ""}` : "Gold already collected · Best stars saved"}${this.progress.cargo.length > 1 ? ` · ${(this.progress.cargo.length * 1000).toLocaleString()} aboard in total` : ""}`;
    this.revealStars = s.stars;
    this.q("#result-stars").removeAttribute("aria-label");
    this.q("#result-title").textContent =
      s.state === "won" ? "A chest full of wonder" : "Your ship sank";
    this.q("#v-result").classList.toggle("unboxing", s.state === "won");
    this.q("#v-result").classList.remove("revealed", "pouring");
    for (const button of this.q(
      "#v-result",
    ).querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = s.state === "won";
    this.q("#result-eyebrow").textContent =
      s.state === "won" ? "YOU REACHED THE TREASURE!" : "SHIPWRECK";
    this.q("#result-stars").innerHTML =
      s.state === "won"
        ? Array.from(
            { length: 3 },
            (_, i) =>
              `<span class="reward-star ${i < s.stars ? "earned" : "empty"}" style="--order:${i}">${i < s.stars ? "★" : "☆"}</span>`,
          ).join("")
        : icon("anchor");
    this.q("#result-detail").textContent =
      s.state === "won"
        ? `${s.gemsFound} / 3 hidden gems · ${Math.round((100 * s.damageTaken) / s.player.spec.maxHull)}% hull damage${s.rescues ? " · Crew repairs" : ""}`
        : s.failureReason === "rocks"
          ? "You struck the rocks. Steer clear and try again!"
          : s.failureReason === "island"
            ? "You crashed into an island. Find a safe passage!"
            : "Your ship took too much damage. Try again!";
    this.q(".collection-confirmation").hidden = s.state !== "won";
  }
  depositing(active: boolean): void { this.q("#v-result").classList.toggle("pouring", active); }
  hold(): void {
    this.showMenu(); this.q("#captain-menu").hidden=true;this.q("#hold-ui").hidden=false;
    this.q("#hold-count").textContent=this.progress.cargo.length ? `${(this.progress.cargo.length*1000).toLocaleString()} gold · ${this.progress.cargo.length} chest${this.progress.cargo.length===1?"":"s"} safely aboard` : "Your hold is ready. Find gold on your next voyage.";
    this.q("#hold-unload").hidden=!this.progress.cargo.length;this.root.dataset.screen="hold";
  }
  unloading(chest:number,total:number,done=false):void {
    this.q("#v-camera").hidden = true;
    this.q("#captain-menu").hidden=this.q("#v-result").hidden=this.q("#hold-ui").hidden=this.q("#cave-ui").hidden=this.q("#voyage-play").hidden=true;
    this.q("#unload-ui").hidden=false;this.q("#v-pause").hidden=this.q("#v-home").hidden=true;
    this.q("#unload-title").textContent=done?"Welcome home, Captain":"Unloading the ship";
    this.q("#unload-count").textContent=done?`${(total*1000).toLocaleString()} gold brought home`:`Chest ${chest} of ${total} · ${(total*1000).toLocaleString()} gold coming home`;
    this.q("#unload-explore").hidden=!done;this.q("#unload-safe").hidden=done;this.root.dataset.screen="unloading";
  }
  reveal(time: number, discovered: boolean, ready: boolean): void {
    if (!this.q("#v-result").classList.contains("unboxing")) return;
    if (discovered) {
      this.q("#result-title").textContent = this.revealName;
      this.q("#result-eyebrow").textContent = this.revealCaption;
      this.q("#v-result").classList.add("revealed");
    }
    for (const [i, star] of Array.from(
      this.q("#result-stars").children,
    ).entries())
      star.classList.toggle("arrived", time >= 3.4 + i * 0.35);
    if (ready) {
      this.q("#v-result").classList.remove("unboxing");
      for (const button of this.q(
        "#v-result",
      ).querySelectorAll<HTMLButtonElement>("button"))
        button.disabled = false;
      this.q("#result-stars").setAttribute(
        "aria-label",
        `${this.revealStars} of 3 stars`,
      );
    }
  }
  help(message: string, until: number): void {
    this.q("#v-tip").textContent = message;
    this.messageUntil = until;
    this.q("#v-tip").classList.remove("fade");
  }
  update(
    s: VoyageSession,
    project: (
      x: number,
      y: number,
      z: number,
    ) => { x: number; y: number; visible: boolean },
    viewHeading = 0,
  ): void {
    const health = Math.round((s.player.hull / s.player.spec.maxHull) * 100);
    this.q("#v-hull").style.width = `${health}%`;
    this.q("#v-health").textContent = `${health}%`;
    const anchor = this.q("#v-anchor"), sailing = String(s.player.sail > 0);
    if (anchor.dataset.sailing !== sailing) {
      anchor.dataset.sailing = sailing;
      anchor.setAttribute("aria-label", s.player.sail ? "Drop anchor" : "Set sail");
      anchor.innerHTML = icon(s.player.sail ? "anchor" : "ship");
    }
    this.q("#v-gems").textContent = `${s.gemsFound} / ${s.voyage.gems.length}`;
    this.q("#v-level").textContent =
      s.voyage.freeSailing ? "OPEN WORLD · FREE SAILING"
        : `${PACKS[s.voyage.pack]!.name.toUpperCase()} · LEVEL ${stageOf(s.voyage.index) + 1}`;
    this.q("#v-objective").textContent = s.voyage.freeSailing
      ? SEA_LANDMARKS.find(p => seaDistance(p, s.player.pos, s.level.bounds) < 220)?.name ?? s.level.name : s.level.name;
    this.q("#v-travel").style.width =
      `${Math.max(0, Math.min(100, ((s.player.pos.z - s.level.player.pos.z) / (s.voyage.finish.z - s.level.player.pos.z)) * 100))}%`;
    const angle = angleDiff(viewHeading, headingTo(s.player.pos, s.voyage.finish));
    this.q("#v-arrow").style.transform = `rotate(${angle}rad)`;
    this.q("#v-distance").textContent =
      `${Math.round(distance(s.player.pos, s.voyage.finish))} m`;
    this.q("#v-wind-arrow").style.transform = `rotate(${s.world.wind.direction - viewHeading}rad)`;
    this.q("#v-gust").textContent = s.voyage.weather.drift ? `WIND ${(s.world.wind.drift ?? 0).toFixed(1)} m/s` : "";
    const cooldown = s.player.reload[s.firingSide];
    this.q("#v-fire-label").textContent =
      cooldown > 0
        ? `LOADING ${cooldown.toFixed(1)}s`
        : s.targetInArc
          ? `${s.firingSide === "port" ? "LEFT" : "RIGHT"} SIDE READY`
          : s.enemies.some(
                (e) =>
                  e.alive &&
                  distance(e.pos, s.player.pos) <
                    s.player.spec.cannonRange * 1.1,
              )
            ? "TURN SIDE TO PIRATE"
            : "TAP TO FIRE";
    this.q("#v-fire").classList.toggle(
      "ready-target",
      s.targetInArc && cooldown <= 0,
    );
    const obstacle = s.level.islands.find(
      (island, i) =>
        (s.voyage.freeSailing || (i > 0 && i < s.level.islands.length - 1)) &&
        seaDistance(island.pos, s.player.pos, s.world.periodic ? s.level.bounds : undefined) < island.radius + 32,
    );
    if (s.elapsed < this.messageUntil)
      this.q("#v-tip").classList.remove("fade");
    else if (
      s.voyage.whirlpools.some((w) => distance(w, s.player.pos) < w.radius + 13)
    ) {
      this.q("#v-tip").textContent =
        "Whirlpool! Keep sailing and steer away from the dark center.";
      this.q("#v-tip").classList.remove("fade");
    } else if (obstacle && (s.voyage.pack === 0 || s.voyage.freeSailing)) {
      this.q("#v-tip").textContent =
        obstacle.kind === "sea-rock"
          ? "Rocks ahead! Steer around them — a crash sinks your ship."
          : "Island ahead! Steer around it — a crash sinks your ship.";
      this.q("#v-tip").classList.remove("fade");
    } else this.q("#v-tip").classList.toggle("fade", s.elapsed > 10);
    const targets = s.enemies
      .filter((e) => e.alive)
      .flatMap((e) => {
        const p = project(e.pos.x, 9, e.pos.z);
        return p.visible &&
          p.x > 10 &&
          p.x < innerWidth - 10 &&
          p.y > (innerWidth < 600 ? 225 : 90) &&
          p.y < innerHeight - 100
          ? [
              `<span class="pirate-tag" style="left:${p.x}px;top:${p.y}px">${icon("skull")}<i style="--hp:${(e.hull / e.spec.maxHull) * 100}%"></i></span>`,
            ]
          : [];
      });
    for (const gem of s.voyage.gems)
      if (!gem.found && (!s.voyage.freeSailing || seaDistance(gem, s.player.pos, s.level.bounds) < 160)) {
        const x = s.world.periodic ? s.player.pos.x + wrapCoordinate(gem.x - s.player.pos.x, s.level.bounds) : gem.x;
        const z = s.world.periodic ? s.player.pos.z + wrapCoordinate(gem.z - s.player.pos.z, s.level.bounds) : gem.z;
        const p = project(x, 5, z);
        if (
          p.visible &&
          p.x > 20 &&
          p.x < innerWidth - 20 &&
          p.y > (innerWidth < 600 ? 225 : 110) &&
          p.y < innerHeight - 160
        )
          targets.push(
            `<span class="sea-gem-tag" style="left:${p.x}px;top:${p.y}px">◆</span>`,
          );
      }
    const end = project(s.voyage.finish.x, 7, s.voyage.finish.z);
    if (
      !s.voyage.freeSailing &&
      end.visible &&
      end.x > 10 &&
      end.x < innerWidth - 10 &&
      end.y > 100 &&
      end.y < innerHeight - 120
    )
      targets.push(
        `<span class="treasure-tag" style="left:${end.x}px;top:${end.y}px">${icon("chest")} TREASURE</span>`,
      );
    this.q("#v-targets").innerHTML = targets.join("");
    if (s.voyage.freeSailing && s.elapsed - this.chartTime > .1) {
      this.chartTime = s.elapsed;
      this.drawSeaChart(s, viewHeading);
    }
  }
  private drawSeaChart(s: VoyageSession, yaw: number): void {
    const c = this.q("#v-sea-chart canvas") as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 240, 240);
    ctx.fillStyle = "#183d42"; ctx.beginPath(); ctx.arc(120, 120, 114, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(120, 120, 111, 0, Math.PI * 2); ctx.clip();
    const plot = (x: number, z: number) => {
      const dx = wrapCoordinate(x - s.player.pos.x, s.level.bounds), dz = wrapCoordinate(z - s.player.pos.z, s.level.bounds);
      return [120 + (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * .55,
        120 - (dx * Math.sin(yaw) + dz * Math.cos(yaw)) * .55];
    };
    ctx.strokeStyle = "#71908d44"; ctx.lineWidth = 1;
    for (const r of [40, 80, 110]) { ctx.beginPath(); ctx.arc(120, 120, r, 0, Math.PI * 2); ctx.stroke(); }
    for (const i of s.level.islands) {
      const [x, y] = plot(i.pos.x, i.pos.z);
      ctx.fillStyle = i.kind === "sand" ? "#acb387" : "#858a81";
      ctx.strokeStyle = "#d5c994"; ctx.beginPath(); ctx.arc(x!, y!, Math.max(2, i.radius * .55), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const g of s.voyage.gems) if (!g.found) {
      const [x, y] = plot(g.x, g.z); ctx.fillStyle = "#89e5ce"; ctx.fillRect(x! - 2, y! - 2, 4, 4);
    }
    ctx.translate(120, 120); ctx.rotate(s.player.heading - yaw);
    ctx.fillStyle = "#ffdb8b"; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(6, 8); ctx.lineTo(0, 4); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#e4d6ad"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("N", 120 - Math.sin(yaw) * 100, 125 - Math.cos(yaw) * 100);
  }
  private drawWorldChart(s: VoyageSession): void {
    const c = this.q("#sea-chart-menu canvas") as HTMLCanvasElement, ctx = c.getContext("2d")!;
    const margin = 36, scale = (1024 - margin * 2) / (s.level.bounds * 2);
    const plot = (x: number, z: number) => [512 + x * scale, 512 - z * scale] as const;
    const sea = ctx.createLinearGradient(0, 0, 1024, 1024);
    sea.addColorStop(0, "#afbdad"); sea.addColorStop(1, "#758f85");
    ctx.fillStyle = sea; ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = "#334d4930"; ctx.lineWidth = 1;
    for (let n = 0; n < 16; n++) {
      const a = n * Math.PI / 8;
      ctx.beginPath(); ctx.moveTo(512, 512); ctx.lineTo(512 + Math.sin(a) * 800, 512 + Math.cos(a) * 800); ctx.stroke();
    }
    for (let r = 100; r < 700; r += 100) { ctx.beginPath(); ctx.arc(512, 512, r, 0, Math.PI * 2); ctx.stroke(); }
    for (const [n, island] of s.level.islands.entries()) {
      const [x, y] = plot(island.pos.x, island.pos.z), radius = Math.max(2, island.radius * scale);
      ctx.fillStyle = island.kind === "sand" ? "#c7b280" : "#716e59";
      ctx.strokeStyle = "#4d4934"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let v = 0; v <= 24; v++) {
        const a = v * Math.PI / 12, r = radius * (1 + Math.sin(a * 3 + n) * .1 + Math.cos(a * 5 - n) * .07);
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * .84;
        if (!v) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (island.kind === "sand") {
        ctx.fillStyle = "#597b52"; ctx.beginPath(); ctx.ellipse(x, y, radius * .72, radius * .52, .1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = "#235948";
    for (const g of s.voyage.gems) if (!g.found) {
      const [x, y] = plot(g.x, g.z); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = "center";
    for (const p of SEA_LANDMARKS) {
      const [x, y] = plot(p.x, p.z);
      ctx.font = "26px 'Pirata One', Georgia, serif";
      ctx.lineWidth = 6; ctx.strokeStyle = "#d5c49b"; ctx.strokeText(p.name, x, y - 22);
      ctx.fillStyle = "#352f22"; ctx.fillText(p.name, x, y - 22);
    }
    const [px, py] = plot(s.player.pos.x, s.player.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(s.player.heading);
    ctx.fillStyle = "#fce1a1"; ctx.strokeStyle = "#47331d"; ctx.lineWidth = 3;
    ctx.shadowColor = "#fff8cd"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(10, 12); ctx.lineTo(0, 7); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#403a2b"; ctx.font = "bold 28px Georgia";
    ctx.fillText("N", 512, 28); ctx.fillText("S", 512, 1016); ctx.fillText("W", 19, 523); ctx.fillText("E", 1003, 523);
    ctx.strokeStyle = "#4c4935"; ctx.lineWidth = 2; ctx.strokeRect(margin, margin, 952, 952);
  }
}
