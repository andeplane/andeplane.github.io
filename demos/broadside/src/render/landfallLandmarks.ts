import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { IslandScenery, vec } from "./landfallScenery";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

function beacon(s: IslandScenery) {
  const { x, z } = s.site.landmark,
    y = s.floor(x, z) - 0.22;
  const at = (dy: number) => vec(x, y + dy, z);
  s.pole("lighthouse foundation", at(-1), at(0.6), 4.9, 4.6, "#9f967a", 16, s.stone);
  for (let i = 0; i < 6; i++) {
    const band = 0.6 + i * 1.13,
      diameter = 3.6 - i * 0.24;
    s.pole(
      "limewashed tower band",
      at(band),
      at(band + 1.135),
      diameter,
      diameter - 0.24,
      i === 1 || i === 4 ? "#b94d37" : "#efdbaf",
      20,
      s.stone,
    );
  }
  s.pole("lantern balcony", at(7.3), at(7.58), 3.7, 3.9, "#424e4c", 18);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      b = ((i + 1) * Math.PI) / 6;
    const p = vec(x + 1.79 * Math.sin(a), y + 7.54, z + 1.79 * Math.cos(a));
    const q = vec(x + 1.79 * Math.sin(b), y + 8.19, z + 1.79 * Math.cos(b));
    s.pole("iron baluster", p, p.add(vec(0, 0.65, 0)), 0.075, 0.07, "#435158", 6);
    s.pole("balcony handrail", p.add(vec(0, 0.65, 0)), q, 0.09, 0.09, "#49545a", 6);
  }
  s.pole("Fresnel lantern glass", at(7.65), at(8.95), 1.85, 1.85, "#ffd784", 12, s.glow);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      dx = Math.sin(a) * 0.99,
      dz = Math.cos(a) * 0.99;
    s.pole("lantern mullion", vec(x + dx, y + 7.6, z + dz), vec(x + dx, y + 9, z + dz), 0.1, 0.1, "#374548", 6);
  }
  s.pole("lantern roof", at(8.97), at(9.83), 3.0, 0.2, "#55736c", 12);
  s.pole("weather vane", at(9.82), at(10.6), 0.13, 0.03, "#d7ac62", 8);
  s.stoneBlock("painted doorway", x, y + 1.39, z - 1.64, 1.04, 1.75, 0.3, "#405c55");
  for (let i = 0; i < 3; i++)
    s.stoneBlock("worn steps", x, y + 0.47 - i * 0.18, z - 1.96 - i * 0.34, 1.66, 0.3, 0.58, "#c4b99d");
  for (let i = 0; i < 3; i++)
    s.stoneBlock("narrow tower window", x, y + 3.55 + i * 1.12, z - 1.44 + i * 0.13, 0.4, 0.62, 0.18, "#334e52");
  s.solid(x, z, 1.85, 1.85, 9.9);
}

function pennant(s: IslandScenery, x: number, y: number, z: number, height: number, scale: number): Mesh {
  const top = vec(x, y + height, z);
  s.pole("tarred flagstaff", vec(x, y - 0.12, z), top.add(vec(0, 0.2, 0)), 0.17, 0.11, "#6d5646", 9);
  const flag = MeshBuilder.CreateRibbon(
    "torn scarlet pennant",
    {
      pathArray: [
        [vec(0, 0, 0), vec(0.8, 0.03, 0.1), vec(1.7, -0.04, -0.12), vec(2.6, -0.1, 0.09), vec(3.4, -0.26, -0.08)],
        [
          vec(0, -0.95, 0),
          vec(0.8, -0.83, 0.12),
          vec(1.7, -0.68, -0.12),
          vec(2.6, -0.58, 0.09),
          vec(2.65, -0.41, -0.08),
        ],
      ],
      sideOrientation: 2,
    },
    s.scene,
  );
  const cloth = new StandardMaterial("faded crimson canvas", s.scene);
  cloth.diffuseColor = Color3.FromHexString("#ca5946");
  cloth.emissiveColor.set(0.1, 0.026, 0.02);
  cloth.specularColor.setAll(0.02);
  cloth.backFaceCulling = false;
  flag.material = cloth;
  flag.position.copyFrom(top);
  flag.scaling.setAll(scale);
  flag.isPickable = false;
  return flag;
}

function corsairFort(s: IslandScenery) {
  const { x, z } = s.site.landmark,
    y = s.floor(x, z);
  const at = (dy: number) => vec(x, y + dy, z);
  s.pole("battered watchtower footing", at(-1.15), at(0.6), 5.1, 4.7, "#6d6960", 12, s.stone);
  const palette = ["#998a68", "#b19c77", "#938777", "#a1957c", "#c2a784"];
  for (let row = 0; row < 8; row++) {
    const r = 1.85 - row * 0.027;
    for (let i = 0; i < 12; i++) {
      const a = ((i + (row % 2) * 0.5) * Math.PI) / 6;
      if ((row > 5 && i < 3) || (row > 1 && row < 5 && i === 6)) continue;
      const brick = s.stoneBlock(
        "salt-worn fort masonry",
        x + r * Math.sin(a),
        y + 0.72 + row * 0.46,
        z + r * Math.cos(a),
        1.02,
        0.455,
        0.58,
        s.rng.pick(palette),
      );
      brick.rotation.y = a;
    }
  }
  for (let i = 0; i < 10; i++) {
    const dx = -0.22 * i,
      dz = 0.91 * i,
      h = 3.3 - i * 0.21;
    const bx = x + 2 + dx,
      bz = z + dz,
      bottom = s.floor(bx, bz) - 0.26;
    const block = s.stoneBlock("tumbled sea wall", bx, bottom + h * 0.5, bz, 0.8, h, 0.95, s.rng.pick(palette));
    block.rotation.y = -0.22;
    if (i % 2 === 0)
      s.stoneBlock("broken battlement", bx, bottom + h + 0.23, bz, 0.9, 0.5, 0.62, "#b09f81").rotation.y = -0.22;
    s.solid(bx, bz, 0.48, 0.48, h);
  }
  s.pole("watchtower timber roof socket", at(3.75), at(3.93), 2.86, 2.86, "#5c5040", 10);
  s.solid(x, z, 2.2, 2.2, 4.6);
  return pennant(s, x + 0.7, y + 3.8, z, 3.7, 1.15);
}

function tideArch(s: IslandScenery) {
  const { x, z } = s.site.landmark,
    y = s.floor(x, z);
  const face = s.rng.range(-0.3, 0.3);
  // Wedge faces meet along the radius, so daylight is visible through the tilted arch.
  const where = (a: number, r: number, d: number) => {
    const local = Math.cos(a) * r + 0.12 * Math.sin(a) * r;
    return vec(
      x + local * Math.cos(face) + d * Math.sin(face),
      y + 0.15 + Math.sin(a) * r * 0.98,
      z - local * Math.sin(face) + d * Math.cos(face),
    );
  };
  const colors = ["#828d91", "#677f83", "#a1b0ac", "#7c9495"];
  for (let i = 0; i < 13; i++) {
    const a = (i * Math.PI) / 13 + 0.007,
      b = ((i + 1) * Math.PI) / 13 - 0.007;
    const outer = 3.45 + s.rng.range(0, 0.26),
      inner = 2.05 + s.rng.range(-0.1, 0.1),
      depth = 0.7 + s.rng.range(0, 0.13);
    const sides = [
      where(a, inner, -depth),
      where(b, inner, -depth),
      where(b, outer, -depth),
      where(a, outer, -depth),
      where(a, inner, depth),
      where(b, inner, depth),
      where(b, outer, depth),
      where(a, outer, depth),
    ];
    for (const [aa, bb, cc, dd] of [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [3, 2, 6, 7],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
    ]) {
      const color = colors[i % 4]!;
      s.triangle(sides[aa!]!, sides[bb!]!, sides[cc!]!, color);
      s.triangle(sides[aa!]!, sides[cc!]!, sides[dd!]!, color);
    }
    if (i % 2 === 0) {
      const p = where((a + b) * 0.5, 2.78, -depth - 0.05);
      s.boulder(p.x, p.y, p.z, 0.11, 0.16, 0.065, "#80c9c3", s.glow);
    }
  }
  for (const side of [-1, 1]) {
    const bx = x + side * 2.86 * Math.cos(face),
      bz = z - side * 2.86 * Math.sin(face);
    s.boulder(bx, y - 0.16, bz, 1.35, 1.25, 1.25, "#526b70");
    s.solid(bx, bz, 1.03, 0.86, 3);
  }
}

function crystal(s: IslandScenery, origin: Vector3, height: number, tilt: number, angle: number, color: string) {
  const axis = vec(Math.sin(angle) * tilt, height, Math.cos(angle) * tilt);
  const shoulder = origin.add(axis.scale(0.73));
  s.pole("hexagonal mineral prism", origin, shoulder, height * 0.2, height * 0.24, color, 6, s.glow);
  s.pole("faceted mineral termination", shoulder, origin.add(axis), height * 0.24, 0, color, 6, s.glow);
}

function sanctuary(s: IslandScenery) {
  const { x, z } = s.site.landmark,
    y = s.floor(x, z);
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4,
      r = i === 0 ? 0 : s.rng.range(0.5, 2.1),
      h = i === 0 ? 6.1 : s.rng.range(1.6, 4.4);
    const xx = x + Math.sin(a) * r,
      zz = z + Math.cos(a) * r;
    const color = s.rng.pick(["#8aa9e5", "#81cece", "#ad96db", "#b5a3e0"]);
    crystal(s, vec(xx, s.floor(xx, zz) - 0.18, zz), h, r * s.rng.range(0.25, 0.5), a, color);
  }
  s.boulder(x, y - 0.18, z, 2.75, 1.1, 2.52, "#554e73");
  s.solid(x, z, 2.45, 2.25, 5.8);
}

export function buildLandmark(s: IslandScenery) {
  const flags: Mesh[] = [];
  switch (s.world) {
    case 0:
      beacon(s);
      break;
    case 1:
      flags.push(corsairFort(s));
      break;
    case 2:
      tideArch(s);
      break;
    case 3:
      sanctuary(s);
      break;
  }
  const { x, z } = s.site.dig;
  // Each clue refers to objects right here in the world, visible before the first stroke.
  if (s.world === 1) flags.push(pennant(s, x + 1.8, s.floor(x + 1.8, z + 0.9), z + 0.9, 2.7, 0.65));
  for (let i = 0; i < (s.world === 2 ? 25 : 12); i++) {
    const a = i * (s.world === 2 ? 0.57 : 2.399),
      r = s.world === 2 ? 1.2 + i * 0.052 : s.rng.range(1.35, 2.25);
    const xx = x + Math.sin(a) * r,
      zz = z + Math.cos(a) * r,
      y = s.floor(xx, zz);
    if (s.world === 0) {
      // Fluted scallop shell, wider open lip and a small hinge.
      const hinge = vec(xx, y + 0.035, zz),
        radius = s.rng.range(0.2, 0.35);
      for (let k = 0; k < 8; k++) {
        const edge = (j: number) =>
          hinge.add(
            vec(
              Math.sin(a + j * 0.26 - 0.97) * radius,
              0.09 + 0.018 * (j % 2),
              Math.cos(a + j * 0.26 - 0.97) * radius,
            ),
          );
        s.triangle(hinge, edge(k), edge(k + 1), k % 2 ? "#e9a993" : "#f5c6ad");
      }
    } else if (s.world === 2) s.boulder(xx, y + 0.03, zz, 0.19, 0.13, 0.21, i % 2 ? "#8dbcc8" : "#688f9f");
    else if (s.world === 3)
      crystal(s, vec(xx, y - 0.025, zz), s.rng.range(0.34, 0.61), 0.12, a, i % 2 ? "#bd96ee" : "#ab94e3");
  }
  return (t: number) => {
    for (let i = 0; i < flags.length; i++) flags[i]!.rotation.y = Math.sin(t * 2.7 + i) * 0.095;
  };
}
