import { describe, expect, it } from "vitest";
import {
  createShip, damageShip, IDLE_INTENT, reloadProgress, repairShip, SHIP_SPECS, targetSpeed,
  updateShip, type ShipIntent,
} from "./ships";
import type { Wind } from "./wind";

const wind: Wind = { direction: Math.PI / 2, strength: 1 };
const intent = (over: Partial<ShipIntent>): ShipIntent => ({ ...IDLE_INTENT, ...over });
const run = (seconds: number, fn: () => void) => {
  for (let t = 0; t < seconds; t += 1 / 60) fn();
};

describe("ships", () => {
  it("has a spec for every class with sane values", () => {
    for (const spec of Object.values(SHIP_SPECS)) {
      expect(spec.length).toBeGreaterThan(spec.beam);
      expect(spec.maxHull).toBeGreaterThan(0);
      expect(spec.cannonsPerSide).toBeGreaterThan(0);
    }
    expect(SHIP_SPECS.warship.maxHull).toBeGreaterThan(SHIP_SPECS.galleon.maxHull);
  });

  it("starts at half sail, at rest, fully repaired", () => {
    const s = createShip(1, SHIP_SPECS.sloop, "pirates", { x: 1, z: 2 }, 7);
    expect(s.sail).toBe(1);
    expect(s.speed).toBe(0);
    expect(s.hull).toBe(SHIP_SPECS.sloop.maxHull);
    expect(s.heading).toBeCloseTo(7 - 2 * Math.PI);
  });

  it("accelerates toward the wind-limited target speed and moves forward", () => {
    const s = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    run(20, () => updateShip(s, IDLE_INTENT, wind, 1 / 60));
    expect(s.speed).toBeCloseTo(targetSpeed(s, wind), 3);
    expect(s.pos.z).toBeGreaterThan(50);
    expect(Math.abs(s.pos.x)).toBeLessThan(0.001);
  });

  it("raises and lowers sails one notch per press, within limits", () => {
    const s = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    updateShip(s, intent({ sailUp: true }), wind, 0.016);
    updateShip(s, intent({ sailUp: true }), wind, 0.016);
    expect(s.sail).toBe(2);
    for (let i = 0; i < 4; i++) updateShip(s, intent({ sailDown: true }), wind, 0.016);
    expect(s.sail).toBe(0);
    expect(targetSpeed(s, wind)).toBe(0);
  });

  it("full sail is faster than half sail", () => {
    const half = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const full = createShip(2, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    full.sail = 2;
    expect(targetSpeed(full, wind)).toBeGreaterThan(targetSpeed(half, wind));
  });

  it("turns to starboard with positive turn and can turn from a standstill", () => {
    const s = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    s.sail = 0;
    run(1, () => updateShip(s, intent({ turn: 1 }), wind, 1 / 60));
    expect(s.heading).toBeGreaterThan(0.05);
    const p = createShip(2, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    run(1, () => updateShip(p, intent({ turn: -1 }), wind, 1 / 60));
    expect(p.heading).toBeLessThan(-0.05);
  });

  it("turns faster when moving", () => {
    const slow = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const fast = createShip(2, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    slow.sail = 0;
    fast.sail = 2;
    fast.speed = fast.spec.maxSpeed;
    run(2, () => {
      updateShip(slow, intent({ turn: 1 }), wind, 1 / 60);
      updateShip(fast, intent({ turn: 1 }), wind, 1 / 60);
    });
    expect(fast.heading).toBeGreaterThan(slow.heading);
  });

  it("clamps oversized turn input", () => {
    const a = createShip(1, SHIP_SPECS.sloop, "player", { x: 0, z: 0 }, 0);
    const b = createShip(2, SHIP_SPECS.sloop, "player", { x: 0, z: 0 }, 0);
    run(1, () => {
      updateShip(a, intent({ turn: 1 }), wind, 1 / 60);
      updateShip(b, intent({ turn: 50 }), wind, 1 / 60);
    });
    expect(b.heading).toBeCloseTo(a.heading);
  });

  it("counts down reload timers but never below zero", () => {
    const s = createShip(1, SHIP_SPECS.sloop, "player", { x: 0, z: 0 }, 0);
    s.reload.port = 1;
    expect(reloadProgress(s, "port")).toBeLessThan(1);
    run(2, () => updateShip(s, IDLE_INTENT, wind, 1 / 60));
    expect(s.reload.port).toBe(0);
    expect(reloadProgress(s, "port")).toBe(1);
  });

  it("sinks when hull reaches zero and then drifts to a halt", () => {
    const s = createShip(1, SHIP_SPECS.sloop, "pirates", { x: 0, z: 0 }, 0);
    s.speed = 5;
    s.angularVelocity = 0.3;
    expect(damageShip(s, 10)).toBe(false);
    expect(damageShip(s, 1000)).toBe(true);
    expect(s.alive).toBe(false);
    expect(damageShip(s, 10)).toBe(false);
    run(3, () => updateShip(s, intent({ turn: 1, sailUp: true }), wind, 1 / 60));
    expect(s.speed).toBe(0);
    expect(s.sail).toBe(1);
    expect(s.sinkTime).toBeGreaterThan(2.9);
  });

  it("repairs up to max hull but cannot raise the dead", () => {
    const s = createShip(1, SHIP_SPECS.sloop, "player", { x: 0, z: 0 }, 0);
    damageShip(s, 30);
    repairShip(s, 1000);
    expect(s.hull).toBe(s.spec.maxHull);
    damageShip(s, 1000);
    repairShip(s, 50);
    expect(s.hull).toBe(0);
  });
});
