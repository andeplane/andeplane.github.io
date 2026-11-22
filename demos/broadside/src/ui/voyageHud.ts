import { broadsideCatalogs } from "../game/messages";
import { worldAsset } from "./worldAtlas";
import { worldRouteLine, worldRoutePoints, worldRouteStop } from "./worldRoute";
import { pirateMenuItem, settingsDesk } from "./homeMenu";
import { adventureChart, chartCenterButton, chartShip, faceChartShip } from "./adventureChart";
import { PACKS, RELICS, type VoyageSession, type VoyageDef } from "../game/voyage";
import {
  goldTotal,
  GOLD_PER_LEVEL,
  cargoChests,
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
  worldUnlocked,
  levelUnlocked,
} from "../game/campaign";
import { generateVoyage } from "../game/voyage";
import type { Progress } from "../game/progress";
import { icon } from "./icons";
import { holdLedger, ledgerStarMarks, ledgerStars, rewardLedger } from "./rewardLedger";
import { backButton, chartAction, chartHeader, menuBrand, menuHeader } from "./menuChrome";
import { caveHeader, caveNotice, caveTally, updateCaveBalance } from "./caveHud";
import { PRIVATE_PEARL } from "../privatePearl";
import { lanternBackdrop, lanternHome } from "./lanternHome";
import { deviceLanguages, languageOption, readLanguagePreference, saveLanguagePreference, watchMenuLanguage } from "../i18n/languages";
import { commonLocale, createLocale } from "../i18n/locale";
import { languagePickerMarkup, bindLanguagePicker, languageSettingLabel } from "./languagePicker";
import "./explorationHud.css";
import { touchSteeringTurn } from "../input/touchSteering";
import { worldArt, pirateShipArt } from "./worldArt";
import { Controls } from "../input/controls";
import { headingTo, distance, seaDistance, wrapCoordinate } from "../sim/math";
import { SEA_LANDMARKS } from "../game/freeSailing";
import { drawGemSymbol, drawLandmarkSymbol } from "./seaChartSymbols";
import { mountMapPan, type MapCamera, type MapPanController } from "./mapPan";
import { islandArt } from "./islandChart";
import { locationWorld, type ShipLocation } from "../game/journey";
const REGIONAL_CHART_WIDTH = 1900;
const HULL_HEARTS = 3;
const COMPASS_DIRECTIONS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const homeLanguageKey = "broadside.home.language.v1";
const caveBalance = (amount: number) => ({
  amount,
  accessible: `${amount.toLocaleString()} gold safely in your cave`,
  currency: "gold",
  locale: "en",
});
function homeStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
interface Handlers {
  start: (index: number) => void;
  travel: (destination: "cave" | "ship" | "hold" | number) => void;
  freeSail: (respawn?: boolean) => void;
  seaChart: (open: boolean) => void;
  camera: () => void;
  deck: () => void;
  fish: () => void;
  cancelFish: () => void;
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
  steer: (turn: number | null) => void;
  anchor: () => void;
}
export class VoyageHud {
  readonly root: HTMLElement;
  selected = 0;
  private goldWorld = 0;
  pack = 0;
  private progress: Progress;
  private homeLanguage = readLanguagePreference(homeStorage(), homeLanguageKey);
  private messageUntil = 0;
  private releaseSteering = () => {};
  private hullPercent = -1;
  private activeLevel = 0;
  private freeSeed: number | null = null;
  private travelCamera?: { pan: MapPanController; plane: HTMLElement; chart: HTMLElement; viewport: HTMLElement; follow: boolean; ship: HTMLElement };
  private regionalPan?: MapPanController;
  private regionalCameras = new Map<number, MapCamera>();
  private chartTime = 0;
  private chartTrigger: HTMLElement | null = null;
  private resultLost = false;
  private revealName = "";
  private revealStars = 0;
  private deckKey = "";
  private shipLocation: ShipLocation = { kind: "port" };
  private shipPanelTrigger: HTMLElement | null = null;
  constructor(
    progress: Progress,
    controls: Controls,
    private h: Handlers,
  ) {
    this.progress = progress;
    const r = (this.root = document.createElement("div"));
    r.id = "voyage-ui";
    const shipAction = (id: string) => chartAction({ id, label: "Your ship", icon: "ship", accessibleLabel: "Your ship details", controls: "ship-panel" });
    r.innerHTML = `${menuHeader({ className: "voyage-header", brand: menuBrand({ title: "BROADSIDE", subtitle: "A LITTLE CAPTAIN’S COLLECTION", className: "voyage-brand" }), actions: `<button id="v-home" class="round" aria-label="Choose levels">${icon("map")}</button><button id="v-pause" class="round" aria-label="Pause voyage">${icon("pause")}</button>` })}
    <section id="captain-menu" class="captain-menu">
      <div class="menu-atmosphere" aria-hidden="true"><div class="moon"></div><div class="distant-rocks"></div><div class="hero-ship">${pirateShipArt()}</div><div class="ocean-mist"></div><div class="menu-embers"></div></div>
      <div id="main-menu" class="menu-page">${lanternHome()}</div>
      <dialog class="language-picker captain-language" aria-labelledby="language-picker-title"></dialog>
      <div id="world-menu" class="menu-page" hidden>${chartHeader({ back: backButton({ id: "map-back", destination: "main menu" }) })}<div class="world-map" role="group" aria-label="Pirate sea chart"><svg class="map-route" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path class="route-wide" d="M370 930 C280 885 90 720 170 520 S250 90 410 190 S440 650 650 480 S735 90 865 135"/><path class="route-tall" d="M170 930 C110 810 110 710 245 635 S815 810 755 545 S80 525 245 185 S570 290 755 150"/></svg><button id="map-cave" class="map-cave" aria-label="Visit treasure cave"><img class="cave-art" src="${import.meta.env.BASE_URL}assets/map/treasure-cave.webp" width="640" height="640" alt="" draggable="false" decoding="async" /><span>Your cave</span></button><div id="world-packs"></div></div><p class="map-footnote">Gold in every level. A special treasure in every world.</p></div>
      <div id="level-menu" class="menu-page" hidden>${chartHeader({ back: backButton({ id: "level-back", destination: "pirate seas chart" }), heading: `<h1 id="world-name"></h1>`, actions: shipAction("level-ship") })}<div class="level-board"><div class="regional-viewport" tabindex="0" aria-label="Island route" data-map-viewport><div id="voyage-levels" data-map-world></div>${chartCenterButton("Current island", "regional-center")}</div><p class="level-note">1,000 gold per level · Complete the world for its special treasure.</p></div></div>
      <div id="settings-menu" class="menu-page" hidden>${chartHeader({ back: backButton({ id: "menu-back", destination: "main menu" }) })}${settingsDesk("Settings",`<button id="settings-language" class="desk-action" aria-haspopup="dialog"></button><button type="button" class="desk-action privacy-action" data-open-privacy>Privacy & support</button><p class="art-credit"><span id="model-credit">Black Pearl model by</span> <a href="https://www.thingiverse.com/thing:4951578" target="_blank" rel="noopener">DeltaX_F</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a><br><span id="adapted-credit">Adapted for Broadside.</span></p>`)}</div>
    </section>
    <section id="cave-ui" hidden>${caveHeader(backButton({ id: "cave-back", destination: "menu" }), "Cave", caveBalance(0))}<div class="cave-title"><span class="eyebrow">YOUR SECRET HIDEOUT</span><h1>The treasure cave</h1><p id="cave-count"></p></div><div id="relic-info"><span class="eyebrow" id="relic-number"></span><h2 id="relic-title"></h2><p id="relic-story"></p><div id="relic-stars"></div><button id="cave-sail" class="text-button">Find this treasure ${icon("arrow")}</button></div><div class="gallery-hint">WASD walk · Arrows look · Space jump</div><button id="cave-overview" class="cave-overview">‹ Keep exploring</button><div id="cave-crosshair" aria-hidden="true">+</div><div id="cave-pad" class="pirate-walk-pad" role="group" aria-label="Move around the cave"><span id="cave-thumb" class="pirate-walk-thumb"></span><small>MOVE</small></div><button id="cave-jump" class="pirate-walk-jump" aria-label="Jump">↑<small>JUMP</small></button><button id="cave-inspect" hidden>Inspect treasure</button><button id="harbour-chart" class="harbour-chart" hidden>Set sail ${icon("map")}</button></section>
    <section id="voyage-play" hidden>
      <div class="voyage-status">
        <span id="v-health" class="voyage-health" role="img" aria-label="Ship health 100%">
          ${Array.from({ length: HULL_HEARTS }, () => `<span class="hull-heart" aria-hidden="true">${icon("heart")}${icon("heart", "hull-heart-fill")}</span>`).join("")}
        </span>
        <span class="gem-count" role="group" aria-label="Gems collected">${icon("gem")}<b id="v-gems">0 / 3</b></span>
      </div>
      <div id="v-tip" role="status"></div>
      <div id="v-targets" aria-hidden="true"></div>
      <div id="v-wheel" aria-label="Drag the wheel to steer" role="group"><div class="wheel-ring"></div><span id="v-stick">${icon("wheel")}</span></div>
      <button id="v-anchor" class="round" aria-label="Drop anchor">${icon("anchor")}</button>
      <button id="v-fire" aria-label="Fire cannons">${icon("cannon")}<span id="v-fire-label" aria-hidden="true">Fire</span></button>
      <div id="v-compass" role="img" aria-label="Ship heading compass">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="23" class="compass-ring"/>
          <g class="compass-cardinals" text-anchor="middle"><text x="32" y="12">N</text><text x="54" y="35">E</text><text x="32" y="57">S</text><text x="10" y="35">W</text></g>
          <g id="v-compass-course"><circle cx="32" cy="16" r="2.7"/></g>
          <g id="v-compass-heading"><path d="M32 19 38 36 32 33 26 36Z"/></g>
        </svg>
      </div>
    </section>
    <section id="v-result" class="voyage-overlay reward-dock" hidden role="dialog" aria-modal="true" aria-labelledby="result-title">
      ${backButton({ id: "result-menu", destination: "menu" })}
      ${rewardLedger({
        title: "", titleId: "result-title", marks: ledgerStars(0, "", "result-stars"),
        details: '<div class="ledger-details"><p id="result-detail"></p><p id="result-cargo"></p></div>',
        actions: [
          { id: "result-next", label: "Next Island", icon: "ship", primary: true },
          { id: "result-retry", label: "Replay" },
          { id: "result-unload", label: "Return to cave", hidden: true },
        ],
      })}
    </section>
    <section id="v-paused" class="voyage-overlay pause-screen" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div class="pause-grotto" aria-hidden="true">${lanternBackdrop()}</div>
      <div class="voyage-pause-content">
        <h1 id="pause-title">Voyage paused</h1>
        <div class="voyage-briefing">
          <p id="v-briefing"></p>
          <div id="v-weather" aria-label="Weather and wind"><span id="v-wind-arrow" aria-hidden="true">${icon("arrow")}</span><span id="v-weather-name"></span><span id="v-gust"></span></div>
        </div>
        <div class="lantern-actions pause-actions">
          ${pirateMenuItem({ id: "v-resume", action: "resume", label: "Keep sailing" }, "play")}
          ${pirateMenuItem({ id: "v-return", action: "return", label: "Choose levels" }, "resume")}
        </div>
      </div>
    </section>`;
    document.body.append(r);
    const q = (id: string) => r.querySelector<HTMLElement>(id)!;
    q(".pirate-menu-header-actions").insertAdjacentHTML("afterbegin", `<button id="v-camera" class="round" aria-label="Switch to captain view" title="Captain view · C" hidden>${icon("eye")}<span>View</span></button>`);
    q("#v-home").insertAdjacentHTML("beforeend", '<span>Levels</span>');
    q("#v-pause").insertAdjacentHTML("beforeend", '<span>Pause</span>');
    q(".pirate-menu-header-actions").setAttribute("aria-label", "Voyage controls");
    q("#world-menu").insertAdjacentHTML("beforeend", `<button id="menu-free" class="free-chart-button">${icon("compass")} <span>Open world<small>Resume your voyage</small></span></button>`);
    q("#voyage-play").insertAdjacentHTML("beforeend", `<div id="v-captain-help" hidden><button id="v-look-centre" aria-label="Center camera toward the bow" title="Center camera toward the bow">${icon("focus")}</button></div><div id="v-sea-chart" hidden><button id="v-chart-open" aria-label="Open sea chart" title="Open sea chart"><canvas width="240" height="240" aria-hidden="true"></canvas></button></div>`);
    r.insertAdjacentHTML("beforeend", `<section id="sea-chart-menu" hidden role="dialog" aria-modal="true" aria-labelledby="sea-chart-title">${backButton({ id: "sea-chart-back", destination: "menu" })}<div class="sea-chart-heading"><h1 id="sea-chart-title">The open sea</h1></div><canvas width="1024" height="1024" aria-label="Full open world sea chart"></canvas><p class="sea-chart-note">East meets west. North meets south. Keep sailing to circle the world.</p><div class="sea-chart-actions"><button id="sea-chart-close" class="primary">Keep sailing ${icon("ship")}</button></div></section>`);
    q("#menu-free").onclick = () => h.freeSail();
    q(".pirate-menu-header-actions").insertAdjacentHTML("afterbegin", `<button id="v-deck" aria-label="Walk deck" title="Walk deck" hidden>${icon("ship")}<span>Walk deck</span></button>`);
    q("#v-deck").onclick = h.deck;
    q("#voyage-play").insertAdjacentHTML("beforeend", `<div id="deck-ui" hidden><span id="deck-crosshair" aria-hidden="true">+</span><div id="deck-pad" class="pirate-walk-pad" role="group" aria-label="Walk around the sailing ship"><span id="deck-thumb" class="pirate-walk-thumb"></span></div><button id="deck-jump" class="pirate-walk-jump" aria-label="Jump on deck">↑<small>JUMP</small></button><button id="deck-helm" hidden>Take the helm</button><div id="fishing-ui"><button id="deck-fish">Cast line</button><button id="fish-cancel" hidden>Put rod away</button><p id="fish-status" role="status"></p></div><p class="deck-hint">WASD walk · Arrows / drag look · E helm · F fish</p></div>`);
    q("#deck-helm").onclick = h.deck; q("#deck-fish").onclick = h.fish; q("#fish-cancel").onclick = h.cancelFish;
    q("#deck-jump").onpointerdown = e => {e.preventDefault();h.caveJump();};
    q("#deck-jump").onclick = e => {if(e.detail===0)h.caveJump();};
    q("#v-camera").onclick = h.camera;
    q("#v-look-centre").onclick = h.centreLook;
    q("#v-chart-open").onclick = () => h.seaChart(true);
    q("#sea-chart-close").onclick = () => h.seaChart(false);
    q("#sea-chart-back").onclick = () => h.menu();
    q("#captain-menu").insertAdjacentHTML("beforeend", `<div id="ship-panel-backdrop" hidden><aside id="ship-panel" hidden role="dialog" aria-modal="true" aria-labelledby="ship-panel-title" aria-describedby="ship-place" tabindex="-1"><button id="ship-close" class="ship-panel-close" aria-label="Close ship details"><span aria-hidden="true">×</span> Close</button><span class="eyebrow">THE BLACK PEARL</span><h2 id="ship-panel-title">Your ship</h2><p id="ship-place"></p><div class="ship-panel-actions"><button id="visit-ship">Board the ship ${icon("arrow")}</button><button id="menu-hold">Treasure hold</button><button id="ship-cave">Sail to your cave</button></div></aside></div><div id="chart-travel" hidden role="status"></div>`);
    q(".world-map").insertAdjacentHTML("beforeend", chartShip("map-ship-marker"));
    q(".level-board").insertAdjacentHTML("beforeend", chartShip("level-ship-marker"));
    q("#level-menu").onscroll = () => {
      r.dataset.levelScrolled = String(q("#level-menu").scrollTop > 20);
    };
    q("#level-ship").onclick = () => this.openShipPanel(q("#level-ship"));
    q("#ship-close").onclick = () => this.closeShipPanel(true);
    q("#ship-panel-backdrop").onclick = event => {
      if (event.target === q("#ship-panel-backdrop")) this.closeShipPanel(true);
    };
    // A modal owns Escape/Tab before global voyage shortcuts can change scenes.
    document.addEventListener("keydown", event => {
      if (!r.isConnected || q("#ship-panel").hidden) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation(); this.closeShipPanel(true);
      } else if (event.key === "Tab") {
        const buttons = [...q("#ship-panel").querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
        const first = buttons[0]!, last = buttons.at(-1)!;
        if (event.shiftKey && (document.activeElement === first || !q("#ship-panel").contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !q("#ship-panel").contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    }, true);
    q("#ship-cave").onclick = () => { this.closeShipPanel(); h.travel("cave"); };
    r.insertAdjacentHTML("beforeend", `<section id="hold-ui" class="reward-dock pirate-hold" hidden>${backButton({ id: "hold-back", destination: "menu" })}${holdLedger({ eyebrow: "Aboard the Black Pearl", title: "The treasure hold", cargo: "", cargoId: "hold-count", actions: [{ id: "hold-unload", label: "Return to cave", icon: "chest", primary: true }, { id: "hold-sail", label: "Keep sailing", icon: "map" }] })}</section><section id="unload-ui" hidden>${caveHeader(backButton({ id: "unload-menu", destination: "menu" }), "Cave", caveBalance(0))}${caveTally("", "unload-count")}<div id="unload-failure" hidden>${caveNotice("The cave couldn't load. Your gold is safe.", '<button id="unload-retry" class="wood-button primary">Try again</button>')}</div></section>`);
    q("#cave-ui").insertAdjacentHTML("beforeend", `<button id="harbour-unload" class="harbour-chart" hidden>Return to cave ${icon("chest")}</button>`);
    if (PRIVATE_PEARL) {
      q(".art-credit").innerHTML = '<span id="model-credit">Black Pearl model by</span> <a href="https://www.cgtrader.com/3d-models/watercraft/recreational-watercraft/black-pearl-pirate-ship" target="_blank" rel="noopener">CrispierCone</a> · <span id="licensed-model">licensed model.</span><br><span id="adapted-credit">Cabin and treasure display adapted for Broadside.</span>';
    }
    q("#menu-hold").onclick = () => { this.closeShipPanel(); h.travel("hold"); };
    q("#result-unload").onclick = q("#hold-unload").onclick = h.unload;
    q("#hold-sail").onclick = () => { h.menu(); this.showMenu("worlds"); };
    q("#hold-back").onclick = q("#unload-menu").onclick = () => h.menu();
    q("#harbour-unload").onclick = h.unload;
    q("#unload-retry").onclick = h.unload;
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
    q("#v-paused").onclick = event => { if (event.target === q("#v-paused")) h.pause(); };
    document.addEventListener("keydown", event => {
      if (!r.isConnected || event.key !== "Tab") return;
      const dialog = ["#v-paused", "#sea-chart-menu"].map(id => q(id)).find(el => !el.hidden);
      if (!dialog) return;
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    }, true);
    q("#v-anchor").onclick = h.anchor;
    q("#menu-play").onclick = () => this.showMenu("worlds");
    q("#home-ship").onclick = () => h.travel("hold");
    const languagePicker = r.querySelector<HTMLDialogElement>(".language-picker")!;
    const languageMenu=bindLanguagePicker(languagePicker,{
      markup:failed=>{
        const languages=deviceLanguages(), locale=commonLocale(this.homeLanguage,languages);
        languagePicker.lang=locale.language;
        return languagePickerMarkup(locale,this.homeLanguage,languages,failed);
      },
      trigger:()=>q(this.menuPage === "settings" ? "#settings-language" : "#menu-language"),
      select:choice=>{
        this.homeLanguage=choice;this.renderHomeLanguage();
        return saveLanguagePreference(choice,homeStorage());
      },
    });
    q("#menu-language").onclick=q("#settings-language").onclick=languageMenu.open;
    watchMenuLanguage(homeStorage(), homeLanguageKey, preference => {
      if (preference !== undefined) this.homeLanguage = preference;
      else if (this.homeLanguage !== "auto") return;
      if (r.isConnected) this.renderHomeLanguage();
      if (languagePicker.open) languageMenu.draw();
    });
    q("#menu-settings").onclick = () => {
      this.showMenu("settings");
      q("#menu-back").focus();
    };
    q("#menu-back").onclick = () => {
      this.showMenu("main");
      q("#menu-settings").focus();
    };
    q("#menu-cave").onclick = q("#map-cave").onclick = () => h.travel("cave");
    q("#visit-ship").onclick = () => { this.closeShipPanel(); h.travel("ship"); };
    q("#harbour-chart").onclick = () => { h.menu(); this.showMenu("worlds"); };
    q("#map-back").onclick = () => this.showMenu("main");
    q("#level-back").onclick = () => this.showMenu("worlds");
    q("#cave-back").onclick = () => {
      h.menu();
      this.showMenu("worlds");
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
    for (const prefix of ["cave", "deck"]) {
    const pad = q(`#${prefix}-pad`);
    let stickPointer: number | null = null;
    const moveStick = (e: PointerEvent) => {
      const rect = pad.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / 34;
      const y = (e.clientY - rect.top - rect.height / 2) / 34;
      const length = Math.max(1, Math.hypot(x, y));
      h.caveMove(x / length, -y / length);
      q(`#${prefix}-thumb`).style.transform =
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
      q(`#${prefix}-thumb`).style.transform = "translate(0,0)";
    };
    pad.onpointerup =
      pad.onpointercancel =
      pad.onlostpointercapture =
        releaseStick;
    window.addEventListener("blur", releaseStick);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) releaseStick();
    });
    }
    q("#cave-sail").onclick = () => {
      h.menu();
      this.pack = Math.max(
        0,
        WORLD_RELICS.indexOf(this.selected as 2 | 5 | 8 | 11),
      );
      this.showMenu("levels");
    };
    q("#world-packs").onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pack]");
      if (b && !b.disabled) {
        this.pack = Number(b.dataset.pack);
        this.showMenu("levels");
      }
    };
    q("#voyage-levels").onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-level]",
      );
      if (b && !b.disabled) h.travel(Number(b.dataset.level));
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
    let originX = 0, originY = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const x = e.clientX - originX,
        y = e.clientY - originY,
        d = Math.hypot(x, y);
      stick.style.transform = `translate(${x * Math.min(1, 27 / Math.max(d, 1))}px,${y * Math.min(1, 27 / Math.max(d, 1))}px)`;
      h.steer(touchSteeringTurn(x));
    };
    wheel.onpointerdown = (e) => {
      e.preventDefault();
      if (pointer !== null) return;
      pointer = e.pointerId;
      originX = e.clientX; originY = e.clientY;
      wheel.setPointerCapture(pointer);
      move(e);
    };
    wheel.onpointermove = move;
    this.releaseSteering = () => {
      if (pointer === null) return;
      const activePointer = pointer;
      pointer = null;
      stick.style.transform = "";
      if (wheel.hasPointerCapture(activePointer)) wheel.releasePointerCapture(activePointer);
      h.steer(null);
    };
    const stop = (e: PointerEvent) => {
      if (e.pointerId === pointer) this.releaseSteering();
    };
    wheel.onpointerup = stop;
    wheel.onpointercancel = stop;
    wheel.onlostpointercapture = stop;
    this.showMenu("main");
  }
  cancelSteering(): void { this.releaseSteering(); }
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
  private renderHomeLanguage(): void {
    const locale = createLocale(broadsideCatalogs, this.homeLanguage, deviceLanguages());
    const { language, t, format, pluralCategory } = locale;
    const count = cargoChests(this.progress).length;
    const gold = goldTotal(caveProgress(this.progress));
    this.q("#main-menu").lang = language;
    this.q(".lantern-actions").setAttribute("aria-label", t("home"));
    this.q("#menu-play span:last-child").textContent = t("play");
    this.q("#home-ship .lantern-action-title").textContent = t("yourShip");
    this.q("#home-ship strong").textContent = count ? t(pluralCategory(count) === "one" ? "aboard_one" : "aboard_other", { count: format(count) }) : t("noCargo");
    this.q("#home-ship small").textContent = count ? t("comingHome", { gold: format(count * 1000) }) : "";
    this.q("#menu-cave .lantern-action-title").textContent = t("yourCave");
    this.q("#menu-cave strong").textContent = language === "en" ? `${format(gold)} gold saved` : t("savedGold", { gold: format(gold) });
    this.q("#menu-cave small").textContent = "";
    this.q("#menu-settings").textContent = t("settings");
    this.q("#menu-language").textContent = languageOption(language).flag;
    this.q("#menu-language").setAttribute("aria-label", t("language"));
    const back = this.q("#menu-back");
    back.lang = language;
    back.lastElementChild!.textContent = t("back");
    back.setAttribute("aria-label", t("back"));
    const desk = this.q("#settings-menu");
    desk.lang = language;
    desk.querySelector("h1")!.textContent = t("settings");
    this.q("#settings-language").innerHTML = `<strong>${t("language")}</strong>${languageSettingLabel(locale,this.homeLanguage)}`;
    desk.querySelector(".privacy-action")!.textContent = t("privacyEnglish");
    this.q("#model-credit").textContent = t("model");
    this.q("#adapted-credit").textContent = t(PRIVATE_PEARL ? "cabinAdaptation" : "adaptation");
    if (PRIVATE_PEARL) this.q("#licensed-model").textContent = t("licensedModel");
  }
  private menuPage: "main" | "worlds" | "levels" | "settings" = "main";
  showMenu(page: "main" | "worlds" | "levels" | "settings" = "main"): void {
    this.cancelSteering();
    if (page === "levels" && !worldUnlocked(this.progress.voyages, this.pack)) page = "worlds";
    this.closeShipPanel();
    this.q("#v-camera").hidden = true;
    this.q("#v-deck").hidden = true;
    this.q("#hold-ui").hidden = this.q("#unload-ui").hidden = true;
    this.q("#menu-hold").textContent = `${PRIVATE_PEARL ? "Treasure room" : "Treasure hold"}${cargoChests(this.progress).length ? ` · ${(cargoChests(this.progress).length * 1000).toLocaleString()} gold aboard` : ""}`;
    this.regionalPan?.destroy();
    this.regionalPan = undefined;
    this.menuPage = page;
    if (page === "main" || page === "settings") this.renderHomeLanguage();
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
    this.root.dataset.screen = page;
    this.renderLevels();
    if (page === "levels") {
      const viewport = this.q(".regional-viewport");
      this.regionalPan = mountMapPan(viewport, this.q("#voyage-levels"), {
        coverViewport: true,
        focus: { x: REGIONAL_CHART_WIDTH / 2, y: this.q("#voyage-levels [aria-current=step]").offsetTop },
        state: this.regionalCameras.get(this.pack),
        onChange: camera => {
          this.regionalCameras.set(this.pack, camera);
          this.resizeChart();
        },
      });
      const menu = this.q("#level-menu");
      menu.scrollTop = 0;
      this.root.dataset.levelScrolled = "false";

    }
  }
  home(): void {
    this.q("#v-camera").hidden = true;
    this.q("#v-deck").hidden = true;
    this.q("#hold-ui").hidden = this.q("#unload-ui").hidden = true;
    this.root.dataset.walkPlace = "cave";
    this.q(".cave-title h1").setAttribute("aria-hidden", "true");
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
    this.q("#v-result").classList.remove("unboxing");
    this.q("#v-paused").hidden = true;
    this.q("#v-pause").hidden = true;
    this.q("#v-home").hidden = true;
    this.renderRelic();
    this.renderLevels();
    this.overview();
  }
  shipLoadFailed(): void {
    const message = this.q('.pirate-home-description');
    message.textContent = 'The ship could not load. Please try again.';
    message.setAttribute('role', 'status');
  }
  harbour(): void {
    this.home();
    this.root.dataset.walkPlace = "harbour";
    this.q("#cave-overview").hidden = true;
    this.q("#harbour-chart").hidden = false;
    this.q("#harbour-unload").hidden = !cargoChests(this.progress).length;
    this.q("#cave-pad").setAttribute("aria-label", PRIVATE_PEARL ? "Walk on the Black Pearl" : "Walk on the ship and quay");
    this.q(".cave-title h1").removeAttribute("aria-hidden");
    this.q(".cave-title .eyebrow").textContent = `YOUR SHIP · ${this.shipLocation.kind === "port" || this.shipLocation.kind === "cave" ? "BLACKWATER BAY" : PACKS[locationWorld(this.shipLocation)]!.name.toUpperCase()}`;
    const keepsakes = this.progress.relics.filter(id => WORLD_RELICS.includes(id as 2|5|8|11)).length;
    this.q("#cave-count").textContent = PRIVATE_PEARL
      ? `${goldTotal(this.progress).toLocaleString()} gold · ${keepsakes} keepsake${keepsakes === 1 ? "" : "s"} · Treasure room under the quarterdeck`
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
    updateCaveBalance(this.q("#cave-ui .pirate-cave-header"), caveBalance(goldTotal(banked)));
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
      `${goldTotal(banked).toLocaleString()} gold · ${banked.relics.length} / 4 world treasures${cargoChests(this.progress).length?` · ${(cargoChests(this.progress).length*1000).toLocaleString()} aboard`:""}`;
    this.q("#relic-number").textContent = gold
      ? `${PACKS[world]!.name.toUpperCase()} · GOLD BANK`
      : `WORLD ${world + 1} · ${owned ? "FOUND & FOREVER YOURS" : "WAITING TO BE DISCOVERED"}`;
    this.q("#relic-title").textContent = gold
      ? `${worldGold(banked, world).toLocaleString()} gold`
      : owned
        ? relic.name
        : "A world’s secret treasure";
    this.q("#relic-story").textContent = gold
      ? `Levels and fishing chests from ${PACKS[world]!.name} each bring 1,000 doubloons to this bank. Fresh coins settle here. When the pile fills, its gold is secured as labelled reserve bars. Your full balance is always kept.`
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
    this.q("#world-packs").innerHTML = adventureChart("pack",PACKS.map((p,i)=>({
      id:i,art:worldArt(i),label:p.name,locked:!worldUnlocked(this.progress.voyages,i),
      accessible:`${p.name}, world ${i+1}${worldUnlocked(this.progress.voyages,i)?"":", finish World 1 to unlock"}`,
      tally:worldUnlocked(this.progress.voyages,i)?`★ ${stars(i)} / 30`:"🔒 Finish World 1"
    })));
    const pack = PACKS[this.pack]!;
    this.q("#world-name").textContent = pack.name;
    this.q(".level-note").textContent =
      `1,000 gold per level · World treasure: ${RELICS[WORLD_RELICS[this.pack]!]!.name}`;

    const theme = (["add", "subtract", "multiply", "divide"] as const)[this.pack]!;
    const width = REGIONAL_CHART_WIDTH, height = 860 + LEVELS_PER_WORLD * 155;
    const points = worldRoutePoints(LEVELS_PER_WORLD, width, height, 500);
    const route = this.q("#voyage-levels");
    route.style.width = `${width}px`;
    route.style.height = `${height}px`;
    route.style.setProperty("--water", `url(${worldAsset(theme, "-water")})`);
    route.innerHTML = worldRouteLine(points, width, height, "level-route") +
      worldLevels(this.pack).map((level, stage) => {
        const result = this.progress.voyages[level];
        const locked = !levelUnlocked(this.progress.voyages, level);
        const title = `Level ${stage + 1}`;
        const current = level === next;
        const detail = stage === LEVELS_PER_WORLD - 1 ? RELICS[WORLD_RELICS[this.pack]!]!.name : undefined;
        const progress = locked ? "Locked" : result ? `${result.stars} / 3 stars` : "Set sail";
        return worldRouteStop({
          ...points[stage]!, key: "level", id: level, art: islandArt(level),
          title, detail, progress,
          accessible: [title, detail, progress].filter(Boolean).join(", "),
          disabled: locked, current,
        });
      }).join("");
    this.location(this.shipLocation);
  }

  private openShipPanel(trigger: HTMLElement): void {
    this.shipPanelTrigger = trigger;
    this.q("#ship-panel-backdrop").hidden = false;
    this.q("#ship-panel").hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    for (const id of ["#world-menu", "#level-menu"]) this.q(id).inert = true;
    this.q("#ship-close").focus();
  }
  closeShipPanel(restoreFocus = false): void {
    this.q("#ship-panel").hidden = true;
    this.q("#ship-panel-backdrop").hidden = true;
    for (const id of ["#world-menu", "#level-menu"]) this.q(id).inert = false;
    this.q("#level-ship").setAttribute("aria-expanded", "false");
    if (restoreFocus) this.shipPanelTrigger?.focus();
    this.shipPanelTrigger = null;
  }
  location(location: ShipLocation): void {
    this.shipLocation = location;
    const world = locationWorld(location);
    this.q("#ship-place").textContent = location.kind === "port" ? "Moored in Blackwater Bay" : location.kind === "cave" ? "Anchored outside your cave" :
      `${PACKS[world]!.name}${location.kind === "course" ? ` · island ${stageOf(location.index) + 1}` : " · exploring the open sea"}`;
    this.q("#level-ship-marker").hidden = world !== this.pack;
    this.placeShip(location, location, 1);
  }
  private chartPoint(location: ShipLocation, regional: boolean): { x: number; y: number } {
    const chart = this.q(regional ? ".level-board" : ".world-map");
    const parent = chart.getBoundingClientRect();

    const selector = regional
      ? `[data-level="${location.kind === "course" && locationWorld(location) === this.pack ? location.index : this.pack * LEVELS_PER_WORLD}"] .chart-island-art`
      : location.kind === "cave" ? ".cave-art" : `[data-shore="${locationWorld(location)}"] .world-art`;
    const element = this.root.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    if (!element || !parent.width) return { x: 0, y: 0 };
    // Regional entry scales the chart. Convert viewport bounds back to its local pixels.
    const sx = chart.clientWidth ? parent.width / chart.clientWidth : 1;
    const sy = chart.clientHeight ? parent.height / chart.clientHeight : 1;
    const y = (element.top - parent.top + element.height * .55) / sy;
    if (regional) {
      const artCenter = (element.left + element.right) / 2;
      const onRight = artCenter >= parent.left + parent.width / 2;
      const x = onRight ? (element.left - parent.left) / sx - 20 : (element.right - parent.left) / sx + 20;
      return { x, y };
    }
    const width = parent.width / sx, height = parent.height / sy;
    const style = getComputedStyle(chart);
    const inset = (edge: string) => parseFloat(style.getPropertyValue(`--pirate-safe-${edge}`)) || 0;
    // Keep the moored ship out of the phone system areas when its island is offscreen.
    return {
      x: Math.max(28 + inset("left") / sx, Math.min(width - 28 - inset("right") / sx, (element.right - parent.left) / sx - element.width / sx * .12)),
      y: Math.max(28 + inset("top") / sy, Math.min(height - 28 - inset("bottom") / sy, y)),
    };
  }
  private placeShip(from: ShipLocation, to: ShipLocation, fraction: number): void {
    const t = fraction * fraction * (3 - 2 * fraction);
    for (const regional of [false, true]) {
      const a = this.chartPoint(from, regional), b = this.chartPoint(to, regional);
      const ship = this.q(regional ? "#level-ship-marker" : "#map-ship-marker");
      faceChartShip(ship, b.x - a.x);
      ship.style.left = `${a.x + (b.x - a.x) * t}px`;
      ship.style.top = `${a.y + (b.y - a.y) * t}px`;
    }
  }
  private closeTravelCamera(): void {
    const camera = this.travelCamera;
    if (!camera) return;
    camera.pan.destroy();
    camera.chart.inert = false;
    camera.viewport.replaceWith(camera.chart);
    this.travelCamera = undefined;
  }
  private followTravelShip(): void {
    const camera = this.travelCamera;
    if (!camera?.follow) return;
    const map = camera.plane.getBoundingClientRect();
    const ship = camera.ship.getBoundingClientRect();
    const { scale } = camera.pan.getState();
    camera.pan.center({ x: (ship.left + ship.width / 2 - map.left) / scale, y: (ship.top + ship.height / 2 - map.top) / scale });
  }
  private openTravelCamera(regional: boolean): void {
    this.closeTravelCamera();
    const chart = this.q(regional ? ".level-board" : ".world-map");
    const ship = this.q(regional ? "#level-ship-marker" : "#map-ship-marker");
    const viewport = document.createElement("div");
    viewport.className = "travel-viewport";
    viewport.dataset.mapViewport = "";
    viewport.tabIndex = 0;
    viewport.setAttribute("aria-label", "Sailing chart");
    const plane = document.createElement("div");
    plane.dataset.mapWorld = "";
    const resume = document.createElement("button");
    resume.className = "travel-follow";
    resume.dataset.mapControl = "";
    resume.dataset.mapCenter = "";
    resume.textContent = "Follow ship";
    resume.hidden = true;
    chart.replaceWith(viewport);
    viewport.append(plane, resume);
    plane.append(chart);
    chart.inert = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pan = mountMapPan(viewport, plane, {
      coverViewport: true, scale: reduced ? 1 : 1.5,
      onGesture: () => {
        if (this.travelCamera) this.travelCamera.follow = false;
        resume.hidden = false;
      },
      onCenter: () => {
        if (this.travelCamera) this.travelCamera.follow = true;
        resume.hidden = true;
        this.followTravelShip();
      },
    });
    this.travelCamera = { pan, viewport, plane, chart, ship, follow: !reduced };
  }
  beginTravel(from: ShipLocation, to: ShipLocation, label: string): void {
    const previousPack = this.pack;
    this.pack = locationWorld(to);
    const page = to.kind === "course" && locationWorld(from) === this.pack ? "levels" : "worlds";
    // Keep an already visible chart mounted. Hiding it or replacing its islands
    // restarts the entry zoom/fade just as the ship is supposed to start sailing.
    if (this.q("#captain-menu").hidden || this.menuPage !== page || previousPack !== this.pack) this.showMenu(page);
    else this.closeShipPanel();
    this.q("#level-ship-marker").hidden = false;
    this.q("#chart-travel").hidden = false;
    this.q("#chart-travel").textContent = label;
    this.root.classList.add("chart-sailing");
    this.openTravelCamera(page === "levels");
    this.travelPose(from, to, 0);
  }
  travelPose(from: ShipLocation, to: ShipLocation, fraction: number): void { this.placeShip(from, to, fraction); this.followTravelShip(); }
  endTravel(location: ShipLocation): void {
    this.closeTravelCamera();
    this.root.classList.remove("chart-sailing");
    this.q("#chart-travel").hidden = true;
    this.location(location);
  }
  resizeChart(): void { if (!this.root.classList.contains("chart-sailing")) this.placeShip(this.shipLocation, this.shipLocation, 1); }

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
    this.q("#v-result").classList.remove("unboxing");
    this.q("#v-paused").hidden = true;
    this.q("#voyage-play").hidden = false;
    this.q("#v-pause").hidden = false;
    this.q("#v-home").hidden = false;
    this.q("#v-home").setAttribute("aria-label", voyage.freeSailing ? "Open sea chart" : "Choose levels");
    this.q("#v-home span").textContent = voyage.freeSailing ? "Sea chart" : "Levels";
    this.q("#v-home").title = voyage.freeSailing ? "Sea chart" : "Choose levels";
    this.q("#v-pause").title = "Pause voyage";
    this.q("#v-return .lantern-action-title").textContent = voyage.freeSailing ? "Choose worlds" : "Choose levels";
    this.q("#v-camera").hidden = false;
    this.q("#v-fire").hidden = !voyage.freeSailing && voyage.level.waves[0]!.enemies.length === 0 && !voyage.forts.length;
    this.setTip("");
    this.q("#v-briefing").textContent = voyage.freeSailing
      ? "Your voyage saves automatically." : voyage.level.intro;
    this.q("#v-weather").hidden = voyage.pack === 0 && !voyage.freeSailing;
    this.q("#v-compass-course").toggleAttribute("hidden", !!voyage.freeSailing);
    this.q("#v-sea-chart").hidden = !voyage.freeSailing;
    this.q("#v-weather-name").textContent = voyage.weather.name;
    this.root.dataset.weather = voyage.weather.kind;
  }
  deck(active:boolean,nearHelm:boolean,atRail:boolean,phase:string,catchKind:string|null,fish:number):void {
    const key=[active,nearHelm,atRail,phase,catchKind,fish,this.root.dataset.screen].join(':');
    if(key===this.deckKey&&!this.q('#v-deck').hidden)return;
    this.deckKey=key;
    this.root.dataset.onDeck=String(active);
    this.q("#deck-ui").hidden=!active;
    this.q("#v-deck").hidden=this.root.dataset.screen!=="play";
    const helm=this.q("#v-deck") as HTMLButtonElement;
    const deckAction = active ? "Take the helm" : "Walk deck";
    if (helm.getAttribute("aria-label") !== deckAction) {
      helm.setAttribute("aria-label", deckAction);
      helm.title = deckAction;
      helm.innerHTML = icon(active ? "wheel" : "ship");
    }
    helm.disabled = active && (!nearHelm || phase !== "idle");
    (this.q('#v-camera') as HTMLButtonElement).disabled=active;
    this.q("#deck-helm").hidden=!active||!nearHelm||phase!=='idle';
    const cast=this.q("#deck-fish") as HTMLButtonElement;
    cast.disabled=phase==='casting'||phase==='waiting'||phase==='reeling'||(phase==='idle'&&!atRail);
    cast.textContent=phase==='bite'?'Reel in!':phase==='caught'?'Keep catch':phase==='idle'?'Cast line':'Fishing…';
    this.q("#fish-cancel").hidden=phase==='idle'||phase==='caught';
    this.q("#fish-status").textContent=phase==='idle'?(atRail?`Fish: ${fish} · 10% chest chance`:'Walk to either rail to fish'):
      phase==='bite'?'A bite! Reel in now!':phase==='caught'?(catchKind==='chest'?'Treasure! 1,000 gold safely aboard.':'A silver fish! Another catch for your collection.'):
      phase==='reeling'?'Hauling your catch aboard…':'Watch the float. Tap when it dips.';
    this.root.dataset.fishing=phase;
  }
  camera(captain: boolean): void {
    const view = captain ? "captain" : "overview";
    if (this.root.dataset.camera !== view) this.cancelSteering();
    this.root.dataset.camera = view;
    const b = this.q("#v-camera");
    b.setAttribute("aria-pressed", String(captain));
    b.setAttribute("aria-label", captain ? "Switch to overhead view" : "Switch to captain view");
    b.innerHTML = `${icon("eye")}<span>${captain ? "Overhead" : "Captain"}</span>`;
    b.title = `${captain ? "Overhead" : "Captain"} view · C`;
    this.q("#v-captain-help").hidden = !captain;
  }
  paused(value: boolean): void {
    if (value) this.cancelSteering();
    const wasPaused = !this.q("#v-paused").hidden;
    this.q("#v-paused").hidden = !value;
    this.q("#voyage-play").inert = value;
    this.q(".voyage-header").inert = value;
    if (value) this.q("#v-resume").focus();
    else if (wasPaused && this.root.dataset.screen === "play") this.q("#v-pause").focus();
  }
  seaChart(open: boolean, session?: VoyageSession): void {
    if (open) this.cancelSteering();
    const wasOpen = !this.q("#sea-chart-menu").hidden;
    if (open && !wasOpen && document.activeElement instanceof HTMLElement)
      this.chartTrigger = document.activeElement;
    this.q("#sea-chart-menu").hidden = !open;
    this.q("#voyage-play").inert = open;
    this.q(".voyage-header").inert = open;
    if (open && session) this.drawWorldChart(session);
    if (open) this.q("#sea-chart-close").focus();
    else if (wasOpen) {
      if (this.root.dataset.screen === "play") {
        const trigger = this.chartTrigger;
        (trigger && trigger.getClientRects().length ? trigger : this.q("#v-home")).focus();
      }
      this.chartTrigger = null;
    }
  }
  result(s: VoyageSession, reward?: VoyageReward): void {
    this.cancelSteering();
    this.q("#v-camera").hidden = true;
    this.q("#v-deck").hidden = true;
    this.q("#hold-ui").hidden = this.q("#unload-ui").hidden = true;
    this.q("#result-unload").hidden = s.state !== "won" || !cargoChests(this.progress).length;
    this.activeLevel = s.voyage.index;
    this.resultLost = s.state === "lost";
    this.q("#result-next").hidden =
      !!s.voyage.freeSailing || this.resultLost || this.activeLevel === TOTAL_LEVELS - 1;
    const replay = this.q("#result-retry");
    replay.textContent = this.resultLost ? "Retry" : "Replay";
    replay.classList.toggle("ledger-primary", this.resultLost);
    this.q("#captain-menu").hidden = true;
    this.root.dataset.screen = "result";
    this.q("#cave-ui").hidden = true;
    this.q("#voyage-play").hidden = true;
    this.q("#v-result").hidden = false;
    this.q("#v-pause").hidden = true;
    this.q("#v-home").hidden = false;
    const special = reward?.special;
    const cargo = cargoChests(this.progress);
    this.revealName = special !== null && special !== undefined ? RELICS[special]!.name
      : reward?.gold ? `${reward.gold.toLocaleString()} gold aboard` : "Voyage complete";
    const cargoNote = this.q("#result-cargo");
    cargoNote.textContent = s.state !== "won" ? ""
      : cargo.length > 1 ? `${(cargo.length * 1000).toLocaleString()} gold aboard in total`
      : !reward?.gold ? "Gold already collected · Best stars saved"
        : special != null ? `${reward.gold.toLocaleString()} gold aboard` : "";
    cargoNote.hidden = !cargoNote.textContent;
    this.revealStars = s.stars;
    const rank = this.q("#result-stars");
    rank.hidden = this.resultLost;
    rank.setAttribute("aria-hidden", "true");
    rank.innerHTML = s.state === "won" ? ledgerStarMarks(s.stars) : "";
    this.q("#result-title").textContent = s.state === "won" ? "Opening the chest…" : "Your ship sank";
    this.q("#v-result").classList.toggle("unboxing", s.state === "won");
    this.q("#result-title").tabIndex = -1;
    this.q("#result-title").focus({ preventScroll: true });
    for (const button of this.q(".ledger-actions").querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = s.state === "won";
    this.q("#result-detail").innerHTML =
      s.state === "won"
        ? `<span class="result-gems">${icon("gem")} ${s.gemsFound} / ${s.voyage.gems.length} hidden gems</span> · ${Math.round((100 * s.damageTaken) / s.player.spec.maxHull)}% hull damage${s.rescues ? " · Crew repairs" : ""}`
        : s.failureReason === "rocks"
          ? "You struck the rocks. Steer clear and try again!"
          : s.failureReason === "island"
            ? "You crashed into an island. Find a safe passage!"
            : "Your ship took too much damage. Try again!";
  }
  hold(): void {
    this.showMenu(); this.q("#captain-menu").hidden=true;this.q("#hold-ui").hidden=false;
    this.q("#hold-count").textContent=cargoChests(this.progress).length ? `${(cargoChests(this.progress).length*1000).toLocaleString()} gold · ${cargoChests(this.progress).length} chest${cargoChests(this.progress).length===1?"":"s"} safely aboard` : "Your hold is ready. Find gold on your next voyage.";
    this.q("#hold-unload").hidden=!cargoChests(this.progress).length;this.root.dataset.screen="hold";
  }
  unloading(chest: number, total: number): void {
    this.q("#v-camera").hidden = true;
    this.q("#v-deck").hidden = true;
    this.q("#captain-menu").hidden = this.q("#v-result").hidden = this.q("#hold-ui").hidden = this.q("#cave-ui").hidden = this.q("#voyage-play").hidden = true;
    this.q("#unload-ui").hidden = false;
    this.q("#v-pause").hidden = this.q("#v-home").hidden = true;
    this.q("#unload-failure").hidden = true;
    const tally = this.q("#unload-count");
    tally.hidden = false;
    const cargo = cargoChests(this.progress).length * GOLD_PER_LEVEL;
    const message = `Chest ${chest} of ${total} · ${cargo.toLocaleString()} gold coming home`;
    if (tally.textContent !== message) {
      tally.textContent = message;
      updateCaveBalance(this.q("#unload-ui .pirate-cave-header"), caveBalance(goldTotal(this.progress) - cargo));
    }
    this.root.dataset.screen = "unloading";
  }
  unloadingFailed(): void {
    this.q("#unload-count").hidden = true;
    this.q("#unload-failure").hidden = false;
  }
  reveal(time: number, discovered: boolean, ready: boolean): void {
    if (!this.q("#v-result").classList.contains("unboxing")) return;
    if (discovered && this.q("#result-title").textContent !== this.revealName)
      this.q("#result-title").textContent = this.revealName;
    for (const [i, star] of Array.from(
      this.q("#result-stars").children,
    ).entries())
      star.classList.toggle("arrived", time >= 3.4 + i * 0.35);
    if (ready) {
      this.q("#v-result").classList.remove("unboxing");
      for (const button of this.q(".ledger-actions").querySelectorAll<HTMLButtonElement>("button"))
        button.disabled = false;
      this.q("#result-stars").removeAttribute("aria-hidden");
      this.q("#result-stars").setAttribute(
        "aria-label",
        `${this.revealStars} of 3 stars`,
      );
    }
  }
  private setTip(message: string): void {
    const tip = this.q("#v-tip");
    // Warnings may persist for many frames; announce and update each only once.
    if (tip.textContent !== message) tip.textContent = message;
  }
  help(message: string, until: number): void {
    this.setTip(message);
    this.messageUntil = until;
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
    const health = Math.round(Math.max(0, Math.min(1, s.player.hull / s.player.spec.maxHull)) * 100);
    if (health !== this.hullPercent) {
      this.hullPercent = health;
      const meter = this.q("#v-health");
      meter.setAttribute("aria-label", `Ship health ${health}%`);
      meter.querySelectorAll<HTMLElement>(".hull-heart").forEach((heart, index) => {
        const filled = Math.max(0, Math.min(1, health * HULL_HEARTS / 100 - index));
        heart.style.setProperty("--heart-fill", `${filled * 100}%`);
      });
    }
    const anchor = this.q("#v-anchor"), sailing = String(s.player.sail > 0);
    if (anchor.dataset.sailing !== sailing) {
      anchor.dataset.sailing = sailing;
      anchor.setAttribute("aria-label", s.player.sail ? "Drop anchor" : "Set sail");
      anchor.innerHTML = icon(s.player.sail ? "anchor" : "ship");
    }
    this.q("#v-gems").textContent = `${s.gemsFound} / ${s.voyage.gems.length}`;
    const heading = s.player.heading;
    const headingIndex = Math.round(heading / (Math.PI / 4));
    const direction = COMPASS_DIRECTIONS[(headingIndex % 8 + 8) % 8]!;
    const compass = this.q("#v-compass");
    const headingLabel = `Heading ${direction}`;
    if (compass.getAttribute("aria-label") !== headingLabel) compass.setAttribute("aria-label", headingLabel);
    this.q("#v-compass-heading").setAttribute("transform", `rotate(${heading * 180 / Math.PI} 32 32)`);
    if (!s.voyage.freeSailing) {
      const course = headingTo(s.player.pos, s.voyage.finish);
      this.q("#v-compass-course").setAttribute("transform", `rotate(${course * 180 / Math.PI} 32 32)`);
    }
    this.q("#v-wind-arrow").style.transform = `rotate(calc(${s.world.wind.direction - viewHeading}rad - 90deg))`;
    this.q("#v-gust").textContent = s.voyage.weather.drift ? `Wind ${(s.world.wind.drift ?? 0).toFixed(1)} m/s` : "";
    const cooldown = s.player.reload[s.firingSide];
    const fire = this.q("#v-fire");
    const ready = s.targetInArc && cooldown <= 0;
    const turn = !s.targetInArc && s.enemies.some(e =>
      e.alive && distance(e.pos, s.player.pos) < s.player.spec.cannonRange * 1.1,
    );
    const fireLabel = cooldown > 0 ? `${cooldown.toFixed(1)}s` : turn ? "Turn side" : "Fire";
    this.q("#v-fire-label").textContent = fireLabel;
    fire.dataset.reloading = String(cooldown > 0);
    fire.classList.toggle("ready-target", ready);
    const fireAction = cooldown > 0 ? "Cannons reloading"
      : turn ? "Turn your broadside toward the pirate"
      : ready ? `Fire ${s.firingSide === "port" ? "left" : "right"} cannons` : "Fire cannons";
    if (fire.getAttribute("aria-label") !== fireAction) fire.setAttribute("aria-label", fireAction);
    const obstacle = s.level.islands.find(
      (island, i) =>
        (s.voyage.freeSailing || (i > 0 && i < s.level.islands.length - 1)) &&
        seaDistance(island.pos, s.player.pos, s.world.periodic ? s.level.bounds : undefined) < island.radius + 32,
    );
    if (s.elapsed >= this.messageUntil) {
      if (s.voyage.whirlpools.some(w => distance(w, s.player.pos) < w.radius + 13))
        this.setTip("Whirlpool ahead. Steer clear!");
      else if (obstacle && (s.voyage.pack === 0 || s.voyage.freeSailing))
        this.setTip(obstacle.kind === "sea-rock" ? "Rocks ahead" : "Island ahead");
      else this.setTip("");
    }
    const targets = s.enemies
      .filter((e) => e.alive)
      .flatMap((e) => {
        const p = project(e.pos.x, 9, e.pos.z);
        return p.visible &&
          p.x > 10 &&
          p.x < innerWidth - 10 &&
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
          p.y < innerHeight - 160
        )
          targets.push(
            `<span class="sea-gem-tag" style="left:${p.x}px;top:${p.y}px">${icon("gem")}</span>`,
          );
      }
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
      if (i.landmark) drawLandmarkSymbol(ctx, i.landmark, x!, y!);
    }
    for (const g of s.voyage.gems) if (!g.found) {
      const [x, y] = plot(g.x, g.z);
      drawGemSymbol(ctx, x!, y!, 18, "#a1fff0");
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
    for (const g of s.voyage.gems) if (!g.found) {
      const [x, y] = plot(g.x, g.z);
      drawGemSymbol(ctx, x, y, 30, "#123e32");
    }
    ctx.textAlign = "center";
    ctx.font = "700 42px 'DM Sans', sans-serif";
    ctx.lineJoin = "round";
    for (const p of SEA_LANDMARKS) {
      const [x, y] = plot(p.x, p.z);
      drawLandmarkSymbol(ctx, p.landmark, x, y);
      ctx.lineWidth = 9; ctx.strokeStyle = "#e7d9b8"; ctx.strokeText(p.name, x, y - 39);
      ctx.fillStyle = "#352f22"; ctx.fillText(p.name, x, y - 39);
    }
    const [px, py] = plot(s.player.pos.x, s.player.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(s.player.heading);
    ctx.fillStyle = "#fce1a1"; ctx.strokeStyle = "#47331d"; ctx.lineWidth = 3;
    ctx.shadowColor = "#fff8cd"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(10, 12); ctx.lineTo(0, 7); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#403a2b"; ctx.font = "bold 36px Georgia";
    ctx.fillText("N", 512, 30); ctx.fillText("S", 512, 1017); ctx.fillText("W", 20, 525); ctx.fillText("E", 1004, 525);
    ctx.strokeStyle = "#4c4935"; ctx.lineWidth = 2; ctx.strokeRect(margin, margin, 952, 952);
  }
}
