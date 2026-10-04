import { describe, expect, it } from "vitest";
import { newOpenSea, readOpenSea, saveOpenSea, openSeaVoyage, recordOpenSea } from "./openSea";
import { OPEN_SEA_BOUNDS, generateFreeSea } from "./freeSailing";
import { VoyageSession, generateVoyage } from "./voyage";
import { wrapCoordinate, seaDistance } from "../sim/math";
import { islandStreamingPlan } from "./islandStreaming";

const storage = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};

describe("one persistent open world", () => {
  it("resumes the same islands, position, heading, look and discoveries", () => {
    const memory = storage(), save = newOpenSea(), original = openSeaVoyage(save);
    const s = new VoyageSession(original);
    s.player.pos = { x: 30, z: -40 }; s.player.heading = .7;
    s.voyage.gems[3]!.found = true;
    recordOpenSea(save, s, -.4, .2); saveOpenSea(save, memory);
    const loaded = readOpenSea(memory), resumed = openSeaVoyage(loaded);
    expect(resumed.level.islands).toEqual(original.level.islands);
    expect(resumed.level.seed).toBe(original.level.seed);
    expect(resumed.level.player.pos).toEqual({ x: 30, z: -40 });
    expect(resumed.level.player.heading).toBe(.7);
    expect(loaded.yaw).toBe(-.4); expect(loaded.pitch).toBe(.2);
    expect(resumed.gems[3]!.found).toBe(true);
    expect([...memory.data.keys()]).toEqual(["broadside.open-sea.v1"]);
    expect(readOpenSea()).toEqual(newOpenSea());
  });
  it("validates old, malformed, private and unsafe saves", () => {
    const read = (value: unknown) => readOpenSea({ getItem: () => JSON.stringify(value) });
    for (const value of [null, {}, { version: 0 }, { version: 1, seed: -1 }, { version: 1, seed: 2.5 }, { version: 1, seed: 2 ** 33 }])
      expect(read(value)).toEqual(newOpenSea());
    expect(readOpenSea({ getItem: () => "{" })).toEqual(newOpenSea());
    expect(readOpenSea({ getItem: () => { throw Error("private"); } })).toEqual(newOpenSea());
    const save = read({ version: 1, seed: 42, position: { x: 1700, z: 0 }, heading: 9, yaw: -9, pitch: 7, gems: [3, 3, -1, 3.5, 1001, "2"] });
    expect(save.position).toEqual({ x: 0, z: 0 });
    expect(save.heading).toBeCloseTo(9 - Math.PI * 2); expect(save.yaw).toBeCloseTo(-9 + Math.PI * 2);
    expect(save.pitch).toBe(1.1); expect(save.gems).toEqual([3]);
    expect(read({ version: 1, seed: 0, position: { x: 1590, z: 1590 } }).position).toEqual({ x: 1590, z: 1590 });
    expect(read({ version: 1, seed: 0, position: { x: "oops", z: 0 }, gems: "bad" }).position).toEqual({ x: 0, z: 0 });
    expect(() => saveOpenSea(save, { setItem: () => { throw Error("private"); } })).not.toThrow();
    expect(() => saveOpenSea(save)).not.toThrow();
    save.position = { ...generateFreeSea(42).level.islands[0]!.pos };
    expect(openSeaVoyage(save).level.player.pos).toEqual({ x: 0, z: 0 });
  });
  it("keeps discoveries after a wreck and keeps campaign saves separate", () => {
    const save = newOpenSea(), s = new VoyageSession(openSeaVoyage(save));
    s.player.pos = { x: -20, z: -50 };
    recordOpenSea(save, s, .2, -.2);
    const safe = structuredClone(save);
    s.player.pos = { ...s.level.islands[0]!.pos };
    recordOpenSea(save, s, 1, 1);
    expect(save).toEqual(safe);
    s.voyage.gems[1]!.found = true; s.state = "lost";
    recordOpenSea(save, s, 1, 1);
    expect(save.position).toEqual({ x: 0, z: 0 }); expect(save.gems).toEqual([1]);
    expect(save.heading).toBe(0); expect(save.yaw).toBe(0); expect(save.pitch).toBe(.03);
    recordOpenSea(save, new VoyageSession(generateVoyage(0)), 3, 3);
    expect(save.gems).toEqual([1]);
  });
});

describe("periodic sea boundaries", () => {
  it("joins all four edges and measures the shortest route", () => {
    const b = OPEN_SEA_BOUNDS;
    expect(wrapCoordinate(b + 3, b)).toBe(-b + 3);
    expect(wrapCoordinate(-b - 5, b)).toBe(b - 5);
    expect(wrapCoordinate(0, b)).toBe(0);
    expect(wrapCoordinate(b * 5 + 4, b)).toBe(-b + 4);
    expect(seaDistance({ x: b - 2, z: b - 3 }, { x: -b + 2, z: -b + 3 }, b)).toBeCloseTo(Math.hypot(4, 6));
    expect(seaDistance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });
  it("preserves course and speed when crossing east/west and north/south", () => {
    const b = OPEN_SEA_BOUNDS;
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const s = new VoyageSession(generateFreeSea());
      s.player.heading = heading; s.player.speed = 12; s.player.sail = 2;
      s.player.pos = { x: Math.sin(heading) * (b - .01), z: Math.cos(heading) * (b - .01) };
      s.step();
      expect(Math.max(Math.abs(s.player.pos.x), Math.abs(s.player.pos.z))).toBeLessThan(b);
      expect(s.player.pos.x * Math.sin(heading) + s.player.pos.z * Math.cos(heading)).toBeLessThan(-b + 1);
      expect(s.player.speed).toBeGreaterThan(10);
      expect(s.player.heading).toBeCloseTo(heading); expect(s.state).toBe("exploring");
    }
  });
  it("collects gems, collides with reefs, and wraps cannonballs across a seam", () => {
    const b = OPEN_SEA_BOUNDS, v = generateFreeSea();
    v.gems = [{ x: -b + 2, z: 200, found: false }];
    const s = new VoyageSession(v);
    s.player.pos = { x: b - 2, z: 200 }; s.player.sail = 0;
    s.step(); expect(s.gemsFound).toBe(1);
    s.step({ turn: 0, sailUp: false, sailDown: false, firePort: false, fireStarboard: true });
    expect(s.world.balls.length).toBeGreaterThan(0);
    expect(s.world.balls.every(ball => Math.abs(ball.pos.x) < b && Math.abs(ball.pos.z) < b)).toBe(true);
    const reefVoyage = generateFreeSea();
    reefVoyage.level.islands = [{ pos: { x: -b + 4, z: 200 }, radius: 4, kind: "sea-rock", props: [] }];
    const reef = new VoyageSession(reefVoyage);
    reef.player.pos = { x: b - 2, z: 200 }; reef.player.sail = 0; reef.step();
    expect(reef.state).toBe("lost"); expect(reef.failureReason).toBe("rocks");
  });
});

describe("scenery streaming on the fixed map", () => {
  it("loads nearby scenery with hysteresis without changing the map", () => {
    const islands = generateFreeSea().level.islands, original = structuredClone(islands);
    const first = islandStreamingPlan(islands, { x: 0, z: 0 }, new Set());
    expect(first.load.length).toBeGreaterThan(0); expect(first.load.length).toBeLessThan(islands.length / 2);
    expect(first.unload).toEqual([]);
    const active = new Set(first.load);
    expect(islandStreamingPlan(islands, { x: 0, z: 0 }, active).load).toEqual([]);
    const away = islandStreamingPlan(islands, { x: 1000, z: 800 }, active);
    expect(away.load.length).toBeGreaterThan(0); expect(away.unload.length).toBeGreaterThan(0);
    expect(islands).toEqual(original);
  });
  it("keeps the same shore visible from both sides of a periodic edge", () => {
    const b = OPEN_SEA_BOUNDS;
    const islands = [{ pos: { x: -b + 40, z: 0 }, radius: 20, kind: "sand" as const, props: [] }];
    expect(islandStreamingPlan(islands, { x: b - 40, z: 0 }, new Set(), b).load).toEqual([0]);
    expect(islandStreamingPlan(islands, { x: b - 40, z: 0 }, new Set([0]), b).unload).toEqual([]);
    expect(islandStreamingPlan(islands, { x: b - 40, z: 0 }, new Set([0])).unload).toEqual([0]);
  });
});
