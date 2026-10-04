import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateFreeSea, SEA_LANDMARKS } from "./freeSailing";
import { inLandmarkClearing, landmarkSites } from "./landmarkLayout";

describe("permanent sea landmarks", () => {
  it("preserves the published shore, reef and indexed discovery coordinates", () => {
    // Captured before scenery changes. Discovery IDs are array indices in saves,
    // so moving a gem or consuming an extra RNG value would corrupt a voyage.
    const released = new Map([
      [1, "f626350c66393b5d8922d16e436c6ecc576096ccb52ce33a7c92b0726d2c1ff3"],
      [42, "e278b27c6b309d2773d147ebe8a0e59f21c0a5a269880d0aaf6974db2a4a530c"],
      [81723, "8d0402fd0cfbdab12d01d61584782a92d3392adece073857eb2b916b76b5e2b4"],
      [0xffffffff, "053e67cc3cf1c37376bf69c5d5a676a8d37b04ad03d57524e5c3e269ea2e8f63"],
    ]);
    for (const [seed, hash] of released) {
      const v = generateFreeSea(seed);
      const coordinates = { islands: v.level.islands.map(i => [i.pos.x, i.pos.z, i.radius, i.kind]), gems: v.gems };
      expect(createHash("sha256").update(JSON.stringify(coordinates)).digest("hex")).toBe(hash);
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
