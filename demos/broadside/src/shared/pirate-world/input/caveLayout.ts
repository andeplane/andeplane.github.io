/** Connected walkable chambers. Canal banks are solid; the central bridge crosses the water. */
export function caveWalkable(x: number, z: number): boolean {
  const inside = (a: number, b: number, c: number, d: number) =>
    x >= a && x <= b && z >= c && z <= d;
  return (
    inside(-13, 13, -12, 19) ||
    inside(-2.6, 2.6, 18, 30) ||
    (inside(-10, 10, 29, 47) && (z < 37 || z > 40 || Math.abs(x) <= 2)) ||
    inside(9, 23, 33, 36) ||
    inside(22, 34, 28, 46) ||
    inside(-2, 2, -17, -11)
  );
}
export function caveRoom(x: number, z: number): string {
  if (x > 20) return "The glowing grotto";
  if (x > 10 && z > 29) return "Smuggler’s passage";
  if (z > 28) return "The king’s vault";
  if (z > 18) return "The lantern passage";
  return "The treasure cave";
}

export function caveFloor(x: number, z: number): number {
  if (z > 37 && z < 40 && Math.abs(x) <= 11) return Math.abs(x) > 2 ? -1.1 : 0;
  return (
    0.16 * Math.sin(x * 0.73 + z * 0.31) +
    0.12 * Math.cos(z * 0.58 - x * 0.24) +
    0.05 * Math.sin(x * 2.3 + z * 1.6)
  );
}
