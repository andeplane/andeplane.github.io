import type { GeneratedIsland } from "../src/game/landfall";
import { LandfallTreasureMap } from "../src/ui/landfallTreasureMap";
import { icon } from "../src/ui/icons";
import "./huntChart.css";

interface ChartPosition { x: number; z: number; yaw: number }

export class HuntChart {
  private readonly dialog = document.createElement("dialog");
  private map?: LandfallTreasureMap;
  private opener?: HTMLElement;

  constructor(walk: () => void) {
    const d = this.dialog;
    d.className = "hunt-chart";
    d.setAttribute("aria-labelledby", "hunt-chart-title");
    d.innerHTML = `
      <header><div><small></small><h2 id="hunt-chart-title"></h2></div>
      <button type="button" class="hunt-chart-close" aria-label="Close treasure map" autofocus>×</button></header>
      <div class="hunt-chart-body"><div class="hunt-chart-art"></div>
      <section class="hunt-chart-notes"><h3>Treasure map</h3><p class="hunt-chart-clue"></p>
      <ul><li>${icon("anchor")} Landing</li><li><b class="hunt-target" aria-hidden="true">×</b><span>Buried treasure</span></li>
      <li class="hunt-you"><b aria-hidden="true">➤</b> You</li></ul>
      <button class="hunt-chart-walk" type="button">Go ashore ${icon("arrow")}</button></section></div>`;
    document.body.append(d);
    d.querySelector<HTMLButtonElement>(".hunt-chart-close")!.onclick = () => this.close();
    d.querySelector<HTMLButtonElement>(".hunt-chart-walk")!.onclick = () => { this.close(); walk(); };
    d.oncancel = event => { event.preventDefault(); this.close(); };
    d.onkeydown = event => {
      event.stopPropagation();
      if (event.code === "KeyM" && !event.repeat) { event.preventDefault(); this.close(); }
    };
    d.onclick = event => {
      if (event.target !== d) return;
      const r = d.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.close();
    };
  }

  get open(): boolean { return this.dialog.open; }

  reset(): void { this.map = undefined; }

  show(island: GeneratedIsland, world: number, seed: number, player: ChartPosition | null, found: boolean): void {
    if (this.open) return;
    const d = this.dialog;
    if (!this.map) {
      this.map = new LandfallTreasureMap(island, world, seed);
      d.querySelector(".hunt-chart-art")!.replaceChildren(this.map.el);
    }
    this.map.locate(player, found);
    d.querySelector("small")!.textContent = `Island Atlas · Seed ${seed}`;
    d.querySelector("h2")!.textContent = island.site.name;
    d.querySelector(".hunt-chart-clue")!.textContent = found ? `Recovered: ${island.site.treasure}.` : island.site.clue;
    d.querySelector(".hunt-target")!.textContent = found ? "✓" : "×";
    d.querySelector(".hunt-target + span")!.textContent = found ? "Treasure found" : "Buried treasure";
    d.querySelector<HTMLElement>(".hunt-you")!.hidden = !player;
    d.querySelector<HTMLButtonElement>(".hunt-chart-walk")!.hidden = !!player;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    d.showModal();
    d.querySelector<HTMLButtonElement>(".hunt-chart-close")!.focus({ preventScroll: true });
  }

  private close(): void {
    this.dialog.close();
    this.opener?.focus({ preventScroll: true });
  }
}
