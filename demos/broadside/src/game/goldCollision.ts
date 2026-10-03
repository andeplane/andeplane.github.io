import { COIN_POSE_STRIDE, COIN_RADIUS, COIN_THICKNESS } from "./goldAreas";

/** The permanent hoard is one collision mesh, rather than thousands of
 * overlapping broad-phase objects. Keep every coin's saved pose and solid rim. */
export function settledGoldCollision(poses: Float32Array): { vertices: Float32Array; indices: Uint32Array } {
  const segments = 12, perCoin = segments * 2 + 2;
  const count = poses.length / COIN_POSE_STRIDE;
  const vertices = new Float32Array(count * perCoin * 3);
  const indices = new Uint32Array(count * segments * 12);
  for (let coin = 0; coin < count; coin++) {
    const p = coin * COIN_POSE_STRIDE, base = coin * perCoin;
    const qx = poses[p + 3]!, qy = poses[p + 4]!, qz = poses[p + 5]!, qw = poses[p + 6]!;
    const vertex = (index: number, x: number, y: number, z: number) => {
      const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
      vertices.set([
        poses[p]! + x + qw * tx + qy * tz - qz * ty,
        poses[p + 1]! + y + qw * ty + qz * tx - qx * tz,
        poses[p + 2]! + z + qw * tz + qx * ty - qy * tx,
      ], (base + index) * 3);
    };
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2, x = Math.cos(a) * COIN_RADIUS, z = Math.sin(a) * COIN_RADIUS;
      vertex(i, x, -COIN_THICKNESS / 2, z);
      vertex(i + segments, x, COIN_THICKNESS / 2, z);
      const next = (i + 1) % segments, b = base + i, n = base + next;
      indices.set([
        b, n, b + segments, n, n + segments, b + segments,
        base + segments * 2, n, b,
        base + segments * 2 + 1, b + segments, n + segments,
      ], (coin * segments + i) * 12);
    }
    vertex(segments * 2, 0, -COIN_THICKNESS / 2, 0);
    vertex(segments * 2 + 1, 0, COIN_THICKNESS / 2, 0);
  }
  return { vertices, indices };
}
