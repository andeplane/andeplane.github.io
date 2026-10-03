import { describe, expect, it } from "vitest";
import { generateVoyage, VoyageSession, RELICS } from "./voyage";
import { Navigator, planRoute } from "./navigation";
import { IDLE_INTENT } from "../sim/ships";
import { distance } from "../sim/math";
import { TOTAL_LEVELS } from "./campaign";
import { readProgress, saveProgress } from "./progress";
const settle = (s: VoyageSession) => {
  s.player.pos = { ...s.voyage.finish };
  s.player.speed = 0;
  s.player.sail = 0;
  for (let n = 0; n < 60; n++) s.step();
};
describe("treasure voyages", () => {
  it("teaches steering with different courses instead of one repeated channel", () => {
    const courses = Array.from({ length: 10 }, (_, i) => generateVoyage(i));
    const shapes = courses.map((v) =>
      JSON.stringify(v.level.islands.map((i) => [i.pos, i.radius, i.kind])),
    );
    expect(new Set(shapes).size).toBe(10);
    const lengths = courses.map((v) => distance(v.level.player.pos, v.finish));
    expect(Math.max(...lengths)).toBeGreaterThan(Math.min(...lengths) * 2);
    // Most courses require actual turns, rather than sailing straight to win.
    expect(
      courses.filter(
        (v) =>
          planRoute(v.level.player.pos, v.finish, v.level.islands).length > 1,
      ).length,
    ).toBeGreaterThanOrEqual(8);
    expect(new Set(courses.map((v) => v.level.intro)).size).toBe(10);
  });
  it("lets a real ship reach every optional gem in the navigation pack", () => {
    for (let i = 0; i < 10; i++) {
      for (let gemIndex = 0; gemIndex < 3; gemIndex++) {
        const s = new VoyageSession(generateVoyage(i)),
          nav = new Navigator();
        const gem = s.voyage.gems[gemIndex]!;
        nav.setGoal(s.player, gem, s.world.islands);
        for (
          let n = 0;
          n < 120 * 60 && !gem.found && s.state === "exploring";
          n++
        ) {
          const intent = nav.read(s.player);
          // Navigation's docking stop is wider than the gem pickup radius.
          if (distance(s.player.pos, gem) < 18) {
            intent.sailDown = false;
            intent.sailUp = true;
          }
          s.step(intent);
        }
        expect(
          gem.found,
          `level ${i + 1} gem ${gemIndex + 1} at ${JSON.stringify(s.player.pos)}`,
        ).toBe(true);
        expect(s.state).toBe("exploring");
      }
    }
  });
  it("generates reproducible courses with accessible treasures and hidden gems", () => {
    for (let i = 0; i < TOTAL_LEVELS; i++)
      for (const seed of [1, 42, 8100]) {
        const a = generateVoyage(i, seed);
        expect(a).toEqual(generateVoyage(i, seed));
        expect(a.level.islands.length).toBeLessThanOrEqual(11);
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
  it("introduces hazards in the requested order across all ten levels of every world", () => {
    for (let i = 0; i < TOTAL_LEVELS; i++) {
      const v = generateVoyage(i),
        s = new VoyageSession(v);
      expect(s.autoFire).toBe(false);
      if (i < 10) {
        expect(s.enemies).toHaveLength(0);
        expect(v.forts).toHaveLength(0);
        expect(v.whirlpools).toHaveLength(0);
        expect(v.kraken).toBeNull();
        s.step({ ...IDLE_INTENT, firePort: true, fireStarboard: true });
        expect(s.simEvents.filter((e) => e.type === "fire")).toHaveLength(0);
      } else if (i < 20) {
        expect(v.forts.length).toBeGreaterThan(0);
        expect(v.whirlpools).toHaveLength(0);
        expect(v.kraken).toBeNull();
        expect(s.enemies.length > 0).toBe(i >= 14);
      } else if (i < 30) {
        expect(v.whirlpools.length).toBeGreaterThan(0);
        expect(v.kraken).toBeNull();
      } else {
        expect(v.whirlpools.length).toBeGreaterThan(0);
        expect(v.kraken).not.toBeNull();
      }
    }
    expect(RELICS).toHaveLength(12);
    expect(
      new Set(
        Array.from({ length: 40 }, (_, i) => generateVoyage(i).level.name),
      ).size,
    ).toBe(40);
    for (const id of [-1, 40, 1.5, NaN])
      expect(() => generateVoyage(id)).toThrow();
  });
  it.each([14, 19])(
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
  it.each([true, false])(
    "island contact sinks the ship even in junior=%s, with no rescue or treasure",
    (junior) => {
      const s = new VoyageSession(generateVoyage(1), junior);
      const island = s.level.islands[0]!;
      s.player.pos = { ...island.pos };
      s.player.speed = 0;
      s.player.sail = 0;
      s.player.sinceBump = 0;
      s.step();
      expect(s.state).toBe("lost");
      expect(s.failureReason).toBe("island");
      expect(s.player.hull).toBe(0);
      expect(s.player.alive).toBe(false);
      expect(s.rescues).toBe(0);
      expect(s.stars).toBe(0);
      expect(s.treasures[0]!.found).toBe(false);
      expect(s.simEvents).toContainEqual({ type: "sunk", shipId: s.player.id });
      s.player.pos = { ...s.voyage.finish };
      for (let n = 0; n < 360; n++) s.step();
      expect(s.state).toBe("lost");
      expect(s.player.sinkTime).toBeGreaterThan(5);
      expect(s.events).toEqual([]);
      expect(s.rescues).toBe(0);
    },
  );
  it.each([0, Math.PI / 2, Math.PI])(
    "detects the bow striking exposed rocks at heading %s before the hull center arrives",
    (heading) => {
      const s = new VoyageSession(generateVoyage(0));
      const rock = s.level.islands.find((i) => i.kind === "sea-rock")!;
      s.player.heading = heading;
      s.player.sail = 0;
      const reach =
        rock.radius +
        s.player.spec.beam * 0.6 +
        s.player.spec.length * 0.4 +
        0.1;
      s.player.pos = {
        x: rock.pos.x - Math.sin(heading) * reach,
        z: rock.pos.z - Math.cos(heading) * reach,
      };
      s.step();
      expect(s.state).toBe("exploring");
      s.player.pos.x += Math.sin(heading) * 0.2;
      s.player.pos.z += Math.cos(heading) * 0.2;
      s.step();
      expect(s.state).toBe("lost");
      expect(s.failureReason).toBe("rocks");
      expect(s.player.hull).toBe(0);
      expect(s.rescues).toBe(0);
    },
  );
  it("collects each hidden gem once without damaging a ship in clear water", () => {
    const s = new VoyageSession(generateVoyage(1));
    s.player.pos = { ...s.voyage.gems[0]! };
    s.player.sail = 0;
    s.step();
    s.step();
    expect(s.gemsFound).toBe(1);
    expect(s.damageTaken).toBe(0);
    expect(s.state).toBe("exploring");
  });
  it("island cannons can hit a stationary ship in their range", () => {
    const s = new VoyageSession(generateVoyage(10));
    s.world.ships.splice(1);
    s.brains.clear();
    s.player.pos = { x: 54, z: 33 };
    s.player.sail = 0;
    for (let n = 0; n < 600; n++) s.step();
    expect(s.damageTaken).toBeGreaterThan(0);
  });
  it("manual broadsides damage a pirate hull instead of firing harmlessly", () => {
    const s = new VoyageSession(generateVoyage(14));
    s.brains.clear();
    s.player.sail = 0;
    const enemy = s.enemies[0]!;
    enemy.pos = { x: 30, z: -90 };
    enemy.sail = 0;
    for (let n = 0; n < 240; n++)
      s.step(
        n % 110 === 0
          ? { ...IDLE_INTENT, firePort: true, fireStarboard: true }
          : IDLE_INTENT,
      );
    expect(enemy.hull).toBeLessThan(enemy.spec.maxHull);
  });
  it("whirlpools pull and spin a ship, damage their core, and allow steering out", () => {
    const s = new VoyageSession(generateVoyage(20));
    s.brains.clear();
    s.world.ships.splice(1);
    const w = s.voyage.whirlpools[0]!;
    s.player.pos = { x: w.x + 8, z: w.z };
    s.player.sail = 0;
    s.player.speed = 0;
    const heading = s.player.heading;
    for (let n = 0; n < 60; n++) s.step();
    expect(distance(s.player.pos, w)).toBeLessThan(8);
    expect(s.player.heading).not.toBe(heading);
    s.player.pos = { x: w.x + 1, z: w.z };
    s.player.sail = 0;
    s.step();
    expect(s.damageTaken).toBeGreaterThan(0);
    s.player.pos = { x: w.x + 8, z: w.z };
    s.player.heading = Math.PI / 2;
    s.player.sail = 2;
    s.player.speed = 10;
    for (let n = 0; n < 180; n++) s.step({ ...IDLE_INTENT, turn: -0.1 });
    expect(distance(s.player.pos, w)).toBeGreaterThan(w.radius);
    const away = s.damageTaken;
    s.player.pos = { x: 0, z: -90 };
    s.player.sail = 0;
    s.player.speed = 0;
    for (let n = 0; n < 30; n++) s.step();
    expect(s.damageTaken).toBe(away);
  });
  it("kraken strikes are real damage in the final world", () => {
    const s = new VoyageSession(generateVoyage(30));
    const k = s.voyage.kraken!;
    s.player.sail = 0;
    for (let n = 0; n < 180; n++) {
      s.player.pos = { ...k };
      s.player.speed = 0;
      s.step();
    }
    expect(s.damageTaken).toBeGreaterThan(0);
  });
  it("completes every generated course by steering with real ship physics", () => {
    for (let i = 0; i < TOTAL_LEVELS; i++) {
      const s = new VoyageSession(generateVoyage(i)),
        nav = new Navigator();
      nav.setGoal(s.player, s.voyage.finish, s.world.islands, s.world.wind);
      for (let n = 0; n < 150 * 60 && s.state !== "won"; n++)
        s.step(nav.read(s.player, s.world.wind));
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
