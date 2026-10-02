import { PACKS, RELICS, type VoyageSession } from "../game/voyage";
import type { Progress } from "../game/progress";
import { icon } from "./icons";
import { Controls } from "../input/controls";
import { angleDiff, headingTo, distance } from "../sim/math";
interface Handlers {
  start: (index: number) => void;
  home: () => void;
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
  constructor(
    progress: Progress,
    controls: Controls,
    private h: Handlers,
  ) {
    this.progress = progress;
    const r = (this.root = document.createElement("div"));
    r.id = "voyage-ui";
    r.innerHTML = `<header class="voyage-header"><span class="voyage-brand">${icon("wheel")} <b>BROADSIDE<small>A LITTLE CAPTAIN’S COLLECTION</small></b></span><div><button id="v-sound" class="round" aria-label="Toggle sound">${icon(progress.muted ? "mute" : "sound")}</button><button id="v-home" class="round" aria-label="Return to treasure cave">${icon("chest")}</button><button id="v-pause" class="round" aria-label="Pause voyage">${icon("pause")}</button></div></header>
    <section id="cave-ui"><div class="cave-title"><span class="eyebrow">YOUR SECRET PLACE</span><h1>The treasure cave</h1><p id="cave-count"></p></div><button class="gallery-arrow previous" id="cave-prev" aria-label="Previous treasure">‹</button><button class="gallery-arrow next" id="cave-next" aria-label="Next treasure">›</button><div id="relic-info"><span class="eyebrow" id="relic-number"></span><h2 id="relic-title"></h2><p id="relic-story"></p><div id="relic-stars"></div></div><div class="gallery-hint">${icon("compass")} Swipe the cave to explore your treasures</div><div id="pack-browser"><div class="pack-tabs">${PACKS.map((p, i) => `<button data-pack="${i}" style="--pack:${p.color}">${i + 1}<span>${p.name}</span></button>`).join("")}</div><div id="pack-caption"></div><div id="voyage-levels"></div></div></section>
    <section id="voyage-play" hidden><div class="voyage-status"><span>${icon("heart")}<div class="health-track"><i id="v-hull"></i></div><b id="v-health">100%</b></span><span class="gem-count">◆ <b id="v-gems">0 / 3</b></span></div><div class="voyage-mission"><small id="v-level"></small><strong id="v-objective"></strong><div class="voyage-track"><i id="v-travel"></i><span>✦</span></div></div><div id="v-targets"></div><div id="v-wheel" aria-label="Drag the wheel to steer" role="group"><div class="wheel-ring"></div><span id="v-stick">${icon("wheel")}</span><small>STEER</small></div><button id="v-anchor" class="round" aria-label="Stop or start sailing">${icon("anchor")}</button><button id="v-fire" aria-label="Fire cannons"><span>${icon("cannon")}</span><b>BOOM!</b><small id="v-fire-label">TAP TO FIRE</small></button><div id="v-compass"><span id="v-arrow">↑</span><b>TREASURE</b><small id="v-distance"></small></div><div id="v-tip"></div></section>
    <section id="v-result" class="voyage-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="result-top"><span class="eyebrow" id="result-eyebrow">A NEW TREASURE FOR YOUR CAVE</span><h1 id="result-title"></h1><div id="result-stars"></div><p id="result-detail"></p></div><div class="result-bottom"><button id="result-cave" class="primary">Put it in my cave ${icon("chest")}</button><button id="result-next" class="secondary">Next voyage ${icon("arrow")}</button><button id="result-retry" class="text-button">Sail this level again</button></div></section>
    <section id="v-paused" class="voyage-overlay pause-screen" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title"><div><span class="eyebrow">A LITTLE SHORE LEAVE</span><h1 id="pause-title">Ready when you are.</h1><button id="v-resume" class="primary">Keep sailing ${icon("play")}</button><button id="v-return" class="secondary">Back to my cave</button></div></section>`;
    document.body.append(r);
    const q = (id: string) => r.querySelector<HTMLElement>(id)!;
    q("#v-home").onclick = h.home;
    q("#v-return").onclick = h.home;
    q("#v-pause").onclick = h.pause;
    q("#v-resume").onclick = h.pause;
    q("#v-anchor").onclick = h.anchor;
    q("#v-sound").onclick = () =>
      (q("#v-sound").innerHTML = icon(h.mute() ? "mute" : "sound"));
    q("#cave-prev").onclick = () => this.select(this.selected - 1);
    q("#cave-next").onclick = () => this.select(this.selected + 1);
    r.querySelector(".pack-tabs")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pack]");
      if (b) {
        this.select(Number(b.dataset.pack) * 3);
      }
    });
    q("#voyage-levels").onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-level]",
      );
      if (b && !b.disabled) h.start(Number(b.dataset.level));
    };
    q("#result-cave").onclick = h.home;
    q("#result-next").onclick = () => h.start(Math.min(11, this.selected + 1));
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
    this.home();
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
  home(): void {
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
  }
  private renderRelic(): void {
    const relic = RELICS[this.selected]!,
      owned = this.progress.relics.includes(this.selected);
    this.q("#cave-count").textContent =
      `${this.progress.relics.length} of 12 treasures found · a story on every pedestal`;
    this.q("#relic-number").textContent =
      `${String(this.selected + 1).padStart(2, "0")} / 12 · ${owned ? "FOUND & FOREVER YOURS" : "WAITING TO BE DISCOVERED"}`;
    this.q("#relic-title").textContent = relic.name;
    this.q("#relic-story").textContent = owned
      ? relic.story
      : `Find this treasure in ${PACKS[Math.floor(this.selected / 3)]!.name}, voyage ${(this.selected % 3) + 1}.`;
    this.q("#relic-stars").textContent = owned
      ? "★".repeat(this.progress.voyages[this.selected]?.stars ?? 1)
      : "✧ ✧ ✧";
    (this.q("#cave-prev") as HTMLButtonElement).disabled = this.selected === 0;
    (this.q("#cave-next") as HTMLButtonElement).disabled = this.selected === 11;
  }
  private renderLevels(): void {
    const next =
      Array.from({ length: 12 }, (_, i) => i).find(
        (i) => !this.progress.voyages[i],
      ) ?? 11;
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-pack]"))
      b.classList.toggle("selected", Number(b.dataset.pack) === this.pack);
    this.q("#pack-caption").textContent = PACKS[this.pack]!.subtitle;
    this.q("#voyage-levels").innerHTML = Array.from({ length: 3 }, (_, n) => {
      const i = this.pack * 3 + n,
        v = this.progress.voyages[i],
        locked = i > next;
      return `<button data-level="${i}" ${locked ? "disabled" : ""} class="level-card ${i === next ? "next-level" : ""}"><span class="level-number">${locked ? "⌁" : i + 1}</span><span><b>${["First", "Second", "Third"][n]} voyage</b><small>${locked ? "Find the treasure before this one" : v ? `${"★".repeat(v.stars)}${"☆".repeat(3 - v.stars)} · ${v.gems}/3 gems` : "Set sail & find a treasure"}</small></span>${icon(locked ? "anchor" : "arrow")}</button>`;
    }).join("");
  }
  play(index: number): void {
    this.selected = index;
    this.messageUntil = 0;
    this.q("#cave-ui").hidden = true;
    this.q("#v-result").hidden = true;
    this.q("#v-result").classList.remove("unboxing", "revealed");
    this.q("#v-paused").hidden = true;
    this.q("#voyage-play").hidden = false;
    this.q("#v-pause").hidden = false;
    this.q("#v-home").hidden = false;
    this.q("#v-fire").hidden = index < 3;
    this.q("#v-tip").textContent =
      index === 0
        ? "Drag the wheel to steer. Sail toward the golden treasure!"
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
  result(s: VoyageSession): void {
    this.q("#cave-ui").hidden = true;
    this.q("#voyage-play").hidden = true;
    this.q("#v-result").hidden = false;
    this.q("#v-pause").hidden = true;
    this.q("#v-home").hidden = false;
    this.revealName = RELICS[s.voyage.index]!.name;
    this.revealStars = s.stars;
    this.q("#result-title").textContent = s.state === "won" ? "A chest full of wonder" : "Pip brought you home";
    this.q("#v-result").classList.toggle("unboxing", s.state === "won");
    this.q("#v-result").classList.remove("revealed");
    for (const button of this.q("#v-result").querySelectorAll<HTMLButtonElement>("button")) button.disabled = s.state === "won";
    this.q("#result-eyebrow").textContent =
      s.state === "won"
        ? "YOU REACHED THE TREASURE!"
        : "ANOTHER ADVENTURE AWAITS";
    this.q("#result-stars").innerHTML = s.state === "won" ? Array.from({length:3}, (_,i)=>`<span class="reward-star ${i < s.stars ? "earned" : "empty"}" style="--order:${i}">${i < s.stars ? "★" : "☆"}</span>`).join("") : "♡";
    this.q("#result-detail").textContent =
      s.state === "won"
        ? `${s.gemsFound} / 3 hidden gems · ${Math.round((100 * s.damageTaken) / s.player.spec.maxHull)}% hull damage${s.rescues ? " · Pip helped you home" : ""}`
        : "Your treasures are safe. Try sailing around the danger.";
    this.q("#result-next").hidden = s.state !== "won" || s.voyage.index === 11;
    this.q("#result-cave").textContent =
      s.state === "won" ? "Put it in my cave ✦" : "Back to my cave";
  }
  reveal(time: number, discovered: boolean, ready: boolean): void {
    if (!this.q("#v-result").classList.contains("unboxing")) return;
    if (discovered) {
      this.q("#result-title").textContent = this.revealName;
      this.q("#result-eyebrow").textContent = "A NEW TREASURE FOR YOUR CAVE";
      this.q("#v-result").classList.add("revealed");
    }
    for (const [i, star] of Array.from(this.q("#result-stars").children).entries()) star.classList.toggle("arrived", time >= 3.4 + i * 0.35);
    if (ready) {
      this.q("#v-result").classList.remove("unboxing");
      for (const button of this.q("#v-result").querySelectorAll<HTMLButtonElement>("button")) button.disabled = false;
      this.q("#result-stars").setAttribute("aria-label", `${this.revealStars} of 3 stars`);
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
      `${PACKS[s.voyage.pack]!.name.toUpperCase()} · VOYAGE ${s.voyage.index + 1}`;
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
              `<span class="pirate-tag" style="left:${p.x}px;top:${p.y}px">${icon("flag")}<i style="--hp:${(e.hull / e.spec.maxHull) * 100}%"></i></span>`,
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
