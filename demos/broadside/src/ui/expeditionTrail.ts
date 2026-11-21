import { chartCenterButton } from "./adventureChart";
import { shoreMarker } from "./islandChart";
import { backButton } from "./menuChrome";
import { icon } from "./icons";
import "./expeditionTrail.css";

export const LEVELS_PER_REGION = 12;
export const MAX_TRAIL_NODES = 72;
const INITIAL_NODES = LEVELS_PER_REGION * 3;
const EXTEND_NODES = LEVELS_PER_REGION * 2;

export interface TrailWindow { first: number; last: number; }
export interface TrailWorld {name:string;image:string;accent:string;ocean:string;chapterNames:readonly string[];}
/** Regions change the scenery; the selected arithmetic pack never changes. */
export function regionForLevel(level: number, world: TrailWorld) {
  const index = Math.floor((Math.max(1, level) - 1) / LEVELS_PER_REGION);
  const shortName = world.chapterNames[index % world.chapterNames.length]!;
  const voyage = Math.floor(index / world.chapterNames.length) + 1;
  return { index, shortName, first: index * LEVELS_PER_REGION + 1, last: (index + 1) * LEVELS_PER_REGION,
    name: `${shortName}${voyage > 1 ? ` · ${voyage}` : ""}` };
}

export function initialTrailWindow(current: number): TrailWindow {
  const regionStart = 1 + Math.floor((Math.max(1, current) - 1) / LEVELS_PER_REGION) * LEVELS_PER_REGION;
  const first = Math.max(1, regionStart - LEVELS_PER_REGION);
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
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const DEFAULT_COURSES = [[50, 43, 39, 46, 55, 61, 57, 48, 40, 44, 56, 50]];
const FIRST_NODE_Y = 88;
const NODE_STEP = 108;
export const TRAIL_WORLD_WIDTH = 1000;
export const REGION_HEIGHT = NODE_STEP * LEVELS_PER_REGION;
const nodeY = (i: number) => FIRST_NODE_Y + i * NODE_STEP;
const segment = (x1: number, y1: number, x2: number, y2: number) => `M${x1 * 4} ${y1} C${x1 * 4} ${(y1 + y2) / 2},${x2 * 4} ${(y1 + y2) / 2},${x2 * 4} ${y2}`;

function trailLevelPoint(level: number, window: TrailWindow, courses: readonly (readonly number[])[]) {
  const relative = level - window.first;
  const region = Math.floor((level - 1) / LEVELS_PER_REGION);
  const stop = relative % LEVELS_PER_REGION;
  const course = courses[region % courses.length]!;
  return { x: course[stop]! / 100 * TRAIL_WORLD_WIDTH, y: Math.floor(relative / LEVELS_PER_REGION) * REGION_HEIGHT + nodeY(stop) };
}

type TrailKey = "back" | "chapter" | "continue" | "dragExplore" | "earlierShores" | "endlessTrail" | "exploreFurther" | "findIsland" | "firstTryGold" | "islandRange" | "islandsAhead" | "islandsBefore" | "level" | "locked" | "mapKeyboard" | "nextIslandMarker" | "play" | "playLevel" | "reachLevel" | "replay" | "resumeCount" | "solvedCount" | "stars" | "start" | "uncharted" | "worldLevelMap" | "zoomIn" | "zoomOut";
interface ExpeditionOptions {
  text: (key: TrailKey, values?: Record<string, string | number>) => string;
  format?: (value: number) => string;
  world: TrailWorld;
  showStars: boolean;
  resumeLabel: (count: number) => string;
  progressLabel: (count: number) => string;
  goldRule?: string;
  operatorName: string;
  packLabel: string;
  backLabel?: string;
  courses?: readonly (readonly number[])[];
  practiceRule: string;
  window: TrailWindow;
  track: { cleared: number; stars: Record<string, number>; runs: Record<string, { solved: number }> };
}

/** An unbroken, explorable island trail, with the same data-level actions as the questions. */
export function expeditionTrail(options: ExpeditionOptions): string {
  const format = options.format ?? ((value: number) => value.toLocaleString("en-GB"));
  const { text, world, track, window } = options, current = track.cleared + 1;
  const courses = options.courses ?? DEFAULT_COURSES;
  const focus = trailLevelPoint(current, window, courses);
  const regions: string[] = [];
  for (let first = window.first; first <= window.last; first += LEVELS_PER_REGION) {
    const region = regionForLevel(first, world), uncharted = region.first > current;
    const band = region.index % courses.length;
    const stopX = courses[band]!;
    const paths = [segment(50, 0, stopX[0]!, nodeY(0))];
    for (let i = 1; i < LEVELS_PER_REGION; i++) paths.push(segment(stopX[i - 1]!, nodeY(i - 1), stopX[i]!, nodeY(i)));
    paths.push(segment(stopX.at(-1)!, nodeY(LEVELS_PER_REGION - 1), 50, REGION_HEIGHT));
    const nodes = Array.from({ length: LEVELS_PER_REGION }, (_, i) => {
      const level = first + i, locked = level > current, score = track.stars[level] ?? 0, solved = track.runs[level]?.solved ?? 0;
      return `<div class="expedition-stop${level === current ? " is-current" : locked ? " is-locked" : " is-cleared"}" style="left:${stopX[i]}%;top:${nodeY(i)}px">
        ${level === current ? `<span class="expedition-here">${text("nextIslandMarker")}</span>` : ""}
        <button class="expedition-node" data-level="${level}" ${locked ? "disabled" : ""}${level === current ? ` aria-current="step" id="expedition-current"` : ""} aria-label="${text("level", { count: format(level) })}, ${locked ? text("locked") : solved ? options.resumeLabel(solved) : score ? `${text("stars", { count: score })}, ${text("replay")}` : text("start")}">${shoreMarker(level - 1, format(level), "shore-number")}${locked ? `<small class="expedition-node-lock">${lockIcon}</small>` : ""}</button>
        ${solved ? `<span class="expedition-solved">${options.progressLabel(solved)}</span>` : !locked && options.showStars ? `<span class="expedition-node-stars" aria-label="${text("stars", { count: score })}">${[1, 2, 3].map(n => `<i class="${n <= score ? "earned" : ""}">★</i>`).join("")}</span>` : ""}
      </div>`;
    }).join("");
    regions.push(`<section class="expedition-region${uncharted ? " is-uncharted" : ""}" data-region="${region.index}" data-atlas-band="${band}" aria-label="${text("chapter", { count: format(region.index + 1) })}: ${escape(region.name)}" style="--region-reflection:${region.index % 2 ? -1 : 1};height:${REGION_HEIGHT}px">

      ${first > 1 ? `<span class="trail-chapter" style="top:${nodeY(0)}px">${escape(region.name)}</span>` : ""}
      <span class="expedition-sea-mark sea-mark-one" aria-hidden="true">✦</span><span class="expedition-sea-mark sea-mark-two" aria-hidden="true">≈</span>
      <svg class="expedition-route" viewBox="0 0 400 ${REGION_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">${paths.map((d, i) => first === 1 && i === 0 ? "" : `<path class="route-shadow" d="${d}"/><path class="route-line${first + i <= current ? " is-travelled" : ""}" d="${d}"/>`).join("")}</svg>${nodes}
    </section>`);
  }
  const height = (window.last - window.first + 1) / LEVELS_PER_REGION * REGION_HEIGHT;
  return `<section class="expedition-view" style="--shore-sea:${world.ocean};--shore-coast:${world.accent};--shore-glow:${world.accent}">
      <header class="trail-heading">${backButton({ action: "back", label: text("back"), accessibleLabel: options.backLabel })}<h1>${escape(world.name)}${world.name === options.packLabel ? "" : `<small>${escape(options.packLabel)}</small>`}</h1></header>
    <div class="expedition-map-viewport" data-map-viewport data-focus-x="${focus.x}" data-focus-y="${focus.y}" tabindex="0" role="group" aria-label="${escape(text("worldLevelMap", { world: world.name }))}" aria-describedby="expedition-map-help">
      <div class="expedition-map" data-map-world style="width:${TRAIL_WORLD_WIDTH}px;height:${height + 140}px" aria-label="${text("endlessTrail")}">
        ${window.first > 1 ? `<button class="expedition-more earlier" style="top:4px" data-action="trail-earlier">↑ ${text("earlierShores")}<small>${text("islandsBefore", { count: format(window.first) })}</small></button>` : ""}
        ${regions.join("")}
        <button class="expedition-more further" style="top:${height + 20}px" data-action="trail-further">${text("exploreFurther")} ${icon("compass")}<small>${text("islandsAhead")}</small></button>
      </div>

      <div class="expedition-map-tools" data-map-control>${chartCenterButton(text("findIsland"))}<button data-map-zoom="in" aria-label="${text("zoomIn")}">+</button><button data-map-zoom="out" aria-label="${text("zoomOut")}">−</button></div>
      <p class="expedition-drag-hint" data-map-control>${text("dragExplore")}</p>
      <span class="map-keyboard-help" id="expedition-map-help">${text("mapKeyboard")} ${escape(options.practiceRule)}</span>

    </div>
  </section>`;
}
