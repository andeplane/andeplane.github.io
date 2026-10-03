import { describe, expect, it } from "vitest";
import { voyageWeather, weatherWind, lightningFlash } from "./weather";
import { generateVoyage, VoyageSession } from "./voyage";
import { IDLE_INTENT } from "../sim/ships";

describe("voyage weather", () => {
  it("keeps the navigation world calm and mixes clear, rain and storm voyages later", () => {
    for (let i = 0; i < 10; i++) {
      const w = voyageWeather(i);
      expect(w.rain).toBe(0);
      expect(w.drift).toBe(0);
      expect(w.lightning).toBe(false);
    }
    for (let pack = 1; pack <= 3; pack++) {
      const weather = Array.from({ length: 10 }, (_, stage) => voyageWeather(pack * 10 + stage));
      expect(new Set(weather.map((w) => w.kind))).toEqual(new Set(["overcast", "rain", "storm"]));
    }
  });
  it("gusts cause actual drift and turning, and furling the sails reduces exposure", () => {
    const travel = (sail: 0 | 2, storm: boolean) => {
      const voyage = generateVoyage(18);
      voyage.forts = [];
      voyage.level.islands = [];
      const s = new VoyageSession(voyage);
      s.world.ships.splice(1);
      s.brains.clear();
      s.world.islands.splice(0);
      s.player.pos = { x: 0, z: -170 };
      s.player.sail = sail;
      s.player.spec = { ...s.player.spec, acceleration: 0 };
      if (!storm) s.world.windField = undefined;
      for (let n = 0; n < 180; n++) s.step(IDLE_INTENT);
      return s.player;
    };
    const full = travel(2, true), furled = travel(0, true), calm = travel(2, false);
    expect(Math.abs(full.pos.x)).toBeGreaterThan(1.5);
    expect(Math.abs(full.heading)).toBeGreaterThan(0.05);
    expect(Math.abs(furled.pos.x)).toBeLessThan(Math.abs(full.pos.x) * 0.3);
    expect(calm.pos.x).toBe(0);
    expect(calm.heading).toBe(0);
  });
  it("replays the same smooth gusts and only flashes on storm voyages", () => {
    const w = voyageWeather(18);
    expect(weatherWind(w, 12)).toEqual(weatherWind(w, 12));
    const a = weatherWind(w, 12), b = weatherWind(w, 12 + 1 / 60);
    expect(Math.abs(a.direction - b.direction)).toBeLessThan(0.01);
    expect(Math.abs(a.drift! - b.drift!)).toBeLessThan(0.03);
    expect(lightningFlash(w, 0)).toBe(0);
    expect(lightningFlash(voyageWeather(0), 20)).toBe(0);
    const flashes = Array.from({ length: 1800 }, (_, n) => lightningFlash(w, n / 60));
    expect(Math.max(...flashes)).toBeGreaterThan(0.9);
  });
});
