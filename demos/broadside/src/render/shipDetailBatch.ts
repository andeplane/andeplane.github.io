import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

/** Batch rigid fittings within one moving frame, keeping material and wheel motion. */
export function batchShipDetails(parent: TransformNode, parts: Mesh[], name: string): void {
  const groups = new Map<Material | null, Mesh[]>();
  for (const part of parts) {
    const group = groups.get(part.material) ?? [];
    group.push(part);
    groups.set(part.material, group);
  }
  for (const [material, group] of groups) {
    if (group.length < 2) continue;
    // MergeMeshes bakes world transforms. Detach without preserving world space
    // so its vertices stay in the wheel/ship's local frame, even after moving.
    for (const part of group) {
      part.parent = null;
      part.computeWorldMatrix(true);
    }
    const receiveShadows = group[0]!.receiveShadows;
    const merged = Mesh.MergeMeshes(group, true, true)!;
    merged.name = `${name} ${material?.name ?? "unpainted"}`;
    merged.material = material;
    merged.parent = parent;
    merged.receiveShadows = receiveShadows;
  }
}
