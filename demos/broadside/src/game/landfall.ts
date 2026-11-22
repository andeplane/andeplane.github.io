import { Rng } from "../sim/rng";
import { coastField, planGrotto, type TidalGrotto } from "./landfallCoast";
import { simplexField } from "./landfallNoise";
import {
  planTown,
  townGrade,
  townReserved,
  type TownPlan,
} from "./landfallTown";

export interface IslandSettings {
  biome: "tropical" | "temperate" | "alpine" | "winter";
  relief: number;
  beach: number;
  vegetation: number;
  settlement: "none" | "hamlet" | "village";
}

export const DEFAULT_SETTINGS: IslandSettings = {
  biome: "tropical",
  relief: 0.48,
  beach: 0.6,
  vegetation: 0.72,
  settlement: "hamlet",
};
export const ISLAND_PACKS = [
  "First sails",
  "Pirate waters",
  "Whirlpool straits",
  "The glowing deep",
] as const;
export const ISLAND_DESTINATIONS = [
  {
    name: "Rose Beacon Cay",
    clue: "Pass the lighthouse and look for pink shells.",
    treasure: "The rose diamond",
  },
  {
    name: "Crown Corsair Cove",
    clue: "Beyond the watchtower, find the torn red pennant.",
    treasure: "The captain’s crown",
  },
  {
    name: "Tideglass Atoll",
    clue: "Beyond the stone arch, seek a spiral of blue stones.",
    treasure: "The tides of time",
  },
  {
    name: "Starfall Sanctuary",
    clue: "Follow the crystal spires to a ring of violet lights.",
    treasure: "The heart of the ocean",
  },
] as const;
type Point = { x: number; z: number };
export interface LandfallSite {
  name: string;
  clue: string;
  treasure: string;
  spawn: Point;
  landmark: Point;
  dig: Point;
  settings: IslandSettings;
  town: TownPlan;
  grotto: TidalGrotto;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
function smooth(lo: number, hi: number, x: number): number {
  const t = clamp((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}

export function normalizeIslandSettings(
  options: Partial<IslandSettings> = {},
): IslandSettings {
  const number = (v: number | undefined, fallback: number) =>
    Number.isFinite(v) ? clamp(v!) : fallback;
  return {
    biome:
      (["tropical", "temperate", "alpine", "winter"] as const).find(
        (b) => b === options.biome,
      ) ?? DEFAULT_SETTINGS.biome,
    settlement:
      (["none", "hamlet", "village"] as const).find(
        (b) => b === options.settlement,
      ) ?? DEFAULT_SETTINGS.settlement,
    relief: number(options.relief, DEFAULT_SETTINGS.relief),
    beach: number(options.beach, DEFAULT_SETTINGS.beach),
    vegetation: number(options.vegetation, DEFAULT_SETTINGS.vegetation),
  };
}

// A bounded cache lets scatter algorithms sample independent fields without
// rebuilding a permutation table per blade of grass.
const fields = new Map<number, ReturnType<typeof simplexField>>();
export function landfallNoise(seed: number, x: number, z: number): number {
  const key = seed >>> 0;
  let field = fields.get(key);
  if (!field) {
    if (fields.size >= 64) fields.delete(fields.keys().next().value!);
    fields.set(key, (field = simplexField(key)));
  }
  return field(x, z);
}

function segmentDistance(x: number, z: number, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

export function landfallReserved(
  site: LandfallSite,
  x: number,
  z: number,
): boolean {
  return (
    townReserved(site.town, x, z) ||
    (z < site.spawn.z && Math.abs(x - site.spawn.x) < 2) ||
    segmentDistance(x, z, site.grotto.entry, site.grotto.exit) < 5.6 ||
    segmentDistance(x, z, site.spawn, site.grotto.entry) < 1.8 ||
    segmentDistance(x, z, site.spawn, site.dig) < 2.2
  );
}

/** Pure, metres, sea level zero. Recreate this recipe with the same seed and
 * settings for the sea silhouette, walking, decoration and treasure placement. */
export function generateIsland(
  world: number,
  seed: number,
  options: Partial<IslandSettings> = {},
) {
  if (!Number.isInteger(world) || !ISLAND_DESTINATIONS[world])
    throw new RangeError("Unknown island pack");
  const settings = normalizeIslandSettings(options);
  const key = ((seed >>> 0) ^ Math.imul(world + 1, 0x9e3779b1)) >>> 0;
  const rng = new Rng(key);
  const coast = simplexField(key),
    detail = simplexField(key ^ 0x413a6d);
  const ridge = simplexField(key ^ 0x331c21);
  const side = rng.next() < 0.5 ? -1 : 1;
  const landmarkSide = world % 2 ? 1 : -1;
  const site: LandfallSite = {
    ...ISLAND_DESTINATIONS[world]!,
    settings,
    spawn: { x: rng.range(-2.5, 2.5), z: rng.range(-22, -18) },
    landmark: { x: landmarkSide * rng.range(4.8, 7.3), z: rng.range(-1, 3) },
    dig: { x: -landmarkSide * rng.range(2.8, 6.2), z: rng.range(8, 13) },
    grotto: planGrotto(-side, key),
    town: planTown(key ^ 0x873ab1, settings.settlement, side),
  };
  const angle = rng.range(-0.42, 0.42);
  const cs = Math.cos(angle),
    sn = Math.sin(angle);
  const width = rng.range(31, 35),
    depth = rng.range(28, 32);
  const peakX = rng.range(-12, 12),
    peakZ = rng.range(10, 17);
  const saddleX = peakX < 0 ? peakX + 12 : peakX - 12;
  const saddleZ = peakZ + rng.range(-5, 4);
  const alpine = settings.biome === "alpine";
  const peakHeight = (alpine ? 5 : 1.4) + settings.relief * (alpine ? 19 : 12);
  const family = ((seed >>> 0) + world) % 4;
  const beachBand = 0.07 + settings.beach * 0.29;
  const grottoSin = Math.sin(site.grotto.yaw), grottoCos = Math.cos(site.grotto.yaw);
  const grainOnShelf = (x: number, z: number) => .13 * detail(x * .14, z * .14);
  function heightAt(x: number, z: number): number {
    const u = (cs * x - sn * z) / width,
      v = (sn * x + cs * z) / depth;
    // Domain warp and two octaves break the shoreline into coves and points.
    const qx = u + 0.11 * coast(0.85 * u + 3.7, 0.85 * v);
    const qz = v + 0.11 * coast(0.9 * u, 0.9 * v - 5.1);
    const inland =
      coastField(family, -side * qx, qz) +
      0.123 * coast(2 * u, 2 * v) +
      0.048 * detail(4.7 * u, 4.7 * v);
    let h =
      inland < 0
        ? Math.max(-8, inland * 15)
        : 1.4 * smooth(0, beachBand, inland);
    if (inland > 0) {
      const upland = smooth(beachBand * 0.75, beachBand + 0.24, inland);
      const grain =
        detail(x * 0.062, z * 0.062) * 0.7 +
        detail(x * 0.145, z * 0.145) * 0.24;
      const crest = 1 - Math.abs(ridge(0.052 * x, 0.052 * z));
      const shoulder = Math.exp(
        -(((x - peakX) / 15) ** 2 + ((z - peakZ) / 12) ** 2),
      );
      const secondary = Math.exp(
        -(((x - saddleX) / 10) ** 2 + ((z - saddleZ) / 9) ** 2),
      );
      const massif = shoulder * 0.78 + secondary * 0.48;
      h +=
        upland *
        (1.15 +
          grain * 0.9 +
          peakHeight * massif * (0.68 + 0.32 * crest * crest));
      h += 0.22 * grain * smooth(0, 0.19, inland);
    }
    // Dry sand at the grotto follows the passage and its approach. The last
    // beach beyond the sea door grades down into the shelf, outside the cave.
    if (z < 2 && x * -side > -4) {
      const grotto = site.grotto;
      const approach = 1 - smooth(1.1, 3.2, segmentDistance(x, z, site.spawn, grotto.entry));
      const shelf = 1 - smooth(4.3, 7.0, segmentDistance(x, z, grotto.entry, grotto.exit));
      if (approach > 0 || shelf > 0) {
        const dx = x - grotto.entry.x, dz = z - grotto.entry.z;
        const along = dx * grottoSin + dz * grottoCos;
        const across = dx * grottoCos - dz * grottoSin;
        // Wave-cut bowl: widen the belly then curl into two rounded coves.
        // The dry path occupies the centre of the vault, beside the pool.
        const poolAxis = -2.45 + .27 * Math.sin(along * .58);
        const bulb = Math.hypot((along - 8.25) / 5.75, (across - poolAxis) / 2.18);
        const pool = 1 - smooth(.19, 1.09, bulb + .042 * detail(x * .6, z * .6));
        const sandyFloor = .83 + grainOnShelf(x, z) - 1.82 * pool;
        h += (sandyFloor - h) * Math.max(approach, shelf);
      }
    }
    // A gently graded trail leads inland, leaving the mountain shoulders wild.
    const trail =
      1 - smooth(2.1, 5.5, segmentDistance(x, z, site.spawn, site.dig));
    const trailHeight =
      1 + 1.9 * clamp((z - site.spawn.z) / (site.dig.z - site.spawn.z));
    h += trail * (trailHeight - h);
    const grade = townGrade(site.town, x, z);
    return h + grade * (2.3 - h);
  }
  return { site, heightAt };
}

export type GeneratedIsland = ReturnType<typeof generateIsland>;
