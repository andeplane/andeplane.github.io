// 2D simplex lattice noise. A seed permutes the gradient directions, so nearby
// samples stay coherent while each island gets its own coast and relief.
import { Rng } from "../sim/rng";

const skew = (Math.sqrt(3) - 1) / 2;
const unskew = (3 - Math.sqrt(3)) / 6;
const gx = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const gz = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1];

export function simplexField(seed: number): (x: number, z: number) => number {
  const rng = new Rng(seed);
  const perm = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    [perm[i], perm[j]] = [perm[j]!, perm[i]!];
  }
  function corner(i: number, j: number, x: number, z: number): number {
    const a = 0.5 - x * x - z * z;
    if (a <= 0) return 0;
    const g = perm[(i + perm[j & 255]!) & 255]! % 12;
    return a * a * a * a * (gx[g]! * x + gz[g]! * z);
  }
  return (x, z) => {
    const s = (x + z) * skew;
    const i = Math.floor(x + s),
      j = Math.floor(z + s);
    const t = (i + j) * unskew;
    const u = x - (i - t),
      v = z - (j - t);
    const di = u > v ? 1 : 0,
      dj = 1 - di;
    return (
      70 *
      (corner(i, j, u, v) +
        corner(i + di, j + dj, u - di + unskew, v - dj + unskew) +
        corner(i + 1, j + 1, u - 1 + 2 * unskew, v - 1 + 2 * unskew))
    );
  };
}
