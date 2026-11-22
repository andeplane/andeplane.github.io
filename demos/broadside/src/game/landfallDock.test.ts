import { expect, it } from "vitest";
import { generateIsland } from "./landfall";
import { planPearlDock } from "./landfallDock";

it("connects the landing, dock and Black Pearl deck across packs and biomes", () => {
  const biomes = ["tropical", "temperate", "winter", "alpine"] as const;
  const settlements = ["none", "hamlet", "village"] as const;
  for (let n = 0; n < 256; n++) {
    const island = generateIsland(n % 4, Math.imul(n + 1, 8738121) >>> 0, {
      biome: biomes[Math.floor(n / 4) % 4],
      settlement: settlements[n % 3],
      relief: (n >> 4) % 2,
      beach: (n >> 5) % 2,
    });
    const dock = planPearlDock(island);
    let previous = island.heightAt(dock.x, island.site.spawn.z);
    for (let step = 0; step <= 240; step++) {
      const z = island.site.spawn.z + (dock.onDeck.z - island.site.spawn.z) * step / 240;
      const land = island.heightAt(dock.x, z);
      const boards = dock.heightAt(dock.x, z);
      expect(boards !== undefined || land >= .32, `seed sample ${n}, z=${z}`).toBe(true);
      const height = Math.max(land, boards ?? -Infinity);
      expect(Math.abs(height - previous), `seed sample ${n}, z=${z}`).toBeLessThan(.30);
      previous = height;
    }
    expect(dock.heightAt(dock.onDeck.x, dock.onDeck.z)).toBeDefined();
    expect(dock.heightAt(dock.x + 9, dock.shoreZ - dock.pierEnd - 1)).toBeUndefined();
  }
});
