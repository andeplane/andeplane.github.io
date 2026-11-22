import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export const SPADE_CONTACT = 0.14;
export const SPADE_DURATION = 0.47;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** A first-person digging spade. Blade shoulder, ferrule and D-grip are modelled
 * in metres; the entire tool sits in a single draw and appears only mid-stroke. */
export class DiggingSpade {
  private readonly rig: TransformNode;
  private readonly mesh: Mesh;
  constructor(private readonly scene: Scene) {
    const parts: Mesh[] = [];
    const makePart = (mesh: Mesh, hex: string) => {
      const color = Color3.FromHexString(hex),
        tint: number[] = [];
      for (let i = 0; i < mesh.getTotalVertices(); i++) tint.push(color.r, color.g, color.b, 1);
      mesh.setVerticesData("color", tint);
      parts.push(mesh);
    };
    const cylinder = (a: Vector3, b: Vector3, diameter: number, tint: string) => {
      const delta = b.subtract(a);
      const mesh = MeshBuilder.CreateCylinder(
        "spade joinery",
        { height: delta.length(), diameter, tessellation: 10 },
        scene,
      );
      mesh.position.copyFrom(Vector3.Center(a, b));
      mesh.rotationQuaternion = Quaternion.Identity();
      Quaternion.FromUnitVectorsToRef(Vector3.Up(), delta.normalize(), mesh.rotationQuaternion);
      makePart(mesh, tint);
    };
    const point = (x: number, y: number, z = 0) => new Vector3(x, y, z);
    cylinder(point(0, -0.68), point(0, -0.04), 0.043, "#a67a48");
    for (const side of [-1, 1]) cylinder(point(0, -0.07), point(side * 0.082, 0.052), 0.025, "#53626a");
    cylinder(point(-0.084, 0.053), point(0.084, 0.053), 0.04, "#be9360");
    cylinder(point(0, -0.73), point(0, -0.59), 0.06, "#69777c");
    cylinder(point(0, -0.622), point(0, -0.602), 0.064, "#c6a56a");
    // Curved steel face with a kicked shoulder for the boot and a raised central spine.
    const blade = new Mesh("rolled steel spade blade", scene);
    const positions = [
      0, -0.75, -0.029, -0.115, -0.677, 0, 0.115, -0.677, 0, -0.128, -0.752, 0.007, 0.128, -0.752, 0.007, -0.102,
      -0.853, 0.017, 0.102, -0.853, 0.017, 0, -0.946, 0.026,
    ];
    const indices = [0, 2, 1, 0, 1, 3, 0, 3, 5, 0, 5, 7, 0, 7, 6, 0, 6, 4, 0, 4, 2],
      normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.applyToMesh(blade);
    blade.setVerticesData("uv", new Float32Array((positions.length / 3) * 2));
    makePart(blade, "#929f9f");
    cylinder(point(-0.12, -0.677), point(-0.026, -0.677), 0.024, "#bcc2b7");
    cylinder(point(0.026, -0.677), point(0.12, -0.677), 0.024, "#bcc2b7");
    this.mesh = Mesh.MergeMeshes(parts, true, true)!;
    this.mesh.name = "shovel in the captain’s hands";
    this.mesh.isPickable = false;
    const material = new StandardMaterial("weathered ash and shovel steel", scene);
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    material.specularColor.setAll(0.12);
    material.emissiveColor.setAll(0.09);
    this.mesh.material = material;
    this.rig = new TransformNode("first person spade swing", scene);
    this.mesh.parent = this.rig;
    this.rig.setEnabled(false);
  }

  show(age: number): void {
    const camera = this.scene.activeCamera;
    if (!camera || age >= SPADE_DURATION) {
      this.hide();
      return;
    }
    this.rig.parent = camera;
    this.rig.setEnabled(true);
    const driving = age < SPADE_CONTACT;
    const t = smooth(driving ? age / SPADE_CONTACT : (age - SPADE_CONTACT) / (SPADE_DURATION - SPADE_CONTACT));
    const drive = driving ? t : 1 - t;
    // The hands dip forward, then carry the blade up and off the right side.
    this.rig.position.set(
      0.26 - 0.075 * drive + (driving ? 0.045 : 0.36 * t),
      -0.16 - 0.108 * drive,
      0.3 + 0.12 * drive,
    );
    this.rig.rotation.set(-1.88 + 0.79 * drive, -0.16 - 0.14 * drive, -0.12 - 0.12 * drive);
  }

  hide(): void {
    this.rig.setEnabled(false);
  }
}
