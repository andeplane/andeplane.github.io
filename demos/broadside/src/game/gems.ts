import { removedCoinPose } from "./goldAreas";

/** Bonus stones never replace coins or alter the player's earned currency. */
export const GEM_LIMIT = 32;
export const gemCount = (gold: number): number => gold > 0 ? Math.min(GEM_LIMIT, Math.ceil(gold / 250) * 4) : 0;
export const GEM_NAMES = ["diamonds", "rubies", "emeralds", "sapphires"] as const;

/** The rendered facets and Rapier convex hull share these exact vertices. */
export function gemShape(kind: number): { vertices: Float32Array; indices: number[] } {
  const positions: number[] = [], indices: number[] = [];
  const sx = kind === 2 ? 1.1 : kind === 0 ? 1 : .88;
  const sz = kind === 2 ? .65 : sx;
  for (const [radius, y] of [[.12, .16], [.27, 0]]) for (let j = 0; j < 8; j++) {
    const a = j * Math.PI / 4;
    positions.push(Math.cos(a) * radius! * sx, y!, Math.sin(a) * radius! * sz);
  }
  positions.push(0, -.25, 0, 0, .16, 0);
  for (let j = 0; j < 8; j++) {
    const n = (j + 1) % 8;
    indices.push(17, n, j, j, n, j + 8, n, n + 8, j + 8, j + 8, n + 8, 16);
  }
  return { vertices: new Float32Array(positions), indices };
}

/** Deterministic, separated starting points above the actual saved gold surface. */
export function gemSeeds(coins: Float32Array, count: number, area: { x: number; z: number }, floor: (x: number, z: number) => number): Float32Array {
  const poses = new Float32Array(count * 7);
  for (let i = 0; i < count; i++) {
    const angle = i * 2.3999632297, radius = .45 + Math.sqrt(i / Math.max(1, count)) * 1.8;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    let y = floor(x + area.x, z + area.z);
    // Include a stone's full footprint, so it starts above tilted coin rims.
    for (let p = 0; p < coins.length; p += 7) if (!removedCoinPose(coins, p) && Math.hypot(coins[p]! - x, coins[p + 2]! - z) < .65) y = Math.max(y, coins[p + 1]! + .15);
    const a = i * .73;
    poses.set([x, y + .65, z, Math.sin(a / 2), 0, 0, Math.cos(a / 2)], i * 7);
  }
  return poses;
}
