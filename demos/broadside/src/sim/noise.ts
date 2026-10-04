/** Seeded gradient noise; adjacent points share the same lattice gradients. */
export class PerlinNoise {
  constructor(private seed: number) {}
  private gradient(x: number, z: number, dx: number, dz: number): number {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ this.seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const a = (h & 7) * Math.PI / 4;
    return Math.cos(a) * dx + Math.sin(a) * dz;
  }
  at(x: number, z: number): number {
    const ix = Math.floor(x), iz = Math.floor(z), dx = x - ix, dz = z - iz;
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = fade(dx), v = fade(dz);
    const a = this.gradient(ix, iz, dx, dz), b = this.gradient(ix + 1, iz, dx - 1, dz);
    const c = this.gradient(ix, iz + 1, dx, dz - 1), d = this.gradient(ix + 1, iz + 1, dx - 1, dz - 1);
    return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) * 1.4142;
  }
  fractal(x: number, z: number): number {
    let value = 0, amplitude = .57;
    for (let i = 0; i < 4; i++) {
      value += this.at(x, z) * amplitude;
      x = x * 2.03 + 19.3; z = z * 2.03 - 7.1; amplitude *= .5;
    }
    return value;
  }
}
