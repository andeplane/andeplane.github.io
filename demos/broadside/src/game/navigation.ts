import { angleDiff, clamp, distance, headingTo, type Vec2 } from "../sim/math";
import { IDLE_INTENT, type Ship, type ShipIntent } from "../sim/ships";
import type { Island } from "../sim/world";
import type { Wind } from "../sim/wind";

const segmentClear = (
  a: Vec2,
  b: Vec2,
  islands: readonly Island[],
  clearance: number,
) => {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    l2 = dx * dx + dz * dz;
  return islands.every((i) => {
    const t = l2
      ? clamp(((i.pos.x - a.x) * dx + (i.pos.z - a.z) * dz) / l2, 0, 1)
      : 0;
    return (
      Math.hypot(a.x + dx * t - i.pos.x, a.z + dz * t - i.pos.z) >
      i.radius + clearance
    );
  });
};

/** Visibility graph around beaches. A course can go around islands instead of steering into them. */
export function planRoute(
  start: Vec2,
  goal: Vec2,
  islands: readonly Island[],
  clearance = 6,
): Vec2[] {
  if (segmentClear(start, goal, islands, clearance)) return [{ ...goal }];
  const nodes: Vec2[] = [{ ...start }, { ...goal }];
  for (const i of islands) {
    const r = (i.radius + clearance + 3) / Math.cos(Math.PI / 12);
    for (let n = 0; n < 12; n++) {
      const a = (n * Math.PI) / 6;
      const p = { x: i.pos.x + Math.sin(a) * r, z: i.pos.z + Math.cos(a) * r };
      if (islands.every((o) => distance(p, o.pos) > o.radius + clearance))
        nodes.push(p);
    }
  }
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    done = new Set<number>();
  costs[0] = 0;
  while (done.size < nodes.length) {
    let current = -1;
    for (let n = 0; n < nodes.length; n++)
      if (!done.has(n) && (current < 0 || costs[n]! < costs[current]!))
        current = n;
    if (current < 0 || !Number.isFinite(costs[current]!)) break;
    if (current === 1) {
      const route: Vec2[] = [];
      for (let n = 1; n > 0; n = previous[n]!) route.unshift(nodes[n]!);
      return route;
    }
    done.add(current);
    for (let n = 0; n < nodes.length; n++) {
      if (
        done.has(n) ||
        !segmentClear(nodes[current]!, nodes[n]!, islands, clearance)
      )
        continue;
      const cost = costs[current]! + distance(nodes[current]!, nodes[n]!);
      if (cost < costs[n]!) {
        costs[n] = cost;
        previous[n] = current;
      }
    }
  }
  // If the ship is already grazing land, first sail away from the island.
  const near = islands.find(
    (i) => distance(start, i.pos) < i.radius + clearance + 4,
  );
  if (near) {
    const a = headingTo(near.pos, start),
      r = near.radius + clearance + 8;
    return [
      { x: near.pos.x + Math.sin(a) * r, z: near.pos.z + Math.cos(a) * r },
      { ...goal },
    ];
  }
  return [{ ...goal }];
}

export class Navigator {
  route: Vec2[] = [];
  target: Vec2 | null = null;
  setGoal(ship: Ship, goal: Vec2, islands: readonly Island[], wind?: Wind): void {
    this.target = { ...goal };
    this.route = planRoute(ship.pos, goal, islands, ship.spec.beam * 0.6 + 3 + (wind?.drift ? 9 : 0));
  }
  clear(): void {
    this.target = null;
    this.route = [];
  }
  read(ship: Ship, wind?: Wind): ShipIntent {
    if (!this.target) return { ...IDLE_INTENT };
    while (this.route.length > 1 && distance(ship.pos, this.route[0]!) < (wind?.drift ? 4 : 9))
      this.route.shift();
    const wp = this.route[0] ?? this.target;
    const d = distance(ship.pos, this.target);
    const course = headingTo(ship.pos, wp);
    const crosswind = wind?.drift ? Math.sin(wind.direction - course) * wind.drift * (0.2 + ship.sail * 0.4) : 0;
    const correction = Math.asin(clamp(crosswind / Math.max(3, ship.speed), -0.6, 0.6));
    const angle = angleDiff(ship.heading, course - correction);
    const desiredSail = d < 13 ? 0 : Math.abs(angle) > 0.9 || d < 28 ? 1 : 2;
    return {
      ...IDLE_INTENT,
      turn: d < 10 ? 0 : clamp(angle * 2.8, -1, 1),
      sailUp: ship.sail < desiredSail,
      sailDown: ship.sail > desiredSail,
    };
  }
}
