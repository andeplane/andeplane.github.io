import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** Original, deterministic timber surface. Grain follows the board, with staggered joinery. */
export function timberTexture(scene: Scene, name: string, planks = 1): DynamicTexture {
  const texture = new DynamicTexture(name, { width: 512, height: 512 }, scene, true);
  const c = texture.getContext() as CanvasRenderingContext2D;
  const width = 512 / planks;
  for (let board = 0; board < planks; board++) {
    const shade = [0, 8, -5, 4, -2][board % 5]!;
    c.fillStyle = `rgb(${139 + shade},${89 + shade},${48 + shade})`;
    c.fillRect(board * width, 0, width, 512);
    c.save(); c.beginPath(); c.rect(board * width + 1, 0, width - 2, 512); c.clip();
    for (let i = 0; i < 52; i++) {
      const x = board * width + (i * 19.731 % width);
      c.strokeStyle = i % 3 ? "rgba(55,27,12,.1)" : "rgba(247,198,122,.08)";
      c.lineWidth = i % 7 ? .65 : 1.4;
      c.beginPath(); c.moveTo(x, 0);
      c.bezierCurveTo(x + Math.sin(i) * 3, 150, x - Math.cos(i) * 4, 350, x, 512); c.stroke();
    }
    c.restore();
    if (planks > 1) {
      c.fillStyle = "#37281d"; c.fillRect(board * width, 0, 1.7, 512);
      c.fillStyle = "rgba(245,197,126,.24)"; c.fillRect(board * width + 2, 0, 1, 512);
      for (let joint = 0; joint < 3; joint++) {
        const y = (joint * 181 + board % 3 * 59) % 512;
        c.fillStyle = "#483020"; c.fillRect(board * width, y, width, 1.4);
        c.fillStyle = "#553b26";
        for (const x of [board * width + 5, (board + 1) * width - 5]) {
          c.beginPath(); c.arc(x, y + 5, 1, 0, Math.PI * 2); c.fill();
        }
      }
    }
  }
  texture.update(); texture.anisotropicFilteringLevel = 4;
  return texture;
}
