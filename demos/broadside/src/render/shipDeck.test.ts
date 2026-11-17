import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { ShipModels } from "./shipModels";
import { shipDeckGeometry } from "./shipDeck";
import { DeckWalk } from "../game/deckWalk";
import { SHIP_SPECS } from "../sim/ships";
import { furledCanvasPositions } from "./shipCanvas";

vi.mock("../shared/pirate-world/render/timber", () => ({ timberTexture: (scene: Scene) => new Texture(null, scene) }));

const idle = { forward: 0, right: 0, sprint: false, crouch: false, jump: false };
describe("physical helm on rendered ship decks", () => {
  it("gathers every low public canvas corner above the eye without stretching its seams", async () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const bytes = new Uint8Array(readFileSync(new URL("../../public/assets/ships/black-pearl.glb", import.meta.url)));
      const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: ".glb" });
      const models = new ShipModels(scene); Object.assign(models, { playerContainer: container });
      const root = new TransformNode("canvas regression", scene), spec = SHIP_SPECS.galleon;
      const model = models.create("galleon", "player", "canvas regression"); model.parent = root;
      const x = -spec.beam * .16, seatZ = -spec.length * .34;
      const geometry = shipDeckGeometry(scene, model, root, spec.length, spec.beam, x, seatZ - 1.35, seatZ);
      const eyeY = geometry.floor(x + .26, seatZ - 1.35) + 1.65;
      const canvas = model.getChildMeshes().find(m => m.name.includes("longitudinal-black-canvas-sail"))!;
      expect(canvas).toBeDefined();
      const iron = model.getChildMeshes().find(m => m.material?.name.includes("iron_cannons"))!;
      const originalIron = container.meshes.find(m => m.material?.name.includes("iron_cannons"))!;
      const triangles = (mesh: typeof canvas) => {
        const p = mesh.getVerticesData(VertexBuffer.PositionKind)!, indices = mesh.getIndices()!, result: string[] = [];
        for (let i = 0; i < indices.length; i += 3) result.push([0, 1, 2].map(corner => {
          const n = indices[i + corner]! * 3; return [p[n], p[n + 1], p[n + 2]].join(',');
        }).join(';'));
        return result;
      };
      // Extraction preserves every exact original triangle. Iron keeps its other rigging and cannons.
      expect([...triangles(iron), ...triangles(canvas)].sort()).toEqual(triangles(originalIron).sort());
      expect(iron.getTotalIndices()).toBeGreaterThan(canvas.getTotalIndices());
      expect(model.getChildMeshes().reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0))
        .toBe(container.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0));
      canvas.computeWorldMatrix(true); root.computeWorldMatrix(true);
      const toDeck = canvas.getWorldMatrix().multiply(root.getWorldMatrix().clone().invert());
      const original = Array.from(canvas.getVerticesData(VertexBuffer.PositionKind)!);
      const gathered = furledCanvasPositions(original, toDeck, Math.max(spec.length * .48, eyeY + 2.2));
      const before: Vector3[] = [], after: Vector3[] = [];
      for (let i = 0; i < original.length; i += 3) {
        before.push(Vector3.TransformCoordinates(Vector3.FromArray(original, i), toDeck));
        after.push(Vector3.TransformCoordinates(Vector3.FromArray(gathered, i), toDeck));
      }
      // This near-eye spanker was previously mislabeled iron and never furled at all.
      expect(Math.min(...before.map(p => p.y))).toBeLessThan(eyeY);
      expect(Math.min(...after.map(p => p.y))).toBeGreaterThan(eyeY + 1.5);
      let maximumStretch = 0;
      const indices = canvas.getIndices()!;
      for (let i = 0; i < indices.length; i += 3) for (let edge = 0; edge < 3; edge++) {
        const a = indices[i + edge]!, b = indices[i + (edge + 1) % 3]!;
        maximumStretch = Math.max(maximumStretch, Vector3.Distance(after[a]!, after[b]!) - Vector3.Distance(before[a]!, before[b]!));
      }
      expect(maximumStretch).toBeLessThan(.0001);
      expect(Array.from(canvas.getVerticesData(VertexBuffer.PositionKind)!)).toEqual(original);
    } finally { scene.dispose(); engine.dispose(); }
  });
  for (const modelType of ["public Pearl", "procedural fallback"]) {
    it(`can immediately resume from a settled walking spawn on the ${modelType}`, async () => {
      const engine = new NullEngine(), scene = new Scene(engine);
      try {
        const models = new ShipModels(scene);
        if (modelType === "public Pearl") {
          const bytes = new Uint8Array(readFileSync(new URL("../../public/assets/ships/black-pearl.glb", import.meta.url)));
          const container = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: ".glb" });
          Object.assign(models, { playerContainer: container });
        }
        const spec = SHIP_SPECS.galleon, root = new TransformNode("test sailing ship", scene);
        const model = models.create("galleon", "player", "helm regression"); model.parent = root;
        const x = -spec.beam * .16, seatZ = -spec.length * .34;
        const geometry = shipDeckGeometry(scene, model, root, spec.length, spec.beam, x, seatZ - 1.35, seatZ);
        if (modelType === "public Pearl") {
          // The actual quarterdeck is stepped here: the old reference-height
          // spawn was outside the helm's vertical reach after the walker settled.
          expect(Math.abs(geometry.helm.y - geometry.floor(x, seatZ))).toBeGreaterThan(.7);
        }
        expect(geometry.helm.y).toBeCloseTo(geometry.floor(x, seatZ - 1.35), 6);
        const deck = new DeckWalk(geometry); deck.leave();
        for (let frame = 0; frame < 180; frame++) deck.step(idle, 1 / 60);
        expect(deck.walker.feet).toBeCloseTo(geometry.helm.y, 6);
        expect(deck.nearHelm).toBe(true);
        expect(deck.takeHelm()).toBe(true);
      } finally { scene.dispose(); engine.dispose(); }
    });
  }
});
