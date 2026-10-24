import { removedCoinPose, COIN_POSE_STRIDE, COIN_RADIUS, COIN_THICKNESS } from './goldAreas';

const CELL = .07;
const STRIDE_Y = 4096, STRIDE_Z = STRIDE_Y * 1024;


/** Keep every exterior surface of a frozen pile, including open cavities.
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
  // Only hide coins fully enclosed by other coins. Cardinal silhouettes
  // incorrectly remove the centre of cavities visible through diagonal gaps.
  // Flood exterior air so sealed microscopic pockets do not defeat culling.
  const visible = new Uint8Array(count);
  if (!occupied.size) return [];
  const decode = (key: number) => [key % STRIDE_Y, Math.floor(key / STRIDE_Y) % 1024, Math.floor(key / STRIDE_Z)];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const key of occupied.keys()) {
    const cell = decode(key);
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, cell[a]! - 1); hi[a] = Math.max(hi[a]!, cell[a]! + 1); }
  }
  const strides = [1, STRIDE_Y, STRIDE_Z];
  // A few escaped coins can span the cavern. Bound temporary air traversal;
  // retaining extra cavity faces is safer than hiding gold or allocating a
  // cavern-sized voxel volume on a phone.
  const volume = (hi[0]! - lo[0]! + 1) * (hi[1]! - lo[1]! + 1) * (hi[2]! - lo[2]! + 1);
  if (volume > 4_000_000) {
    for (const [key, coin] of occupied) {
      if (strides.some(stride => !occupied.has(key - stride) || !occupied.has(key + stride))) visible[coin] = 1;
    }
    return Array.from(visible.keys()).filter(coin => visible[coin]);
  }
  const width = hi[0]! - lo[0]! + 1, height = hi[1]! - lo[1]! + 1, depth = hi[2]! - lo[2]! + 1;
  // Dense typed buffers bound memory to eight bytes per cell, rather than
  // allocating a Set entry and boxed queue value for every empty voxel.
  const cells = new Int32Array(volume), queue = new Uint32Array(volume);
  for (const [key, coin] of occupied) {
    const [x, y, z] = decode(key);
    cells[x! - lo[0]! + (y! - lo[1]!) * width + (z! - lo[2]!) * width * height] = coin + 1;
  }
  cells[0] = -1;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const index = queue[head]!, x = index % width, y = Math.floor(index / width) % height, z = Math.floor(index / (width * height));
    const visit = (neighbour: number) => {
      const owner = cells[neighbour]!;
      if (owner > 0) visible[owner - 1] = 1;
      else if (owner === 0) { cells[neighbour] = -1; queue[tail++] = neighbour; }
    };
    if (x) visit(index - 1); if (x + 1 < width) visit(index + 1);
    if (y) visit(index - width); if (y + 1 < height) visit(index + width);
    if (z) visit(index - width * height); if (z + 1 < depth) visit(index + width * height);
  }
  const indices: number[] = [];
  for (let i = 0; i < count; i++) if (visible[i]) indices.push(i);
  return indices;
}
