import { describe, expect, it } from "vitest";
import {
  generateIsland,
  normalizeIslandSettings,
  landfallNoise,
} from "./landfall";

describe("procedural landfalls", () => {
  it("reconstructs geometry and sites from a shared recipe regardless of generation order", () => {
    const sample = (seed: number) => {
      const { site, heightAt } = generateIsland(3, seed, {
        biome: "winter",
        settlement: "village",
      });
      return {
        site,
        grid: Array.from({ length: 121 }, (_, i) =>
          Math.round(
            heightAt((i % 11) * 6 - 30, Math.floor(i / 11) * 6 - 30) * 1000,
          ),
        ),
      };
    };
    const first = sample(54321);
    expect(sample(54322)).not.toEqual(first);
    expect(sample(54321)).toEqual(first);
    expect(new Set(first.grid).size).toBeGreaterThan(50);
  });
  it("keeps the route dry and walkable across 256 pack, climate and seed combinations", () => {
    const biomes = ["winter", "alpine", "temperate", "tropical"] as const;
    for (let n = 0; n < 256; n++) {
      const { site, heightAt } = generateIsland(
        n % 4,
        Math.imul(n, 8738121) >>> 0,
        {
          biome: biomes[Math.floor(n / 4) % 4],
          relief: n % 2,
          beach: (n >> 1) % 2,
          settlement: "village",
        },
      );
      let previous = heightAt(site.spawn.x, site.spawn.z);
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const h = heightAt(
          site.spawn.x * (1 - t) + site.dig.x * t,
          site.spawn.z * (1 - t) + site.dig.z * t,
        );
        if (!Number.isFinite(h) || h < 0.35 || Math.abs(h - previous) > 0.3)
          throw new Error(`Unsafe treasure trail at sample ${n}/${i}`);
        previous = h;
      }
      for (const lot of site.town.houses)
        expect(heightAt(lot.x, lot.z)).toBeCloseTo(2.3);
      for (const sign of [-1, 1])
        expect(heightAt(44 * sign, 44 * sign)).toBeLessThan(0);
    }
  });
  it("connects the approach and both cave doors on dry land beside the tidal pool", () => {
    const biomes = ["winter", "alpine", "temperate", "tropical"] as const;
    for (let n = 0; n < 128; n++) {
      const { site, heightAt } = generateIsland(n % 4, n * 1973, {
        biome: biomes[(n >> 2) % 4], relief: n % 2, beach: (n >> 1) % 2,
      });
      const { entry, exit, yaw } = site.grotto;
      for (const [a, b] of [[site.spawn, entry], [entry, exit]] as const) {
        for (let i = 0; i <= 32; i++) {
          const t = i / 32;
          expect(heightAt(a.x + t * (b.x - a.x), a.z + t * (b.z - a.z))).toBeGreaterThan(.35);
        }
      }
      const along = 8, across = -2.15 + .32 * Math.sin(along * .54);
      expect(heightAt(entry.x + along * Math.sin(yaw) + across * Math.cos(yaw),
        entry.z + along * Math.cos(yaw) - across * Math.sin(yaw))).toBeLessThan(0);
    }
  });
  it("varies relief and beach width, and keeps simplex gradients continuous", () => {
    const grid = (relief: number, beach: number) => {
      const { heightAt } = generateIsland(0, 439, {
        biome: "alpine",
        relief,
        beach,
        settlement: "none",
      });
      return Array.from({ length: 625 }, (_, i) =>
        heightAt((i % 25) * 2 - 24, Math.floor(i / 25) * 2 - 24),
      );
    };
    const hills = grid(0, 0),
      mountains = grid(1, 0),
      beaches = grid(1, 1);
    expect(Math.max(...mountains) - Math.max(...hills)).toBeGreaterThan(4);
    expect(beaches.filter((h) => h > 0.1 && h < 2).length).toBeGreaterThan(
      mountains.filter((h) => h > 0.1 && h < 2).length,
    );
    expect(
      Math.abs(
        landfallNoise(42, 1.78, -2.99) - landfallNoise(42, 1.781, -2.99),
      ),
    ).toBeLessThan(0.02);
    expect(
      normalizeIslandSettings({ relief: -4, beach: 9, vegetation: NaN }),
    ).toMatchObject({ relief: 0, beach: 1, vegetation: 0.72 });
  });
});
