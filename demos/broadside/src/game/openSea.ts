import { OPEN_SEA_SEED, OPEN_SEA_BOUNDS, generateFreeSea } from "./freeSailing";
import { seaDistance, wrapAngle, clamp, type Vec2 } from "../sim/math";
import type { VoyageSession } from "./voyage";

export interface OpenSeaSave {
  version: 1;
  seed: number;
  position: Vec2;
  heading: number;
  yaw: number;
  pitch: number;
  gems: number[];
}
const KEY = "broadside.open-sea.v1";
export const newOpenSea = (seed = OPEN_SEA_SEED): OpenSeaSave => ({
  version: 1, seed: seed >>> 0, position: { x: 0, z: 0 }, heading: 0, yaw: 0, pitch: .03, gems: [],
});

/** A separate save keeps free exploration independent of campaign rewards. */
export function readOpenSea(storage?: Pick<Storage, "getItem">): OpenSeaSave {
  try {
    const p = JSON.parse(storage?.getItem(KEY) ?? "null") as Partial<OpenSeaSave> | null;
    if (p?.version !== 1 || !Number.isInteger(p.seed) || p.seed! < 0 || p.seed! > 0xffffffff)
      return newOpenSea();
    const result = newOpenSea(p.seed);
    if (p.position && Number.isFinite(p.position.x) && Number.isFinite(p.position.z) &&
        Math.max(Math.abs(p.position.x), Math.abs(p.position.z)) < OPEN_SEA_BOUNDS)
      result.position = { x: p.position.x, z: p.position.z };
    if (Number.isFinite(p.heading)) result.heading = wrapAngle(p.heading!);
    if (Number.isFinite(p.yaw)) result.yaw = wrapAngle(p.yaw!);
    if (Number.isFinite(p.pitch)) result.pitch = clamp(p.pitch!, -1.1, 1.1);
    if (Array.isArray(p.gems)) result.gems = [...new Set(p.gems.filter(g => Number.isInteger(g) && g >= 0 && g < 1000))];
    return result;
  } catch { return newOpenSea(); }
}

export function saveOpenSea(save: OpenSeaSave, storage?: Pick<Storage, "setItem">): void {
  try { storage?.setItem(KEY, JSON.stringify(save)); } catch { /* Private browsing still has an in-memory world. */ }
}

export function openSeaVoyage(save: OpenSeaSave, pack = 0) {
  const voyage = generateFreeSea(save.seed, pack);
  // A damaged/corrupt location must never resume within an island or reef.
  if (voyage.level.islands.every(i => seaDistance(save.position, i.pos, OPEN_SEA_BOUNDS) > i.radius + 22)) {
    voyage.level.player.pos = { ...save.position };
    voyage.level.player.heading = save.heading;
  }
  voyage.gems.forEach((g, i) => { g.found = save.gems.includes(i); });
  return voyage;
}

export function recordOpenSea(save: OpenSeaSave, session: VoyageSession, yaw: number, pitch: number): void {
  if (!session.voyage.freeSailing) return;
  save.gems = session.voyage.gems.flatMap((g, i) => g.found ? [i] : []);
  if (session.state === "lost") {
    save.position = { x: 0, z: 0 }; save.heading = save.yaw = 0; save.pitch = .03;
  } else if (session.level.islands.every(i => seaDistance(session.player.pos, i.pos, OPEN_SEA_BOUNDS) > i.radius + 22)) {
    save.position = { ...session.player.pos }; save.heading = session.player.heading;
    save.yaw = yaw; save.pitch = pitch;
  }
}
