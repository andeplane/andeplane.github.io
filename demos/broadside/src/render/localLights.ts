import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Bake a bounded local-light assignment when cave geometry changes, never on camera movement. */
export function bindLocalLights(
  lights: PointLight[],
  meshes: AbstractMesh[],
): void {
  const assignments = lights.map(() => [] as AbstractMesh[]);
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const center = mesh.getBoundingInfo().boundingBox.centerWorld;
    const nearest = lights
      .map((light, index) => ({
        index,
        distance: Vector3.DistanceSquared(center, light.position),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);
    for (const { index } of nearest) assignments[index]!.push(mesh);
  }
  lights.forEach((light, index) => {
    light.renderPriority = 1;
    light.includedOnlyMeshes = assignments[index]!;
    // Babylon treats an empty inclusion list as all meshes, so disable unused lamps.
    light.setEnabled(assignments[index]!.length > 0);
  });
}
