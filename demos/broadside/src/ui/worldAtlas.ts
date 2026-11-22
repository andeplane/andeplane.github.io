import { chartCenterButton, chartShip } from "../ui/adventureChart";
import type { OperatorId } from "../math/academy";
import type { CommonLocale } from "../i18n/locale";
import { worldFor } from "../math/worlds";
import type { ShipArtStyle } from "./worldArt";
import { icon } from "../ui/icons";
import { chartHeader } from "./menuChrome";
import { regionForLevel } from "../ui/expeditionTrail";
import type { MapCamera, MapPoint } from "../ui/mapPan";

const TILE = 512;
const STEP = 115;
const phases: Record<OperatorId, number> = { add: 0, subtract: 2, multiply: 4, divide: 5 };
export const worldAsset = (id: OperatorId, suffix = "") => `${import.meta.env.BASE_URL}assets/map/worlds/${id}${suffix}.webp`;
export const worldIsland = (id: OperatorId, n: number) => `<img class="world-art chart-island-art" src="${worldAsset(id, "-" + n % 4)}" alt="" draggable="false">`;

export function levelPoint(id: OperatorId, level: number): MapPoint {
  const n = level - 1, phase = phases[id];
  return { x: Math.round(n * 24 + 310 * Math.sin(n * .37 + phase) + 180 * Math.sin(n * .16 + phase)), y: -n * STEP };
}

type Locale = Pick<CommonLocale, "t" | "format">;
export function atlasView(id: OperatorId, pack: string, back: string, current: number, locale: Locale, options: { title?: string; actions?: string } = {}) {
  const { t } = locale, focus = levelPoint(id, current);
  const { title = worldFor(id).name, actions } = options;
  return `<section class="expedition-view voyage-atlas">
    ${chartHeader({back, heading: `<h1>${title}<small>${pack}</small></h1>`, actions})}
    <div class="expedition-map-viewport" data-map-viewport tabindex="0" role="group" aria-label="${t("worldLevelMap", {world:title})}" aria-describedby="expedition-map-help" data-focus-x="${focus.x}" data-focus-y="${focus.y}">
      <div class="atlas-plane" data-map-world style="--water:url(${worldAsset(id, "-water")})"></div>
      <div class="expedition-map-tools" data-map-control>${chartCenterButton(t("findIsland"))}<button data-map-zoom="in" aria-label="${t("zoomIn")}">+</button><button data-map-zoom="out" aria-label="${t("zoomOut")}">−</button></div>
      <span class="map-keyboard-help" id="expedition-map-help">${t("mapKeyboard")}</span>
    </div></section>`;
}

function noise(x: number, y: number, salt: number) {
  let n = Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801) ^ Math.imul(salt, 2654435761);
  n = Math.imul(n ^ n >>> 16, 2246822507);
  return ((n ^ n >>> 13) >>> 0) / 4294967296;
}

// Closest distance to the shipping lane. Include the whole painted island and tap target.
function clearOfCourse(id: OperatorId, x: number, y: number, radius: number) {
  const near = Math.floor(-y / STEP) + 1;
  for (let offset = -3; offset <= 3; offset++) {
    const n = near + offset;
    if (n < 1 || !Number.isSafeInteger(n)) continue;
    const a = levelPoint(id, n), b = levelPoint(id, n + 1), dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x-a.x)*dx + (y-a.y)*dy) / (dx*dx + dy*dy)));
    if (Math.hypot(x-a.x-t*dx, y-a.y-t*dy) < radius + 72) return false;
  }
  return true;
}

interface AtlasOptions {
  terrainOnly?:boolean;
  shipStyle?: ShipArtStyle;
  caption?:(level:number, solved:number)=>string;
}
interface AtlasTrack { cleared:number; stars:Record<number,number>; runs:Record<number,{solved:number}>; }
function tileContents(id: OperatorId, col: number, row: number, track: AtlasTrack, locale: Locale, options:AtlasOptions) {
  const ox = col * TILE, oy = row * TILE, { t, format } = locale;
  const parts: string[] = [];
  const start = levelPoint(id, 1);
  const harbour = { x: start.x - 42, y: start.y + 210 };
  if (Math.floor(harbour.x / TILE) === col && Math.floor(harbour.y / TILE) === row) {
    parts.push(`<span class="atlas-land" aria-hidden="true" style="left:${harbour.x-ox}px;top:${harbour.y-oy}px;width:235px"><img src="${worldAsset(id, "-coast")}" alt="" draggable="false"></span>`);
  }
  for (let i = 0; i < 4; i++) {
    const gx = 2*col + i%2, gy = 2*row + Math.floor(i/2), seed = phases[id] * 7;
    const x = (gx + .24 + noise(gx, gy, seed+1)*.52)*256;
    const y = (gy + .24 + noise(gx, gy, seed+2)*.52)*256;
    const maximum = 145 + Math.round(noise(gx, gy, seed+3)*125);
    if (Math.hypot(x-harbour.x, y-harbour.y) < maximum*.5 + 120) continue;
    const size = [maximum, maximum*.7, maximum*.46].find(width => clearOfCourse(id, x, y, width*.71));
    if (size) {
      parts.push(`<span class="atlas-land" aria-hidden="true" style="left:${x-ox}px;top:${y-oy}px;width:${size}px"><img src="${worldAsset(id, "-coast")}" alt="" draggable="false" style="transform:scaleX(${noise(gx,gy,seed+4) < .5 ? -1 : 1})"></span>`);
    }
  }
  if(options.terrainOnly)return parts.join("");
  const first = Math.max(1, Math.floor(-(oy+TILE)/STEP)+1);
  for (let index = 0; index <= Math.ceil(TILE / STEP); index++) {
    const n = first + index;
    if (!Number.isSafeInteger(n)) continue;
    const a = levelPoint(id,n), b = levelPoint(id,n+1);
    if (Math.floor(a.x/TILE) !== col || Math.floor(a.y/TILE) !== row) continue;
    const left = a.x-ox, top = a.y-oy, dx = b.x-a.x;
    parts.push(`<svg class="atlas-leg" style="left:${left}px;top:${top}px" width="1" height="1" aria-hidden="true"><path d="M0 0 L${dx} ${-STEP}"/></svg>`);
    const current = n === track.cleared+1, locked = n > track.cleared+1;
    const score = track.stars[n] ?? 0, solved = track.runs[n]?.solved ?? 0;
    const state = options.caption && !locked ? options.caption(n,solved) : locked ? t("locked") : solved ? t("resumeCount",{count:solved}) : current ? t("start") : `${t("stars", {count:score})}, ${t("replay")}`;
    const chapter = options.caption ? options.caption(n,solved) : (n-1)%12 === 0 ? regionForLevel(n,worldFor(id)).name : "";
    parts.push(`<div class="expedition-stop ${current ? "is-current" : locked ? "is-locked" : "is-cleared"}" style="left:${left}px;top:${top}px">
      ${current ? `${chartShip("moored-level", options.shipStyle)}<span class="expedition-here">${t("nextIslandMarker")}</span>` : ""}
      <button class="expedition-node" data-level="${n}" ${locked ? "disabled" : ""} ${current ? 'id="expedition-current" aria-current="step"' : ""} aria-label="${t("level",{count:format(n)})}, ${state}">
        <span class="route-island" aria-hidden="true">${worldIsland(id,n-1)}</span><span class="shore-number">${format(n)}</span>
        ${locked ? `<small class="expedition-node-lock">${icon("lock")}</small>` : ""}
      </button>
      ${chapter || solved || !locked ? `<span class="atlas-caption">${chapter}${!options.caption && chapter && (solved || !locked) ? " · " : ""}${options.caption ? "" : solved ? t("solvedCount",{count:solved}) : !locked ? "★".repeat(score) + "☆".repeat(3-score) : ""}</span>` : ""}
    </div>`);
  }
  return parts.join("");
}

export function atlasRenderer(plane: HTMLElement, id: OperatorId, track: AtlasTrack, locale: Locale, options:AtlasOptions = {}) {
  const tiles = new Map<string, HTMLElement>();
  let previousBounds = "";
  return (camera: MapCamera, origin: MapPoint, width: number, height: number) => {
    const x = -camera.x/camera.scale, y = -camera.y/camera.scale;
    const west = Math.floor(x/TILE)-1, east = Math.floor((x+width/camera.scale)/TILE)+1;
    const north = Math.floor(y/TILE)-1, south = Math.floor((y+height/camera.scale)/TILE)+1;
    const bounds = [west,east,north,south,origin.x,origin.y].join(",");
    if (bounds === previousBounds) return;
    previousBounds = bounds;
    const active = new Set<string>();
    for (let j = 0; j <= south - north; j++) for (let i = 0; i <= east - west; i++) {
      const col = west + i, row = north + j;
      const key = col + "," + row;
      active.add(key);
      let tile = tiles.get(key);
      if (!tile) {
        tile = document.createElement("div");
        tile.className = "atlas-tile";
        tile.dataset.tile = key;
        tile.innerHTML = tileContents(id,col,row,track,locale,options);
        plane.append(tile);
        tiles.set(key,tile);
      }
      tile.style.left = (col*TILE-origin.x) + "px";
      tile.style.top = (row*TILE-origin.y) + "px";
    }
    for (const [key,tile] of tiles) if (!active.has(key)) {
      if (tile.contains(document.activeElement)) plane.parentElement?.focus({preventScroll:true});
      tile.remove();
      tiles.delete(key);
    }
  };
}
