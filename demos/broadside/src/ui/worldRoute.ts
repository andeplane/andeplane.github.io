import { menuText } from "./homeMenu";
import type { MapPoint } from "./mapPan";
import "./worldRoute.css";

export function worldRoutePoints(count: number, width: number, height: number): MapPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    x: width / 2 + (index % 2 ? 52 : -52),
    y: height - 215 - index * 155,
  }));
}

export function worldRouteLine(points: readonly MapPoint[], width: number, height: number, className: string): string {
  return `<svg class="${className} world-route-line" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points.map(({x, y}) => `${x},${y}`).join(" ")}"/></svg>`;
}

interface WorldRouteStop extends MapPoint {
  key: "pack" | "level";
  id: string | number;
  art: string;
  marker?: string;
  title: string;
  detail?: string;
  progress?: string;
  accessible: string;
  current?: boolean;
  disabled?: boolean;
}

export function worldRouteStop(stop: WorldRouteStop): string {
  return `<button type="button" class="world-route-stop${stop.current ? " is-current" : ""}" data-${stop.key}="${menuText(String(stop.id))}" style="left:${stop.x}px;top:${stop.y}px" aria-label="${menuText(stop.accessible)}"${stop.current ? ' aria-current="step"' : ""}${stop.disabled ? " disabled" : ""}>
    ${stop.art}${stop.marker ?? ""}<span class="world-route-caption"><b>${menuText(stop.title)}</b>${stop.detail ? `<small>${menuText(stop.detail)}</small>` : ""}${stop.progress ? `<small class="chart-tally">${menuText(stop.progress)}</small>` : ""}</span>
  </button>`;
}
