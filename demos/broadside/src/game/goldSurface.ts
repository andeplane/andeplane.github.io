import { removedCoinPose, COIN_POSE_STRIDE, COIN_RADIUS, COIN_THICKNESS } from './goldAreas';

const CELL = .07;
const STRIDE_Y = 4096, STRIDE_Z = STRIDE_Y * 1024;


/** Keep the outside of a frozen pile, including its sides and underside.
 * Occupancy is used only for rendering: every surviving pose remains in saves,
 * walking support and physics. Never run this on moving coins or every frame.
 */
export function exposedGold(poses: Float32Array, count = poses.length / COIN_POSE_STRIDE): number[] {
  const occupied = new Map<number, number>();
  const margin = CELL / 2, radius = COIN_RADIUS + margin, half = COIN_THICKNESS / 2 + margin;
  for (let coin = 0; coin < count; coin++) {
    const p = coin * COIN_POSE_STRIDE;
    if (removedCoinPose(poses, p)) continue;
    const x = poses[p]!, y = poses[p + 1]!, z = poses[p + 2]!;
    const qx = poses[p + 3]!, qy = poses[p + 4]!, qz = poses[p + 5]!, qw = poses[p + 6]!;
    const nx = 2 * (qx * qy - qz * qw), ny = 1 - 2 * (qx * qx + qz * qz), nz = 2 * (qy * qz + qx * qw);
    const extent = (n: number) => Math.sqrt(Math.max(0, 1 - n * n)) * radius + Math.abs(n) * half;
    const ex = extent(nx), ey = extent(ny), ez = extent(nz);
    for (let gx = Math.ceil((x - ex) / CELL); gx <= Math.floor((x + ex) / CELL); gx++) {
      const dx = gx * CELL - x;
      for (let gy = Math.ceil((y - ey) / CELL); gy <= Math.floor((y + ey) / CELL); gy++) {
        const dy = gy * CELL - y;
        for (let gz = Math.ceil((z - ez) / CELL); gz <= Math.floor((z + ez) / CELL); gz++) {
          const dz = gz * CELL - z, normal = dx * nx + dy * ny + dz * nz;
          if (Math.abs(normal) > half || dx * dx + dy * dy + dz * dz - normal * normal > radius * radius) continue;
          // Numeric keys avoid strings/objects for the hundreds of thousands of
          // cells. The cave bounds fit these non-overlapping integer ranges.
          occupied.set(gx + 2048 + (gy + 128) * STRIDE_Y + (gz + 2048) * STRIDE_Z, coin);
        }
      }
    }
  }
  // Six orthographic silhouettes retain top/bottom and all four sides. Small
  // cavities inside the stack do not make buried coins count as exposed.
  const axes = [new Map<number, [number, number]>(), new Map<number, [number, number]>(), new Map<number, [number, number]>()];
  const decode = (key: number) => {
    const x = key % STRIDE_Y, y = Math.floor(key / STRIDE_Y) % 1024, z = Math.floor(key / STRIDE_Z);
    return [x, y, z];
  };
  for (const key of occupied.keys()) {
    const [x, y, z] = decode(key) as [number, number, number];
    const columns = [y + z * 1024, x + z * STRIDE_Y, x + y * STRIDE_Y], values = [x, y, z];
    for (let a = 0; a < 3; a++) {
      const bounds = axes[a]!.get(columns[a]!);
      if (!bounds) axes[a]!.set(columns[a]!, [values[a]!, values[a]!]);
      else { bounds[0] = Math.min(bounds[0], values[a]!); bounds[1] = Math.max(bounds[1], values[a]!); }
    }
  }
  const visible = new Uint8Array(count);
  for (const [key, coin] of occupied) {
    if (visible[coin]) continue;
    const [x, y, z] = decode(key) as [number, number, number];
    const columns = [y + z * 1024, x + z * STRIDE_Y, x + y * STRIDE_Y], values = [x, y, z];
    for (let a = 0; a < 3; a++) {
      const [lo, hi] = axes[a]!.get(columns[a]!)!;
      if (values[a] === lo || values[a] === hi) { visible[coin] = 1; break; }
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < count; i++) if (visible[i]) indices.push(i);
  return indices;
}
