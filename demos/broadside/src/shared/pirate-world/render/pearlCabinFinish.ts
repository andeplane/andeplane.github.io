import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

const side = 128;
async function nativeGrain(authored: readonly Material[], name: string, top: number, height: number) {
  const native = authored.find(m => m.name === name);
  if (!(native instanceof PBRMaterial) || !native.albedoTexture) return null;
  const source = native.albedoTexture, size = source.getSize();
  // Some mobile drivers prohibit readback. The modeled room already has a
  // weathered fallback finish; boarding must still succeed on those drivers.
  let pixels: ArrayBufferView | null;
  try { pixels = await source.readPixels(); } catch { return null; }
  if (!pixels || !size.width || !size.height) return null;
  const values = pixels as Uint8Array, samples = new Uint8Array(side * side * 3), mean = [0, 0, 0];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    // Rotate native horizontal fibres into each board's longitudinal V.
    const sx = Math.floor((.025 + y / side * .35) * size.width);
    const sy = Math.floor((top + x / side * height) * size.height);
    for (let c = 0; c < 3; c++) {
      let value = 0;
      // Cross-grain flecks must not turn into crushed-stone speckle on a phone.
      for (let tap = -2; tap <= 2; tap++) value += values[(sy * size.width + Math.max(0, Math.min(size.width - 1, sx + tap * 6))) * 4 + c]! / 5;
      samples[(y * side + x) * 3 + c] = value; mean[c]! += value / (side * side);
    }
  }
  return mean[0]! >= 1 ? { samples, mean } : null;
}

/** Sample the private ship's worn timber in its own scene. The small grain
 * fields exclude atlas ornaments/padding. No licensed image becomes a new
 * distributable asset or a separate network request.
 */
export async function fitPearlCabinFinish(scene: Scene, authored: readonly Material[]): Promise<void> {
  const [wallGrain, deckGrain] = await Promise.all([
    nativeGrain(authored, "Wood_00", .065, .09),
    nativeGrain(authored, "Wood_01", .015, .075),
  ]);
  if (!wallGrain) return;
  for (const mat of scene.materials) {
    if (!(mat instanceof StandardMaterial)) continue;
    const deck = mat.name.startsWith("cabin deck");
    const target = deck ? [87, 76, 61]
      : mat.name === "cabin weathered hull planking" ? [70, 57, 46]
      : mat.name === "cabin dark carved oak" ? [48, 39, 33]
      : mat.name === "cabin worn carved relief" ? [94, 76, 57]
      : mat.name === "Pearl chest aged mahogany" ? [80, 56, 38]
      : mat.name === "Pearl chest warm teak planks" ? [88, 65, 46] : null;
    if (!target) continue;
    const { samples, mean } = deck ? deckGrain ?? wallGrain : wallGrain;
    const data = new Uint8Array(samples.length);
    for (let i = 0; i < data.length; i++) {
      const pixel = Math.floor(i / 3), x = pixel % side, y = Math.floor(pixel / side);
      const fibres = deck ? Math.sin((x + Math.sin(y * .024) * .35) * 2.3) * 3.8 + Math.sin(x * 5.1 + Math.sin(y * .032) * .2) * 2.2 : 0;
      data[i] = Math.max(0, Math.min(255, target[i % 3]! + (samples[i]! - mean[i % 3]!) * (deck ? .55 : 1.1) + fibres));
    }
    const texture = RawTexture.CreateRGBTexture(data, side, side, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    texture.name = `Pearl native timber · ${mat.name}`; texture.gammaSpace = true; texture.anisotropicFilteringLevel = 4;
    if (mat.name.startsWith("Pearl chest")) texture.wAng = Math.PI / 2;
    mat.diffuseTexture = texture;
    mat.diffuseColor = mat.name === "cabin deck worn oak" ? new Color3(.94, .92, .88)
      : mat.name === "cabin deck aged oak" ? new Color3(.86, .85, .81) : Color3.White();
    mat.specularColor.set(.075, .065, .05); mat.specularPower = 28;
  }
}
