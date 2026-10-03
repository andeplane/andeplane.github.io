import { PACKS, RELICS, type VoyageSession } from "../game/voyage";
import {
  goldTotal,
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
import { worldArt, pirateShipArt } from "./worldArt";
import { Controls } from "../input/controls";
import { angleDiff, headingTo, distance } from "../sim/math";
interface Handlers {
  start: (index: number) => void;
  home: () => void;
  menu: () => void;
  overview: () => void;
  caveMove: (right: number, forward: number) => void;
  caveJump: () => void;
  caveInspect: () => void;
  select: (index: number) => void;
  pause: () => void;
  fire: () => void;
  steer: (heading: number | null) => void;
  anchor: () => void;
  mute: () => boolean;
}
export class VoyageHud {
  readonly root: HTMLElement;
  selected = 0;
  pack = 0;
  private progress: Progress;
  private messageUntil = 0;
  private activeLevel = 0;
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
    r.innerHTML = `<header class="voyage-header"><span class="voyage-brand">${icon("wheel")} <b>BROADSIDE<small>A LITTLE CAPTAIN’S COLLECTION</small></b></span><div><button id="v-sound" class="round" aria-label="Toggle sound">${icon(progress.muted ? "mute" : "sound")}</button><button id="v-home" class="round" aria-label="Choose levels">${icon("map")}</button><button id="v-pause" class="round" aria-label="Pause voyage">${icon("pause")}</button></div></header>
    <section id="captain-menu" class="captain-menu">
      <div class="menu-atmosphere" aria-hidden="true"><div class="moon"></div><div class="distant-rocks"></div><div class="hero-ship">${pirateShipArt()}</div><div class="ocean-mist"></div><div class="menu-embers"></div></div>
      <div id="main-menu" class="menu-page"><div class="title-crest">${icon("wheel")}</div><span class="eyebrow">A PIRATE’S TREASURE ADVENTURE</span><h1>Broadside</h1><p class="menu-tagline">Brave the seas. Bring home the treasure.</p><nav class="main-actions" aria-label="Main menu"><button id="menu-play" class="wood-button prominent">Play ${icon("play")}</button><button id="menu-settings" class="wood-button">Settings ${icon("wheel")}</button><button id="menu-cave" class="wood-button">Cave ${icon("chest")}</button></nav></div>
      <div id="world-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow">CHART YOUR COURSE</span><h1>The pirate seas</h1><p>Choose an island. Chart your adventure.</p></div><div class="world-map" role="group" aria-label="Pirate sea chart"><svg class="map-route" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path class="route-wide" d="M180 930 C125 820 90 720 170 520 S250 90 410 190 S440 650 650 480 S735 90 865 135"/><path class="route-tall" d="M170 930 C110 810 110 710 245 635 S815 810 755 545 S80 525 245 185 S570 290 755 150"/></svg><button id="map-cave" class="map-cave" aria-label="Visit treasure cave">${icon("chest")}<span>Your cave</span></button><div id="world-packs"></div></div><p class="map-footnote">Gold in every level. A special treasure in every world.</p></div>
      <div id="level-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow" id="world-number"></span><h1 id="world-name"></h1><p id="pack-caption"></p></div><div class="level-board"><div id="level-world-art"></div><div id="voyage-levels"></div><p class="level-note">1,000 gold per level · Complete the world for its special treasure.</p></div></div>
      <div id="settings-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow">THE CAPTAIN’S ORDERS</span><h1>Settings</h1></div><div class="settings-board"><button id="settings-sound" class="setting-row" role="switch" aria-checked="${!progress.muted}"><span>${icon("sound")} Sound effects</span><b>${progress.muted ? "Off" : "On"}</b></button><p>Steer with the wheel. Tap BOOM to fire.<br>Your treasures and stars are saved automatically.</p><p class="art-credit">Black Pearl model by <a href="https://www.thingiverse.com/thing:4951578" target="_blank" rel="noopener">DeltaX_F</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a><br>Adapted for Broadside.</p></div></div>
      <button id="menu-back" class="menu-back" hidden>‹ <span>Back</span></button>
    </section>
    <section id="cave-ui" hidden><div class="cave-title"><span class="eyebrow">YOUR SECRET HIDEOUT</span><h1>The treasure cave</h1><p id="cave-count"></p></div><div id="relic-info"><span class="eyebrow" id="relic-number"></span><h2 id="relic-title"></h2><p id="relic-story"></p><div id="relic-stars"></div><button id="cave-sail" class="text-button">Find this treasure ${icon("arrow")}</button></div><div class="gallery-hint">WASD walk · Arrows look · Space jump</div><button id="cave-overview" class="cave-overview">‹ Keep exploring</button><div id="cave-crosshair" aria-hidden="true">+</div><div id="cave-pad" role="group" aria-label="Move around the cave"><span id="cave-thumb"></span><small>MOVE</small></div><button id="cave-jump" aria-label="Jump">↑<small>JUMP</small></button><button id="cave-inspect" hidden>Inspect treasure</button><button id="cave-back" class="menu-back">‹ <span>Back</span></button></section>
    <section id="voyage-play" hidden><div class="voyage-status"><span>${icon("heart")}<div class="health-track"><i id="v-hull"></i></div><b id="v-health">100%</b></span><span class="gem-count">◆ <b id="v-gems">0 / 3</b></span></div><div class="voyage-mission"><small id="v-level"></small><strong id="v-objective"></strong><div class="voyage-track"><i id="v-travel"></i><span>✦</span></div></div><div id="v-targets"></div><div id="v-wheel" aria-label="Drag the wheel to steer" role="group"><div class="wheel-ring"></div><span id="v-stick">${icon("wheel")}</span><small>STEER</small></div><button id="v-anchor" class="round" aria-label="Stop or start sailing">${icon("anchor")}</button><button id="v-fire" aria-label="Fire cannons"><span>${icon("cannon")}</span><b>BOOM!</b><small id="v-fire-label">TAP TO FIRE</small></button><div id="v-compass"><span id="v-arrow">↑</span><b>TREASURE</b><small id="v-distance"></small></div><div id="v-tip"></div></section>
    <section id="v-result" class="voyage-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-top"><span class="eyebrow" id="result-eyebrow">A NEW TREASURE FOR YOUR CAVE</span><h1 id="result-title"></h1><div id="result-stars"></div><p id="result-detail"></p></div><div class="result-bottom"><p class="collection-confirmation">${icon("chest")} Added to your cave</p><div class="result-actions"><button id="result-retry" class="secondary">Retry</button><button id="result-next" class="primary">Next level ${icon("arrow")}</button><button id="result-menu" class="text-button">Back to menu</button></div></div></section>
    <section id="v-paused" class="voyage-overlay pause-screen" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title"><div><span class="eyebrow">A LITTLE SHORE LEAVE</span><h1 id="pause-title">Ready when you are.</h1><button id="v-resume" class="primary">Keep sailing ${icon("play")}</button><button id="v-return" class="secondary">Choose levels</button></div></section>`;
    document.body.append(r);
    const q = (id: string) => r.querySelector<HTMLElement>(id)!;
    q("#v-home").onclick = () => {
      h.menu();
      this.showMenu("levels");
    };
    q("#v-return").onclick = () => {
      h.menu();
      this.showMenu("levels");
    };
    q("#v-pause").onclick = h.pause;
    q("#v-resume").onclick = h.pause;
    q("#v-anchor").onclick = h.anchor;
    q("#v-sound").onclick = () =>
      (q("#v-sound").innerHTML = icon(h.mute() ? "mute" : "sound"));
    q("#menu-play").onclick = () => this.showMenu("worlds");
    q("#menu-settings").onclick = () => this.showMenu("settings");
    q("#menu-cave").onclick = q("#map-cave").onclick = h.home;
    q("#menu-back").onclick = () =>
      this.showMenu(this.menuPage === "levels" ? "worlds" : "main");
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
    q("#settings-sound").onclick = () => {
      const muted = h.mute();
      q("#v-sound").innerHTML = icon(muted ? "mute" : "sound");
      q("#settings-sound").setAttribute("aria-checked", String(!muted));
      q("#settings-sound b").textContent = muted ? "Off" : "On";
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
    q("#result-retry").onclick = () => h.start(this.activeLevel);
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
  select(index: number): void {
    this.selected = Math.max(0, Math.min(11, index));
    this.pack = Math.max(
      0,
      WORLD_RELICS.indexOf(this.selected as 2 | 5 | 8 | 11),
    );
    this.root.dataset.caveView = "inspect";
    this.h.select(this.selected);
    this.renderRelic();
    this.renderLevels();
  }
  private menuPage: "main" | "worlds" | "levels" | "settings" = "main";
  showMenu(page: "main" | "worlds" | "levels" | "settings" = "main"): void {
    this.menuPage = page;
    this.q("#settings-sound").setAttribute(
      "aria-checked",
      String(!this.progress.muted),
    );
    this.q("#settings-sound b").textContent = this.progress.muted
      ? "Off"
      : "On";
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
      ? "Drag to turn · spread fingers or Esc to return"
      : innerWidth < 700 ||
          (innerWidth < 1000 && innerHeight < 500) ||
          matchMedia("(pointer: coarse)").matches
        ? "Left stick to move · swipe to look · tap a treasure"
        : `${locked ? "Mouse" : "Drag"} or arrows look · WASD walk · Space jump · E inspect`;
  }
  private renderRelic(): void {
    this.q("#relic-info").hidden = false;
    const gold = this.selected === 0;
    const world = gold
      ? 0
      : WORLD_RELICS.indexOf(this.selected as 2 | 5 | 8 | 11);
    const relic = RELICS[this.selected]!;
    const owned = gold
      ? goldTotal(this.progress) > 0
      : this.progress.relics.includes(this.selected);
    this.q("#cave-count").textContent =
      `${goldTotal(this.progress).toLocaleString()} gold · ${this.progress.relics.length} / 4 world treasures`;
    this.q("#relic-number").textContent = gold
      ? "THE CAPTAIN’S GROWING HOARD"
      : `WORLD ${world + 1} · ${owned ? "FOUND & FOREVER YOURS" : "WAITING TO BE DISCOVERED"}`;
    this.q("#relic-title").textContent = gold
      ? `${goldTotal(this.progress).toLocaleString()} gold`
      : owned
        ? relic.name
        : "A world’s secret treasure";
    this.q("#relic-story").textContent = gold
      ? "Every new level brings home 1,000 gold. Watch your fortune grow around the cave."
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

  play(index: number): void {
    this.q("#captain-menu").hidden = true;
    this.root.dataset.screen = "play";
    this.activeLevel = index;
    this.pack = worldOf(index);
    this.messageUntil = 0;
    this.q("#cave-ui").hidden = true;
    this.q("#v-result").hidden = true;
    this.q("#v-result").classList.remove("unboxing", "revealed");
    this.q("#v-paused").hidden = true;
    this.q("#voyage-play").hidden = false;
    this.q("#v-pause").hidden = false;
    this.q("#v-home").hidden = false;
    const voyage = generateVoyage(index);
    this.q("#v-fire").hidden = voyage.level.waves[0]!.enemies.length === 0;
    this.q("#v-tip").textContent = voyage.level.intro;
  }
  paused(value: boolean): void {
    this.q("#v-paused").hidden = !value;
    this.q("#voyage-play").inert = value;
  }
  result(s: VoyageSession, reward?: VoyageReward): void {
    this.activeLevel = s.voyage.index;
    this.resultLost = s.state === "lost";
    this.q("#result-next").hidden =
      this.resultLost || this.activeLevel === TOTAL_LEVELS - 1;
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
      `${icon("chest")} ${reward?.gold ? `${reward.gold} gold added to your cave${reward.special !== null ? " · Special treasure collected" : ""}` : "Gold already collected · Best stars saved"}`;
    this.revealStars = s.stars;
    this.q("#result-stars").removeAttribute("aria-label");
    this.q("#result-title").textContent =
      s.state === "won" ? "A chest full of wonder" : "Your ship sank";
    this.q("#v-result").classList.toggle("unboxing", s.state === "won");
    this.q("#v-result").classList.remove("revealed");
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
        ? `${s.gemsFound} / 3 hidden gems · ${Math.round((100 * s.damageTaken) / s.player.spec.maxHull)}% hull damage${s.rescues ? " · Pip helped you home" : ""}`
        : s.failureReason === "rocks"
          ? "You struck the rocks. Steer clear and try again!"
          : s.failureReason === "island"
            ? "You crashed into an island. Find a safe passage!"
            : "Your ship took too much damage. Try again!";
    this.q(".collection-confirmation").hidden = s.state !== "won";
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
  ): void {
    const health = Math.round((s.player.hull / s.player.spec.maxHull) * 100);
    this.q("#v-hull").style.width = `${health}%`;
    this.q("#v-health").textContent = `${health}%`;
    this.q("#v-gems").textContent = `${s.gemsFound} / 3`;
    this.q("#v-level").textContent =
      `${PACKS[s.voyage.pack]!.name.toUpperCase()} · LEVEL ${stageOf(s.voyage.index) + 1}`;
    this.q("#v-objective").textContent = s.level.name;
    this.q("#v-travel").style.width =
      `${Math.max(0, Math.min(100, ((s.player.pos.z - s.level.player.pos.z) / (s.voyage.finish.z - s.level.player.pos.z)) * 100))}%`;
    const angle = angleDiff(0, headingTo(s.player.pos, s.voyage.finish));
    this.q("#v-arrow").style.transform = `rotate(${angle}rad)`;
    this.q("#v-distance").textContent =
      `${Math.round(distance(s.player.pos, s.voyage.finish))} m`;
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
        i > 0 &&
        i < s.level.islands.length - 1 &&
        distance(island.pos, s.player.pos) < island.radius + 32,
    );
    if (s.elapsed < this.messageUntil)
      this.q("#v-tip").classList.remove("fade");
    else if (
      s.voyage.whirlpools.some((w) => distance(w, s.player.pos) < w.radius + 13)
    ) {
      this.q("#v-tip").textContent =
        "Whirlpool! Keep sailing and steer away from the dark center.";
      this.q("#v-tip").classList.remove("fade");
    } else if (obstacle && s.voyage.pack === 0) {
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
      if (!gem.found) {
        const p = project(gem.x, 5, gem.z);
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
  }
}
