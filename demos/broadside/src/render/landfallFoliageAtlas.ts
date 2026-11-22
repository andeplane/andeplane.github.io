import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Rng } from "../sim/rng";

type Brush = CanvasRenderingContext2D;
const W = 256,
  H = 384;
export const foliageTiles = { palm: 0, spruce: 1, hardwood: 2, sedge: 3 } as const;

function stem(c: Brush, x: number, y: number, xx: number, yy: number, width: number, ink: string) {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(xx, yy);
  c.strokeStyle = ink;
  c.lineWidth = width;
  c.stroke();
}

// A painted, tapering blade with a folded midrib. Root-to-point gradients keep
// a full frond readable from across the inlet; vein strokes resolve at eye level.
function blade(
  c: Brush,
  x: number,
  y: number,
  xx: number,
  yy: number,
  width: number,
  curve: number,
  base: string,
  tip: string,
) {
  const dx = xx - x,
    dy = yy - y,
    len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = -dy / len,
    ny = dx / len;
  const mx = (x + xx) * 0.5 + nx * curve,
    my = (y + yy) * 0.5 + ny * curve;
  const pigment = c.createLinearGradient(x, y, xx, yy);
  pigment.addColorStop(0, base);
  pigment.addColorStop(1, tip);
  c.fillStyle = pigment;
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(mx + nx * width, my + ny * width, xx, yy);
  c.quadraticCurveTo(mx - nx * width, my - ny * width, x, y);
  c.fill();
  c.strokeStyle = "rgba(225,227,139,.45)";
  c.lineWidth = Math.max(0.7, width * 0.09);
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(mx, my, xx, yy);
  c.stroke();
}

function palm(c: Brush, rng: Rng) {
  c.lineCap = "round";
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 30; i++) {
      const t = (i + rng.range(0, 0.38)) / 30;
      const y = H - 46 - t * (H - 65),
        leaf = Math.pow(Math.sin((t * 0.9 + 0.095) * Math.PI), 0.77);
      const rootX = W * 0.5 + 3 * Math.sin(t * 4.4);
      const reach = (18 + leaf * 102) * rng.range(0.92, 1);
      const tx = rootX + side * reach,
        ty = y - (15 + reach * 0.41) * rng.range(0.8, 1.15);
      const young = i % 5 < 2;
      blade(
        c,
        rootX,
        y,
        tx,
        ty,
        3.8 + leaf * 4.5,
        side * reach * 0.12,
        young ? "#507339" : "#345c36",
        young ? "#bbca6a" : "#8aaf56",
      );
      // A second, fine vein, most visible where a blade crosses the sun.
      if (i % 3 === 1)
        stem(
          c,
          rootX + side * reach * 0.23,
          y - (y - ty) * 0.11,
          tx - side * reach * 0.12,
          ty + (y - ty) * 0.07,
          0.72,
          "rgba(222,220,129,.38)",
        );
    }
  }
  const rib = c.createLinearGradient(0, H, 0, 0);
  rib.addColorStop(0, "#a99053");
  rib.addColorStop(0.38, "#bbc079");
  rib.addColorStop(1, "#9ab763");
  c.strokeStyle = rib;
  c.lineWidth = 3.4;
  c.beginPath();
  c.moveTo(W * 0.5, H - 2);
  c.bezierCurveTo(W * 0.5, H * 0.7, W * 0.54, H * 0.4, W * 0.5, 6);
  c.stroke();
  blade(c, W * 0.5, 37, W * 0.5, 3, 2, 0.5, "#8aad56", "#c0cb76");
}

function spruce(c: Brush, rng: Rng) {
  c.lineCap = "round";
  stem(c, 128, 381, 127, 8, 4, "#6f644b");
  for (let j = 0; j < 14; j++)
    for (const side of [-1, 1]) {
      const t = (j + rng.range(0, 0.5)) / 14,
        y = 352 - t * 316;
      const reach = 100 * Math.pow(1 - t, 0.68) + 11,
        tx = 128 + side * reach,
        ty = y - 35 - reach * 0.23;
      // A dark core under the needles keeps the branch legible through mipmaps.
      blade(c, 128, y, tx, ty, 8, -side * 9, "#2a4942", "#476b57");
      for (let n = 0; n < 13; n++) {
        const u = (n + 0.35) / 13,
          x = 128 + (tx - 128) * u,
          by = y + (ty - y) * u + Math.sin(u * Math.PI) * 4;
        const len = (11 + 17 * (1 - u)) * rng.range(0.76, 1.19);
        blade(
          c,
          x,
          by,
          x + side * len * 0.64,
          by - len,
          2.2,
          -side * 1.7,
          "#385d4b",
          rng.pick(["#779678", "#668c73", "#96aa81"]),
        );
        blade(c, x, by, x + side * len, by + len * 0.22, 2.2, side * 2.2, "#315145", "#739479");
      }
    }
}

function hardwood(c: Brush, rng: Rng) {
  c.lineCap = "round";
  stem(c, 125, 382, 134, 10, 4, "#73644a");
  for (let j = 0; j < 8; j++)
    for (const side of [-1, 1]) {
      const t = (j + 0.3) / 8,
        by = 348 - t * 292,
        span = 28 + 77 * Math.sin(t * Math.PI);
      const bx = 129 + side * span,
        ty = by - rng.range(22, 47);
      stem(c, 128, by + 20, bx, ty, 2.1, "#61704a");
      for (let n = 0; n < 3; n++) {
        const u = (n + 0.65) / 3,
          x = 128 + (bx - 128) * u,
          y = by + (ty - by) * u;
        const extent = rng.range(19, 31);
        blade(
          c,
          x,
          y,
          x + side * extent * 0.67,
          y - extent * 1.34,
          rng.range(6, 11),
          -side * 2,
          "#416445",
          "#99b569",
        );
        blade(
          c,
          x,
          y,
          x + side * extent * 1.3,
          y + extent * 0.2,
          rng.range(7, 12),
          side * 2,
          "#406546",
          "#83a661",
        );
      }
    }
  blade(c, 130, 57, 135, 4, 12, 3, "#698959", "#b9c875");
}

function sedge(c: Brush, rng: Rng) {
  c.lineCap = "round";
  for (let i = 0; i < 34; i++) {
    const x = rng.range(91, 166),
      reach = rng.range(-111, 111);
    const y = H - rng.range(3, 18),
      rise = rng.range(100, 336) * (1 - (0.24 * Math.abs(reach)) / 115);
    const tx = Math.max(3, Math.min(W - 3, x + reach)),
      ty = y - rise;
    blade(
      c,
      x,
      y,
      tx,
      ty,
      rng.range(2.5, 6.7),
      -reach * 0.26,
      "#53613b",
      rng.pick(["#a4aa60", "#899c56", "#b8b578", "#77924f", "#c3bc79"]),
    );
  }
  for (let i = 0; i < 3; i++) {
    const x = rng.range(105, 150),
      tx = x + rng.range(-48, 58),
      ty = rng.range(16, 92);
    stem(c, x, 377, tx, ty, 1.6, "#9d9d5a");
    for (let j = 0; j < 6; j++)
      for (const side of [-1, 1]) {
        const y = ty + j * 5;
        blade(c, tx, y, tx + side * (4 + j * 0.72), y - 10 + j * 0.4, 2.7, 1, "#8f8059", "#d6c58a");
      }
  }
}

export function leafAtlas(scene: Scene) {
  const tex = new DynamicTexture(
    "painted palm leaflets, spruce sprays, oak leaves and sea oats",
    { width: W * 4, height: H },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  const c = tex.getContext() as CanvasRenderingContext2D;
  for (const [i, paint] of [palm, spruce, hardwood, sedge].entries()) {
    c.save();
    c.translate(i * W, 0);
    c.beginPath();
    c.rect(1, 1, W - 2, H - 2);
    c.clip();
    paint(c, new Rng(719 + i * 863));
    c.restore();
  }
  tex.hasAlpha = true;
  tex.anisotropicFilteringLevel = 4;
  tex.update();
  return tex;
}

export function barkAtlas(scene: Scene) {
  const tex = new DynamicTexture("fibrous salt-weathered bark", { width: 256, height: 256 }, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D,
    rng = new Rng(735);
  c.fillStyle = "#c6b299";
  c.fillRect(0, 0, 256, 256);
  // The diffuse map wraps around the curved bole, so growth marks meet at the seam.
  for (let i = 0; i < 1700; i++) {
    const x = rng.range(-2, 257),
      y = rng.range(-18, 260);
    stem(
      c,
      x,
      y,
      x + rng.range(-1.5, 1.5),
      y + rng.range(3, 22),
      rng.range(0.45, 2),
      rng.pick(["rgba(100,73,49,.28)", "rgba(241,219,175,.32)", "rgba(139,104,76,.28)"]),
    );
  }
  for (let j = 0; j < 9; j++) {
    const h = ((j + 0.3) * 256) / 9,
      phase = rng.range(0, 6.28);
    for (const offset of [-1, 1.4]) {
      c.beginPath();
      for (let x = 0; x <= 256; x += 4) {
        const y =
          h + Math.sin((x * Math.PI) / 128 + phase) * 3.8 + Math.cos((x * Math.PI) / 32 + phase) * 0.95 + offset;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.lineWidth = offset < 0 ? 2.2 : 1.55;
      c.strokeStyle = offset < 0 ? "rgba(84,61,43,.58)" : "rgba(235,213,168,.74)";
      c.stroke();
    }
  }
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  tex.update();
  return tex;
}
