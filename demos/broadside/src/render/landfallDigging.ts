import { Scene } from "@babylonjs/core/scene.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { ExcavationSurface } from "./landfallExcavation";
import { DiggingSpade, SPADE_CONTACT, SPADE_DURATION } from "./landfallSpade";
import { SpadeSound } from "./landfallSpadeSound";
import { Rng } from "../sim/rng";
import type { IslandSettings } from "../game/landfall";

type Height = (x: number, z: number) => number;
type Mark = { x: number; z: number; count: number; seed: number; index: number; batch: PatchBatch };

const LUMPS = 13,
  SIDES = 5,
  VERTICES = LUMPS * (SIDES + 1),
  SLOTS = 32;
const TAU = Math.PI * 2;

/** Loose, irregular heaps beside the cut. The pit itself is the actual terrain. */
class PatchBatch {
  count = 0;
  private readonly mesh: Mesh;
  private readonly positions = new Float32Array(SLOTS * VERTICES * 3);
  private readonly colors = new Float32Array(SLOTS * VERTICES * 4);
  private readonly normals = new Float32Array(SLOTS * VERTICES * 3);
  private readonly indices: number[] = [];
  constructor(scene: Scene, material: StandardMaterial) {
    this.mesh = new Mesh("spoils heaped beside spade cuts", scene);
    for (let n = 0; n < LUMPS * SLOTS; n++) {
      const base = n * (SIDES + 1);
      for (let j = 0; j < SIDES; j++) this.indices.push(base, base + 1 + j, base + 1 + ((j + 1) % SIDES));
    }
    const data = new VertexData();
    data.positions = this.positions;
    data.colors = this.colors;
    data.indices = this.indices;
    data.normals = this.normals;
    data.applyToMesh(this.mesh, true);
    this.mesh.material = material;
    this.mesh.receiveShadows = true;
    this.mesh.isPickable = false;
  }
  stamp(mark: Mark, height: Height, palette: Color3[], successful: boolean) {
    const rng = new Rng(mark.seed),
      heading = rng.range(0, TAU);
    const radius = (successful ? 1.31 : 1.05) + Math.min(mark.count - 1, 3) * 0.09;
    for (let n = 0; n < LUMPS; n++) {
      const a = heading + rng.range(-1.35, 1.35),
        r = radius * rng.range(0.92, 1.35);
      const x = mark.x + r * Math.cos(a),
        z = mark.z + r * Math.sin(a);
      const size = rng.range(0.054, 0.147) * (1 + Math.min(mark.count - 1, 3) * 0.18);
      const tint = palette[rng.int(1, 3)]!,
        base = mark.index * VERTICES + n * (SIDES + 1);
      this.positions.set([x, height(x, z) + size * 1.17, z], base * 3);
      this.colors.set([tint.r, tint.g, tint.b, 1], base * 4);
      for (let j = 0; j < SIDES; j++) {
        const az = a + (j * TAU) / SIDES,
          xx = x + Math.cos(az) * size * rng.range(0.95, 1.46),
          zz = z + Math.sin(az) * size;
        this.positions.set([xx, height(xx, zz) - 0.035, zz], (base + j + 1) * 3);
        this.colors.set([tint.r * 0.82, tint.g * 0.82, tint.b * 0.82, 1], (base + j + 1) * 4);
      }
    }
    VertexData.ComputeNormals(this.positions, this.indices, this.normals);
    this.mesh.updateVerticesData("position", this.positions, true);
    this.mesh.updateVerticesData("color", this.colors);
    this.mesh.updateVerticesData("normal", this.normals);
  }
}

type Stroke = {
  x: number;
  z: number;
  successful: boolean;
  onContact?: () => void;
  age: number;
  contacted: boolean;
};
export class IslandDigging {
  private readonly spots = new Map<string, Mark>();
  private batch?: PatchBatch;
  private readonly surface: ExcavationSurface;
  private readonly sound = new SpadeSound();
  private readonly spade: DiggingSpade;
  private stroke?: Stroke;
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
    height: Height,
    biome: IslandSettings["biome"],
    private seed: number,
    ground = scene.getMeshByName("island-0-0") as Mesh,
  ) {
    this.surface = new ExcavationSurface(ground, height);
    this.spade = new DiggingSpade(scene);
    scene.onDisposeObservable.addOnce(() => {
      this.cancelSwing();
      this.sound.dispose();
    });
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

  heightAt(x: number, z: number): number {
    return this.surface.heightAt(x, z);
  }

  setMuted(value: boolean): void {
    this.sound.setMuted(value);
  }

  cancelSwing(): void {
    this.stroke = undefined;
    this.spade.hide();
  }

  strike(x: number, z: number, successful: boolean, reduced: boolean, onContact?: () => void): boolean {
    if (this.stroke && !this.stroke.contacted) return false;
    this.sound.unlock();
    const stroke = (this.stroke = { x, z, successful, onContact, age: 0, contacted: false });
    if (reduced) {
      this.contact(stroke, true);
      this.cancelSwing();
    } else this.spade.show(0);
    return true;
  }

  /** The chart keeps completed strokes when a lighting change rebuilds the scene. */
  restoreTreasure(x: number, z: number, strokes: number): void {
    const count = this.spots.get("treasure")?.count ?? 0;
    for (let i = count; i < Math.min(3, strokes); i++) this.cut(x, z, true);
  }

  private cut(x: number, z: number, successful: boolean): Mark {
    const cellX = Math.round(x / 0.74),
      cellZ = Math.round(z / 0.74);
    const key = successful ? "treasure" : cellX + "," + cellZ;
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
    const heading = new Rng(mark.seed).range(0, TAU);
    this.surface.scoop(mark.x, mark.z, mark.count, successful, heading, this.palette);
    // A cut beside an earlier one also moves the ground underneath its spoil heap.
    for (const [id, spot] of this.spots) {
      if (Math.hypot(spot.x - mark.x, spot.z - mark.z) < 4)
        spot.batch.stamp(spot, (xx, zz) => this.surface.heightAt(xx, zz), this.palette, id === "treasure");
    }
    return mark;
  }

  private contact(stroke: Stroke, reduced: boolean): void {
    stroke.contacted = true;
    const { x, z, successful } = stroke;
    const mark = this.cut(x, z, successful);
    const rng = new Rng(mark.seed ^ Math.imul(mark.count, 1777));
    this.sound.impact(successful && mark.count >= 2, rng.next());
    this.age = reduced ? Infinity : 0;
    this.clods.setEnabled(!reduced);
    stroke.onContact?.();
    if (reduced) return;
    const direction = rng.range(0, TAU);
    const ground = this.heightAt(x, z);
    for (const piece of this.pieces) {
      const a = direction + rng.range(-1.15, 1.15),
        speed = rng.range(0.65, 1.95);
      piece.origin.set(x + rng.range(-0.15, 0.15), ground + 0.11, z + rng.range(-0.13, 0.13));
      piece.velocity.set(Math.cos(a) * speed, rng.range(1.5, 2.9), Math.sin(a) * speed);
      piece.size = rng.range(0.035, 0.087);
      piece.spin = rng.range(-7, 7);
    }
  }

  update(dt: number, reduced: boolean) {
    const stroke = this.stroke;
    if (stroke) {
      stroke.age += dt;
      if (!stroke.contacted && (reduced || stroke.age >= SPADE_CONTACT)) this.contact(stroke, reduced);
      if (reduced || stroke.age >= SPADE_DURATION) this.cancelSwing();
      else this.spade.show(stroke.age);
    }
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
