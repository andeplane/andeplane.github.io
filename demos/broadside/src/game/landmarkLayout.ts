import type { IslandDef, SeaLandmarkKind } from "./levels";

export interface LandmarkSite {
  /** Normalized coordinates and footprint relative to the island's radius. */
  x: number;
  z: number;
  radius: number;
}

// The renderer and vegetation share these footprints, keeping buildings out of
// trees and boulder ridges without changing any navigable shoreline or save ID.
const SITES: Record<SeaLandmarkKind, readonly LandmarkSite[]> = {
  harbour: [
    { x: -.34, z: -.18, radius: .23 }, { x: .34, z: -.22, radius: .22 },
    { x: -.32, z: .29, radius: .23 }, { x: .29, z: .28, radius: .24 },
  ],
  smugglers: [
    { x: -.34, z: -.18, radius: .22 }, { x: .35, z: -.12, radius: .23 },
    { x: 0, z: .3, radius: .3 },
  ],
  stormkeep: [{ x: 0, z: .12, radius: .53 }],
  ruins: [{ x: 0, z: .12, radius: .55 }],
  moonstone: [{ x: 0, z: .12, radius: .48 }],
};

export function landmarkSites(def: IslandDef): readonly LandmarkSite[] {
  return def.landmark ? SITES[def.landmark] : [];
}

/** Reserve the approach trail and building footprints, allowing for prop size. */
export function inLandmarkClearing(def: IslandDef, x: number, z: number, padding = 0): boolean {
  if (!def.landmark) return false;
  if (Math.abs(x) < 2.5 + padding && z < def.radius * .18) return true;
  return landmarkSites(def).some(site =>
    Math.hypot(x - site.x * def.radius, z - site.z * def.radius) < site.radius * def.radius + padding);
}
