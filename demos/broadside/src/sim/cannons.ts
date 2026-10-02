import { distance, forward, starboard, toLocal } from "./math";
import type { Rng } from "./rng";
import type { Ship, Side, Team } from "./ships";

export const GRAVITY = 9.8;
/** Height of the gun deck above the waterline. */
export const MUZZLE_HEIGHT = 1.6;
/** Balls above this height fly over a hull. */
export const HULL_HEIGHT = 5;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Cannonball {
  id: number;
  ownerId: number;
  team: Team;
  pos: Vec3;
  vel: Vec3;
  damage: number;
  alive: boolean;
}

/** Launch elevation (radians) that carries a ball `range` metres on flat water. */
export const elevationForRange = (range: number, speed: number): number => {
  const s = (GRAVITY * range) / (speed * speed);
  if (s >= 1) return Math.PI / 4;
  return 0.5 * Math.asin(Math.max(0, s));
};

/** Horizontal distance a ball travels before splashing down from `height`. */
export const flightRange = (speed: number, elevation: number, height: number): number => {
  const vh = speed * Math.cos(elevation);
  const vy = speed * Math.sin(elevation);
  const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * height)) / GRAVITY;
  return vh * t;
};

/**
 * Elevation that lands a ball exactly `range` metres away when fired from
 * `height` above the water. Bisection on the monotonic flight-range curve.
 */
export const elevationForTarget = (range: number, speed: number, height: number): number => {
  let lo = -0.35;
  let hi = Math.PI / 4;
  if (flightRange(speed, hi, height) <= range) return hi;
  if (flightRange(speed, lo, height) >= range) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (flightRange(speed, mid, height) < range) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

export const sideVector = (heading: number, side: Side) => {
  const r = starboard(heading);
  return side === "starboard" ? r : { x: -r.x, z: -r.z };
};

export const canFire = (ship: Ship, side: Side): boolean => ship.alive && ship.reload[side] <= 0;

/** Muzzle positions in world space, evenly spaced along the hull. */
export const muzzlePositions = (ship: Ship, side: Side): Vec3[] => {
  const n = ship.spec.cannonsPerSide;
  const f = forward(ship.heading);
  const out = sideVector(ship.heading, side);
  const span = ship.spec.length * 0.55;
  const result: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const along = t * span;
    const offset = ship.spec.beam * 0.5;
    result.push({
      x: ship.pos.x + f.x * along + out.x * offset,
      y: MUZZLE_HEIGHT,
      z: ship.pos.z + f.z * along + out.z * offset,
    });
  }
  return result;
};

/** Closest a gun crew will lower its aim to. */
export const MIN_AIM = 12;
/** Half-angle of the arc, either side of abeam, in which the crew spots targets. */
export const AIM_ARC = 0.9;

export interface AimSolution {
  /** Distance from the ship's centre to the aim point. */
  distance: number;
  /** Radians to swing the guns away from straight abeam. */
  yaw: number;
}

/** Furthest the guns can swing fore or aft. */
export const MAX_YAW = 0.6;

const velocityOf = (ship: Ship) => {
  const f = forward(ship.heading);
  return { x: f.x * ship.speed, z: f.z * ship.speed };
};

/**
 * The gun crew finds the range and leads the target: aim at the nearest enemy
 * off this side within reach, predicting where it will be when the balls land.
 * `lead` (0..1) is how well the crew predicts movement. Keeps aiming simple for
 * young captains: point your side at a ship and the balls land on it.
 */
export const findAim = (ship: Ship, side: Side, ships: readonly Ship[], lead = 1): AimSolution => {
  const max = ship.spec.cannonRange;
  const out = sideVector(ship.heading, side);
  let target: Ship | undefined;
  let bestDist = Infinity;
  for (const other of ships) {
    if (!other.alive || other.team === ship.team) continue;
    const d = distance(ship.pos, other.pos);
    if (d > max * 1.1 || d >= bestDist) continue;
    const cos = ((other.pos.x - ship.pos.x) * out.x + (other.pos.z - ship.pos.z) * out.z) / d;
    if (cos < Math.cos(AIM_ARC)) continue;
    bestDist = d;
    target = other;
  }
  if (!target) return { distance: max * 0.92, yaw: 0 };

  // Balls inherit our velocity, so only relative motion needs leading.
  const tv = velocityOf(target);
  const sv = velocityOf(ship);
  const rel = { x: (tv.x - sv.x) * lead, z: (tv.z - sv.z) * lead };
  let aimX = target.pos.x;
  let aimZ = target.pos.z;
  for (let i = 0; i < 3; i++) {
    const flight = Math.hypot(aimX - ship.pos.x, aimZ - ship.pos.z) / (ship.spec.muzzleSpeed * 0.97);
    aimX = target.pos.x + rel.x * flight;
    aimZ = target.pos.z + rel.z * flight;
  }
  const dx = aimX - ship.pos.x;
  const dz = aimZ - ship.pos.z;
  const d = Math.hypot(dx, dz);
  const yaw = Math.atan2(out.x * dz - out.z * dx, out.x * dx + out.z * dz);
  return {
    // Aim at the near side of the hull so long shots still connect.
    distance: Math.min(max, Math.max(MIN_AIM, d - target.spec.beam * 0.3)),
    yaw: Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw)),
  };
};

/**
 * Fire a broadside. Each cannon gets a little random spread so volleys
 * scatter naturally. Caller must check `canFire` first.
 */
export const fireBroadside = (
  ship: Ship, side: Side, rng: Rng, nextId: () => number,
  aim: AimSolution = { distance: ship.spec.cannonRange * 0.92, yaw: 0 },
): Cannonball[] => {
  const spec = ship.spec;
  // Distances are measured from the ship's centre; balls leave from the hull side.
  const fromMuzzle = Math.max(1, aim.distance - spec.beam * 0.5);
  const elevation = elevationForTarget(fromMuzzle, spec.muzzleSpeed, MUZZLE_HEIGHT);
  const out = sideVector(ship.heading, side);
  const f = forward(ship.heading);
  const balls = muzzlePositions(ship, side).map((pos) => {
    const yaw = aim.yaw + rng.range(-0.035, 0.035);
    const speed = spec.muzzleSpeed * rng.range(0.95, 1.04);
    const el = elevation + rng.range(-0.02, 0.02);
    const dirX = out.x * Math.cos(yaw) - out.z * Math.sin(yaw);
    const dirZ = out.x * Math.sin(yaw) + out.z * Math.cos(yaw);
    const h = speed * Math.cos(el);
    return {
      id: nextId(),
      ownerId: ship.id,
      team: ship.team,
      pos: pos,
      vel: {
        x: dirX * h + f.x * ship.speed,
        y: speed * Math.sin(el),
        z: dirZ * h + f.z * ship.speed,
      },
      damage: spec.damage,
      alive: true,
    };
  });
  ship.reload[side] = spec.reloadTime;
  return balls;
};

export const stepBall = (ball: Cannonball, dt: number): void => {
  ball.vel.y -= GRAVITY * dt;
  ball.pos.x += ball.vel.x * dt;
  ball.pos.y += ball.vel.y * dt;
  ball.pos.z += ball.vel.z * dt;
};

/** Hulls are treated as ellipses in the ship's local frame. */
export const ballHitsShip = (ball: Cannonball, ship: Ship): boolean => {
  if (!ship.alive || ball.ownerId === ship.id || ball.team === ship.team) return false;
  if (ball.pos.y > HULL_HEIGHT || ball.pos.y < -0.5) return false;
  const local = toLocal(ball.pos, ship.pos, ship.heading);
  const a = ship.spec.beam * 0.5 + 0.3;
  const b = ship.spec.length * 0.5;
  return (local.x * local.x) / (a * a) + (local.z * local.z) / (b * b) <= 1;
};
