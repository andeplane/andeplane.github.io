import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";

export interface CabinCut { min: Vector3; max: Vector3; }

// Clear the fitted lower cabin and its outward window views. The upper starboard
// staircase remains intact; a fitted timber soffit separates it from the room.
export const PRIVATE_CABIN_CUTS: CabinCut[] = [
  { min: new Vector3(-8, 4.24, -100), max: new Vector3(2.4, 10.05, -10.65) },
  { min: new Vector3(2.4, 4.24, -100), max: new Vector3(8, 7.05, -10.65) },
  { min: new Vector3(2.4, 7.05, -100), max: new Vector3(8, 10.05, -16.1) },
  { min: new Vector3(-1.35, 4.24, -12.2), max: new Vector3(1.35, 8.4, -8.8) },
];

interface CutVertex { point: Vector3; index?: number; values: number[][]; }
const axes = ["x", "y", "z"] as const;
const inside = (p: Vector3, box: CabinCut) => axes.every(axis => p[axis] >= box.min[axis] - 1e-6 && p[axis] <= box.max[axis] + 1e-6);

/** Subtract a convex box from a triangle/polygon, preserving the exterior pieces. */
function outsideBox(polygon: CutVertex[], box: CabinCut): CutVertex[][] {
  if (axes.some(axis => polygon.every(v => v.point[axis] < box.min[axis]) || polygon.every(v => v.point[axis] > box.max[axis]))) return [polygon];
  if (polygon.every(v => inside(v.point, box))) return [];
  let remaining = polygon;
  const kept: CutVertex[][] = [];
  for (const axis of axes) for (const upper of [false, true]) {
    if (remaining.length < 3) return kept;
    const distance = (v: CutVertex) => upper ? box.max[axis] - v.point[axis] : v.point[axis] - box.min[axis];
    const yes: CutVertex[] = [], no: CutVertex[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[i]!, b = remaining[(i + 1) % remaining.length]!, da = distance(a), db = distance(b);
      (da >= -1e-6 ? yes : no).push(a);
      if ((da >= -1e-6) !== (db >= -1e-6)) {
        const t = da / (da - db), point = Vector3.Lerp(a.point, b.point, t);
        const edge: CutVertex = { point, values: a.values.map((values, k) => values.map((v, n) => v + (b.values[k]![n]! - v) * t)) };
        yes.push(edge); no.push(edge);
      }
    }
    if (no.length >= 3) kept.push(no);
    remaining = yes;
  }
  return kept;
}

/** Runtime-only adaptation. Original licensed GLBs and all exterior vertices stay untouched. */
export function clearPrivateCabinShell(meshes: readonly AbstractMesh[], cuts = PRIVATE_CABIN_CUTS): { changedMeshes: number; removedTriangles: number } {
  let changedMeshes = 0, removedTriangles = 0;
  for (const abstract of meshes) {
    if (!(abstract instanceof Mesh) || !abstract.name.startsWith("pearl_") || !abstract.getTotalVertices()) continue;
    const mesh = abstract, positions = mesh.getVerticesData(VertexBuffer.PositionKind), originalIndices = mesh.getIndices();
    if (!positions || !originalIndices) continue;
    mesh.computeWorldMatrix(true);
    const matrix = mesh.getWorldMatrix(), points = Array.from({ length: positions.length / 3 }, (_, i) => Vector3.TransformCoordinates(Vector3.FromArray(positions, i * 3), matrix));
    const min = points.reduce((a, p) => Vector3.Minimize(a, p), points[0]!.clone());
    const max = points.reduce((a, p) => Vector3.Maximize(a, p), points[0]!.clone());
    if (!cuts.some(box => axes.every(axis => max[axis] >= box.min[axis] && min[axis] <= box.max[axis]))) continue;
    const kinds = mesh.getVerticesDataKinds().filter(kind => mesh.getVerticesData(kind));
    const sizes = kinds.map(kind => mesh.getVertexBuffer(kind)!.getSize());
    const buffers = kinds.map(kind => Array.from(mesh.getVerticesData(kind)!));
    const vertex = (index: number): CutVertex => ({ index, point: points[index]!, values: buffers.map((data, k) => data.slice(index * sizes[k]!, (index + 1) * sizes[k]!)) });
    const result: number[] = []; let changed = false, added = 0;
    for (let i = 0; i < originalIndices.length; i += 3) {
      const ids = [originalIndices[i]!, originalIndices[i + 1]!, originalIndices[i + 2]!];
      if (!cuts.some(box => !axes.some(axis => ids.every(n => points[n]![axis] < box.min[axis]) || ids.every(n => points[n]![axis] > box.max[axis])))) { result.push(...ids); continue; }
      let polygons = [ids.map(vertex)];
      for (const box of cuts) polygons = polygons.flatMap(polygon => outsideBox(polygon, box));
      if (polygons.length === 1 && polygons[0]!.length === 3 && polygons[0]!.every((v, n) => v.index === ids[n])) { result.push(...ids); continue; }
      changed = true; removedTriangles++;
      for (const polygon of polygons) {
        const mapped = polygon.map(v => {
          if (v.index !== undefined) return v.index;
          const index = positions.length / 3 + added++;
          for (let k = 0; k < buffers.length; k++) buffers[k]!.push(...v.values[k]!);
          return index;
        });
        for (let j = 1; j < mapped.length - 1; j++) {
          // Coincident intersections on adjacent cut planes can leave a line
          // with three vertices. Never emit zero-area faces (ray hits become NaN).
          const area = Vector3.Cross(polygon[j]!.point.subtract(polygon[0]!.point), polygon[j + 1]!.point.subtract(polygon[0]!.point)).lengthSquared();
          if (area > 1e-12) result.push(mapped[0]!, mapped[j]!, mapped[j + 1]!);
        }
      }
    }
    if (!changed) continue;
    changedMeshes++; mesh.makeGeometryUnique();
    if (added) for (let k = 0; k < kinds.length; k++) mesh.setVerticesData(kinds[k]!, buffers[k]!, false, sizes[k]!);
    mesh.setIndices(result); mesh.refreshBoundingInfo({});
    if (!result.length) mesh.setEnabled(false);
  }
  return { changedMeshes, removedTriangles };
}
