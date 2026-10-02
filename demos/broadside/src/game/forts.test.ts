import { describe, expect, it } from "vitest";
import { aimFortShot } from "./forts";
import { VoyageSession, generateVoyage } from "./voyage";
import { IDLE_INTENT, createShip, SHIP_SPECS } from "../sim/ships";
import { ballHitsShip, stepBall, type Cannonball } from "../sim/cannons";
import { forward } from "../sim/math";

const launch = (heading: number, speed: number) => {
  const ship = createShip(
    0,
    SHIP_SPECS.galleon,
    "player",
    { x: 0, z: -20 },
    heading,
  );
  ship.speed = speed;
  const origin = { x: 54, z: -5 },
    aim = aimFortShot(origin, ship);
  const ball: Cannonball = {
    id: -1,
    ownerId: -1,
    team: "pirates",
    pos: { ...origin, y: 12 },
    vel: aim.velocity,
    damage: 12,
    alive: true,
  };
  return { ship, ball, aim };
};
describe("island cannon aim", () => {
  it.each([
    [0, 0],
    [0, 12],
    [Math.PI / 2, 10],
    [-Math.PI / 2, 10],
  ])("can hit a steady ship with heading %s and speed %s", (heading, speed) => {
    const { ship, ball } = launch(heading!, speed!);
    const f = forward(ship.heading);
    let hit = false;
    for (let n = 0; n < 300 && ball.pos.y > 0; n++) {
      ship.pos.x += (f.x * ship.speed) / 60;
      ship.pos.z += (f.z * ship.speed) / 60;
      stepBall(ball, 1 / 60);
      if (ballHitsShip(ball, ship)) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
  });
  it("lets a captain evade a committed shot by turning after it fires", () => {
    const { ship, ball } = launch(0, 12);
    ship.heading = Math.PI / 2;
    const f = forward(ship.heading);
    let hit = false;
    for (let n = 0; n < 300 && ball.pos.y > 0; n++) {
      ship.pos.x += (f.x * ship.speed) / 60;
      ship.pos.z += (f.z * ship.speed) / 60;
      stepBall(ball, 1 / 60);
      if (ballHitsShip(ball, ship)) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(false);
  });
  it("hits a moving ship through the real simulation and removes expired warning targets", () => {
    const s = new VoyageSession(generateVoyage(10));
    s.player.pos = { x: 0, z: -55 };
    s.player.heading = 0;
    s.player.sail = 2;
    s.player.speed = 10;
    let warning = false,
      hit = false;
    for (let n = 0; n < 500 && s.state !== "won"; n++) {
      s.step(IDLE_INTENT);
      warning ||= s.incomingFortShots.length > 0;
      hit ||= s.simEvents.some(
        (e) => e.type === "hit" && e.shipId === s.player.id,
      );
    }
    expect(warning).toBe(true);
    expect(hit).toBe(true);
    expect(s.damageTaken).toBeGreaterThan(0);
    s.world.balls.splice(0);
    expect(s.incomingFortShots).toEqual([]);
  });
});
