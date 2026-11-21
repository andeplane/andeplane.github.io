import { chartCenterButton, chartShip } from "./adventureChart";
import { islandArt } from "./islandChart";
import "./difficultyMap.css";

interface PackIsland {
  id: string | number;
  label: string;
  description?: string;
  progress?: string;
  ariaLabel: string;
}
interface DifficultyMapOptions {
  name: string;
  accessibleName: string;
  instructions: string;
  stops: readonly PackIsland[];
  selected: string | number;
  centerLabel: string;
  firstArt: number;
  back?: string;
  island?: (index: number) => string;
  backdrop?: string;
}
const escape = (s: string) => s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export function difficultyMap(options: DifficultyMapOptions): string {
  const height = 360 + options.stops.length * 155;
  const stops = options.stops.map((stop,i) => ({
    ...stop, x: 480 + (i % 2 ? 52 : -52), y: height - 215 - i * 155,
  }));
  const focus = stops.find(p => p.id === options.selected) ?? stops[0]!;
  const points = stops.map(p => `${p.x},${p.y}`).join(" ");
  const title = `<h1>${escape(options.name)}</h1><p>${escape(options.instructions)}</p>`;
  return `<section class="map-view operation-world">
    <div class="world-map-heading">${options.back ? `${options.back}<div>${title}</div>` : title}</div>
    <div class="world-map-viewport" data-map-viewport data-focus-x="${focus.x}" data-focus-y="${focus.y}" tabindex="0" aria-label="${escape(options.accessibleName)}">
      <div class="world-map-plane chart-water" data-map-world style="width:960px;height:${height}px;${options.backdrop ? `background: url(${options.backdrop}) center / 100% 100%` : ""}">
        <svg class="world-pack-route" viewBox="0 0 960 ${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="#685438" stroke-width="3" stroke-dasharray="5 8"/></svg>
        ${stops.map((p,i) => `<button class="world-pack-stop" data-pack="${escape(String(p.id))}" style="left:${p.x}px;top:${p.y}px" aria-label="${escape([p.ariaLabel, p.progress].filter(Boolean).join(", "))}">${options.island?.(i) ?? islandArt(i + options.firstArt)}${p.id===focus.id?chartShip("moored-pack"):""}<span class="world-pack-label"><b>${escape(p.label)}</b>${p.description ? `<small>${escape(p.description)}</small>` : ""}${p.progress ? `<small class="chart-tally">${escape(p.progress)}</small>` : ""}</span></button>`).join("")}
      </div>
      <div class="world-map-tools" data-map-control>${chartCenterButton(options.centerLabel)}</div>
    </div></section>`;
}
