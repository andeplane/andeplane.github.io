import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Vector3, type Matrix } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

/** The public STL import mislabeled longitudinal cloth as iron. Split its large planar slabs only. */
export function splitPublicCanvas(root: TransformNode, length: number, beam: number, scene: Scene): number {
  const iron = root.getChildMeshes().find(m => m.name.includes("Black_Pearl_iron_cannons_and_rigging"));
  const canvas = root.getChildMeshes().find(m => m.name.includes("Black_Pearl_black_canvas_sail"));
  if (!(iron instanceof Mesh) || !canvas?.material) return 0;
  iron.computeWorldMatrix(true); root.computeWorldMatrix(true);
  const matrix = iron.getWorldMatrix().multiply(root.getWorldMatrix().clone().invert());
  const positions = iron.getVerticesData(VertexBuffer.PositionKind)!, indices = iron.getIndices()!;
  const points = Array.from({ length: positions.length / 3 }, (_, i) =>
    Vector3.TransformCoordinates(Vector3.FromArray(positions, i * 3), matrix));
  const slabs: { min: Vector3; max: Vector3 }[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = points[indices[i]!]!, b = points[indices[i + 1]!]!, c = points[indices[i + 2]!]!;
    const normal = Vector3.Cross(b.subtract(a), c.subtract(a));
    // On this known STL, cloth sheets have metre-scale planar faces; rods and cannons do not.
    if (normal.length() / 2 < length * length * .0025 || Math.abs(normal.normalize().x) < .9999) continue;
    const min = Vector3.Minimize(Vector3.Minimize(a, b), c), max = Vector3.Maximize(Vector3.Maximize(a, b), c);
    if (min.y < length * .17 || Math.max(Math.abs(min.x), Math.abs(max.x)) > beam * .15) continue;
    const existing = slabs.find(s => min.x <= s.max.x + beam * .04 && max.x >= s.min.x - beam * .04 &&
      min.y <= s.max.y + .001 && max.y >= s.min.y - .001 && min.z <= s.max.z + .001 && max.z >= s.min.z - .001);
    if (existing) { existing.min.minimizeInPlace(min); existing.max.maximizeInPlace(max); }
    else slabs.push({ min, max });
  }
  const cloth: number[] = [], remaining: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
    const inside = slabs.some(s => tri.every(n => {
      const p = points[n]!;
      return p.x >= s.min.x - .001 && p.x <= s.max.x + .001 && p.y >= s.min.y - .001 &&
        p.y <= s.max.y + .001 && p.z >= s.min.z - .001 && p.z <= s.max.z + .001;
    }));
    (inside ? cloth : remaining).push(...tri);
  }
  if (!cloth.length) return 0;
  const data = new VertexData(), remap = new Map<number, number>(), compactPositions: number[] = [], compactNormals: number[] = [];
  const normals = iron.getVerticesData(VertexBuffer.NormalKind)!;
  data.indices = cloth.map(index => {
    let mapped = remap.get(index);
    if (mapped === undefined) {
      mapped = remap.size; remap.set(index, mapped);
      compactPositions.push(positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!);
      compactNormals.push(normals[index * 3]!, normals[index * 3 + 1]!, normals[index * 3 + 2]!);
    }
    return mapped;
  });
  data.positions = compactPositions; data.normals = compactNormals;
  const panel = new Mesh(`${root.name}-longitudinal-black-canvas-sail`, scene); data.applyToMesh(panel);
  panel.parent = iron.parent; panel.position.copyFrom(iron.position); panel.rotation.copyFrom(iron.rotation);
  panel.rotationQuaternion = iron.rotationQuaternion?.clone() ?? null; panel.scaling.copyFrom(iron.scaling);
  panel.material = canvas.material;
  iron.makeGeometryUnique(); iron.setIndices(remaining);
  return cloth.length / 3;
}

/** Gather the complete low panel toward its yard. A monotonic compression never stretches a seam. */
export function furledCanvasPositions(original: readonly number[], toDeck: Matrix, yardHeight: number): number[] {
  const result = [...original], fromDeck = toDeck.clone().invert();
  for (let i = 0; i < result.length; i += 3) {
    const p = Vector3.TransformCoordinates(Vector3.FromArray(original, i), toDeck);
    if (p.y >= yardHeight) continue;
    p.y = yardHeight - (yardHeight - p.y) * .08;
    const folded = Vector3.TransformCoordinates(p, fromDeck);
    result[i] = folded.x; result[i + 1] = folded.y; result[i + 2] = folded.z;
  }
  return result;
}

/** Original fine woven canvas, mipmapped so the weave disappears cleanly at a distance. */
export function canvasWeave(scene: Scene): { normal: RawTexture; roughness: RawTexture } {
  const size = 128, normal = new Uint8Array(size * size * 3), roughness = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 3;
    const warp = Math.sin(x * Math.PI / 4), weft = Math.sin(y * Math.PI / 4);
    normal[i] = 128 + warp * 14; normal[i + 1] = 128 + weft * 14; normal[i + 2] = 254;
    roughness[i] = 255; roughness[i + 1] = 241 + warp * weft * 12; roughness[i + 2] = 0;
  }
  const texture = (name: string, data: Uint8Array) => {
    const t = RawTexture.CreateRGBTexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    t.name = name; t.anisotropicFilteringLevel = 4; return t;
  };
  return { normal: texture("woven canvas normal", normal), roughness: texture("woven canvas roughness", roughness) };
}
