import { describe, expect, it } from "vitest";
import { Session } from "./session";
import { ADVENTURE_LEVEL, createTreasures } from "./adventure";
import { Navigator, planRoute } from "./navigation";
import { createBrain, thinkAi } from "./ai";
import { distance } from "../sim/math";
import { SIM_DT } from "../sim/world";
import { readProgress, saveProgress } from "./progress";

const make = (junior = true, seed = 1701) =>
  new Session({ ...ADVENTURE_LEVEL, seed }, { adventure: true, junior });
describe("little captain adventure", () => {
  it("waits for exploration, opens a chest only once, and repairs the ship", () => {
    const s = make();
    for (let i = 0; i < 600; i++) s.step();
    expect(s.state).toBe("exploring");
    expect(s.enemies).toHaveLength(0);
    s.player.pos = { ...s.treasures[0]!.pos };
    s.player.sail = 0;
    s.player.speed = 0;
    s.player.hull = 40;
    for (let i = 0; i < 80; i++) s.step();
    expect(s.treasures[0]!.found).toBe(true);
    expect(s.gold).toBe(150);
    expect(s.player.hull).toBe(s.player.spec.maxHull);
    for (let i = 0; i < 100; i++) s.step();
    expect(s.gold).toBe(150);
  });
  it("rescues junior captains and shields them, while Sea Dog can lose", () => {
    const s = make();
    s.player.alive = false;
    s.player.hull = 0;
    s.step();
    expect(s.state).toBe("exploring");
    expect(s.player.alive).toBe(true);
    expect(s.rescues).toBe(1);
    expect(s.shield).toBe(6);
    expect(s.events.some((e) => e.type === "rescue")).toBe(true);
    const hard = make(false);
    hard.player.alive = false;
    hard.player.hull = 0;
    hard.step();
    expect(hard.state).toBe("lost");
  });
  it("can navigate to every landing without getting stuck on islands", () => {
    const s = make();
    const nav = new Navigator();
    for (const t of createTreasures()) {
      nav.setGoal(s.player, t.pos, s.world.islands);
      for (let n = 0; n < 120 * 60 && distance(s.player.pos, t.pos) > 17; n++) {
        s.world.setIntent(s.player.id, nav.read(s.player));
        s.world.step();
      }
      expect(distance(s.player.pos, t.pos), t.name).toBeLessThan(17);
    }
  });
  it("unlocks a peaceful cruise after winning and opens all six islands", () => {
    const s = make();
    s.startCruise();
    expect(s.cruising).toBe(false);
    s.state = "won";
    s.startCruise();
    expect(s.cruising).toBe(true);
    expect(s.activeTreasures).toHaveLength(6);
    for (const t of s.treasures) {
      s.player.pos = { ...t.pos };
      s.player.speed = 0;
      s.player.sail = 0;
      for (let n = 0; n < 80; n++) s.step();
    }
    expect(s.enemies).toHaveLength(0);
    expect(s.state).toBe("exploring");
    expect(s.treasures.every((t) => t.found)).toBe(true);
  });
  it("routes around a blocking island rather than through it", () => {
    const route = planRoute({ x: -50, z: 0 }, { x: 50, z: 0 }, [
      { pos: { x: 0, z: 0 }, radius: 20 },
    ]);
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(-1)).toEqual({ x: 50, z: 0 });
    for (const point of route.slice(0, -1))
      expect(Math.hypot(point.x, point.z)).toBeGreaterThan(26);
  });
  it("finishes all three adventures with the same crew assists used by the UI", () => {
    for (const seed of [1, 7, 1701]) {
      const s = make(true, seed);
      const nav = new Navigator();
      const brain = createBrain(s.player.id, [], {
        telegraph: 0,
        fleeAt: 0,
        detectRange: 600,
      });
      let target = -1;
      for (let n = 0; n < 1500 * 60 && s.state !== "won"; n++) {
        if (s.state === "reward") {
          s.continueAdventure();
          nav.clear();
          target = -1;
        }
        if (s.state === "exploring") {
          const t = s.activeTreasures
            .slice()
            .sort(
              (a, b) =>
                distance(a.pos, s.player.pos) - distance(b.pos, s.player.pos),
            )[0]!;
          if (t.id !== target) {
            nav.setGoal(s.player, t.pos, s.world.islands);
            target = t.id;
          }
          s.step(nav.read(s.player));
        } else {
          const enemy = s.enemies
            .filter((e) => e.alive)
            .sort(
              (a, b) =>
                distance(a.pos, s.player.pos) - distance(b.pos, s.player.pos),
            )[0];
          s.step(
            thinkAi(
              brain,
              s.player,
              enemy,
              s.world.islands,
              SIM_DT,
              s.world.bounds,
            ),
          );
        }
      }
      expect(
        s.state,
        `seed ${seed} chapter ${s.chapter} at ${JSON.stringify(s.player.pos)}`,
      ).toBe("won");
      expect(s.treasures.filter((t) => t.found)).toHaveLength(6);
      expect(s.gold).toBe(2290);
      s.restart();
      expect(s.treasures.every((t) => !t.found)).toBe(true);
      expect(s.chapter).toBe(0);
      expect(s.gold).toBe(0);
    }
  }, 60000);
});

describe("treasure shelf storage", () => {
  it("handles unavailable or corrupted storage and validates saved data", () => {
    expect(readProgress({ getItem: () => "{bad" }).keepsakes).toEqual([]);
    const p = readProgress({
      getItem: () =>
        JSON.stringify({
          best: -4,
          adventures: 3.8,
          keepsakes: [0, 0, 9, "2", 5],
          paint: "bad",
          muted: true,
        }),
    });
    expect(p).toMatchObject({
      best: 0,
      adventures: 3,
      keepsakes: [0, 5],
      paint: "#fff3d0",
    });
    expect(p).not.toHaveProperty("muted");
    expect(() =>
      saveProgress(p, {
        setItem: () => {
          throw new Error("private");
        },
      }),
    ).not.toThrow();
  });
});
