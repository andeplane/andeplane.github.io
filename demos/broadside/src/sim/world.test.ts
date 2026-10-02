import { describe, expect, it } from "vitest";
import { IDLE_INTENT, SHIP_SPECS, SINK_DURATION, type ShipIntent } from "./ships";
import { FixedStepper, SIM_DT, World, type SimEvent, type WorldConfig } from "./world";

const config: WorldConfig = {
  seed: 1,
  wind: { direction: Math.PI / 2, strength: 1 },
  bounds: 200,
  islands: [{ pos: { x: 0, z: 60 }, radius: 10 }],
};

const fire = (side: "port" | "starboard"): ShipIntent => ({
  ...IDLE_INTENT, firePort: side === "port", fireStarboard: side === "starboard",
});

const collect = (world: World, seconds: number, each?: () => void): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += SIM_DT) {
    each?.();
    events.push(...world.step());
  }
  return events;
};

describe("World", () => {
  it("assigns unique ids and finds ships", () => {
    const w = new World(config);
    const a = w.addShip(SHIP_SPECS.sloop, "player", { x: 0, z: 0 }, 0);
    const b = w.addShip(SHIP_SPECS.sloop, "pirates", { x: 50, z: 0 }, 0);
    expect(a.id).not.toBe(b.id);
    expect(w.getShip(b.id)).toBe(b);
    expect(w.getShip(999)).toBeUndefined();
  });

  it("does not share island objects with the config", () => {
    const w = new World(config);
    w.islands[0]!.pos.x = 99;
    expect(config.islands[0]!.pos.x).toBe(0);
  });

  it("is deterministic for the same seed and inputs", () => {
    const simulate = () => {
      const w = new World(config);
      const p = w.addShip(SHIP_SPECS.galleon, "player", { x: -40, z: -40 }, 0.3);
      w.addShip(SHIP_SPECS.sloop, "pirates", { x: 20, z: -40 }, 0);
      collect(w, 10, () => w.setIntent(p.id, { ...fire("starboard"), turn: 0.2 }));
      return JSON.stringify(w.ships);
    };
    expect(simulate()).toBe(simulate());
  });

  it("fires, emits events, and sinks an enemy alongside", () => {
    const w = new World({ ...config, islands: [] });
    const player = w.addShip(SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const enemy = w.addShip(SHIP_SPECS.sloop, "pirates", { x: 45, z: 0 }, 0);
    enemy.sail = 0;
    player.sail = 0;
    const events = collect(w, 30, () => w.setIntent(player.id, fire("starboard")));
    const types = new Set(events.map((e) => e.type));
    expect(types).toContain("fire");
    expect(types).toContain("hit");
    expect(types).toContain("sunk");
    expect(types).toContain("removed");
    expect(w.getShip(enemy.id)).toBeUndefined();
    expect(w.balls.length).toBeLessThan(20);
  });

  it("splashes missed shots into the sea", () => {
    const w = new World({ ...config, islands: [] });
    const p = w.addShip(SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const events = collect(w, 5, () => w.setIntent(p.id, fire("port")));
    expect(events.filter((e) => e.type === "splash").length).toBeGreaterThanOrEqual(6);
  });

  it("keeps ships out of islands and reports the bump once per second", () => {
    const w = new World(config);
    const p = w.addShip(SHIP_SPECS.galleon, "player", { x: 0, z: 30 }, 0);
    p.sail = 2;
    const events = collect(w, 12);
    const d = Math.hypot(p.pos.x, p.pos.z - 60);
    expect(d).toBeGreaterThanOrEqual(10 + p.spec.beam * 0.6 - 1e-6);
    const bumps = events.filter((e) => e.type === "bump").length;
    expect(bumps).toBeGreaterThan(0);
    expect(bumps).toBeLessThanOrEqual(12);
  });

  it("pushes overlapping ships apart", () => {
    const w = new World({ ...config, islands: [] });
    const a = w.addShip(SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const b = w.addShip(SHIP_SPECS.galleon, "pirates", { x: 0, z: 0 }, 0);
    w.step();
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(10);
  });

  it("keeps ships inside the sea bounds", () => {
    const w = new World({ ...config, islands: [], bounds: 50 });
    const p = w.addShip(SHIP_SPECS.sloop, "player", { x: 0, z: 0 }, 0);
    p.sail = 2;
    collect(w, 20);
    expect(Math.hypot(p.pos.x, p.pos.z)).toBeLessThanOrEqual(50 + 1e-6);
  });

  it("removes a sunk ship only after it has finished sinking", () => {
    const w = new World({ ...config, islands: [] });
    const s = w.addShip(SHIP_SPECS.sloop, "pirates", { x: 0, z: 0 }, 0);
    s.alive = false;
    collect(w, SINK_DURATION - 0.5);
    expect(w.getShip(s.id)).toBe(s);
    collect(w, 1);
    expect(w.getShip(s.id)).toBeUndefined();
  });

  it("applies sail intents once, not every frame", () => {
    const w = new World(config);
    const p = w.addShip(SHIP_SPECS.sloop, "player", { x: 0, z: 0 }, 0);
    w.setIntent(p.id, { ...IDLE_INTENT, sailUp: true });
    w.step();
    w.step();
    expect(p.sail).toBe(2);
    w.setIntent(p.id, { ...IDLE_INTENT, sailDown: true });
    w.step();
    w.step();
    expect(p.sail).toBe(1);
  });
});

describe("FixedStepper", () => {
  it("runs whole steps and reports leftover alpha", () => {
    let steps = 0;
    const s = new FixedStepper(() => steps++, 0.1);
    expect(s.advance(0.25)).toBeCloseTo(0.5);
    expect(steps).toBe(2);
    s.advance(0.06);
    expect(steps).toBe(3);
  });

  it("caps catch-up work after a long stall", () => {
    let steps = 0;
    const s = new FixedStepper(() => steps++, 0.1, 3);
    s.advance(10);
    expect(steps).toBe(3);
  });
});
