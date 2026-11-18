import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Rng } from "../sim/rng";

/** Seamless mineral weathering and sand grain; macro colour remains in the terrain. */
export function islandSurface(scene: Scene, stone = false): StandardMaterial {
  const size = 256;
  const texture = new DynamicTexture(stone ? "weathered stone grain" : "sand and soil grain",
    { width: size, height: size }, scene, true);
  const normal = new DynamicTexture(stone ? "stone weathering relief" : "fine sand relief",
    { width: size, height: size }, scene, true);
  const context = texture.getContext() as CanvasRenderingContext2D;
  const normalContext = normal.getContext() as CanvasRenderingContext2D;
  const pixels = context.createImageData(size, size), normals = normalContext.createImageData(size, size);
  const rng = new Rng(stone ? 83 : 59);
  const grids = [4, 8, 16, 32, 64].map(frequency => ({ frequency,
    values: Array.from({ length: frequency * frequency }, () => rng.range(0, 1)) }));
  const sample = (x: number, y: number, octave: number) => {
    const { frequency: f, values } = grids[octave]!;
    const xx = x / size * f, yy = y / size * f;
    const ix = Math.floor(xx), iy = Math.floor(yy), sx = xx - ix, sy = yy - iy;
    const u = sx * sx * (3 - 2 * sx), v = sy * sy * (3 - 2 * sy);
    const at = (a: number, b: number) => values[((b + f) % f) * f + ((a + f) % f)]!;
    return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v)
      + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v;
  };
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const coarse = sample(x, y, 0), medium = sample(x, y, 2), fine = sample(x, y, 4);
    const vein = Math.pow(Math.max(0, 1 - Math.abs(Math.sin((x * 2 + y * 3) * Math.PI / 128 + coarse * 4)) * 8), 2);
    const grain = rng.range(-1, 1);
    heights[y * size + x] = stone
      ? coarse * .45 + medium * .3 + fine * .17 - vein * .08 + grain * .035
      : medium * .12 + fine * .2 + grain * .12;
    const tint = stone ? 217 + coarse * 20 + medium * 10 - vein * 13 + grain * 5
      : 235 + (medium - .5) * 8 + grain * 5;
    const i = (y * size + x) * 4;
    pixels.data[i] = tint;
    pixels.data[i + 1] = tint;
    pixels.data[i + 2] = stone ? tint - 2 : tint - 1;
    pixels.data[i + 3] = 255;
  }
  const h = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const strength = stone ? 3.8 : .8;
    const nx = (h(x - 1, y) - h(x + 1, y)) * strength;
    const ny = (h(x, y - 1) - h(x, y + 1)) * strength;
    const length = Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
    normals.data[i] = (nx / length * .5 + .5) * 255;
    normals.data[i + 1] = (ny / length * .5 + .5) * 255;
    normals.data[i + 2] = (1 / length * .5 + .5) * 255;
    normals.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0); normalContext.putImageData(normals, 0, 0);
  texture.update(); normal.update();
  texture.anisotropicFilteringLevel = normal.anisotropicFilteringLevel = 4;
  const material = new StandardMaterial(stone ? "rounded weathered rock" : "continuous island surface", scene);
  material.diffuseTexture = texture; material.bumpTexture = normal;
  material.diffuseColor = Color3.White();
  material.specularColor.set(stone ? .075 : .025, stone ? .08 : .025, stone ? .07 : .025);
  material.specularPower = stone ? 28 : 24;
  return material;
}
