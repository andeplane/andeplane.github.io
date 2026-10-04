import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Rng } from "../sim/rng";

/** Fine, seamless grain. Large-scale colour and shape come from the landscape. */
export function islandSurface(scene: Scene, stone = false): StandardMaterial {
  const texture = new DynamicTexture(stone ? "weathered stone grain" : "sand and soil grain",
    { width: 256, height: 256 }, scene, true);
  const context = texture.getContext() as CanvasRenderingContext2D;
  const pixels = context.createImageData(256, 256);
  const rng = new Rng(stone ? 83 : 59);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const bands = Math.sin((x * 3 + y * 7) * Math.PI / 128)
      * Math.sin((x * 5 - y * 2) * Math.PI / 128);
    const grain = Math.round(236 + bands * (stone ? 12 : 4) + rng.range(-8, 8));
    const i = (y * 256 + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = grain;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  texture.update();
  texture.anisotropicFilteringLevel = 4;
  const material = new StandardMaterial(stone ? "rounded weathered rock" : "continuous island surface", scene);
  material.diffuseTexture = texture;
  material.diffuseColor = Color3.White();
  material.specularColor.set(stone ? .1 : .025, stone ? .12 : .025, stone ? .13 : .025);
  material.specularPower = stone ? 40 : 24;
  return material;
}
