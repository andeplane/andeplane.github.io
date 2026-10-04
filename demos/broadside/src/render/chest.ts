import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { doubloonMaterial, doubloonMesh } from "./coin";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { chestCoinPoses, CHEST_COIN_SCALE } from "../game/chestCoins";

const ease = (a: number, b: number, t: number) => {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
export function revealPose(seconds: number, reducedMotion = false) {
  const t = reducedMotion ? seconds * 4 : seconds;
  return {
    time: t,
    lid: ease(1.1, 2.65, t),
    rise: ease(2.15, 4.25, t),
    glow: ease(0.35, 2.3, t),
    ready: t >= 4.7,
    opening: t >= 1.1,
    discovered: t >= 2.65,
  };
}

/** A hollow chest with a real rear hinge, curved planked lid and animated light. */
export class RewardChest {
  readonly root: TransformNode;
  private lid: TransformNode;
  private contents: Mesh;
  private light: PointLight;
  private glow: StandardMaterial;
  private coinsReady = false;
  private coinCount = 1000;
  constructor(scene: Scene) {
    this.root = new TransformNode("captain's treasure chest", scene);
    this.lid = new TransformNode("rear hinge", scene);
    this.lid.parent = this.root;
    this.lid.position.set(0, 1.45, 0.88);
    const mat = (name: string, hex: string, emission = 0) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.emissiveColor = m.diffuseColor.scale(emission);
      m.specularColor = Color3.FromHexString("#ae8b56");
      m.specularPower = 64;
      m.maxSimultaneousLights = 6;
      return m;
    };
    const wood = mat("aged mahogany", "#593322"),
      grain = mat("warm teak planks", "#815139"),
      gold = mat("hammered gold fittings", "#e6b455", 0.09),
      interior = mat("velvet inside the chest", "#211b2b"),
      gem = mat("lock's ocean sapphire", "#69dedf", 0.5);
    this.glow = mat("treasure light spilling through seam", "#ffcd76", 1.4);
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material: StandardMaterial, parent = this.root) => {
      const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      m.parent = parent; m.position.set(x, y, z); m.material = material;
      return m;
    };
    box("hollow chest floor", 3.5, 0.18, 1.9, 0, 0.16, 0, wood);
    box("velvet bed", 3.12, 0.03, 1.5, 0, 0.27, 0, interior);
    for (const z of [-0.88, 0.88]) {
      box("solid oak wall", 3.5, 1.25, 0.17, 0, 0.82, z, wood);
      for (let j = 0; j < 4; j++) {
        box("individual front plank", 3.48, 0.28, 0.035, 0, 0.36 + j * 0.3, z * 1.11, j % 2 ? wood : grain);
        box("wood grain", 3.1, 0.013, 0.039, 0.1, 0.4 + j * 0.3, z * 1.12, wood);
      }
    }
    for (const x of [-1.7, 1.7]) box("end wall", 0.18, 1.25, 1.8, x, 0.82, 0, grain);
    for (const y of [0.3, 1.4]) {
      for (const z of [-0.99, 0.99]) box("gold rim", 3.65, 0.09, 0.06, 0, y, z, gold);
      for (const x of [-1.8, 1.8]) box("gold end rim", 0.06, 0.09, 1.98, x, y, 0, gold);
    }
    for (const x of [-1.3, 1.3]) {
      for (const z of [-1, 1]) {
        box("forged band", 0.17, 1.23, 0.07, x, 0.83, z, gold);
        for (const y of [0.42, 0.73, 1.08, 1.32]) {
          const rivet = MeshBuilder.CreateSphere("gold rivet", { diameter: 0.085, segments: 8 }, scene);
          rivet.parent = this.root; rivet.position.set(x, y, z * 1.045); rivet.material = gold;
        }
      }
      for (const z of [-0.66, 0.66]) box("carved foot", 0.4, 0.22, 0.4, x, 0.02, z, wood);
    }
    box("lock plate", 0.48, 0.56, 0.09, 0, 1.1, -1.07, gold);
    const keyhole = MeshBuilder.CreateCylinder("keyhole", { diameter: 0.13, height: 0.025, tessellation: 16 }, scene);
    keyhole.parent = this.root; keyhole.position.set(0, 1.16, -1.13); keyhole.rotation.x = Math.PI / 2; keyhole.material = interior;
    box("keyhole stem", 0.065, 0.14, 0.03, 0, 1.07, -1.13, interior);
    for (const x of [-1.84, 1.84]) {
      const handle = MeshBuilder.CreateTorus("carrying ring", { diameter: 0.48, thickness: 0.065, tessellation: 24 }, scene);
      handle.parent = this.root; handle.position.set(x, 0.95, 0); handle.rotation.z = Math.PI / 2; handle.material = gold;
    }
    // Twelve curved planks form the barrel lid. Every piece shares the rear hinge.
    const arc = (a: number, x: number) => new Vector3(x, Math.sin(a) * 0.78, -0.88 - Math.cos(a) * 0.97);
    for (let j = 0; j < 12; j++) {
      const a = j / 12 * Math.PI, b = (j + 1) / 12 * Math.PI;
      const plank = MeshBuilder.CreateRibbon("curved lid plank", { pathArray: [[arc(a + 0.004, -1.75), arc(a + 0.004, 1.75)], [arc(b - 0.004, -1.75), arc(b - 0.004, 1.75)]], sideOrientation: 2 }, scene);
      plank.parent = this.lid; plank.material = j % 3 === 0 ? wood : grain;
    }
    for (const x of [-1.74, -1.3, 1.3, 1.74]) {
      const strip = MeshBuilder.CreateRibbon("curved lid gold band", { pathArray: Array.from({ length: 25 }, (_, j) => [arc(j / 24 * Math.PI, x - 0.065), arc(j / 24 * Math.PI, x + 0.065)]), sideOrientation: 2 }, scene);
      strip.parent = this.lid; strip.material = gold;
    }
    for (const x of [-1.74, 1.74]) {
      const end = MeshBuilder.CreateRibbon("closed lid end", { pathArray: [Array.from({ length: 25 }, (_, j) => arc(j / 24 * Math.PI, x)), Array.from({ length: 25 }, (_, j) => new Vector3(x, 0, -0.88))], sideOrientation: 2 }, scene);
      end.parent = this.lid; end.material = wood;
    }
    box("lid front rim", 3.6, 0.09, 0.06, 0, 0, -1.86, gold, this.lid);
    box("latch", 0.26, 0.4, 0.055, 0, -0.14, -1.94, gold, this.lid);
    const seal = MeshBuilder.CreateSphere("sapphire on the latch", { diameter: 0.16, segments: 12 }, scene);
    seal.parent = this.lid; seal.position.set(0, -0.12, -1.98); seal.material = gem;
    for (const z of [-0.84,0.84]) box("light at lid seam", 3.26, 0.025, 0.025, 0, 1.43, z, this.glow);
    for (const x of [-1.63,1.63]) box("light at lid seam", 0.025, 0.025, 1.66, x, 1.43, 0, this.glow);
    this.contents = doubloonMesh(scene, "one thousand doubloons inside the chest");
    this.contents.parent = this.root; this.contents.material = doubloonMaterial(scene); this.contents.isPickable = false;
    this.contents.setEnabled(false);
    void chestCoinPoses().then(poses => {
      if (this.contents.isDisposed()) return;
      const coins = new Float32Array(1000 * 16), m = Matrix.Identity(), q = Quaternion.Identity(), p = Vector3.Zero(), scale = Vector3.One().scale(CHEST_COIN_SCALE);
      for (let i = 0; i < 1000; i++) {
        const n = i * 7;
        p.set(poses[n]!, poses[n + 1]!, poses[n + 2]!);
        q.set(poses[n + 3]!, poses[n + 4]!, poses[n + 5]!, poses[n + 6]!);
        Matrix.ComposeToRef(scale, q, p, m); m.copyToArray(coins, i * 16);
      }
      this.contents.thinInstanceSetBuffer("matrix", coins, 16, true);
      this.coinsReady = true; this.setCoinCount(this.coinCount);
    }).catch(error => console.error("Chest contents:", error));
    this.light = new PointLight("chest's hidden glow", new Vector3(0, 2, -0.4), scene);
    this.light.renderPriority = 4;
    this.light.parent = this.root; this.light.diffuse = Color3.FromHexString("#ffcc75"); this.light.range = 8;
    this.root.setEnabled(false); this.light.setEnabled(false);
  }
  fade(alpha: number) {
    this.root.getChildMeshes().forEach(mesh => { mesh.visibility = alpha; });
    this.light.intensity *= alpha;
  }
  setCoinCount(count: number) {
    this.coinCount = count;
    if (!this.coinsReady) return;
    this.contents.thinInstanceCount = Math.max(0, Math.min(1000, count));
    this.contents.setEnabled(count > 0);
  }
  hide() { this.root.setEnabled(false); this.light.setEnabled(false); }
  open(amount: number): void { this.lid.rotation.x = Math.max(0, Math.min(1, amount)) * 1.96; }
  animate(seconds: number, x: number, reduced: boolean) {
    const p = revealPose(seconds, reduced);
    this.root.setEnabled(true); this.light.setEnabled(true);
    this.setCoinCount(1000);
    this.fade(1);
    this.root.position.set(x, 1.05, 0);
    this.root.rotation.set(0, -0.16, 0);
    this.open(p.lid);
    this.glow.emissiveColor = Color3.FromHexString("#ffcc75").scale(.08 + p.glow * .15);
    this.light.intensity = .4 + p.lid * .9;
    return p;
  }
}
