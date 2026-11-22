import { Rng } from "../sim/rng";

export type SettlementSize = "none" | "hamlet" | "village";

interface Point { x: number; z: number }
export interface TownHouse extends Point {
  /** The front wall faces this way along the X axis, toward the lane. */
  facing: number;
  frontage: number;
  depth: number;
  eaves: number;
  rise: number;
  color: number;
  variant: "cottage" | "store" | "loft";
}
export interface TownPath { a: Point; b: Point; width: number }
export interface TownPlan {
  houses: TownHouse[];
  paths: TownPath[];
}

/** Lot and lane planning is independent of terrain meshing and furniture placement. */
export function planTown(seed: number, size: SettlementSize, side: number): TownPlan {
  const houses: TownHouse[] = [], paths: TownPath[] = [];
  if (size === "none") return { houses, paths };
  const sign = side < 0 ? -1 : 1;
  const layout = new Rng(seed ^ 0x7a2d9a1d);
  const rows = size === "village" ? 3 : 2;
  const lane = Array.from({ length: rows }, (_, row) => ({
    x: sign * layout.range(17.8, 19.2), z: (row - (rows - 1) / 2) * 7.4 + layout.range(-.4, .4),
  }));
  const entry = { x: sign * 11.6, z: lane[0]!.z - 5.4 };
  const landing = { x: lane[0]!.x, z: entry.z };
  paths.push({ a: entry, b: landing, width: 1.8 }, { a: landing, b: lane[0]!, width: 2.25 });
  const skip = size === "hamlet" ? layout.int(0, 3) : -1;
  for (const [row, cross] of lane.entries()) {
    if (row) paths.push({ a: lane[row - 1]!, b: cross, width: 2.25 });
    for (const edge of [-1, 1]) {
      const lot = row * 2 + (edge === 1 ? 1 : 0);
      if (lot === skip) continue;
      const rng = new Rng(Math.imul(lot + 1, 0x6e93b4bb) ^ seed);
      const facing = -edge * sign;
      const variant = row === 1 && edge === -1 && size === "village" ? "store"
        : rng.next() < .30 ? "loft" : "cottage";
      const depth = rng.range(2.9, 4.0);
      const door = { x: cross.x - facing * rng.range(2.65, 3.0), z: cross.z + rng.range(-.75, .75) };
      houses.push({
        x: door.x - facing * depth / 2, z: door.z, facing, depth, variant,
        frontage: rng.range(3.8, 4.7), eaves: rng.range(2.4, 2.85) + (variant === "loft" ? .7 : 0),
        rise: rng.range(1.08, 1.65), color: rng.int(0, 4),
      });
      paths.push({ a: cross, b: door, width: variant === "store" ? 1.8 : 1.1 });
    }
  }
  return { houses, paths };
}

function clearance(plan: TownPlan, x: number, z: number): number {
  // Called by terrain and each vegetation layer, mostly outside the village.
  if (!plan.houses.length || Math.abs(x) < 8.5 || Math.abs(x) > 29 || Math.abs(z) > 17) return Infinity;
  let nearest = Infinity;
  for (const h of plan.houses) {
    const dx = Math.abs(x - h.x) - h.depth / 2;
    const dz = Math.abs(z - h.z) - h.frontage / 2;
    nearest = Math.min(nearest, Math.max(dx, dz) - .45);
  }
  for (const { a, b, width } of plan.paths) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - a.x - dx * t, z - a.z - dz * t) - width / 2);
  }
  return nearest;
}

export function townGrade(plan: TownPlan, x: number, z: number): number {
  const t = 1 - Math.max(0, Math.min(1, clearance(plan, x, z) / 2.0));
  return t * t * (3 - 2 * t);
}

export function townReserved(plan: TownPlan, x: number, z: number): boolean {
  return clearance(plan, x, z) < 1.2;
}
