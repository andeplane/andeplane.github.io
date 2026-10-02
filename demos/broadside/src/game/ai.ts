import { angleDiff, clamp, distance, forward, headingTo, wrapAngle, type Vec2 } from "../sim/math";
import { IDLE_INTENT, type Ship, type ShipIntent, type Side } from "../sim/ships";
import type { Island } from "../sim/world";

export type AiState = "patrol" | "engage" | "flee";

export interface AiBrain {
  shipId: number;
  state: AiState;
  waypoints: Vec2[];
  waypointIndex: number;
  /** Seconds the ship has held its aim; it fires once this passes `telegraph`. */
  aimTime: number;
  /** Which side is being aimed, so the renderer can warn the player. */
  aiming: Side | null;
  /** Seconds of steady aim before firing. Longer = easier for the player. */
  telegraph: number;
  detectRange: number;
  /** Flee when hull falls below this fraction. 0 = fight to the last. */
  fleeAt: number;
  /** Seconds spent fleeing. After FLEE_LIMIT a cornered pirate turns to fight. */
  fleeTime: number;
}

/** Seconds a ship will run before it gives up and fights to the end. */
export const FLEE_LIMIT = 10;

export const createBrain = (
  shipId: number, waypoints: Vec2[], opts: Partial<Pick<AiBrain, "telegraph" | "detectRange" | "fleeAt">> = {},
): AiBrain => ({
  shipId,
  state: "patrol",
  waypoints: waypoints.map((w) => ({ ...w })),
  waypointIndex: 0,
  aimTime: 0,
  aiming: null,
  telegraph: opts.telegraph ?? 0.9,
  detectRange: opts.detectRange ?? 110,
  fleeAt: opts.fleeAt ?? 0.2,
  fleeTime: 0,
});

const LOOKAHEAD = 28;
/** How tightly the AI must line up a broadside before it starts aiming. */
const AIM_TOLERANCE = 0.3;

const steerToward = (ship: Ship, heading: number): number =>
  clamp(angleDiff(ship.heading, heading) * 2.2, -1, 1);

/** Bias steering away from any island in the ship's path, or one it is already scraping. */
export const avoidIslands = (ship: Ship, islands: readonly Island[], turn: number): number => {
  const f = forward(ship.heading);
  for (const island of islands) {
    const clearance = island.radius + ship.spec.beam + 6;
    const toIsland = angleDiff(ship.heading, headingTo(ship.pos, island.pos));
    const hugging = distance(ship.pos, island.pos) < clearance + 4 && Math.abs(toIsland) < Math.PI / 2;
    const ahead = [10, 20, LOOKAHEAD].some(
      (look) => distance({ x: ship.pos.x + f.x * look, z: ship.pos.z + f.z * look }, island.pos) < clearance,
    );
    // Island on our right? Turn left, and vice versa.
    if (hugging || ahead) return toIsland >= 0 ? -1 : 1;
  }
  return turn;
};

/** Turn back toward open water when the ship is heading for the edge of the map. */
export const avoidEdge = (ship: Ship, bounds: number, turn: number): number => {
  const f = forward(ship.heading);
  const ahead = { x: ship.pos.x + f.x * LOOKAHEAD, z: ship.pos.z + f.z * LOOKAHEAD };
  if (Math.hypot(ahead.x, ahead.z) < bounds - 10) return turn;
  return steerToward(ship, headingTo(ship.pos, { x: 0, z: 0 }));
};

/** The side the target is on, and the heading that would present that broadside. */
export const broadsideHeading = (ship: Ship, target: Vec2): { side: Side; heading: number } => {
  const bearing = headingTo(ship.pos, target);
  const rel = angleDiff(ship.heading, bearing);
  return rel >= 0
    ? { side: "starboard", heading: wrapAngle(bearing - Math.PI / 2) }
    : { side: "port", heading: wrapAngle(bearing + Math.PI / 2) };
};

const nextState = (brain: AiBrain, ship: Ship, target: Ship | undefined): AiState => {
  if (!target || !target.alive) return "patrol";
  if (ship.hull < ship.spec.maxHull * brain.fleeAt && brain.fleeTime < FLEE_LIMIT) return "flee";
  const d = distance(ship.pos, target.pos);
  if (brain.state === "patrol" && d > brain.detectRange) return "patrol";
  // Once engaged, keep chasing a little further before giving up.
  if (d > brain.detectRange * 1.5) return "patrol";
  return "engage";
};

export const thinkAi = (
  brain: AiBrain, ship: Ship, target: Ship | undefined, islands: readonly Island[], dt: number,
  bounds = Infinity,
): ShipIntent => {
  if (!ship.alive) return IDLE_INTENT;
  brain.state = nextState(brain, ship, target);
  const intent: ShipIntent = { ...IDLE_INTENT };
  let desiredSail = ship.sail;

  if (brain.state === "patrol" || !target) {
    brain.aiming = null;
    brain.aimTime = 0;
    const wp = brain.waypoints[brain.waypointIndex];
    if (wp) {
      if (distance(ship.pos, wp) < 15) {
        brain.waypointIndex = (brain.waypointIndex + 1) % brain.waypoints.length;
      }
      intent.turn = steerToward(ship, headingTo(ship.pos, wp));
      desiredSail = 1;
    } else {
      desiredSail = 0;
    }
  } else if (brain.state === "flee") {
    brain.aiming = null;
    brain.fleeTime += dt;
    intent.turn = steerToward(ship, headingTo(target.pos, ship.pos));
    desiredSail = 2;
  } else {
    const d = distance(ship.pos, target.pos);
    const range = ship.spec.cannonRange;
    const { side, heading } = broadsideHeading(ship, target.pos);
    if (d > range * 0.9) {
      // Close in on an angle rather than head-on.
      intent.turn = steerToward(ship, wrapAngle(headingTo(ship.pos, target.pos) + (side === "starboard" ? -0.35 : 0.35)));
      desiredSail = 2;
    } else {
      // Too close? Open the angle a little to keep some distance.
      const push = d < range * 0.4 ? (side === "starboard" ? -0.4 : 0.4) : 0;
      intent.turn = steerToward(ship, wrapAngle(heading + push));
      desiredSail = 1;
    }

    const aligned = Math.abs(angleDiff(ship.heading, heading)) < AIM_TOLERANCE && d < range * 1.05;
    if (aligned && ship.reload[side] <= 0) {
      if (brain.aiming !== side) brain.aimTime = 0;
      brain.aiming = side;
      brain.aimTime += dt;
      if (brain.aimTime >= brain.telegraph) {
        if (side === "port") intent.firePort = true;
        else intent.fireStarboard = true;
        brain.aimTime = 0;
        brain.aiming = null;
      }
    } else {
      brain.aiming = null;
      brain.aimTime = 0;
    }
  }

  intent.turn = avoidIslands(ship, islands, avoidEdge(ship, bounds, intent.turn));
  intent.sailUp = desiredSail > ship.sail;
  intent.sailDown = desiredSail < ship.sail;
  return intent;
};
