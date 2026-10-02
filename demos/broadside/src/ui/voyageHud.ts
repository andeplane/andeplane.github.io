import { PACKS, RELICS, type VoyageSession } from "../game/voyage";
import {
  goldTotal,
  CAVE_ITEMS,
  WORLD_RELICS,
  type VoyageReward,
} from "../game/rewards";
import type { Progress } from "../game/progress";
import { icon } from "./icons";
import { worldArt, pirateShipArt } from "./worldArt";
import { Controls } from "../input/controls";
import { angleDiff, headingTo, distance } from "../sim/math";
interface Handlers {
  start: (index: number) => void;
  home: () => void;
  menu: () => void;
  narration: () => boolean;
  overview: () => void;
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
      <div id="world-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow">CHART YOUR COURSE</span><h1>The pirate seas</h1><p>Choose a world</p></div><div class="world-map"><svg class="map-route" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true"><path d="M120 390 C40 130 310 420 380 240 S480 50 610 215 S820 380 870 90"/></svg><button id="map-cave" class="map-cave" aria-label="Visit treasure cave">${icon("chest")}<span>Your cave</span></button><div id="world-packs"></div><span class="map-compass" aria-hidden="true">${icon("compass")}</span></div><p class="map-footnote">Gold in every level. A special treasure in every world.</p></div>
      <div id="level-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow" id="world-number"></span><h1 id="world-name"></h1><p id="pack-caption"></p></div><div class="level-board"><div id="level-world-art"></div><div id="voyage-levels"></div><p class="level-note">100 gold per level · Complete the world for its special treasure.</p></div></div>
      <div id="settings-menu" class="menu-page" hidden><div class="menu-heading"><span class="eyebrow">THE CAPTAIN’S ORDERS</span><h1>Settings</h1></div><div class="settings-board"><button id="settings-sound" class="setting-row" role="switch" aria-checked="${!progress.muted}"><span>${icon("sound")} Sound effects</span><b>${progress.muted ? "Off" : "On"}</b></button><button id="settings-voice" class="setting-row" role="switch" aria-checked="${progress.narration}"><span>${icon("flag")} Spoken hints</span><b>${progress.narration ? "On" : "Off"}</b></button><p>Steer with the wheel. Tap BOOM to fire.<br>Your treasures and stars are saved automatically.</p></div></div>
      <button id="menu-back" class="menu-back" hidden>‹ <span>Back</span></button>
    </section>
    <section id="cave-ui" hidden><div class="cave-title"><span class="eyebrow">YOUR SECRET HIDEOUT</span><h1>The treasure cave</h1><p id="cave-count"></p></div><div id="relic-info"><span class="eyebrow" id="relic-number"></span><h2 id="relic-title"></h2><p id="relic-story"></p><div id="relic-stars"></div><button id="cave-sail" class="text-button">Find this treasure ${icon("arrow")}</button></div><div class="gallery-hint">Drag to explore · tap a treasure · spread fingers to pull back</div><button id="cave-overview" class="cave-overview">${icon("chest")} Whole cave</button><button id="cave-back" class="menu-back">‹ <span>Back</span></button></section>
    <section id="voyage-play" hidden><div class="voyage-status"><span>${icon("heart")}<div class="health-track"><i id="v-hull"></i></div><b id="v-health">100%</b></span><span class="gem-count">◆ <b id="v-gems">0 / 3</b></span></div><div class="voyage-mission"><small id="v-level"></small><strong id="v-objective"></strong><div class="voyage-track"><i id="v-travel"></i><span>✦</span></div></div><div id="v-targets"></div><div id="v-wheel" aria-label="Drag the wheel to steer" role="group"><div class="wheel-ring"></div><span id="v-stick">${icon("wheel")}</span><small>STEER</small></div><button id="v-anchor" class="round" aria-label="Stop or start sailing">${icon("anchor")}</button><button id="v-fire" aria-label="Fire cannons"><span>${icon("cannon")}</span><b>BOOM!</b><small id="v-fire-label">TAP TO FIRE</small></button><div id="v-compass"><span id="v-arrow">↑</span><b>TREASURE</b><small id="v-distance"></small></div><div id="v-tip"></div></section>
    <section id="v-result" class="voyage-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-top"><span class="eyebrow" id="result-eyebrow">A NEW TREASURE FOR YOUR CAVE</span><h1 id="result-title"></h1><div id="result-stars"></div><p id="result-detail"></p></div><div class="result-bottom"><p class="collection-confirmation">${icon("chest")} Added to your cave</p><button id="result-next" class="primary">Continue ${icon("arrow")}</button><button id="result-retry" class="text-button">Sail this level again</button></div></section>
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
    q("#cave-sail").onclick = () => {
      h.menu();
      this.pack = Math.floor(this.selected / 3);
      this.showMenu("levels");
    };
    q("#settings-sound").onclick = () => {
      const muted = h.mute();
      q("#v-sound").innerHTML = icon(muted ? "mute" : "sound");
      q("#settings-sound").setAttribute("aria-checked", String(!muted));
      q("#settings-sound b").textContent = muted ? "Off" : "On";
    };
    q("#settings-voice").onclick = () => {
      const enabled = h.narration();
      q("#settings-voice").setAttribute("aria-checked", String(enabled));
      q("#settings-voice b").textContent = enabled ? "On" : "Off";
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
    q("#result-next").onclick = () => {
      if (this.selected === 11) {
        h.home();
        return;
      }
      h.menu();
      this.pack = Math.floor(this.selected / 3);
      this.showMenu(this.selected % 3 === 2 ? "worlds" : "levels");
    };
    q("#result-retry").onclick = () => h.start(this.selected);
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
    this.pack = Math.floor(this.selected / 3);
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
    this.q("#settings-voice").setAttribute(
      "aria-checked",
      String(this.progress.narration),
    );
    this.q("#settings-voice b").textContent = this.progress.narration
      ? "On"
      : "Off";
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
    this.pack = Math.floor(this.selected / 3);
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
    this.q("#relic-info").hidden = true;
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
      ? "Every new level brings home 100 gold. Watch your fortune grow around the cave."
      : owned
        ? relic.story
        : `Complete all three levels in ${PACKS[world]!.name} to open this chest.`;
    this.q("#relic-stars").textContent = gold
      ? ""
      : owned
        ? `★ ${[0, 1, 2].reduce((sum, n) => sum + (this.progress.voyages[world * 3 + n]?.stars ?? 0), 0)} / 9 world stars`
        : "✧ ✧ ✧";
    this.q("#cave-sail").hidden = owned;
  }
  private renderLevels(): void {
    const next =
      Array.from({ length: 12 }, (_, i) => i).find(
        (i) => !this.progress.voyages[i],
      ) ?? 11;
    const stars = (pack: number) =>
      [0, 1, 2].reduce(
        (total, n) => total + (this.progress.voyages[pack * 3 + n]?.stars ?? 0),
        0,
      );
    this.q("#world-packs").innerHTML = PACKS.map(
      (p, i) =>
        `<button data-pack="${i}" class="world-island world-${i}" aria-label="${p.name}, world ${i + 1}">${worldArt(i)}<span class="world-label"><small>WORLD ${i + 1}</small><b>${p.name}</b><span>${i * 3 > next ? icon("lock") + " Uncharted" : "★ " + stars(i) + " / 9"}</span></span></button>`,
    ).join("");
    const pack = PACKS[this.pack]!;
    this.q("#world-number").textContent = `WORLD ${this.pack + 1}`;
    this.q("#world-name").textContent = pack.name;
    this.q("#pack-caption").textContent = pack.subtitle;
    this.q(".level-note").textContent =
      `100 gold per level · World treasure: ${RELICS[WORLD_RELICS[this.pack]!]!.name}`;
    this.q("#level-world-art").innerHTML = worldArt(this.pack, "level");
    this.q("#voyage-levels").innerHTML = Array.from({ length: 3 }, (_, n) => {
      const i = this.pack * 3 + n,
        v = this.progress.voyages[i],
        locked = i > next;
      return `<button data-level="${i}" ${locked ? "disabled" : ""} aria-label="Level ${n + 1}${locked ? ", locked" : v ? ", " + v.stars + " stars" : ", set sail"}" class="level-tile ${locked ? "locked" : ""} ${i === next ? "next-level" : ""}"><span class="tile-number">${n + 1}</span>${locked ? icon("lock", "tile-lock") : ""}<span class="tile-stars">${[0, 1, 2].map((s) => `<i class="${s < (v?.stars ?? 0) ? "earned" : ""}">★</i>`).join("")}</span><span class="tile-treasure" title="${n === 2 ? RELICS[WORLD_RELICS[this.pack]!]!.name : "100 gold"}">${icon(n === 2 ? "gem" : "chest")}</span></button>`;
    }).join("");
  }

  play(index: number): void {
    this.q("#captain-menu").hidden = true;
    this.root.dataset.screen = "play";
    this.selected = index;
    this.messageUntil = 0;
    this.q("#cave-ui").hidden = true;
    this.q("#v-result").hidden = true;
    this.q("#v-result").classList.remove("unboxing", "revealed");
    this.q("#v-paused").hidden = true;
    this.q("#voyage-play").hidden = false;
    this.q("#v-pause").hidden = false;
    this.q("#v-home").hidden = false;
    this.q("#v-fire").hidden = false;
    this.q("#v-tip").textContent =
      index === 0
        ? "Drag the wheel to steer. Tap BOOM when a pirate is beside you!"
        : index < 3
          ? "Choose either side of the island. Blue gems are little secrets."
          : index < 6
            ? "Turn your ship sideways to a pirate, then tap BOOM!"
            : "Stay clear of glowing danger rings. Keep your ship safe!";
  }
  paused(value: boolean): void {
    this.q("#v-paused").hidden = !value;
    this.q("#voyage-play").inert = value;
  }
  result(s: VoyageSession, reward?: VoyageReward): void {
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
    this.q("#result-title").textContent =
      s.state === "won" ? "A chest full of wonder" : "Pip brought you home";
    this.q("#v-result").classList.toggle("unboxing", s.state === "won");
    this.q("#v-result").classList.remove("revealed");
    for (const button of this.q(
      "#v-result",
    ).querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = s.state === "won";
    this.q("#result-eyebrow").textContent =
      s.state === "won"
        ? "YOU REACHED THE TREASURE!"
        : "ANOTHER ADVENTURE AWAITS";
    this.q("#result-stars").innerHTML =
      s.state === "won"
        ? Array.from(
            { length: 3 },
            (_, i) =>
              `<span class="reward-star ${i < s.stars ? "earned" : "empty"}" style="--order:${i}">${i < s.stars ? "★" : "☆"}</span>`,
          ).join("")
        : "♡";
    this.q("#result-detail").textContent =
      s.state === "won"
        ? `${s.gemsFound} / 3 hidden gems · ${Math.round((100 * s.damageTaken) / s.player.spec.maxHull)}% hull damage${s.rescues ? " · Pip helped you home" : ""}`
        : "Your treasures are safe. Try sailing around the danger.";
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
      `${PACKS[s.voyage.pack]!.name.toUpperCase()} · LEVEL ${(s.voyage.index % 3) + 1}`;
    this.q("#v-objective").textContent = "Reach the treasure";
    this.q("#v-travel").style.width =
      `${Math.max(0, Math.min(100, ((s.player.pos.z + 90) / 238) * 100))}%`;
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
    else if (obstacle && s.voyage.pack === 0) {
      this.q("#v-tip").textContent =
        "Island ahead! Turn the wheel left or right to go around.";
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
