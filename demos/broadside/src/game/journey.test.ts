import { describe, expect, it } from "vitest";
import { LEVEL_ROUTE, WorldJourney, locationWorld, nearestRegion, readJourney, saveJourney } from "./journey";
import { SEA_LANDMARKS } from "./freeSailing";

describe("a ship travelling through one chart", () => {
  it("keeps arrival atomic, rejects locked courses and cancels safely", () => {
    const j = new WorldJourney({ kind: "port" });
    expect(j.depart({ kind: "course", index: 1 }, {})).toBe(false);
    expect(j.depart({ kind: "course", index: 0 }, {})).toBe(true);
    expect(j.depart({ kind: "cave" }, {})).toBe(false);
    expect(j.step(.5)).toBeNull();
    expect(j.location).toEqual({ kind: "port" });
    expect(j.fraction).toBeCloseTo(.5 / 1.15);
    j.cancel(); expect(j.step(10)).toBeNull();
    expect(j.location).toEqual({ kind: "port" });
    j.depart({ kind: "course", index: 1 }, { 0: { stars: 1, gems: 0 } });
    expect(j.step(2)).toEqual({ kind: "course", index: 1 });
    expect(j.trip).toBeNull();
    j.depart({ kind: "cave" }, {}, true);
    expect(j.step(.12)).toEqual({ kind: "cave" });
  });
  it("does not corrupt travel time with negative or non-finite deltas", () => {
    const j = new WorldJourney({ kind: "sea", world: 2 }); j.depart({ kind: "cave" }, {});
    for (const dt of [-1, NaN, Infinity]) expect(j.step(dt)).toBeNull();
    expect(j.fraction).toBe(0);
    expect(locationWorld(j.location)).toBe(2);
    expect(locationWorld({ kind: "course", index: 39 })).toBe(3);
    expect(locationWorld({ kind: "cave" })).toBe(0);
  });
  it("round-trips the ship location without touching campaign or open-sea saves", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) };
    for (const location of [{ kind: "port" }, { kind: "cave" }, { kind: "course", index: 12 }, { kind: "sea", world: 3 }] as const) {
      saveJourney(location, store); expect(readJourney(store)).toEqual(location);
    }
    expect([...data.keys()]).toEqual(["broadside.journey.v1"]);
    expect(readJourney()).toEqual({ kind: "port" });
    expect(readJourney({ getItem: () => { throw Error("blocked"); } })).toEqual({ kind: "port" });
    expect(() => saveJourney({ kind: "port" }, { setItem: () => { throw Error("quota"); } })).not.toThrow();
    for (const location of [null, {}, { kind: "course", index: -1 }, { kind: "course", index: 40 }, { kind: "course", index: 1.5 }, { kind: "sea", world: 4 }, { kind: "unknown" }])
      expect(readJourney({ getItem: () => JSON.stringify({ version: 1, location }) })).toEqual({ kind: "port" });
    expect(readJourney({ getItem: () => "bad json" })).toEqual({ kind: "port" });
    expect(readJourney({ getItem: () => '{"version":2,"location":{"kind":"cave"}}' })).toEqual({ kind: "port" });
  });
  it("locates the explored sea region and keeps ten distinct route stops", () => {
    expect([0, 1, 2, 4].map(i => nearestRegion(SEA_LANDMARKS[i]!))).toEqual([0, 1, 2, 3]);
    expect(LEVEL_ROUTE).toHaveLength(10);
    expect(new Set(LEVEL_ROUTE.map(p => p.join(','))).size).toBe(10);
    expect(LEVEL_ROUTE.every(p => p.every(n => n > 0 && n < 100))).toBe(true);
  });
});
