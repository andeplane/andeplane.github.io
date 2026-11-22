import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { GeneratedIsland } from "../game/landfall";
import { planPearlDock } from "../game/landfallDock";
import { timberTexture } from "../shared/pirate-world/render/timber";
import { buildHarbourScenery } from "../shared/pirate-world/render/harbourScenery";
import { harbourObstacles } from "../shared/pirate-world/input/harbourLayout";

export function buildHarbor(scene: Scene, island: GeneratedIsland, shadows: ShadowGenerator) {
  const dock = planPearlDock(island);
  const { x, shoreZ, landEnd, pierEnd, gangwayEnd, halfPier, pierHeight, gangwayHeight } = dock;
  const timber = new StandardMaterial("salt-weathered pier", scene);
  timber.diffuseTexture = timberTexture(scene, "pier timber grain");
  timber.diffuseColor = Color3.FromHexString("#b9a288");
  timber.specularColor.setAll(.045);
  const hemp = new StandardMaterial("waxed mooring ropes", scene);
  hemp.diffuseColor = Color3.FromHexString("#ad9671");
  hemp.specularColor.setAll(.025);
  const boards: Mesh[] = [], ropes: Mesh[] = [];
  const point = (across: number, y: number, along: number) => new Vector3(x + across, y, shoreZ - along);
  function box(name: string, across: number, y: number, along: number, width: number, height: number, depth: number) {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.copyFrom(point(across, y, along));
    boards.push(mesh);
    return mesh;
  }
  function planks(from: number, to: number, width: number, floor: (t: number) => number) {
    const count = Math.ceil((to - from) / .27);
    const step = (to - from) / count;
    for (let i = 0; i < count; i++) {
      const t = from + (i + .5) * step;
      const piece = box("salted dock plank", 0, floor(t) - .064, t, width, .128, step - .008);
      piece.rotation.x = Math.atan2(floor(t + step / 2) - floor(t - step / 2), step);
    }
  }
  function rope(name: string, path: Vector3[], radius: number) {
    ropes.push(MeshBuilder.CreateTube(name, { path, radius, tessellation: 10, cap: Mesh.CAP_ALL }, scene));
  }
  planks(landEnd, pierEnd, halfPier * 2, pierHeight);
  planks(pierEnd, gangwayEnd + .34, 2.38, gangwayHeight);
  for (const side of [-1, 1]) {
    const u = side * (halfPier - .16);
    const pileCount = Math.ceil(pierEnd / 2.8);
    for (let i = 0; i <= pileCount; i++) {
      const t = i * (pierEnd - .38) / pileCount;
      const bed = island.heightAt(x + u, shoreZ - t) - .22;
      const top = pierHeight(t) + .46;
      box("pier piling", u, (bed + top) / 2, t, .24, top - bed, .25);
      if (i < pileCount) {
        const span = (pierEnd - .38) / pileCount;
        box("pier bearer", u, pierHeight(t + span / 2) - .25, t + span / 2, .21, .32, span + .1);
      }
    }
    const rail = side * 1.12;
    for (let i = 0; i <= 2; i++) {
      const t = pierEnd + (gangwayEnd - pierEnd) * i / 2;
      box("gangway stanchion", rail, gangwayHeight(t) + .35, t, .115, .94, .115);
    }
    for (let i = 0; i < 2; i++) {
      const span = (gangwayEnd - pierEnd) / 2;
      rope("gangway hand rope", Array.from({ length: 11 }, (_, j) => {
        const f = j / 10, t = pierEnd + (i + f) * span;
        return point(rail, gangwayHeight(t) + .73 - Math.sin(Math.PI * f) * .11, t);
      }), .035);
    }
    rope("Pearl mooring line", [
      point(u, pierHeight(pierEnd) + .44, pierEnd - .42),
      point(side * 2.1, 1.12, pierEnd + 2.7),
      point(side * 4.5, 2.19, gangwayEnd + .94),
    ], .046);
  }
  for (const [parts, material] of [[boards, timber], [ropes, hemp]] as const) {
    const mesh = Mesh.MergeMeshes(parts, true, true);
    if (!mesh) continue;
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    shadows.addShadowCaster(mesh);
  }
  const animate = buildHarbourScenery(scene, shadows, {
    center: new Vector3(dock.shipX, 0, dock.shipZ), yaw: -Math.PI / 2, scale: dock.scale,
  });
  const obstacles = harbourObstacles().filter(obstacle => Math.abs(obstacle.x) < 6)
    .map(obstacle => ({
      x: dock.shipX - obstacle.z * dock.scale,
      z: dock.shipZ + obstacle.x * dock.scale,
      rx: obstacle.rz * dock.scale,
      rz: obstacle.rx * dock.scale,
      top: obstacle.top * dock.scale,
    }));
  return { ...dock, animate, obstacles };
}

export type HarborDeck = ReturnType<typeof buildHarbor>;
