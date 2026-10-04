import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateFreeSea, SEA_LANDMARKS } from "./freeSailing";
import { inLandmarkClearing, landmarkSites } from "./landmarkLayout";

describe("permanent sea landmarks", () => {
  it("preserves the published shore, reef and indexed discovery coordinates", () => {
    // Captured before scenery changes. Discovery IDs are array indices in saves,
    // so moving a gem or consuming an extra RNG value would corrupt a voyage.
    const released = new Map([
      [1, "18ff63b7348615f565e82bfaced42700d25b4bdc479d1964c127f50560183c06"],
      [42, "7dc5fb7b857c2a865b9c1b0ba6a274b01877b7e7c27fb76a5a359af3db407bf2"],
      [81723, "672d8a60b40888834e0bf92e905707acc03ccd821b8dfe4573b7506702062572"],
      [0xffffffff, "2032c2aee0bd9bb8e3fb67d4a8eb34a570d565206d230eb1e22fc6bae5e89e03"],
    ]);
    for (const [seed, hash] of released) {
      const v = generateFreeSea(seed);
      const coordinates = { islands: v.level.islands.map(i => [i.pos.x, i.pos.z, i.radius, i.kind]), gems: v.gems };
      // Different JS runtimes can vary in the final digits of sin/cos. Preserve
      // the array order and coordinates to 0.0000001 m, well below game precision.
      const snapshot = JSON.stringify(coordinates, (_, value) =>
        typeof value === "number" ? Math.round(value * 1e7) / 1e7 : value);
      expect(createHash("sha256").update(snapshot).digest("hex")).toBe(hash);
    }
  });

  it("gives each named island its own settlement in every preview climate", () => {
    for (const pack of [0, 1, 2, 3]) {
      const islands = generateFreeSea(81723, pack).level.islands;
      expect(islands.filter(i => i.landmark)).toHaveLength(5);
      for (const [n, place] of SEA_LANDMARKS.entries()) {
        const def = islands[n]!;
        expect(def.pos).toEqual({ x: place.x, z: place.z });
        expect(def.landmark).toBe(place.landmark);
        expect(def.props).not.toContain("lighthouse");
        const sites = landmarkSites(def);
        expect(sites.length).toBeGreaterThan(0);
        for (const site of sites) {
          expect(inLandmarkClearing(def, site.x * def.radius, site.z * def.radius)).toBe(true);
          expect(Math.hypot(site.x, site.z) + site.radius).toBeLessThan(1);
        }
        expect(inLandmarkClearing(def, 0, -def.radius * .8)).toBe(true);
        expect(inLandmarkClearing(def, -def.radius * .8, 0)).toBe(false);
        expect(inLandmarkClearing(def, -def.radius * .8, 0, def.radius)).toBe(true);
      }
    }
    const ordinary = generateFreeSea().level.islands.find(i => !i.landmark)!;
    expect(landmarkSites(ordinary)).toEqual([]);
    expect(inLandmarkClearing(ordinary, 0, 0)).toBe(false);
  });
});
