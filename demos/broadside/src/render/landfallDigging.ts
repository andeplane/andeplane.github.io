import { Scene } from "@babylonjs/core/scene.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Rng } from "../sim/rng";
import type { IslandSettings } from "../game/landfall";

type Height = (x: number, z: number) => number;
type Mark = { x: number; z: number; count: number; seed: number; index: number; batch: PatchBatch };

const SIDES = 12,
  RINGS = 3,
  VERTICES = 1 + SIDES * RINGS,
  SLOTS = 48;
const TAU = Math.PI * 2;

/** A batch keeps every scoop on the ground and costs one draw for 48 distinct spots. */
class PatchBatch {
  count = 0;
  private readonly mesh: Mesh;
  private readonly positions = new Float32Array(SLOTS * VERTICES * 3);
  private readonly colors = new Float32Array(SLOTS * VERTICES * 4);
  constructor(scene: Scene, material: StandardMaterial) {
    this.mesh = new Mesh("spade marks in the ground", scene);
    const indices: number[] = [];
    for (let slot = 0; slot < SLOTS; slot++) {
      const start = slot * VERTICES;
      for (let j = 0; j < SIDES; j++) {
        const a = start + 1 + j,
          b = start + 1 + ((j + 1) % SIDES);
        indices.push(start, a, b);
        for (let ring = 1; ring < RINGS; ring++) {
          const c = a + ring * SIDES,
            d = b + ring * SIDES;
          indices.push(c - SIDES, c, d, c - SIDES, d, d - SIDES);
        }
      }
    }
    const data = new VertexData();
    data.positions = this.positions;
    data.colors = this.colors;
    data.indices = indices;
    // Low relief is painted into the scoop; subtle directional colour stays visible in shade.
    data.normals = Float32Array.from({ length: this.positions.length }, (_, i) => (i % 3 === 1 ? 1 : 0));
    data.applyToMesh(this.mesh, true);
    this.mesh.material = material;
    this.mesh.receiveShadows = true;
    this.mesh.isPickable = false;
  }
  stamp(mark: Mark, height: Height, colors: Color3[], successful: boolean) {
    const first = mark.index * VERTICES,
      rng = new Rng(mark.seed),
      angle = rng.range(0, TAU);
    const cs = Math.cos(angle),
      sn = Math.sin(angle);
    const scale = (successful ? 0.72 : 0.51) + 0.043 * Math.min(mark.count, 4);
    const write = (vertex: number, x: number, z: number, above: number, tint: Color3, shade: number) => {
      this.positions.set([x, height(x, z) + above, z], vertex * 3);
      this.colors.set([tint.r * shade, tint.g * shade, tint.b * shade, 1], vertex * 4);
    };
    write(first, mark.x, mark.z, 0.027, colors[0]!, 1);
    for (let j = 0; j < SIDES; j++) {
      const a = ((j + rng.range(-0.18, 0.18)) * TAU) / SIDES;
      const edge = rng.range(0.8, 1.06);
      const dx = Math.cos(a) * scale * edge,
        dz = Math.sin(a) * scale * 0.74 * edge;
      // Loose turf piles on the side where the spade leaves the cut.
      const displaced = Math.max(0, Math.cos(a - 0.6)),
        shade = rng.range(0.92, 1.04);
      for (let k = 0; k < RINGS; k++) {
        const r = [0.53, 0.83, 1.08][k]!;
        const x = mark.x + (dx * cs - dz * sn) * r,
          z = mark.z + (dx * sn + dz * cs) * r;
        const above = k === 1 ? 0.065 + 0.086 * displaced : 0.033;
        write(first + 1 + k * SIDES + j, x, z, above, colors[k + 1]!, shade);
      }
    }
    this.mesh.updateVerticesData("position", this.positions, true);
    this.mesh.updateVerticesData("color", this.colors);
  }
}

export class IslandDigging {
  private readonly spots = new Map<string, Mark>();
  private batch?: PatchBatch;
  private readonly material: StandardMaterial;
  private readonly palette: Color3[];
  private readonly clods: Mesh;
  private readonly transforms = new Float32Array(8 * 16);
  private readonly pieces = Array.from({ length: 8 }, () => ({
    origin: Vector3.Zero(),
    velocity: Vector3.Zero(),
    size: 0,
    spin: 0,
  }));
  private readonly trs = Matrix.Identity();
  private readonly pos = Vector3.Zero();
  private readonly rotation = Quaternion.Identity();
  private readonly size = Vector3.One();
  private age = Infinity;

  constructor(
    private scene: Scene,
    private height: Height,
    biome: IslandSettings["biome"],
    private seed: number,
  ) {
    this.material = new StandardMaterial("fresh earth and displaced turf", scene);
    this.material.specularColor.setAll(0.025);
    this.material.backFaceCulling = false;
    this.material.zOffset = -2;
    const tints =
      biome === "winter"
        ? ["#6b777a", "#879597", "#bbcacc", "#d6ded9"]
        : biome === "alpine"
          ? ["#615b4d", "#80715b", "#a5967b", "#b39f83"]
          : ["#715744", "#8e6c4f", "#b1986e", "#c5ae85"];
    this.palette = tints.map((hex) => Color3.FromHexString(hex));
    const soil = new StandardMaterial("crumbs of loosened ground", scene);
    soil.diffuseColor = this.palette[2]!;
    soil.specularColor.setAll(0.02);
    this.clods = MeshBuilder.CreateIcoSphere(
      "earth thrown by the spade",
      { radius: 1, subdivisions: 1, flat: true },
      scene,
    );
    this.clods.material = soil;
    this.clods.isPickable = false;
    this.clods.alwaysSelectAsActiveMesh = true;
    this.clods.thinInstanceSetBuffer("matrix", this.transforms, 16, false);
    this.clods.setEnabled(false);
  }

  strike(x: number, z: number, successful: boolean, reduced: boolean) {
    const cellX = Math.round(x / 0.74),
      cellZ = Math.round(z / 0.74),
      key = cellX + "," + cellZ;
    let mark = this.spots.get(key);
    if (!mark) {
      if (!this.batch || this.batch.count === SLOTS) this.batch = new PatchBatch(this.scene, this.material);
      mark = {
        x,
        z,
        count: 0,
        seed: this.seed ^ Math.imul(cellX, 6151) ^ Math.imul(cellZ, 27961),
        index: this.batch.count++,
        batch: this.batch,
      };
      this.spots.set(key, mark);
    }
    mark.count++;
    mark.batch.stamp(mark, this.height, this.palette, successful);
    this.age = reduced ? Infinity : 0;
    this.clods.setEnabled(!reduced);
    if (reduced) return;
    const rng = new Rng(mark.seed ^ Math.imul(mark.count, 1777)),
      direction = rng.range(0, TAU);
    const ground = this.height(x, z);
    for (const piece of this.pieces) {
      const a = direction + rng.range(-1.15, 1.15),
        speed = rng.range(0.65, 1.95);
      piece.origin.set(x + rng.range(-0.15, 0.15), ground + 0.11, z + rng.range(-0.13, 0.13));
      piece.velocity.set(Math.cos(a) * speed, rng.range(1.5, 2.9), Math.sin(a) * speed);
      piece.size = rng.range(0.035, 0.087);
      piece.spin = rng.range(-7, 7);
    }
    this.update(0, false);
  }

  update(dt: number, reduced: boolean) {
    if (!Number.isFinite(this.age)) return;
    this.age += dt;
    if (reduced || this.age >= 0.68) {
      this.age = Infinity;
      this.clods.setEnabled(false);
      return;
    }
    const t = this.age;
    for (const [i, piece] of this.pieces.entries()) {
      this.pos
        .copyFrom(piece.origin)
        .addInPlaceFromFloats(piece.velocity.x * t, piece.velocity.y * t - 5.8 * t * t, piece.velocity.z * t);
      const fade = Math.min(1, Math.max(0, (this.pos.y - piece.origin.y + 0.11) * 9));
      this.size.set(piece.size * 1.3 * fade, piece.size * 0.78 * fade, piece.size * fade);
      Quaternion.FromEulerAnglesToRef(t * piece.spin, t * piece.spin * 0.6, i * 0.63, this.rotation);
      Matrix.ComposeToRef(this.size, this.rotation, this.pos, this.trs);
      this.trs.copyToArray(this.transforms, i * 16);
    }
    this.clods.thinInstanceBufferUpdated("matrix");
  }
}
