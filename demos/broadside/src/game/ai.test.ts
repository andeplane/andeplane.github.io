import { describe, expect, it } from "vitest";
import { avoidIslands, broadsideHeading, createBrain, thinkAi } from "./ai";
import { angleDiff } from "../sim/math";
import { createShip, SHIP_SPECS, updateShip } from "../sim/ships";

const wind = { direction: 0, strength: 1 };
const sloop = (x: number, z: number, heading = 0) => createShip(1, SHIP_SPECS.sloop, "pirates", { x, z }, heading);
const target = (x: number, z: number) => createShip(2, SHIP_SPECS.galleon, "player", { x, z }, 0);

describe("AI", () => {
  it("copies waypoints and applies options", () => {
    const wps = [{ x: 1, z: 2 }];
    const b = createBrain(1, wps, { telegraph: 2, fleeAt: 0 });
    wps[0]!.x = 50;
    expect(b.waypoints[0]!.x).toBe(1);
    expect(b.telegraph).toBe(2);
    expect(b.fleeAt).toBe(0);
  });

  it("patrols toward waypoints and advances when it arrives", () => {
    const b = createBrain(1, [{ x: 100, z: 0 }, { x: 0, z: 100 }]);
    const s = sloop(0, 0);
    const i = thinkAi(b, s, undefined, [], 1 / 60);
    expect(b.state).toBe("patrol");
    expect(i.turn).toBeGreaterThan(0); // waypoint is to the east => starboard turn
    s.pos = { x: 95, z: 0 };
    thinkAi(b, s, undefined, [], 1 / 60);
    expect(b.waypointIndex).toBe(1);
  });

  it("drops sail when it has nowhere to go", () => {
    const s = sloop(0, 0);
    s.sail = 2;
    const i = thinkAi(createBrain(1, []), s, undefined, [], 1 / 60);
    expect(i.sailDown).toBe(true);
  });

  it("engages a target within detection range and hunts with full sail", () => {
    const b = createBrain(1, []);
    const s = sloop(0, 0);
    const i = thinkAi(b, s, target(0, 90), [], 1 / 60);
    expect(b.state).toBe("engage");
    expect(i.sailUp).toBe(true);
  });

  it("ignores far targets while patrolling, but chases further once engaged", () => {
    const b = createBrain(1, [{ x: 0, z: -50 }], { detectRange: 100 });
    const s = sloop(0, 0);
    thinkAi(b, s, target(0, 130), [], 1 / 60);
    expect(b.state).toBe("patrol");
    thinkAi(b, s, target(0, 90), [], 1 / 60);
    thinkAi(b, s, target(0, 130), [], 1 / 60);
    expect(b.state).toBe("engage");
    thinkAi(b, s, target(0, 400), [], 1 / 60);
    expect(b.state).toBe("patrol");
  });

  it("works out which broadside to present", () => {
    const s = sloop(0, 0);
    const right = broadsideHeading(s, { x: 0, z: 50 });
    // Target dead ahead, slightly right => turn left to show starboard.
    expect(right.side).toBe("starboard");
    expect(right.heading).toBeCloseTo(-Math.PI / 2);
    const left = broadsideHeading(s, { x: -30, z: 10 });
    expect(left.side).toBe("port");
  });

  it("telegraphs before firing a lined-up broadside", () => {
    const b = createBrain(1, [], { telegraph: 0.5 });
    const s = sloop(0, 0, 0); // facing north; target due east => starboard aligned
    const t = target(40, 0);
    let fired = false;
    let frames = 0;
    while (!fired && frames < 120) {
      const i = thinkAi(b, s, t, [], 1 / 60);
      if (frames === 5) expect(b.aiming).toBe("starboard");
      fired = i.fireStarboard;
      frames++;
    }
    expect(fired).toBe(true);
    expect(frames).toBeGreaterThanOrEqual(30);
  });

  it("does not aim while reloading", () => {
    const b = createBrain(1, []);
    const s = sloop(0, 0, 0);
    s.reload.starboard = 3;
    thinkAi(b, s, target(40, 0), [], 1 / 60);
    expect(b.aiming).toBeNull();
  });

  it("opens distance when dangerously close", () => {
    const b = createBrain(1, []);
    const s = sloop(0, 0, 0);
    const near = thinkAi(b, s, target(10, 0), [], 1 / 60);
    const ok = thinkAi(createBrain(1, []), sloop(0, 0, 0), target(40, 0), [], 1 / 60);
    expect(near.turn).not.toBeCloseTo(ok.turn);
  });

  it("flees when badly damaged, unless it is a fight-to-the-death boss", () => {
    const s = sloop(0, 0);
    s.hull = 5;
    const b = createBrain(1, []);
    const i = thinkAi(b, s, target(0, 50), [], 1 / 60);
    expect(b.state).toBe("flee");
    expect(i.sailUp).toBe(true);
    const boss = createBrain(1, [], { fleeAt: 0 });
    thinkAi(boss, s, target(0, 50), [], 1 / 60);
    expect(boss.state).toBe("engage");
  });

  it("does nothing once sunk, and returns to patrol when the target is gone", () => {
    const s = sloop(0, 0);
    const b = createBrain(1, [{ x: 0, z: 100 }]);
    const t = target(0, 50);
    t.alive = false;
    thinkAi(b, s, t, [], 1 / 60);
    expect(b.state).toBe("patrol");
    s.alive = false;
    expect(thinkAi(b, s, t, [], 1 / 60).turn).toBe(0);
  });

  it("steers away from islands ahead", () => {
    const s = sloop(0, 0, 0);
    expect(avoidIslands(s, [{ pos: { x: 3, z: 28 }, radius: 8 }], 1)).toBe(-1);
    expect(avoidIslands(s, [{ pos: { x: -3, z: 28 }, radius: 8 }], -1)).toBe(1);
    expect(avoidIslands(s, [{ pos: { x: 200, z: 0 }, radius: 8 }], 0.3)).toBe(0.3);
  });

  it("actually reaches a broadside position when simulated", () => {
    const b = createBrain(1, []);
    const s = sloop(0, 0, 0);
    const t = target(0, 45);
    for (let i = 0; i < 60 * 8; i++) updateShip(s, thinkAi(b, s, t, [], 1 / 60), wind, 1 / 60);
    const { heading } = broadsideHeading(s, t.pos);
    expect(Math.abs(angleDiff(s.heading, heading))).toBeLessThan(0.6);
  });
});
