import { chartCenterButton, chartShip } from "./adventureChart";
import { chartHeader } from "./menuChrome";
import { islandArt } from "./islandChart";
import { worldRouteLine, worldRoutePoints, worldRouteStop } from "./worldRoute";
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
  actions?: string;
  island?: (index: number) => string;
  backdrop?: string;
}
const escape = (s: string) => s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export function difficultyMap(options: DifficultyMapOptions): string {
  const width = 960, height = 360 + options.stops.length * 155;
  const points = worldRoutePoints(options.stops.length, width, height);
  const stops = options.stops.map((stop, index) => ({ ...stop, ...points[index]! }));
  const focus = stops.find(p => p.id === options.selected) ?? stops[0]!;
  const title = `<h1>${escape(options.name)}</h1><p>${escape(options.instructions)}</p>`;
  return `<section class="map-view operation-world">
    ${options.back ? chartHeader({ back: options.back, heading: title, actions: options.actions }) : `<div class="world-map-heading">${title}</div>`}
    <div class="world-map-viewport" data-map-viewport data-focus-x="${width / 2}" data-focus-y="${focus.y}" tabindex="0" aria-label="${escape(options.accessibleName)}">
      <div class="world-map-plane chart-water" data-map-world style="width:${width}px;height:${height}px;${options.backdrop ? `background: url(${options.backdrop}) center / 100% 100%` : ""}">
        ${worldRouteLine(points, width, height, "world-pack-route")}
        ${stops.map((stop, index) => worldRouteStop({
          ...stop, key: "pack", title: stop.label, detail: stop.description,
          art: options.island?.(index) ?? islandArt(index + options.firstArt),
          marker: stop.id === focus.id ? chartShip("moored-pack") : undefined,
          accessible: [stop.ariaLabel, stop.progress].filter(Boolean).join(", "),
        })).join("")}
      </div>
      <div class="world-map-tools" data-map-control>${chartCenterButton(options.centerLabel)}</div>
    </div></section>`;
}
