import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';

export interface CargoPosition { x: number; y: number; z: number; scale: number; }
/** Each bank has a clear staging area and a viewpoint inside its chamber. */
export const bankCargoStaging = [
  { x: 6.7, z: .6, width: 4.9, cameraX: 2.7, cameraY: 6.5, cameraZ: -10 },
  { x: -6.7, z: .6, width: 4.9, cameraX: -2.7, cameraY: 6.5, cameraZ: -10 },
  { x: 6.7, z: .35, width: 4.9, cameraX: 2.7, cameraY: 6.5, cameraZ: -10 },
  { x: 4.4, z: -5.3, width: 3, cameraX: 3.6, cameraY: 5.9, cameraZ: -11.5 },
] as const;

/** Fit the whole manifest in the clearing. Keep each slot fixed as the queue advances. */
export function bankCargoPosition(slot: number, count: number, area: { world: number; x: number; z: number }): CargoPosition {
  const stage = bankCargoStaging[area.world]!;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const row = Math.floor(slot / columns);
  const stagger = rows === 1 ? 0 : row % 2 ? .22 : -.22;
  const scale = Math.min(.52, stage.width / ((columns + Math.abs(stagger) * 2) * 3.9), 4.8 / (rows * 3.75));
  const x = area.x + stage.x + (slot % columns - (columns - 1) / 2 + stagger) * 3.9 * scale;
  const z = area.z + stage.z + (row - (rows - 1) / 2) * 3.75 * scale;
  return { x, y: 0, z, scale };
}
export function holdCargoPosition(slot: number): CargoPosition {
  return { x: slot % 2 ? -3.25 : 3.25, y: .78 + Math.floor(slot / 14) * 1.06, z: 4.4 - Math.floor(slot % 14 / 2) * 1.35, scale: .37 };
}
/** Open cargo chests are static, batched by material; no light or physics per chest. */
export class CargoChests {
  private meshes: Mesh[] = [];
  private wood: StandardMaterial;
  private brass: StandardMaterial;
  constructor(private scene: Scene, private name: string) {
    this.wood = new StandardMaterial(name + ' oak', scene); this.wood.diffuseColor = Color3.FromHexString('#70462b');
    this.brass = new StandardMaterial(name + ' gold', scene); this.brass.diffuseColor = Color3.FromHexString('#e0b55c');
    this.brass.specularColor = Color3.FromHexString('#ffe1a1');
  }
  show(positions: CargoPosition[], open = true): void {
    this.meshes.forEach(mesh => mesh.dispose()); this.meshes = [];
    const timber: Mesh[] = [], gold: Mesh[] = [];
    for (const [index, position] of positions.entries()) {
      const root = new TransformNode(this.name + ' chest ' + index, this.scene);
      root.position.set(position.x, position.y, position.z); root.scaling.setAll(position.scale);
      const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, metal = false) => {
        const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
        mesh.parent = root; mesh.position.set(x, y, z); mesh.material = metal ? this.brass : this.wood;
        (metal ? gold : timber).push(mesh); return mesh;
      };
      box('cargo chest floor', 3.5, .18, 1.9, 0, .16, 0);
      for (const z of [-.88, .88]) box('cargo chest wall', 3.5, 1.25, .17, 0, .82, z);
      for (const x of [-1.7, 1.7]) box('cargo chest end', .18, 1.25, 1.8, x, .82, 0);
      // A visibly lifted lid, rather than a solid crate hiding the treasure.
      const lid = box(open ? 'open cargo lid' : 'stowed cargo lid', 3.5, .18, 1.9, 0, open ? 2.3 : 1.52, open ? 1.45 : 0);
      lid.rotation.x = open ? 1.96 : 0;
      for (const x of [-1.3, 1.3]) {
        for (const z of [-.99, .99]) box('cargo brass binding', .16, 1.28, .07, x, .82, z, true);
      }
      for (let i = 0; i < (open ? 18 : 0); i++) {
        const coin = MeshBuilder.CreateCylinder('visible cargo doubloon', { diameter: .44, height: .07, tessellation: 10 }, this.scene);
        coin.parent = root; coin.position.set((i % 6 - 2.5) * .45, 1.04 + (i % 3) * .025, (Math.floor(i / 6) - 1) * .43);
        coin.material = this.brass; gold.push(coin);
      }
      root.computeWorldMatrix(true);
    }
    for (const parts of [timber, gold]) if (parts.length) {
      for (const mesh of parts) mesh.computeWorldMatrix(true);
      const merged = Mesh.MergeMeshes(parts, true, true)!;
      merged.name = this.name + ' open chests'; merged.receiveShadows = true; merged.isPickable = false; this.meshes.push(merged);
    }
    // MergeMeshes bakes the transforms, so the now-empty per-chest roots can go.
    for (const root of [...this.scene.transformNodes]) if (root.name.startsWith(this.name + ' chest ')) root.dispose();
  }
  get count(): number { return this.meshes.length; }
}
