import {
  ballHitsShip,
  canFire,
  findAim,
  fireBroadside,
  stepBall,
  type Cannonball,
  type Vec3,
} from "./cannons";
import { distance, length, wrapCoordinate, type Vec2 } from "./math";
import { Rng } from "./rng";
import {
  createShip,
  damageShip,
  IDLE_INTENT,
  SINK_DURATION,
  updateShip,
  type Ship,
  type ShipIntent,
  type ShipSpec,
  type Side,
  type Team,
} from "./ships";
import { shiftWind, type Wind } from "./wind";

export interface Island {
  pos: Vec2;
  radius: number;
}

export type SimEvent =
  | { type: "fire"; shipId: number; side: Side; muzzles: Vec3[] }
  | { type: "splash"; x: number; z: number }
  | {
      type: "hit";
      shipId: number;
      x: number;
      y: number;
      z: number;
      damage: number;
    }
  | { type: "sunk"; shipId: number }
  | { type: "removed"; shipId: number }
  | { type: "bump"; shipId: number; x: number; z: number };

export interface WorldConfig {
  seed: number;
  wind: Wind;
  /** Radius of the playable sea around the origin. */
  bounds: number;
  islands: Island[];
  /** How well each team's gun crews lead moving targets (0..1). */
  gunnery?: Partial<Record<Team, number>>;
}

export const DEFAULT_GUNNERY: Readonly<Record<Team, number>> = {
  player: 1,
  pirates: 0.5,
};

/** Fixed simulation step. Rendering interpolates; the sim never varies. */
export const SIM_DT = 1 / 60;

export class World {
  periodic = false;
  readonly ships: Ship[] = [];
  readonly balls: Cannonball[] = [];
  readonly islands: Island[];
  readonly bounds: number;
  readonly rng: Rng;
  wind: Wind;
  windField?: (time: number) => Wind;
  time = 0;
  /** Events produced by the most recent step. */
  events: SimEvent[] = [];

  private readonly baseWind: number;
  private readonly gunnery: Record<Team, number>;
  private readonly intents = new Map<number, ShipIntent>();
  private nextShipId = 1;
  private nextBallId = 1;

  constructor(config: WorldConfig) {
    this.rng = new Rng(config.seed);
    this.wind = { ...config.wind };
    this.baseWind = config.wind.direction;
    this.bounds = config.bounds;
    this.gunnery = { ...DEFAULT_GUNNERY, ...config.gunnery };
    this.islands = config.islands.map((i) => ({
      pos: { ...i.pos },
      radius: i.radius,
    }));
  }

  addShip(spec: ShipSpec, team: Team, pos: Vec2, heading: number): Ship {
    const ship = createShip(this.nextShipId++, spec, team, pos, heading);
    this.ships.push(ship);
    return ship;
  }

  getShip(id: number): Ship | undefined {
    return this.ships.find((s) => s.id === id);
  }

  setIntent(shipId: number, intent: ShipIntent): void {
    this.intents.set(shipId, intent);
  }

  step(dt: number = SIM_DT): SimEvent[] {
    this.events = [];
    this.time += dt;
    this.wind = this.windField?.(this.time) ?? shiftWind(this.wind, this.time, this.baseWind);

    for (const ship of this.ships) {
      const intent = this.intents.get(ship.id) ?? IDLE_INTENT;
      this.handleFiring(ship, intent);
      updateShip(ship, intent, this.wind, dt);
    }
    // Edge-triggered intents (sail changes) apply once.
    this.intents.clear();

    this.resolveIslands();
    this.resolveShipCollisions();
    this.resolveBounds();
    this.stepBalls(dt);
    this.removeSunkShips();
    return this.events;
  }

  private handleFiring(ship: Ship, intent: ShipIntent): void {
    const fire = (side: Side) => {
      if (!canFire(ship, side)) return;
      const aim = findAim(ship, side, this.ships, this.gunnery[ship.team]);
      const balls = fireBroadside(
        ship,
        side,
        this.rng,
        () => this.nextBallId++,
        aim,
      );
      this.balls.push(...balls);
      this.events.push({
        type: "fire",
        shipId: ship.id,
        side,
        muzzles: balls.map((b) => ({ ...b.pos })),
      });
    };
    if (intent.firePort) fire("port");
    if (intent.fireStarboard) fire("starboard");
  }

  private resolveIslands(): void {
    for (const ship of this.ships) {
      for (const island of this.islands) {
        const reach = island.radius + ship.spec.beam * 0.6;
        const ix = this.periodic ? ship.pos.x - wrapCoordinate(ship.pos.x - island.pos.x, this.bounds) : island.pos.x;
        const iz = this.periodic ? ship.pos.z - wrapCoordinate(ship.pos.z - island.pos.z, this.bounds) : island.pos.z;
        const d = Math.hypot(ship.pos.x - ix, ship.pos.z - iz);
        if (d >= reach || d === 0) continue;
        const nx = (ship.pos.x - ix) / d;
        const nz = (ship.pos.z - iz) / d;
        ship.pos.x = ix + nx * reach;
        ship.pos.z = iz + nz * reach;
        ship.speed = Math.min(ship.speed, 1.5);
        if (ship.sinceBump > 1) {
          ship.sinceBump = 0;
          this.events.push({
            type: "bump",
            shipId: ship.id,
            x: ship.pos.x,
            z: ship.pos.z,
          });
        }
      }
    }
  }

  private resolveShipCollisions(): void {
    const ships = this.ships.filter((s) => s.alive);
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i]!;
        const b = ships[j]!;
        const minDist = (a.spec.length + b.spec.length) * 0.3;
        const d = distance(a.pos, b.pos);
        if (d >= minDist) continue;
        const nx = d === 0 ? 1 : (b.pos.x - a.pos.x) / d;
        const nz = d === 0 ? 0 : (b.pos.z - a.pos.z) / d;
        const push = (minDist - d) / 2;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        a.speed *= 0.9;
        b.speed *= 0.9;
      }
    }
  }

  private resolveBounds(): void {
    for (const ship of this.ships) {
      if (this.periodic) {
        ship.pos.x = wrapCoordinate(ship.pos.x, this.bounds);
        ship.pos.z = wrapCoordinate(ship.pos.z, this.bounds);
        continue;
      }
      const d = length(ship.pos);
      if (d <= this.bounds) continue;
      ship.pos.x *= this.bounds / d;
      ship.pos.z *= this.bounds / d;
      ship.speed = Math.min(ship.speed, 3);
    }
  }

  private stepBalls(dt: number): void {
    for (const ball of this.balls) {
      stepBall(ball, dt);
      if (this.periodic) {
        ball.pos.x = wrapCoordinate(ball.pos.x, this.bounds);
        ball.pos.z = wrapCoordinate(ball.pos.z, this.bounds);
      }
      for (const ship of this.ships) {
        if (!ballHitsShip(ball, ship)) continue;
        ball.alive = false;
        this.events.push({
          type: "hit",
          shipId: ship.id,
          x: ball.pos.x,
          y: ball.pos.y,
          z: ball.pos.z,
          damage: ball.damage,
        });
        if (damageShip(ship, ball.damage))
          this.events.push({ type: "sunk", shipId: ship.id });
        break;
      }
      if (ball.alive && ball.pos.y <= 0) {
        ball.alive = false;
        this.events.push({ type: "splash", x: ball.pos.x, z: ball.pos.z });
      }
    }
    for (let i = this.balls.length - 1; i >= 0; i--) {
      if (!this.balls[i]!.alive) this.balls.splice(i, 1);
    }
  }

  private removeSunkShips(): void {
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const ship = this.ships[i]!;
      if (!ship.alive && ship.sinkTime > SINK_DURATION) {
        this.ships.splice(i, 1);
        this.events.push({ type: "removed", shipId: ship.id });
      }
    }
  }
}

/** Accumulates real frame time into fixed sim steps. */
export class FixedStepper {
  private accumulator = 0;

  reset(): void {
    this.accumulator = 0;
  }

  constructor(
    private readonly step: () => void,
    private readonly dt: number = SIM_DT,
    private readonly maxSteps = 5,
  ) {}

  /** Advance by real elapsed seconds. Returns interpolation alpha (0..1). */
  advance(elapsed: number): number {
    this.accumulator += Math.min(elapsed, this.dt * this.maxSteps);
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      this.step();
      this.accumulator -= this.dt;
      steps++;
    }
    return this.accumulator / this.dt;
  }
}
