import { approach, clamp, forward, wrapAngle, type Vec2 } from "./math";
import { sailEfficiency, type Wind } from "./wind";

export type ShipClass = "sloop" | "brigantine" | "galleon" | "warship";
export type Team = "player" | "pirates";
export type Side = "port" | "starboard";
/** 0 = furled, 1 = half sail, 2 = full sail. */
export type SailSetting = 0 | 1 | 2;

export interface ShipSpec {
  class: ShipClass;
  displayName: string;
  /** Metres, bow to stern. Matches the Blender generator presets. */
  length: number;
  beam: number;
  maxSpeed: number;
  acceleration: number;
  /** Radians per second at cruising speed. */
  turnRate: number;
  maxHull: number;
  cannonsPerSide: number;
  reloadTime: number;
  muzzleSpeed: number;
  cannonRange: number;
  damage: number;
  /** Gold dropped when sunk. */
  bounty: number;
}

export const SHIP_SPECS: Readonly<Record<ShipClass, ShipSpec>> = {
  sloop: {
    class: "sloop", displayName: "Sloop", length: 13, beam: 4.2,
    maxSpeed: 12, acceleration: 3.5, turnRate: 0.8, maxHull: 80,
    cannonsPerSide: 3, reloadTime: 4.5, muzzleSpeed: 34, cannonRange: 52, damage: 9, bounty: 50,
  },
  brigantine: {
    class: "brigantine", displayName: "Brigantine", length: 17, beam: 5.2,
    maxSpeed: 10.5, acceleration: 3, turnRate: 0.65, maxHull: 150,
    cannonsPerSide: 4, reloadTime: 4.2, muzzleSpeed: 36, cannonRange: 58, damage: 11, bounty: 120,
  },
  galleon: {
    class: "galleon", displayName: "Galleon", length: 22, beam: 6.6,
    maxSpeed: 11, acceleration: 3, turnRate: 0.6, maxHull: 320,
    cannonsPerSide: 6, reloadTime: 3.0, muzzleSpeed: 40, cannonRange: 68, damage: 16, bounty: 300,
  },
  warship: {
    class: "warship", displayName: "Man-o'-War", length: 28, beam: 8.2,
    maxSpeed: 8.5, acceleration: 2, turnRate: 0.42, maxHull: 450,
    cannonsPerSide: 8, reloadTime: 5.5, muzzleSpeed: 40, cannonRange: 72, damage: 9, bounty: 1000,
  },
};

const SAIL_SPEED: Readonly<Record<SailSetting, number>> = { 0: 0, 1: 0.55, 2: 1 };

/** Seconds a ship takes to slip beneath the waves. */
export const SINK_DURATION = 5;

export interface ShipIntent {
  /** -1 = hard to port (left), +1 = hard to starboard (right). */
  turn: number;
  sailUp: boolean;
  sailDown: boolean;
  firePort: boolean;
  fireStarboard: boolean;
}

export const IDLE_INTENT: Readonly<ShipIntent> = {
  turn: 0, sailUp: false, sailDown: false, firePort: false, fireStarboard: false,
};

export interface Ship {
  id: number;
  team: Team;
  spec: ShipSpec;
  pos: Vec2;
  heading: number;
  speed: number;
  angularVelocity: number;
  sail: SailSetting;
  hull: number;
  /** Seconds until each broadside is ready again. */
  reload: Record<Side, number>;
  alive: boolean;
  /** Seconds since the ship started sinking. */
  sinkTime: number;
  /** Seconds since last grounding, used to throttle bump events. */
  sinceBump: number;
}

export const createShip = (
  id: number, spec: ShipSpec, team: Team, pos: Vec2, heading: number,
): Ship => ({
  id, team, spec,
  pos: { x: pos.x, z: pos.z },
  heading: wrapAngle(heading),
  speed: 0,
  angularVelocity: 0,
  sail: 1,
  hull: spec.maxHull,
  reload: { port: 0, starboard: 0 },
  alive: true,
  sinkTime: 0,
  sinceBump: 99,
});

/** Holed hulls take on water: a ship at 0 hull sails at this fraction of full speed. */
export const DAMAGED_SPEED = 0.55;

export const targetSpeed = (ship: Ship, wind: Wind): number => {
  const integrity = DAMAGED_SPEED + (1 - DAMAGED_SPEED) * (ship.hull / ship.spec.maxHull);
  return ship.spec.maxSpeed * SAIL_SPEED[ship.sail] * sailEfficiency(ship.heading, wind) * integrity;
};

export const updateShip = (ship: Ship, intent: ShipIntent, wind: Wind, dt: number): void => {
  ship.sinceBump += dt;
  if (!ship.alive) {
    ship.sinkTime += dt;
    ship.speed = approach(ship.speed, 0, ship.spec.acceleration * 2 * dt);
    ship.angularVelocity = approach(ship.angularVelocity, 0, dt);
    ship.heading = wrapAngle(ship.heading + ship.angularVelocity * dt);
    const f = forward(ship.heading);
    ship.pos.x += f.x * ship.speed * dt;
    ship.pos.z += f.z * ship.speed * dt;
    return;
  }

  if (intent.sailUp && ship.sail < 2) ship.sail = (ship.sail + 1) as SailSetting;
  if (intent.sailDown && ship.sail > 0) ship.sail = (ship.sail - 1) as SailSetting;

  const target = targetSpeed(ship, wind);
  // Furling sails acts like a brake: slowing down is quicker than speeding up.
  const rate = target > ship.speed ? ship.spec.acceleration : ship.spec.acceleration * 1.6;
  ship.speed = approach(ship.speed, target, rate * dt);

  // Rudders bite harder with speed, but a ship can always turn a little.
  const speedFactor = clamp(0.35 + (0.65 * ship.speed) / (ship.spec.maxSpeed * 0.6), 0.35, 1);
  const desired = clamp(intent.turn, -1, 1) * ship.spec.turnRate * speedFactor;
  ship.angularVelocity = approach(ship.angularVelocity, desired, ship.spec.turnRate * 2.5 * dt);
  ship.heading = wrapAngle(ship.heading + ship.angularVelocity * dt);

  const f = forward(ship.heading);
  ship.pos.x += f.x * ship.speed * dt;
  ship.pos.z += f.z * ship.speed * dt;

  // Furling the sails reduces storm exposure; the rudder still counters gusts.
  const exposure = 0.2 + ship.sail * 0.4;
  if (wind.drift) {
    ship.pos.x += Math.sin(wind.direction) * wind.drift * exposure * dt;
    ship.pos.z += Math.cos(wind.direction) * wind.drift * exposure * dt;
  }
  if (wind.turbulence)
    ship.heading = wrapAngle(ship.heading + Math.sin(wind.direction - ship.heading) * wind.turbulence * exposure * dt);

  ship.reload.port = Math.max(0, ship.reload.port - dt);
  ship.reload.starboard = Math.max(0, ship.reload.starboard - dt);
};

/** Apply damage. Returns true if this hit sank the ship. */
export const damageShip = (ship: Ship, amount: number): boolean => {
  if (!ship.alive) return false;
  ship.hull = Math.max(0, ship.hull - amount);
  if (ship.hull === 0) {
    ship.alive = false;
    ship.sinkTime = 0;
    return true;
  }
  return false;
};

export const repairShip = (ship: Ship, amount: number): void => {
  if (!ship.alive) return;
  ship.hull = Math.min(ship.spec.maxHull, ship.hull + amount);
};

/** 0..1 readiness of a broadside, for HUD reload bars. */
export const reloadProgress = (ship: Ship, side: Side): number =>
  1 - ship.reload[side] / ship.spec.reloadTime;
