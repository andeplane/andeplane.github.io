import { describe, expect, it } from "vitest";
import {
  ballHitsShip, canFire, elevationForRange, elevationForTarget, findAim, MAX_YAW, fireBroadside, flightRange, GRAVITY, MIN_AIM, muzzlePositions,
  sideVector, stepBall, type Cannonball,
} from "./cannons";
import { Rng } from "./rng";
import { createShip, SHIP_SPECS } from "./ships";

const ids = () => {
  let n = 1;
  return () => n++;
};

const ball = (over: Partial<Cannonball>): Cannonball => ({
  id: 1, ownerId: 99, team: "pirates",
  pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 }, damage: 10, alive: true, ...over,
});

describe("cannons", () => {
  it("computes an elevation that reaches the requested range", () => {
    const el = elevationForRange(60, 40);
    expect(el).toBeGreaterThan(0);
    expect(el).toBeLessThan(Math.PI / 4);
    expect(flightRange(40, el, 0)).toBeCloseTo(60, 1);
  });

  it("solves elevation exactly from muzzle height, within its limits", () => {
    const el = elevationForTarget(40, 40, 1.6);
    expect(flightRange(40, el, 1.6)).toBeCloseTo(40, 2);
    expect(elevationForTarget(10_000, 40, 1.6)).toBeCloseTo(Math.PI / 4);
    expect(elevationForTarget(0.5, 40, 1.6)).toBeCloseTo(-0.35);
  });

  it("caps elevation at 45 degrees for unreachable ranges", () => {
    expect(elevationForRange(10_000, 10)).toBeCloseTo(Math.PI / 4);
  });

  it("flies further when fired from higher up", () => {
    expect(flightRange(40, 0.1, 5)).toBeGreaterThan(flightRange(40, 0.1, 0));
  });

  it("points port and starboard out of opposite sides", () => {
    const p = sideVector(0, "port");
    const s = sideVector(0, "starboard");
    expect(p.x).toBeCloseTo(-1);
    expect(s.x).toBeCloseTo(1);
  });

  it("places one muzzle per cannon along the correct side", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const m = muzzlePositions(ship, "starboard");
    expect(m).toHaveLength(SHIP_SPECS.galleon.cannonsPerSide);
    for (const p of m) expect(p.x).toBeGreaterThan(0);
    const zs = m.map((p) => p.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(5);
    const single = createShip(2, { ...SHIP_SPECS.sloop, cannonsPerSide: 1 }, "player", { x: 0, z: 0 }, 0);
    expect(muzzlePositions(single, "port")[0]!.z).toBeCloseTo(0);
  });

  it("fires a broadside outward and starts the reload", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    expect(canFire(ship, "port")).toBe(true);
    const balls = fireBroadside(ship, "port", new Rng(1), ids());
    expect(balls).toHaveLength(6);
    for (const b of balls) {
      expect(b.vel.x).toBeLessThan(0);
      expect(b.vel.y).toBeGreaterThan(0);
      expect(b.team).toBe("player");
    }
    expect(new Set(balls.map((b) => b.id)).size).toBe(6);
    expect(canFire(ship, "port")).toBe(false);
    expect(canFire(ship, "starboard")).toBe(true);
  });

  it("dead ships cannot fire", () => {
    const ship = createShip(1, SHIP_SPECS.sloop, "player", { x: 0, z: 0 }, 0);
    ship.alive = false;
    expect(canFire(ship, "port")).toBe(false);
  });

  it("lands broadsides near the cannon's rated range", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const balls = fireBroadside(ship, "starboard", new Rng(9), ids());
    for (const b of balls) {
      while (b.pos.y > 0) stepBall(b, 1 / 60);
      expect(b.pos.x).toBeGreaterThan(SHIP_SPECS.galleon.cannonRange * 0.8);
      expect(b.pos.x).toBeLessThan(SHIP_SPECS.galleon.cannonRange * 1.15);
    }
  });

  it("applies gravity while stepping", () => {
    const b = ball({ vel: { x: 1, y: 0, z: 0 } });
    stepBall(b, 1);
    expect(b.vel.y).toBeCloseTo(-GRAVITY);
    expect(b.pos.x).toBeCloseTo(1);
  });

  it("hits enemy hulls inside the hull ellipse only", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    expect(ballHitsShip(ball({ pos: { x: 0, y: 1, z: 5 } }), ship)).toBe(true);
    expect(ballHitsShip(ball({ pos: { x: 0, y: 1, z: 12 } }), ship)).toBe(false);
    expect(ballHitsShip(ball({ pos: { x: 6, y: 1, z: 0 } }), ship)).toBe(false);
    expect(ballHitsShip(ball({ pos: { x: 0, y: 9, z: 0 } }), ship)).toBe(false);
    expect(ballHitsShip(ball({ pos: { x: 0, y: -2, z: 0 } }), ship)).toBe(false);
  });

  it("never hits its own ship, its own team, or wrecks", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    expect(ballHitsShip(ball({ ownerId: 1 }), ship)).toBe(false);
    expect(ballHitsShip(ball({ team: "player" }), ship)).toBe(false);
    ship.alive = false;
    expect(ballHitsShip(ball({}), ship)).toBe(false);
  });
});

describe("gun crew aiming", () => {
  const land = (b: Cannonball) => {
    while (b.pos.y > 0) stepBall(b, 1 / 60);
    return b.pos;
  };

  it("aims at the nearest enemy off that side", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const near = createShip(2, SHIP_SPECS.sloop, "pirates", { x: 30, z: 4 }, 0);
    const far = createShip(3, SHIP_SPECS.sloop, "pirates", { x: 55, z: 0 }, 0);
    const aim = findAim(ship, "starboard", [ship, far, near]);
    expect(aim.distance).toBeGreaterThan(25);
    expect(aim.distance).toBeLessThan(31);
    expect(aim.yaw).toBeGreaterThan(0); // target slightly ahead
  });

  it("fires straight at full range with nothing to aim at", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const ally = createShip(2, SHIP_SPECS.sloop, "player", { x: 20, z: 0 }, 0);
    const wreck = createShip(3, SHIP_SPECS.sloop, "pirates", { x: 25, z: 0 }, 0);
    wreck.alive = false;
    const ahead = createShip(4, SHIP_SPECS.sloop, "pirates", { x: 0, z: 30 }, 0);
    const port = createShip(5, SHIP_SPECS.sloop, "pirates", { x: -30, z: 0 }, 0);
    const distant = createShip(6, SHIP_SPECS.sloop, "pirates", { x: 200, z: 0 }, 0);
    const aim = findAim(ship, "starboard", [ally, wreck, ahead, port, distant]);
    expect(aim.distance).toBeCloseTo(SHIP_SPECS.galleon.cannonRange * 0.92);
    expect(aim.yaw).toBe(0);
  });

  it("never aims closer than the minimum, beyond max range, or past the yaw limit", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const point = createShip(2, SHIP_SPECS.sloop, "pirates", { x: 5, z: 0 }, 0);
    expect(findAim(ship, "starboard", [point]).distance).toBe(MIN_AIM);
    const edge = createShip(3, SHIP_SPECS.warship, "pirates", { x: 74, z: 0 }, 0);
    expect(findAim(ship, "starboard", [edge]).distance).toBe(SHIP_SPECS.galleon.cannonRange);
    const racing = createShip(4, SHIP_SPECS.sloop, "pirates", { x: 50, z: 30 }, 0);
    racing.speed = 60;
    expect(findAim(ship, "starboard", [racing]).yaw).toBe(MAX_YAW);
  });

  it("leads a crossing target, and does not lead with lead = 0", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const crossing = createShip(2, SHIP_SPECS.sloop, "pirates", { x: 40, z: 0 }, 0);
    crossing.speed = 8; // sailing north, across our line of fire
    expect(findAim(ship, "starboard", [crossing], 1).yaw).toBeGreaterThan(0.1);
    expect(findAim(ship, "starboard", [crossing], 0).yaw).toBeCloseTo(0);
  });

  const countHits = (target: ReturnType<typeof createShip>, balls: Cannonball[]) => {
    let hits = 0;
    for (let t = 0; t < 4; t += 1 / 60) {
      target.pos.z += target.speed / 60;
      for (const b of balls) {
        if (!b.alive) continue;
        stepBall(b, 1 / 60);
        if (ballHitsShip(b, target)) {
          b.alive = false;
          hits++;
        }
      }
    }
    return hits;
  };

  it("a broadside hits a close target instead of overshooting it", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const target = createShip(2, SHIP_SPECS.sloop, "pirates", { x: 35, z: 0 }, 0);
    const aimed = fireBroadside(ship, "starboard", new Rng(4), ids(), findAim(ship, "starboard", [target]));
    expect(countHits(target, aimed)).toBeGreaterThanOrEqual(3);
    const unaimed = fireBroadside(ship, "starboard", new Rng(4), ids());
    for (const b of unaimed) expect(land(b).x).toBeGreaterThan(50);
  });

  it("a led broadside hits a moving target", () => {
    const ship = createShip(1, SHIP_SPECS.galleon, "player", { x: 0, z: 0 }, 0);
    const target = createShip(2, SHIP_SPECS.sloop, "pirates", { x: 50, z: 0 }, 0);
    target.speed = 7;
    const balls = fireBroadside(ship, "starboard", new Rng(5), ids(), findAim(ship, "starboard", [target]));
    expect(countHits(target, balls)).toBeGreaterThanOrEqual(3);
  });
});
