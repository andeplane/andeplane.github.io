import { describe, expect, it } from "vitest";
import { generateVoyage, VoyageSession, RELICS } from "./voyage";
import { Navigator, planRoute } from "./navigation";
import { IDLE_INTENT } from "../sim/ships";
import { distance } from "../sim/math";
import { readProgress, saveProgress } from "./progress";
const settle = (s: VoyageSession) => {
  s.player.pos = { ...s.voyage.finish };
  s.player.speed = 0;
  s.player.sail = 0;
  for (let n = 0; n < 60; n++) s.step();
};
describe("treasure voyages", () => {
  it("generates reproducible courses with accessible treasures and hidden gems", () => {
    for (let i = 0; i < 12; i++)
      for (const seed of [1, 42, 8100]) {
        const a = generateVoyage(i, seed);
        expect(a).toEqual(generateVoyage(i, seed));
        expect(a.level.islands.length).toBeLessThanOrEqual(8);
        for (const p of [a.finish, ...a.gems])
          for (const island of a.level.islands)
            expect(distance(p, island.pos)).toBeGreaterThan(island.radius + 4);
        expect(
          planRoute(a.level.player.pos, a.finish, a.level.islands).at(-1),
        ).toEqual(a.finish);
      }
  });
  it("lets both branches enter the far sea without pinpoint docking", () => {
    for (const x of [-60, 60]) {
      const s = new VoyageSession(generateVoyage(1));
      s.player.pos = { x, z: 145 };
      s.player.sail = 0;
      for (let n = 0; n < 60; n++) s.step();
      expect(s.state).toBe("won");
    }
  });
  it("starts with a gentle pirate encounter, then introduces stronger pirates, forts and kraken", () => {
    const s = new VoyageSession(generateVoyage(0));
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]!.spec.damage).toBe(2);
    expect(s.autoFire).toBe(false);
    expect(generateVoyage(3).level.waves[0]!.enemies).toHaveLength(1);
    expect(generateVoyage(6).forts).not.toHaveLength(0);
    expect(generateVoyage(9).kraken).not.toBeNull();
    expect(RELICS).toHaveLength(12);
  });
  it.each([0, 3])(
    "voyage %i never shoots without a player command and chooses one broadside for BOOM",
    (index) => {
      const s = new VoyageSession(generateVoyage(index));
      s.player.sail = 0;
      s.enemies[0]!.pos = { x: 30, z: -90 };
      s.enemies[0]!.sail = 0;
      s.step();
      expect(
        s.simEvents.filter(
          (e) => e.type === "fire" && e.shipId === s.player.id,
        ),
      ).toHaveLength(0);
      s.step({ ...IDLE_INTENT, firePort: true, fireStarboard: true });
      expect(
        s.simEvents.filter(
          (e) => e.type === "fire" && e.shipId === s.player.id,
        ),
      ).toMatchObject([{ side: "starboard" }]);
      s.enemies[0]!.pos.x = -30;
      expect(s.firingSide).toBe("port");
    },
  );
  it("awards one to three stars from total damage before any rescue repairs", () => {
    for (const [damage, stars] of [
      [0, 3],
      [70, 2],
      [200, 1],
    ]) {
      const s = new VoyageSession(generateVoyage(0));
      s.damageTaken = damage!;
      settle(s);
      expect(s.state).toBe("won");
      expect(s.stars).toBe(stars);
      expect(s.treasures[0]!.found).toBe(true);
      s.step();
      expect(s.events.filter((e) => e.type === "treasure")).toHaveLength(0);
    }
  });
  it("counts grounding damage and each gem once, with gentle rescue protection", () => {
    const s = new VoyageSession(generateVoyage(1));
    s.player.pos = { x: -53, z: -25 };
    s.player.speed = 0;
    s.player.sail = 0;
    s.step();
    expect(s.damageTaken).toBe(10);
    s.player.pos = { ...s.voyage.gems[0]! };
    s.step();
    s.step();
    expect(s.gemsFound).toBe(1);
    s.player.hull = 1;
    s.player.pos = { x: 0, z: -90 };
    s.step();
    s.player.sinceBump = 2;
    s.player.pos = { x: -53, z: -25 };
    s.step();
    expect(s.rescues).toBe(1);
    expect(s.player.alive).toBe(true);
    settle(s);
    expect(s.stars).toBe(1);
  });
  it("island cannons can hit a stationary ship in their range", () => {
    const s = new VoyageSession(generateVoyage(6));
    s.world.ships.splice(1);
    s.brains.clear();
    s.player.pos = { x: 54, z: 36 };
    s.player.sail = 0;
    for (let n = 0; n < 600; n++) s.step();
    expect(s.damageTaken).toBeGreaterThan(0);
  });
  it("completes every generated course by steering with real ship physics", () => {
    for (let i = 0; i < 12; i++) {
      const s = new VoyageSession(generateVoyage(i)),
        nav = new Navigator();
      nav.setGoal(s.player, s.voyage.finish, s.world.islands);
      for (let n = 0; n < 150 * 60 && s.state !== "won"; n++)
        s.step(nav.read(s.player));
      expect(
        s.state,
        `voyage ${i + 1} at ${JSON.stringify(s.player.pos)}`,
      ).toBe("won");
      expect(s.stars).toBeGreaterThanOrEqual(1);
    }
  });
  it("retains the collection and best stars and safely rejects malformed save data", () => {
    let value = "";
    const p = readProgress();
    p.relics = [0, 4];
    p.voyages = { "0": { stars: 3, gems: 2 } };
    saveProgress(p, { setItem: (_key, v) => (value = v) });
    expect(readProgress({ getItem: () => value })).toEqual(p);
    const bad = readProgress({
      getItem: () =>
        JSON.stringify({
          relics: [0, 0, 99, -1, "4"],
          voyages: { 0: { stars: 9, gems: 1 }, 1: { stars: 2, gems: 3 } },
        }),
    });
    expect(bad.relics).toEqual([0]);
    expect(bad.voyages).toEqual({ "1": { stars: 2, gems: 3 } });
  });
});
