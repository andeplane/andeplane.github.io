import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { COIN_RADIUS, COIN_THICKNESS } from "../game/goldAreas";

export function doubloonMaterial(scene: Scene): StandardMaterial {
  const texture = new DynamicTexture("hammered doubloon engraving", 256, scene, true);
  const c = texture.getContext() as CanvasRenderingContext2D;
  c.fillStyle = "#c79848";
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = (i * 71.73) % 256, y = (i * 113.41) % 256;
    c.fillStyle = i % 2 ? "#d4ab61" : "#b68738";
    c.fillRect(x, y, 1.2, 1.2);
  }
  const stamp = (ctx: CanvasRenderingContext2D, color: string) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    for (const radius of [106, 94]) {
      ctx.lineWidth = radius === 106 ? 3 : 2;
      ctx.beginPath(); ctx.arc(128, 128, radius, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16;
      ctx.beginPath(); ctx.arc(128 + Math.sin(a) * 100, 128 + Math.cos(a) * 100, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    // Raised compass rose with eight points and a central pirate's skull.
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(128 + Math.sin(a) * 76, 128 + Math.cos(a) * 76);
      ctx.lineTo(128 + Math.sin(a + .18) * 36, 128 + Math.cos(a + .18) * 36);
      ctx.lineTo(128 + Math.sin(a - .18) * 36, 128 + Math.cos(a - .18) * 36);
      ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(128, 123, 23, 26, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillRect(114, 147, 28, 7);
    ctx.beginPath(); ctx.arc(120, 121, 5, 0, Math.PI * 2); ctx.arc(136, 121, 5, 0, Math.PI * 2); ctx.fill();
  };
  stamp(c, "#936a2b");
  texture.update();
  const relief = new DynamicTexture("struck coin relief", 256, scene, true);
  const h = document.createElement("canvas"); h.width = h.height = 256;
  const hc = h.getContext("2d")!; hc.fillStyle = "#808080"; hc.fillRect(0, 0, 256, 256); stamp(hc, "#b0b0b0");
  const heights = hc.getImageData(0, 0, 256, 256).data;
  const nc = relief.getContext() as CanvasRenderingContext2D, out = nc.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const read = (dx: number, dy: number) => heights[4 * (Math.max(0, Math.min(255, y + dy)) * 256 + Math.max(0, Math.min(255, x + dx)))]!;
    const dx = (read(-1, 0) - read(1, 0)) / 100, dy = (read(0, -1) - read(0, 1)) / 100, n = Math.hypot(dx, dy, 1), i = (y * 256 + x) * 4;
    out.data[i] = 128 + dx / n * 127; out.data[i + 1] = 128 + dy / n * 127; out.data[i + 2] = 128 + 127 / n; out.data[i + 3] = 255;
  }
  nc.putImageData(out, 0, 0); relief.update(); relief.level = 0.6;
  const material = new StandardMaterial("aged reflective pirate doubloons", scene);
  material.diffuseTexture = texture;
  material.bumpTexture = relief;
  material.diffuseColor = new Color3(.84, .77, .63);
  material.specularColor = Color3.FromHexString("#f4d58c");
  material.specularPower = 52;
  material.maxSimultaneousLights = 6;
  return material;
}

/** Bevelled edge and struck raised rim: a solid coin, including when seen edge-on. */
export function doubloonMesh(scene: Scene, name: string): Mesh {
  const mesh = new Mesh(name, scene), segments = 16, h = COIN_THICKNESS / 2, r = COIN_RADIUS;
  const profile = [[0, -h + .004], [r * .94, -h + .004], [r, -h + .006], [r, h - .006], [r * .94, h - .004], [0, h - .004]];
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [], normals: number[] = [];
  for (const [radius, height] of profile) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, x = Math.cos(a) * radius!, z = Math.sin(a) * radius!;
    positions.push(x, height!, z); uvs.push(.5 + x / (r * 2), .5 + z / (r * 2));
  }
  for (let j = 0; j < profile.length - 1; j++) for (let i = 0; i < segments; i++) {
    const n = j * (segments + 1) + i;
    // One triangle per cap sector, rather than duplicate centre triangles.
    if(j>0)indices.push(n,n+1,n+segments+1);
    if(j<profile.length-2)indices.push(n+1,n+segments+2,n+segments+1);
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs; data.applyToMesh(mesh);
  mesh.receiveShadows = true;
  return mesh;
}
