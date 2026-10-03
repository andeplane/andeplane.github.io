import type { Controls } from "../input/controls";
import { CHAPTERS } from "../game/adventure";
import { PAINTS, type Progress } from "../game/progress";
import type { GameEvent, Session } from "../game/session";
import { distance, headingTo } from "../sim/math";
import { icon } from "./icons";

type Projector = (
  x: number,
  y: number,
  z: number,
) => { x: number; y: number; visible: boolean };
interface Handlers {
  onCruise: () => void;
  onStart: (junior: boolean) => void;
  onRestart: () => void;
  onContinue: () => void;
  onPause: () => void;
  onNavigate: (id?: number) => void;
  onAnchor: () => void;
  onSteer: (heading: number | null) => void;
  onPaint: (color: string) => void;
}
const $ = <T extends HTMLElement>(r: ParentNode, s: string): T =>
  r.querySelector<T>(s)!;

export class Hud {
  readonly root: HTMLElement;
  private junior = true;
  private bannerTimer = 0;
  private toastTimer = 0;
  private pulseTime = 0;
  private started = false;
  private session: Session | null = null;
  private progress: Progress;
  private mapOpen = false;
  private navigating = false;
  private navigationTreasure: number | null = null;
  private displayedReward = -1;
  constructor(
    parent: HTMLElement,
    controls: Controls,
    private readonly h: Handlers,
    progress: Progress,
  ) {
    this.progress = progress;
    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.innerHTML = `
      <header class="topbar"><div class="brand">${icon("wheel")}<span>BROADSIDE<small>A LITTLE CAPTAIN’S ADVENTURE</small></span></div>
        <div class="tools"><button id="help" class="tool" aria-label="How to play">?</button><button id="pause-btn" class="tool" aria-label="Pause game">${icon("pause")}</button></div></header>
      <div id="sailing-ui" hidden>
        <div id="status" class="glass"><span class="ship-label">${icon("ship")} THE SEA LARK</span><div class="hull-row">${icon("heart")}<div id="hull" class="bar"><i></i></div><span id="health">100%</span></div><div class="wallet"><span class="coin"></span><b id="gold-value">0</b><span>gold</span><span id="keepsake-count">0 / 6 ${icon("chest")}</span></div></div>
        <div id="mission" class="glass"><span class="eyebrow" id="chapter-label"></span><strong id="mission-title"></strong><span id="mission-subtitle"></span><div id="chapter-pips">${CHAPTERS.map((_, i) => `<i data-chapter="${i}"></i>`).join("")}</div></div>
        <div id="boss" class="glass" hidden><span>CAPTAIN REDWAKE</span><div class="bar"><i></i></div></div>
        <button id="chart-btn" class="glass" aria-label="Open treasure map"><svg id="mini-map" viewBox="-310 -310 620 620" aria-hidden="true"></svg><span>${icon("map")} TREASURE MAP</span></button>
        <div id="destination"><span id="destination-icon">${icon("compass")}</span><div><small id="destination-label">NEXT TREASURE</small><strong id="destination-name"></strong></div><span id="destination-distance"></span><button id="navigate" aria-label="Sail to next treasure">${icon("arrow")}</button></div>
        <div id="joystick" aria-label="Drag to steer"><div class="stick-ring"></div><div id="stick">${icon("wheel")}</div><span>STEER</span></div>
        <div id="sail-actions"><button id="anchor" class="tool" aria-label="Stop or start sailing">${icon("anchor")}</button><button id="auto" class="tool active" aria-label="Toggle automatic cannons">${icon("star")}</button></div>
        <button id="fire" aria-label="Fire cannons"><span>${icon("cannon")}</span><b>BOOM!</b><small id="fire-label">CREW AIMING</small></button>
        <div id="keyboard-hint"><kbd>←</kbd><kbd>→</kbd> steer <span>·</span> <kbd>SPACE</kbd> boom <span>·</span> click the sea to sail</div>
        <div id="bars"></div><div id="markers"></div><div id="floaters"></div>
      </div>
      <div id="banner" role="status" aria-hidden="true"><strong></strong><span></span></div><div id="toast" role="status" aria-hidden="true"></div>
      <section id="title" class="screen on"><div class="hero-copy"><div class="eyebrow hero-eyebrow"><span></span> THE TREASURE IS CALLING</div><h1>Little captain.<br><em>Big adventure.</em></h1><p>Set sail for sunlit islands, sparkling treasure<br class="desktop-break"> and a little pirate mischief.</p>
        <div class="mode-picker"><button id="junior" class="mode selected" aria-pressed="true">${icon("star")}<span>Little Captain<small>Gentle seas · crew repairs</small></span></button><button id="normal" class="mode" aria-pressed="false">${icon("flag")}<span>Sea Dog<small>A bigger challenge</small></span></button></div>
        <button class="btn" id="start">Set sail ${icon("arrow")}</button><div class="paint-picker"><span>YOUR SAILS</span>${PAINTS.map((c, i) => `<button class="paint ${c === progress.paint ? "selected" : ""}" data-paint="${c}" aria-label="${["Pearl", "Lagoon", "Coral"][i]} sails" style="--paint:${c}"></button>`).join("")}</div>
        <div class="hero-notes"><span>${icon("compass")} 3 adventures</span><span>${icon("chest")} 6 treasures</span><span>${icon("heart")} Made for little captains</span></div></div>
        <div class="hero-caption"><span>01 / THE ARCHIPELAGO</span><b>A world of wonder awaits.</b><small>PALM BAY · CORAL COAST · SUNSET COVE</small></div>
        <div id="collection-home" class="collection-home"></div>
      </section>
      <section id="pause" class="screen modal"><div class="card"><div class="medallion">${icon("anchor")}</div><span class="eyebrow">A LITTLE SHORE LEAVE</span><h2>Rest your sea legs.</h2><p>Your adventure will be right here.</p><button id="resume" class="btn">Keep sailing ${icon("play")}</button><button id="restart-pause" class="text-btn">Start a new adventure</button></div></section>
      <section id="treasure" class="screen modal"><div class="card"><span class="eyebrow">X MARKED THE SPOT!</span><h2>A treasure for you!</h2><div id="treasure-prize"></div><p id="treasure-name"></p><div class="treasure-gold">+150 gold · ship patched up</div><button id="treasure-go" class="btn">Keep sailing ${icon("arrow")}</button></div></section>
      <section id="reward" class="screen modal"><div class="card"><div class="medallion">${icon("star")}</div><span class="eyebrow">ADVENTURE COMPLETE</span><h2 id="reward-title"></h2><p id="reward-text"></p><div id="reward-loot" class="loot"></div><button id="continue" class="btn">Next adventure ${icon("arrow")}</button></div></section>
      <section id="end" class="screen modal"><div class="card"><div class="medallion">${icon("wheel")}</div><span class="eyebrow" id="end-eyebrow"></span><h2 id="end-title"></h2><p id="end-text"></p><div id="end-loot" class="loot"></div><div id="end-gold"></div><button id="again" class="btn">Sail again ${icon("arrow")}</button><button id="cruise" class="text-btn">A peaceful treasure cruise</button></div></section>
      <section id="chart" class="screen modal"><div class="card chart-card"><button id="close-chart" class="close" aria-label="Close treasure map">×</button><span class="eyebrow">X MARKS THE SPOT</span><h2>Your treasure map</h2><svg id="big-map" viewBox="-310 -310 620 620" role="img" aria-label="Island map showing your ship, pirates and treasures"></svg><div id="map-stops"></div><small class="map-legend"><i></i> You <i></i> Treasure <i></i> Pirates</small></div></section>
      <section id="how" class="screen modal"><div class="card"><button id="close-help" class="close" aria-label="Close instructions">×</button><div class="medallion">${icon("compass")}</div><span class="eyebrow">WELCOME ABOARD, CAPTAIN</span><h2>Ready for adventure?</h2><div class="instructions"><div>${icon("wheel")}<span><b>Steer your ship</b>Drag the wheel, use ← →, or tap the sea.</span></div><div>${icon("chest")}<span><b>Find the treasure</b>Follow the gold compass. Stop by a chest to open it.</span></div><div>${icon("cannon")}<span><b>Make a little BOOM!</b>Get close to pirates. Your crew aims and fires for you!</span></div><div>${icon("map")}<span><b>A helping hand</b>Tap a treasure on your map and your crew sails there.</span></div></div><button id="help-go" class="btn">Aye aye! ${icon("arrow")}</button></div></section>`;
    for (const modal of this.root.querySelectorAll<HTMLElement>(".modal")) {
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      const heading = modal.querySelector("h2");
      if (heading) {
        heading.id ||= `${modal.id}-heading`;
        modal.setAttribute("aria-labelledby", heading.id);
      }
    }
    parent.appendChild(this.root);
    const r = this.root;
    const click = (sel: string, f: () => void) =>
      $(r, sel).addEventListener("click", f);
    click("#start", () => {
      this.started = true;
      $(r, "#title").classList.remove("on");
      $(r, "#sailing-ui").hidden = false;
      this.h.onStart(this.junior);
      this.showToast("Follow the gold compass. Your first treasure is close!");
    });
    click("#junior", () => this.setMode(true));
    click("#normal", () => this.setMode(false));
    click("#treasure-go", () => {
      $(r, "#treasure").classList.remove("on");
      h.onPause();
    });
    click("#cruise", h.onCruise);
    click("#again", h.onRestart);
    click("#restart-pause", h.onRestart);
    click("#continue", () => {
      $(r, "#reward").classList.remove("on");
      h.onContinue();
    });
    click("#pause-btn", h.onPause);
    click("#resume", h.onPause);
    click("#chart-btn", () => this.toggleChart(true));
    click("#close-chart", () => this.toggleChart(false));
    click("#navigate", () => {
      this.navigating = true;
      h.onNavigate();
      this.showToast(
        this.session?.state === "battle"
          ? "Your crew is lining up the pirates. Steer any time to take over."
          : "Your crew is following the compass. Steer any time to take over.",
      );
    });
    click("#anchor", h.onAnchor);
    click("#auto", () => {
      if (this.session) {
        this.session.autoFire = !this.session.autoFire;
        $(r, "#auto").classList.toggle("active", this.session.autoFire);
        this.showToast(
          this.session.autoFire
            ? "Your crew will fire when pirates are in range."
            : "You are in charge of BOOM!",
        );
      }
    });
    click("#help", () => {
      if (this.started && !$(r, "#pause").classList.contains("on")) h.onPause();
      $(r, "#how").classList.add("on");
    });
    const closeHelp = () => {
      $(r, "#how").classList.remove("on");
      if (this.started && $(r, "#pause").classList.contains("on")) h.onPause();
    };
    click("#close-help", closeHelp);
    click("#help-go", closeHelp);
    for (const p of r.querySelectorAll<HTMLButtonElement>("[data-paint]"))
      p.addEventListener("click", () => {
        for (const b of r.querySelectorAll(".paint"))
          b.classList.remove("selected");
        p.classList.add("selected");
        h.onPaint(p.dataset.paint!);
      });
    const fire = $(r, "#fire");
    fire.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      fire.setPointerCapture(e.pointerId);
      fire.classList.add("down");
      controls.setVirtual("fireBoth", true);
    });
    const release = () => {
      fire.classList.remove("down");
      controls.setVirtual("fireBoth", false);
    };
    fire.addEventListener("pointerup", release);
    fire.addEventListener("pointercancel", release);
    fire.addEventListener("lostpointercapture", release);
    const joy = $(r, "#joystick"),
      stick = $(r, "#stick");
    let pointer: number | null = null;
    const move = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      const rect = joy.getBoundingClientRect(),
        x = e.clientX - rect.left - rect.width / 2,
        y = e.clientY - rect.top - rect.height / 2;
      const d = Math.hypot(x, y),
        scale = Math.min(1, 34 / Math.max(1, d));
      stick.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
      h.onSteer(d < 12 ? null : Math.atan2(x, -y));
      this.navigating = false;
    };
    joy.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      joy.setPointerCapture(pointer);
      move(e);
    });
    joy.addEventListener("pointermove", move);
    const stop = () => {
      pointer = null;
      stick.style.transform = "";
      h.onSteer(null);
    };
    joy.addEventListener("pointerup", stop);
    joy.addEventListener("pointercancel", stop);
    joy.addEventListener("lostpointercapture", stop);
    $(r, "#map-stops").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-target]",
      );
      if (b) {
        this.toggleChart(false);
        this.navigating = true;
        h.onNavigate(Number(b.dataset.target));
      }
    });
    this.renderCollection();
  }
  private setMode(junior: boolean): void {
    this.junior = junior;
    for (const [id, selected] of [
      ["#junior", junior],
      ["#normal", !junior],
    ] as const) {
      $(this.root, id).classList.toggle("selected", selected);
      $(this.root, id).setAttribute("aria-pressed", String(selected));
    }
  }
  private toggleChart(on: boolean): void {
    this.mapOpen = on;
    $(this.root, "#chart").classList.toggle("on", on);
    if (this.started) this.h.onPause();
  }
  closeOverlay(): boolean {
    if (this.mapOpen) {
      this.toggleChart(false);
      return true;
    }
    for (const id of ["#how", "#treasure"]) {
      if ($(this.root, id).classList.contains("on")) {
        $(this.root, id).classList.remove("on");
        if (this.started) this.h.onPause();
        return true;
      }
    }
    return false;
  }
  setNavigating(value: boolean, treasureId?: number): void {
    this.navigating = value;
    this.navigationTreasure = value ? treasureId ?? null : null;
  }
  setPaused(paused: boolean): void {
    $(this.root, "#pause").classList.toggle(
      "on",
      paused &&
        !this.mapOpen &&
        !$(this.root, "#how").classList.contains("on") &&
        !$(this.root, "#treasure").classList.contains("on"),
    );
  }
  hideEnd(): void {
    for (const id of [
      "#end",
      "#reward",
      "#pause",
      "#chart",
      "#how",
      "#treasure",
    ])
      $(this.root, id).classList.remove("on");
    this.mapOpen = false;
    this.displayedReward = -1;
  }
  clearEnemyBars(): void {
    $(this.root, "#bars").replaceChildren();
    $(this.root, "#markers").replaceChildren();
  }
  private renderCollection(): void {
    $(this.root, "#collection-home").innerHTML =
      `<span>YOUR TREASURE SHELF</span><div>${["🦜", "🐚", "⭐", "🐢", "💎", "👑"].map((x, i) => `<i class="${this.progress.keepsakes.includes(i) ? "found" : ""}">${x}</i>`).join("")}</div>`;
  }
  showEnd(won: boolean, gold: number): void {
    $(this.root, "#end-eyebrow").textContent = won
      ? "CAPTAIN OF THE COVE"
      : "EVERY CAPTAIN LEARNS";
    $(this.root, "#end-title").textContent = won
      ? "You’re a pirate legend!"
      : "Another adventure?";
    $(this.root, "#end-text").textContent = won
      ? "Six treasures. Three adventures. One very brave captain."
      : "Your treasure is safe. Set sail and give it another go!";
    $(this.root, "#end-gold").textContent = `${gold} gold collected`;
    $(this.root, "#end-loot").innerHTML = (
      this.session?.treasures.filter((t) => t.found) ?? []
    )
      .map((t) => `<span title="${t.prize}">${t.icon}</span>`)
      .join("");
    $(this.root, "#cruise").hidden = !won;
    $(this.root, "#end").classList.add("on");
  }
  showToast(text: string): void {
    $(this.root, "#toast").innerHTML =
      '<span></span>';
    $(this.root, "#toast span").textContent = text;
    $(this.root, "#toast").classList.add("on");
    $(this.root, "#toast").setAttribute("aria-hidden", "false");
    this.toastTimer = 5;
  }
  handleEvents(events: readonly GameEvent[], project: Projector): void {
    for (const e of events) {
      if (e.type === "banner") {
        $(this.root, "#banner strong").textContent = e.title;
        $(this.root, "#banner span").textContent = e.subtitle;
        $(this.root, "#banner").classList.add("on");
        $(this.root, "#banner").setAttribute("aria-hidden", "false");
        this.bannerTimer = 3.6;
      }
      if (e.type === "treasure") {
        $(this.root, "#treasure-prize").textContent = e.treasure.icon;
        $(this.root, "#treasure-name").textContent = e.treasure.prize;
        $(this.root, "#treasure").classList.add("on");
        this.h.onPause();
      }
      if (e.type === "reward" && this.displayedReward !== e.chapter) {
        this.displayedReward = e.chapter;
        $(this.root, "#reward-title").textContent = CHAPTERS[e.chapter]!.reward;
        $(this.root, "#reward-text").textContent =
          "The pirates sailed away! Your ship is patched up and upgraded.";
        $(this.root, "#reward-loot").innerHTML = this.session!.treasures.filter(
          (t) => t.chapter === e.chapter && t.found,
        )
          .map((t) => `<span>${t.icon}<small>${t.prize}</small></span>`)
          .join("");
        $(this.root, "#reward").classList.add("on");
      }
      if (e.type === "gold") {
        const p = project(e.x, 8, e.z);
        if (!p.visible) continue;
        const f = document.createElement("div");
        f.className = "floater";
        f.textContent = `+${e.amount}`;
        f.style.left = `${p.x}px`;
        f.style.top = `${p.y}px`;
        $(this.root, "#floaters").appendChild(f);
        setTimeout(() => f.remove(), 1800);
      }
    }
  }
  update(s: Session, dt: number, project: Projector): void {
    this.session = s;
    const r = this.root;
    this.pulseTime += dt;
    this.bannerTimer -= dt;
    this.toastTimer -= dt;
    if (this.bannerTimer <= 0) {
      $(r, "#banner").classList.remove("on");
      $(r, "#banner").setAttribute("aria-hidden", "true");
    }
    if (this.toastTimer <= 0) {
      $(r, "#toast").classList.remove("on");
      $(r, "#toast").setAttribute("aria-hidden", "true");
    }
    if (!this.started) return;
    $(r, "#sailing-ui").inert = !!r.querySelector(".modal.on");
    const frac = s.player.hull / s.player.spec.maxHull;
    $(r, "#hull i").style.transform = `scaleX(${frac})`;
    $(r, "#hull").classList.toggle("hurt", frac < 0.4);
    $(r, "#health").textContent = `${Math.ceil(frac * 100)}%`;
    $(r, "#gold-value").textContent = String(s.gold);
    $(r, "#keepsake-count").innerHTML =
      `${s.treasures.filter((t) => t.found).length} / 6 ${icon("chest")}`;
    $(r, "#chapter-label").textContent = s.cruising
      ? "JUST YOU AND THE SEA"
      : `ADVENTURE ${s.chapter + 1} / 3 · ${CHAPTERS[s.chapter]!.place}`;
    $(r, "#mission-title").textContent = s.cruising
      ? "A peaceful treasure cruise"
      : s.state === "battle"
        ? s.chapter === 2
        ? "Captain Redwake!"
          : "Shoo away the pirates!"
        : CHAPTERS[s.chapter]!.name;
    const remaining = s.enemies.filter((e) => e.alive);
    $(r, "#mission-subtitle").textContent = s.cruising
      ? `${s.treasures.filter((t) => t.found).length} / 6 treasures found · happy sailing`
      : s.state === "battle"
        ? `${remaining.length} pirate ${remaining.length === 1 ? "ship" : "ships"} left · your crew aims for you`
        : `${2 - s.activeTreasures.length} / 2 treasures found · follow the compass`;
    for (const [i, p] of [...r.querySelectorAll("#chapter-pips i")].entries()) {
      p.classList.toggle("done", i < s.chapter || s.state === "won");
      p.classList.toggle("current", i === s.chapter);
    }
    const target = s.activeTreasures
      .slice()
      .sort(
        (a, b) => distance(a.pos, s.player.pos) - distance(b.pos, s.player.pos),
      )[0];
    const enemy = remaining
      .slice()
      .sort(
        (a, b) => distance(a.pos, s.player.pos) - distance(b.pos, s.player.pos),
      )[0];
    const destination = s.state === "battle" ? enemy : target;
    $(r, "#destination").hidden =
      !destination || s.state === "reward" || s.state === "won";
    if (destination) {
      $(r, "#destination-name").textContent =
        s.state === "battle"
          ? (enemy?.spec.displayName ?? "Pirate ship")
          : target!.name;
      $(r, "#destination-label").textContent = this.navigating
        ? "CREW AT THE HELM"
        : s.state === "battle"
          ? "PIRATES AHOY"
          : "NEXT TREASURE";
      $(r, "#destination-distance").textContent =
        `${Math.round(distance(s.player.pos, destination.pos))} m`;
      $(r, "#destination-icon").style.transform =
        `rotate(${headingTo(s.player.pos, destination.pos)}rad)`;
      $(r, "#destination-icon").innerHTML =
        '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 7 19-7-5-7 5z"/></svg>';
    }
    $(r, "#anchor").classList.toggle("active", s.player.sail === 0);
    const reload =
      Math.min(s.player.reload.port, s.player.reload.starboard) /
      s.player.spec.reloadTime;
    $(r, "#fire").style.setProperty(
      "--reload",
      `${Math.round((1 - reload) * 100)}%`,
    );
    $(r, "#fire-label").textContent =
      reload > 0 ? "RELOADING" : s.autoFire ? "AUTO CREW ON" : "READY TO FIRE";
    const boss = remaining.find((e) => s.bossIds.has(e.id));
    $(r, "#boss").hidden = !boss;
    if (boss)
      $(r, "#boss i").style.transform =
        `scaleX(${boss.hull / boss.spec.maxHull})`;
    const markerHtml = s.activeTreasures
      .map((t) => {
        const p = project(t.pos.x, 12, t.pos.z);
        if (!p.visible || p.x < 10 || p.y < 80) return "";
        return `<div class="treasure-marker" style="left:${p.x}px;top:${p.y}px;--progress:${t.progress}">${icon("chest")}<span>${t.progress > 0 ? "Opening…" : t.name}</span></div>`;
      })
      .join("");
    $(r, "#markers").innerHTML = markerHtml;
    $(r, "#bars").innerHTML = remaining
      .map((e) => {
        const p = project(e.pos.x, e.spec.length * 0.9, e.pos.z);
        return p.visible
          ? `<div class="enemy-bar" style="left:${p.x}px;top:${p.y}px"><i style="transform:scaleX(${e.hull / e.spec.maxHull})"></i></div>`
          : "";
      })
      .join("");
    // Map is north-up, as is the sailing camera.
    const map = `<circle r="298" fill="#113a40" stroke="#f1d29b" stroke-opacity=".2" stroke-width="3"/><path d="M-285 0H285M0-285V285" stroke="#fff" stroke-opacity=".08" stroke-dasharray="8 12"/>${s.level.islands.map((i) => `<circle cx="${i.pos.x}" cy="${-i.pos.z}" r="${i.radius}" fill="${i.kind === "sand" ? "#a4b879" : "#83938b"}" stroke="#e7d4a0" stroke-width="5"/>`).join("")}${s.treasures
      .filter((t) => s.cruising || t.chapter <= s.chapter)
      .map(
        (t) =>
          `<circle cx="${t.pos.x}" cy="${-t.pos.z}" r="${t.found ? 6 : 11}" fill="${t.found ? "#9bb9ac" : "#ffd278"}"/>`,
      )
      .join(
        "",
      )}${remaining.map((e) => `<circle cx="${e.pos.x}" cy="${-e.pos.z}" r="8" fill="#ff917c"/>`).join("")}<g transform="translate(${s.player.pos.x} ${-s.player.pos.z}) rotate(${(s.player.heading * 180) / Math.PI})"><path d="M0-18 12 13 0 8-12 13Z" fill="#fff8dd" stroke="#10383e" stroke-width="3"/></g>`;
    if (
      Math.floor(this.pulseTime * 8) !== Math.floor((this.pulseTime - dt) * 8)
    ) {
      $(r, "#mini-map").innerHTML = map;
      if (this.mapOpen) {
        $(r, "#big-map").innerHTML = map;
        $(r, "#map-stops").innerHTML =
          s.activeTreasures
            .map(
              (t) =>
                `<button data-target="${t.id}">${icon("chest")}<span>${t.name}<small>${Math.round(distance(t.pos, s.player.pos))} m away</small></span>${icon("arrow")}</button>`,
            )
            .join("") ||
          (s.cruising
            ? "<p>All six treasures found. Happy sailing, Captain!</p>"
            : "<p>All treasure found. Time for a little pirate mischief!</p>");
      }
    }
  }
}
