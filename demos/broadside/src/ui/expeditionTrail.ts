import { icon } from "./icons";
import "./expeditionTrail.css";
import { worldFor } from "../math/worlds";
import type { OperatorId } from "../math/academy";

export const LEVELS_PER_REGION = 12;
export const MAX_TRAIL_NODES = 72;
const INITIAL_NODES = LEVELS_PER_REGION * 3;
const EXTEND_NODES = LEVELS_PER_REGION * 2;

export interface TrailWindow { first: number; last: number; }
/** Regions change the scenery; the selected arithmetic pack never changes. */
export function regionForLevel(level: number, operator: OperatorId = "add") {
  const index = Math.floor((Math.max(1, level) - 1) / LEVELS_PER_REGION);
  const world = worldFor(operator);
  const shortName = world.chapterNames[index % world.chapterNames.length]!;
  const voyage = Math.floor(index / world.chapterNames.length) + 1;
  return { index, shortName, first: index * LEVELS_PER_REGION + 1, last: (index + 1) * LEVELS_PER_REGION,
    name: `${shortName}${voyage > 1 ? ` · Far seas ${voyage}` : ""}` };
}

export function initialTrailWindow(current: number): TrailWindow {
  const region = regionForLevel(current);
  const first = Math.max(1, region.first - LEVELS_PER_REGION);
  return { first, last: first + INITIAL_NODES - 1 };
}

/** A moving window keeps even million-level expeditions small on a phone. */
export function extendTrailWindow(window: TrailWindow, direction: "earlier" | "further"): TrailWindow {
  if (direction === "earlier") {
    const first = Math.max(1, window.first - EXTEND_NODES);
    return { first, last: Math.min(window.last, first + MAX_TRAIL_NODES - 1) };
  }
  const last = window.last + EXTEND_NODES;
  return { first: Math.max(window.first, last - MAX_TRAIL_NODES + 1), last };
}

const lockIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`;
const format = (n: number) => n.toLocaleString("en-GB");
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const NODE_X = [50, 40, 31, 37, 57, 69, 62, 44, 31, 37, 59, 50];
const FIRST_NODE_Y = 196;
const NODE_STEP = 108;
export const TRAIL_WORLD_WIDTH = 1000;
export const REGION_HEIGHT = 1500;
const nodeY = (i: number) => FIRST_NODE_Y + i * NODE_STEP;
const segment = (x1: number, y1: number, x2: number, y2: number) => `M${x1 * 4} ${y1} C${x1 * 4} ${(y1 + y2) / 2},${x2 * 4} ${(y1 + y2) / 2},${x2 * 4} ${y2}`;

export function trailLevelPoint(level: number, window: TrailWindow) {
  const relative = level - window.first;
  return { x: NODE_X[relative % LEVELS_PER_REGION]! / 100 * TRAIL_WORLD_WIDTH, y: Math.floor(relative / LEVELS_PER_REGION) * REGION_HEIGHT + nodeY(relative % LEVELS_PER_REGION) };
}

interface ExpeditionOptions {
  operator: OperatorId;
  packName: string;
  operatorName: string;
  packLabel: string;
  practiceRule: string;
  baseUrl: string;
  window: TrailWindow;
  track: { cleared: number; stars: Record<string, number>; runs: Record<string, { solved: number }> };
}

/** An unbroken, explorable island trail, with the same data-level actions as the questions. */
export function expeditionTrail(options: ExpeditionOptions): string {
  const { track, window, baseUrl } = options, current = track.cleared + 1;
  const world = worldFor(options.operator), focus = trailLevelPoint(current, window);
  const currentRegion = regionForLevel(current, options.operator), regions: string[] = [];
  for (let first = window.first; first <= window.last; first += LEVELS_PER_REGION) {
    const region = regionForLevel(first, options.operator), uncharted = region.first > current;
    const paths = [segment(50, 0, NODE_X[0]!, nodeY(0))];
    for (let i = 1; i < LEVELS_PER_REGION; i++) paths.push(segment(NODE_X[i - 1]!, nodeY(i - 1), NODE_X[i]!, nodeY(i)));
    paths.push(segment(NODE_X.at(-1)!, nodeY(LEVELS_PER_REGION - 1), 50, REGION_HEIGHT));
    const nodes = Array.from({ length: LEVELS_PER_REGION }, (_, i) => {
      const level = first + i, locked = level > current, score = track.stars[level] ?? 0, solved = track.runs[level]?.solved ?? 0;
      return `<div class="expedition-stop${level === current ? " is-current" : locked ? " is-locked" : " is-cleared"}" style="left:${NODE_X[i]}%;top:${nodeY(i)}px">
        ${level === current ? `<span class="expedition-here">YOUR NEXT ISLAND</span>` : ""}
        <button class="expedition-node" data-level="${level}" ${locked ? "disabled" : ""}${level === current ? ` aria-current="step" id="expedition-current"` : ""} aria-label="Level ${format(level)}, ${locked ? "locked" : solved ? `resume, ${solved} of 10 solved` : score ? `${score} stars, replay` : "start"}"><span style="font-size:${Math.max(10, Math.min(25, 100 / String(level).length))}px">${level}</span>${locked ? `<small class="expedition-node-lock">${lockIcon}</small>` : ""}</button>
        ${solved ? `<span class="expedition-solved">${solved}/10 solved</span>` : !locked ? `<span class="expedition-node-stars" aria-label="${score} stars">${[1, 2, 3].map(n => `<i class="${n <= score ? "earned" : ""}">★</i>`).join("")}</span>` : ""}
      </div>`;
    }).join("");
    regions.push(`<section class="expedition-region${uncharted ? " is-uncharted" : ""}" data-region="${region.index}" aria-label="Chapter ${format(region.index + 1)}: ${escape(region.name)}" style="--region-reflection:${region.index % 2 ? -1 : 1};height:${REGION_HEIGHT}px">
      <div class="expedition-world-art" aria-hidden="true"></div>
      <div class="expedition-region-title"><span>${`CHAPTER ${format(region.index + 1)}`}${uncharted ? " · UNCHARTED" : ""}</span><h2>${escape(region.shortName)}</h2><small>Islands ${format(region.first)}–${format(region.last)}${uncharted ? ` · Reach level ${format(region.first)} to discover` : ""}</small></div>
      <span class="expedition-sea-mark sea-mark-one" aria-hidden="true">✦</span><span class="expedition-sea-mark sea-mark-two" aria-hidden="true">≈</span>
      <svg class="expedition-route" viewBox="0 0 400 ${REGION_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">${paths.map((d, i) => `<path class="route-shadow" d="${d}"/><path class="route-line${first + i <= current ? " is-travelled" : ""}" d="${d}"/>`).join("")}</svg>${nodes}
    </section>`);
  }
  const height = (window.last - window.first + 1) / LEVELS_PER_REGION * REGION_HEIGHT;
  return `<section class="expedition-view" data-operation="${options.operator}" style="--shore-sea:${world.ocean};--shore-coast:${world.accent};--shore-glow:${world.accent};--operation-world:url('${baseUrl}${world.image}')">
    <div class="expedition-map-viewport" data-map-viewport data-focus-x="${focus.x}" data-focus-y="${focus.y}" tabindex="0" role="group" aria-label="${escape(world.name)} level map" aria-describedby="expedition-map-help">
      <div class="expedition-map" data-map-world style="width:${TRAIL_WORLD_WIDTH}px;height:${height + 140}px" aria-label="Endless level trail">
        ${window.first > 1 ? `<button class="expedition-more earlier" style="top:-80px" data-action="trail-earlier">↑ Earlier shores<small>Islands before ${format(window.first)}</small></button>` : ""}
        ${regions.join("")}
        <button class="expedition-more further" style="top:${height + 20}px" data-action="trail-further">Explore further ${icon("compass")}<small>More islands lie ahead.</small></button>
      </div>
      <div class="expedition-intro" data-map-control><span class="eyebrow">${escape(options.operatorName)} · ${escape(options.packLabel)}</span><h1>${escape(world.name)}</h1><p>${escape(options.practiceRule)}</p></div>
      <div class="expedition-map-tools" data-map-control><button data-map-center aria-label="Find my current island" title="Find my current island">${icon("compass")}</button><button data-map-zoom="in" aria-label="Zoom in">+</button><button data-map-zoom="out" aria-label="Zoom out">−</button></div>
      <p class="expedition-drag-hint" data-map-control>Drag to explore · Pinch to zoom</p>
      <span class="map-keyboard-help" id="expedition-map-help">Drag the map in any direction. Use arrow keys to pan, plus and minus to zoom, Home to find the current island, and Tab then Enter to choose a level.</span>
      <div class="expedition-dock" data-map-control><div><small>${escape(options.packLabel)} · 100 gold per first try</small><button class="wood-button primary" data-level="${current}">${track.runs[current]?.solved ? "Continue" : "Play"} level ${format(current)} ${icon("ship")}</button></div></div>
    </div>
  </section>`;
}
