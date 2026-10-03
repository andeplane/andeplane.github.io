import type { CaveObstacle } from "./caveWalk";
import { Rng } from "../sim/rng";

export const HARBOUR_BUILDINGS = [-28, -10, 10, 28].flatMap((z, i) => [
  { x: 31, z, width: 9, depth: 11, height: 7 + i % 2 * 2, name: ["The Rusty Anchor", "Chandler", "Captain's stores", "Shipwright"][i]! },
  { x: 53, z: z + 2, width: 10, depth: 12, height: 9 + i % 3, name: ["Sailmaker", "Harbour watch", "The Golden Gull", "Cartographer"][i]! },
]);

const cargoRng = new Rng(3190);
export const HARBOUR_CARGO = Array.from({length:18},(_,i)=>({x:22+cargoRng.range(-1,1),z:-35+i*4}))
  .filter(c=>Math.abs(c.z+3)>=5);

/** Metres: the raised decks are connected by shallow, solid stairways. */
export function deckHeight(z: number): number {
  if (z < -16) return 5.4;
  if (z < -12) return 3.6 + (-12 - z) / 4 * 1.8;
  if (z > 15) return 4.8;
  if (z > 12) return 3.6 + (z - 12) / 3 * 1.2;
  return 3.6;
}
export function deckHalfWidth(z: number): number {
  const t = (z + 24) / 48;
  return t < 0.6 ? 6.7 - 1.8 * ((0.6 - t) / 0.6) ** 2
    : 1.3 + 5.4 * Math.sqrt(Math.max(0, 1 - ((t - 0.6) / 0.4) ** 2));
}
export function onGangplank(x: number, z: number): boolean {
  return x >= 5.5 && x <= 18 && z >= -5 && z <= -1;
}
export function harbourWalkable(x: number, z: number): boolean {
  return onGangplank(x, z) ||
    (z > -23.3 && z < 23.3 && Math.abs(x) < deckHalfWidth(z) - 0.55) ||
    (x > 16 && x < 63 && z > -39 && z < 40);
}
export function harbourFloor(x: number, z: number): number {
  if (onGangplank(x, z)) return 3.6 - Math.max(0, Math.min(1, (x - 6) / 11)) * 1.2;
  return x > 15 ? 2.4 : deckHeight(z);
}
export function harbourObstacles(): CaveObstacle[] {
  const obstacles: CaveObstacle[] = HARBOUR_BUILDINGS.map(b => ({
    x: b.x, z: b.z, rx: b.width * 0.72, rz: b.depth * 0.72, top: 30,
  }));
  for (const z of [-10, 3, 15]) obstacles.push({x: 0, z, rx: 0.72, rz: 0.72, top: 40});
  for (const x of [-4.6, 4.6])
    for (const z of [-7, 1, 8])
      if (!(x > 0 && z === -7)) obstacles.push({x, z, rx: 1.1, rz: 1, top: 5.2});
  for (const x of [-3.5, 3.5])
    obstacles.push({x, z: -10, rx: 0.8, rz: 0.8, top: 5.4});
  obstacles.push({x: 0, z: -21, rx: 0.7, rz: 0.55, top: 6.8});
  obstacles.push({x: -2.8, z: -19, rx: 1.45, rz: 1, top: 6.65});
  obstacles.push({x: 2.7, z: 11, rx: .6, rz: .6, top: 4.6});
  for (const z of [-23,-12,9,22,36]) obstacles.push({x:17,z,rx:.4,rz:.4,top:3.5});
  for (const z of [-28,-8,14,34]) obstacles.push({x:19,z,rx:.25,rz:.25,top:8});
  // Cargo sits outside the gangway route; include its full visible footprint.
  for (const c of HARBOUR_CARGO) obstacles.push({...c,rx:1,rz:1,top:3.7});
  return obstacles;
}
export function harbourRoom(x: number, z: number): string {
  if (x > 24) return "Port Blackwater";
  if (x > 15) return "The lantern quay";
  if (onGangplank(x, z)) return "The gangplank";
  if (z < -12) return "The captain’s deck";
  if (z > 12) return "The forecastle";
  return "Aboard the Black Pearl";
}
