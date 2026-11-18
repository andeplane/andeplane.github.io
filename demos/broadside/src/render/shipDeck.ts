import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { TransformNode as WheelPivot } from "@babylonjs/core/Meshes/transformNode.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { lerp } from "../sim/math";
import type { DeckGeometry } from "../game/deckWalk";

/** The purchased Pearl already contains its wheel; use that authored placement. */
export function importedPearlWheel(model: TransformNode, root: TransformNode): Vector3 | null {
  const wheel = model.getChildMeshes().find(mesh => mesh.name.includes("pearl_") &&
    /(?:^|-)steeringwheel$/.test(mesh.material?.name ?? ""));
  if (!wheel) return null;
  root.computeWorldMatrix(true); wheel.computeWorldMatrix(true);
  return Vector3.TransformCoordinates(wheel.getBoundingInfo().boundingBox.centerWorld,
    root.getWorldMatrix().clone().invert());
}

/** Reparent the two authored wheel parts around their existing hub, preserving their world pose. */
export function importedPearlWheelPivot(model: TransformNode, root: TransformNode, centre: Vector3): TransformNode {
  const pivot = new WheelPivot("authored Pearl wheel hub", model.getScene());
  pivot.parent = root; pivot.position.copyFrom(centre); pivot.computeWorldMatrix(true);
  for (const mesh of model.getChildMeshes().filter(mesh => mesh.name.includes("pearl_") &&
    /(?:^|-)steeringwheel(?:_01)?$/.test(mesh.material?.name ?? ""))) mesh.setParent(pivot);
  return pivot;
}

/** The helm, walking spawn and eye all use the same interpolated walking surface. */
export function shipDeckGeometry(scene: Scene, model: TransformNode, root: TransformNode,
  length: number, beam: number, helmX: number, helmZ: number, referenceZ: number): DeckGeometry {
  model.computeWorldMatrix(true);
  for (const mesh of model.getChildMeshes(false)) mesh.computeWorldMatrix(true);
  const importedDeck = model.getChildMeshes().some(mesh => mesh.name.includes("pearl_walk_deck_"));
  const isDeck = (mesh: AbstractMesh) => mesh.isDescendantOf(model) && (importedDeck
    ? mesh.name.includes("pearl_walk_deck_") : /deck|teak|hull/i.test(mesh.material?.name ?? ""));
  const reference = scene.pickWithRay(new Ray(new Vector3(helmX, length, referenceZ), new Vector3(0, -1, 0)), isDeck);
  const referenceY = Math.max(1.35, reference?.pickedPoint?.y ?? 2.7);
  const floors = new Map<string, number>();
  const sample = (x: number, z: number): number => {
    const key = `${x},${z}`;
    if (floors.has(key)) return floors.get(key)!;
    root.computeWorldMatrix(true);
    const matrix = root.getWorldMatrix(), inverse = matrix.clone().invert();
    const origin = Vector3.TransformCoordinates(new Vector3(x, referenceY + 3, z), matrix);
    const down = Vector3.TransformNormal(new Vector3(0, -1, 0), matrix).normalize();
    const hit = scene.pickWithRay(new Ray(origin, down, length * 2), isDeck);
    const y = hit?.pickedPoint ? Vector3.TransformCoordinates(hit.pickedPoint, inverse).y : referenceY;
    const height = Math.max(1.35, Math.min(referenceY + 2.5, y));
    floors.set(key, height); return height;
  };
  const floor = (x: number, z: number): number => {
    const cell = .6, x0 = Math.floor(x / cell) * cell, z0 = Math.floor(z / cell) * cell;
    const u = (x - x0) / cell, v = (z - z0) / cell;
    return lerp(lerp(sample(x0, z0), sample(x0 + cell, z0), u),
      lerp(sample(x0, z0 + cell), sample(x0 + cell, z0 + cell), u), v);
  };
  return { length, beam, helm: { x: helmX, y: floor(helmX, helmZ), z: helmZ }, floor };
}
