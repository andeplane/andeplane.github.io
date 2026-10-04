import { TOTAL_LEVELS, levelUnlocked, worldOf } from "./campaign";
import { SEA_LANDMARKS, OPEN_SEA_BOUNDS } from "./freeSailing";
import type { Progress } from "./progress";
import { seaDistance, type Vec2 } from "../sim/math";

export type ShipLocation = { kind: "port" | "cave" } |
  { kind: "course"; index: number } | { kind: "sea"; world: number };
const KEY = "broadside.journey.v1";
export const REGION_LANDMARKS = [0, 1, 2, 4] as const;
/** A winding ten-stop route, from the anchorage to the world treasure. */
export const LEVEL_ROUTE = [
  [20, 86], [62, 83], [81, 67], [43, 65], [18, 50],
  [59, 48], [82, 33], [43, 30], [20, 14], [65, 12],
] as const;
export function locationWorld(location: ShipLocation): number {
  return location.kind === "course" ? worldOf(location.index) : location.kind === "sea" ? location.world : 0;
}
function valid(value: unknown): value is ShipLocation {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return p.kind === "port" || p.kind === "cave" ||
    (p.kind === "course" && Number.isInteger(p.index) && Number(p.index) >= 0 && Number(p.index) < TOTAL_LEVELS) ||
    (p.kind === "sea" && Number.isInteger(p.world) && Number(p.world) >= 0 && Number(p.world) < 4);
}
function copy(location: ShipLocation): ShipLocation {
  return location.kind === "course" ? { kind: "course", index: location.index } :
    location.kind === "sea" ? { kind: "sea", world: location.world } : { kind: location.kind };
}
export function readJourney(storage?: Pick<Storage, "getItem">): ShipLocation {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (raw?.version === 1 && valid(raw.location)) return copy(raw.location);
  } catch { /* No persistent storage is needed to play. */ }
  return { kind: "port" };
}
export function saveJourney(location: ShipLocation, storage?: Pick<Storage, "setItem">): void {
  try { storage?.setItem(KEY, JSON.stringify({ version: 1, location: copy(location) })); }
  catch { /* Private browsing keeps the current location in memory. */ }
}
export function nearestRegion(position: Vec2): number {
  return REGION_LANDMARKS.reduce<number>((best, landmark, world) =>
    seaDistance(position, SEA_LANDMARKS[landmark], OPEN_SEA_BOUNDS) <
    seaDistance(position, SEA_LANDMARKS[REGION_LANDMARKS[best]!], OPEN_SEA_BOUNDS) ? world : best, 0);
}
/** Arrival commits the destination; cancelling a trip leaves the ship where it was. */
export class WorldJourney {
  location: ShipLocation;
  trip: { from: ShipLocation; to: ShipLocation; time: number; duration: number } | null = null;
  constructor(location: ShipLocation) { this.location = copy(location); }
  depart(to: ShipLocation, voyages: Progress["voyages"], reducedMotion = false): boolean {
    if (this.trip || !valid(to) || (to.kind === "course" && !levelUnlocked(voyages, to.index))) return false;
    this.trip = { from: copy(this.location), to: copy(to), time: 0, duration: reducedMotion ? .12 : 1.15 };
    return true;
  }
  get fraction(): number { return this.trip ? Math.min(1, this.trip.time / this.trip.duration) : 1; }
  step(dt: number): ShipLocation | null {
    if (!this.trip) return null;
    if (Number.isFinite(dt)) this.trip.time += Math.max(0, dt);
    if (this.fraction < 1) return null;
    this.location = copy(this.trip.to); this.trip = null;
    return copy(this.location);
  }
  cancel(): void { this.trip = null; }
}
