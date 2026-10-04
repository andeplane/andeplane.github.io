import { describe, expect, it } from "vitest";
import { generateFreeSea } from "./freeSailing";
import { VoyageSession } from "./voyage";
import { distance } from "../sim/math";
import { PerlinNoise } from "../sim/noise";

describe("generated free sailing", () => {
  it("is repeatable by seed, with distinct seas and continuous noise", () => {
    expect(generateFreeSea(81723)).toEqual(generateFreeSea(81723));
    expect(generateFreeSea(81724).level.islands).not.toEqual(generateFreeSea(81723).level.islands);
    const n = new PerlinNoise(42);
    for (const x of [-3.001, -.001, .999, 4.999])
      expect(Math.abs(n.at(x, .73) - n.at(x + .002, .73))).toBeLessThan(.02);
  });
  it("leaves safe spawning, navigable channels, and reachable gems on a large finite map", () => {
    for (const seed of [1, 42, 81723, 0xffffffff]) {
      const { level, gems } = generateFreeSea(seed);
      expect(level.islands.length).toBeGreaterThan(100);
      expect(gems.length).toBeGreaterThanOrEqual(50);
      for (const [index, i] of level.islands.entries()) {
        expect(distance(i.pos, level.player.pos)).toBeGreaterThan(i.radius + 30);
        expect(Math.hypot(i.pos.x, i.pos.z) + i.radius).toBeLessThan(level.bounds);
        for (const other of level.islands.slice(index + 1))
          expect(distance(i.pos, other.pos)).toBeGreaterThan(i.radius + other.radius + 27);
        for (const gem of gems) expect(distance(i.pos, gem)).toBeGreaterThan(i.radius + 13);
      }
    }
  });
  it("allows exploration and manual fire without triggering a campaign reward", () => {
    const s = new VoyageSession(generateFreeSea(42));
    s.player.sail = 0;
    s.player.pos = { ...s.voyage.gems[0]! };
    s.step();
    expect(s.gemsFound).toBe(1);
    s.step({ turn: 0, sailUp: false, sailDown: false, firePort: true, fireStarboard: false });
    expect(s.world.balls.length).toBeGreaterThan(0);
    expect(s.treasures).toHaveLength(0);
    expect(s.state).toBe("exploring");
  });
  it("keeps reef collisions dangerous and provides four weather choices", () => {
    const s = new VoyageSession(generateFreeSea(42));
    const reef = s.level.islands.find(i => i.kind === "sea-rock")!;
    s.player.pos = { ...reef.pos };
    s.step();
    expect(s.state).toBe("lost");
    expect(s.failureReason).toBe("rocks");
    const styles = [0, 1, 2, 3].map(p => generateFreeSea(42, p));
    expect(styles[0]!.weather.kind).toBe("clear");
    expect(styles[2]!.weather.lightning).toBe(true);
    expect(styles[3]!.weather.name).toBe("Haunted moonlight");
  });
});
