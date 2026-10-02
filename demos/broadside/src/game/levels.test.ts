import { describe, expect, it } from "vitest";
import { LEVELS, SUNSET_COVE } from "./levels";
import { distance, length } from "../sim/math";
import { SHIP_SPECS } from "../sim/ships";

describe("levels", () => {
  it("registers Sunset Cove as level 1", () => {
    expect(LEVELS[0]).toBe(SUNSET_COVE);
  });

  for (const level of LEVELS) {
    describe(level.name, () => {
      it("has waves that end with a boss", () => {
        expect(level.waves.length).toBeGreaterThan(0);
        const last = level.waves[level.waves.length - 1]!;
        expect(last.enemies.some((e) => e.boss)).toBe(true);
      });

      it("spawns everything inside the sea and clear of islands", () => {
        const spawns = [
          { pos: level.player.pos, beam: SHIP_SPECS[level.player.ship].beam },
          ...level.waves.flatMap((w) => w.enemies.map((e) => ({ pos: e.pos, beam: SHIP_SPECS[e.ship].beam }))),
        ];
        for (const s of spawns) {
          expect(length(s.pos)).toBeLessThan(level.bounds);
          for (const i of level.islands) expect(distance(s.pos, i.pos)).toBeGreaterThan(i.radius + s.beam);
        }
      });

      it("keeps patrol waypoints in open water", () => {
        for (const e of level.waves.flatMap((w) => w.enemies)) {
          expect(e.patrol.length).toBeGreaterThan(0);
          for (const wp of e.patrol) {
            expect(length(wp)).toBeLessThan(level.bounds);
            for (const i of level.islands) expect(distance(wp, i.pos)).toBeGreaterThan(i.radius + 5);
          }
        }
      });

      it("does not overlap islands", () => {
        for (let a = 0; a < level.islands.length; a++) {
          for (let b = a + 1; b < level.islands.length; b++) {
            const i = level.islands[a]!;
            const j = level.islands[b]!;
            expect(distance(i.pos, j.pos)).toBeGreaterThan(i.radius + j.radius);
          }
        }
      });
    });
  }
});
