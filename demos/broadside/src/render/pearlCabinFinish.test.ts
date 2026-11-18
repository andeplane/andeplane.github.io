import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { fitPearlCabinFinish } from "../shared/pirate-world/render/pearlCabinFinish";

describe("private Pearl cabin timber", () => {
  it("reuses a separate native grain texture without modifying the imported finish or unrelated materials", async () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const source = new PBRMaterial("Wood_00", scene);
      const texture = RawTexture.CreateRGBATexture(new Uint8Array(256 * 256 * 4).fill(90), 256, 256, scene);
      source.albedoTexture = texture;
      vi.spyOn(texture, "readPixels").mockResolvedValue(new Uint8Array(256 * 256 * 4).fill(90));
      const frame = new StandardMaterial("cabin dark carved oak", scene);
      const original = new StandardMaterial("purchased wheel", scene);
      await fitPearlCabinFinish(scene, [source]);
      expect(source.albedoTexture).toBe(texture);
      expect(texture.getInternalTexture()).not.toBeNull();
      expect(frame.diffuseTexture).not.toBe(texture);
      expect(frame.diffuseTexture?.name).toBe("Pearl native timber · cabin dark carved oak");
      expect(frame.diffuseTexture?.getSize().width).toBe(128);
      expect(original.diffuseTexture).toBeNull();
    } finally { scene.dispose(); engine.dispose(); }
  });
  it("keeps boarding viable when a mobile driver rejects native texture readback", async () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const source = new PBRMaterial("Wood_00", scene), frame = new StandardMaterial("cabin dark carved oak", scene);
      const texture = RawTexture.CreateRGBATexture(new Uint8Array(16 * 16 * 4), 16, 16, scene);
      source.albedoTexture = texture; frame.diffuseTexture = texture;
      vi.spyOn(texture, "readPixels").mockRejectedValue(new Error("driver disallows readback"));
      await expect(fitPearlCabinFinish(scene, [source])).resolves.toBeUndefined();
      expect(frame.diffuseTexture).toBe(texture);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
