import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";

type Height = (x: number, z: number) => number;

/** Edits the island's own regular CreateGround grid. The walking surface uses the
 * same diagonal and the same three vertices as each visible Babylon triangle. */
export class ExcavationSurface {
  private readonly original: Float32Array;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly normals: Float32Array;
  private readonly edited = new Set<number>();
  private readonly columns: number;
  private readonly rows: number;
  private readonly dx: number;
  private readonly dz: number;

  constructor(
    private readonly mesh: Mesh,
    private readonly naturalHeight: Height,
  ) {
    this.original = Float32Array.from(mesh.getVerticesData("position")!);
    this.positions = this.original.slice();
    this.normals = Float32Array.from(mesh.getVerticesData("normal")!);
    this.colors = Float32Array.from(mesh.getVerticesData("color")!);
    let columns = 1;
    while (columns * 3 < this.original.length && this.original[columns * 3 + 2] === this.original[2]) columns++;
    this.columns = columns;
    this.rows = this.original.length / (3 * columns);
    this.dx = this.original[3]! - this.original[0]!;
    this.dz = this.original[columns * 3 + 2]! - this.original[2]!;
    mesh.setVerticesData("position", this.positions, true);
    mesh.setVerticesData("normal", this.normals, true);
    mesh.setVerticesData("color", this.colors, true);
  }

  heightAt(x: number, z: number): number {
    const u = (x - this.original[0]!) / this.dx,
      v = (z - this.original[2]!) / this.dz;
    const col = Math.floor(u),
      row = Math.floor(v);
    if (col < 0 || row < 0 || col >= this.columns - 1 || row >= this.rows - 1) return this.naturalHeight(x, z);
    const a = row * this.columns + col,
      b = a + 1,
      c = a + this.columns,
      d = c + 1;
    if (!this.edited.has(a) && !this.edited.has(b) && !this.edited.has(c) && !this.edited.has(d))
      return this.naturalHeight(x, z);
    const fx = u - col,
      fz = v - row,
      p = this.positions;
    const ya = p[a * 3 + 1]!,
      yb = p[b * 3 + 1]!,
      yc = p[c * 3 + 1]!,
      yd = p[d * 3 + 1]!;
    return fx >= fz ? ya * (1 - fx) + yb * (fx - fz) + yd * fz : ya * (1 - fz) + yc * (fz - fx) + yd * fx;
  }

  scoop(x: number, z: number, count: number, successful: boolean, angle: number, palette: Color3[]): void {
    const radius = (successful ? 1.31 : 1.05) + Math.min(count - 1, 3) * 0.09;
    const reach = radius * 1.5,
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    const col = (x - this.original[0]!) / this.dx,
      row = (z - this.original[2]!) / this.dz;
    const cols = Math.ceil(reach / Math.abs(this.dx)),
      rows = Math.ceil(reach / Math.abs(this.dz));
    const radial = (dx: number, dz: number) =>
      Math.hypot((dx * cs + dz * sn) / radius, (dz * cs - dx * sn) / (radius * 0.87));
    let cut = 0.29;
    if (successful) {
      const i = Math.floor(col),
        j = Math.floor(row),
        u = col - i,
        v = row - j;
      const kernel = (c: number, r: number) =>
        Math.max(0, 1 - radial((c - col) * this.dx, (r - row) * this.dz) ** 2);
      // Compensate for the target falling between vertices: every chest is buried
      // at the same depth whether the spade lands on a grid vertex or a diagonal.
      const centre =
        kernel(i, j) * (1 - Math.max(u, v)) +
        kernel(i + 1, j + 1) * Math.min(u, v) +
        (u >= v ? kernel(i + 1, j) * (u - v) : kernel(i, j + 1) * (v - u));
      const depth = [0.28, 0.34, 0.38][Math.min(count, 3) - 1]!;
      cut = depth / Math.max(0.3, centre);
    }
    for (let j = Math.max(0, Math.floor(row) - rows); j <= Math.min(this.rows - 1, Math.ceil(row) + rows); j++) {
      for (
        let i = Math.max(0, Math.floor(col) - cols);
        i <= Math.min(this.columns - 1, Math.ceil(col) + cols);
        i++
      ) {
        const v = j * this.columns + i,
          p = 3 * v;
        const dx = this.positions[p]! - x,
          dz = this.positions[p + 2]! - z;
        const along = (dx * cs + dz * sn) / radius,
          across = (dz * cs - dx * sn) / (radius * 0.87);
        const r = Math.hypot(along, across);
        if (r >= 1.4) continue;
        const bowl = Math.max(0, 1 - r * r);
        const lip = Math.max(0, 1 - Math.abs(r - 1.08) / 0.32);
        const offset = this.positions[p + 1]! - this.original[p + 1]!;
        const delta = -cut * bowl + 0.17 * lip * Math.max(0.12, along);
        this.positions[p + 1] =
          this.original[p + 1]! +
          Math.max(Math.min(offset, successful ? -1.95 : -1.08), Math.min(0.34, offset + delta));
        this.edited.add(v);
        const exposed = Math.min(1, bowl * 1.4 + lip * 0.67);
        const tint = bowl > 0.36 ? palette[0]! : r < 1 ? palette[1]! : palette[2]!;
        const c = v * 4;
        this.colors[c] = this.colors[c]! + (tint.r - this.colors[c]!) * exposed;
        this.colors[c + 1] = this.colors[c + 1]! + (tint.g - this.colors[c + 1]!) * exposed;
        this.colors[c + 2] = this.colors[c + 2]! + (tint.b - this.colors[c + 2]!) * exposed;
      }
    }
    VertexData.ComputeNormals(this.positions, this.mesh.getIndices()!, this.normals);
    this.mesh.updateVerticesData("position", this.positions, true);
    this.mesh.updateVerticesData("normal", this.normals);
    this.mesh.updateVerticesData("color", this.colors);
  }
}
