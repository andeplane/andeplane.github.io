import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { simplexField } from "../game/landfallNoise";
import type { GeneratedIsland } from "../game/landfall";
import type { CaveObstacle } from "../shared/pirate-world/input/caveWalk";
import limestoneUrl from "./grotto/tidal-limestone.webp";
import { GrottoBounce } from "./landfallGrottoLight";
import timberUrl from "./village-surfaces/boards.webp";
import timberNormalUrl from "./village-surfaces/boards-normal.webp";
import reliefUrl from "./grotto/tidal-limestone-normal.webp";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Two connected, eroded chambers. Walking and the tide pool use the island
 * heightfield. Overhangs need their own mesh and collision along the side walls. */
export function buildGrotto(
  scene: Scene,
  island: GeneratedIsland,
  shadows: ShadowGenerator,
  night = false,
): CaveObstacle[] {
  const cave = island.site.grotto;
  const rockField = simplexField(cave.seed ^ 0xa85f48bd);
  const sin = Math.sin(cave.yaw),
    cos = Math.cos(cave.yaw);
  const at = (u: number, y: number, v: number) =>
    new Vector3(
      cave.entry.x + u * cos + v * sin,
      y,
      cave.entry.z - u * sin + v * cos,
    );
  const midline = (v: number) => 0.56 * Math.sin((v - 3) * 0.43);
  const width = (v: number) =>
    3.16 + 0.95 * Math.sin((v - 2.6) * 0.4) + 0.42 * Math.sin(v * 0.81);
  const entrance = 3,
    length = 11;
  const material = new StandardMaterial("salt-cut limestone", scene);
  material.diffuseTexture = new Texture(limestoneUrl, scene);
  material.bumpTexture = new Texture(reliefUrl, scene);
  material.bumpTexture.gammaSpace = false;
  material.bumpTexture.level = 0.76;
  material.emissiveColor.set(
    night ? 0.013 : 0.13,
    night ? 0.021 : 0.14,
    night ? 0.033 : 0.155,
  );
  material.linkEmissiveWithDiffuse = true;
  material.diffuseTexture.anisotropicFilteringLevel =
    material.bumpTexture.anisotropicFilteringLevel = 4;
  material.specularColor.set(0.06, 0.065, 0.06);
  material.backFaceCulling = false;
  material.twoSidedLighting = true;

  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const sides = 96,
    rings = 60;
  const snow = island.site.settings.biome === "winter";
  const vertex = (v: number, a: number, layer: number) => {
    const roof = Math.sin(a),
      lateral = Math.cos(a);
    const seam = rockField(v * 0.28, a * 1.45);
    const bedding = rockField(lateral * 2.2, v * 0.6) * 0.18;
    const w = width(v) + 0.3 * seam + 0.29 * Math.sin(a * 3.1 + v * 0.47);
    const rise =
      4.25 +
      0.43 * Math.sin(v * 0.66 + 0.7) +
      0.26 * rockField(v * 0.28, lateral * 1.7);
    const envelope = Math.pow(Math.max(0, roof), 0.76);
    const sit = 0.33;
    const wall =
      (w + layer * (2.45 + 0.85 * seam + 0.58 * Math.sin(v * 0.72 + a))) *
      lateral;
    const x =
      wall + midline(v) + envelope * (0.47 * Math.sin(v * 0.43) + seam * 0.36);
    const hollows =
      rockField(v * 0.72 + layer * 1.8, a * 5.3) * 0.23 +
      0.07 * rockField(v * 1.94, a * 9.1);
    const y =
      sit +
      envelope *
        (rise + (1.85 + 0.6 * seam + 0.72 * Math.sin(v * 0.35 + a)) * layer) +
      bedding +
      hollows * envelope;
    const edge =
      Math.exp(-Math.abs(v - entrance) * 0.6) -
      Math.exp(-Math.abs(v - entrance - length) * 0.6);
    const scallops =
      0.65 * Math.sin(a * 3.3 + v * 0.07) +
      0.31 * Math.sin(8.4 * a + v * 0.16) +
      0.12 * rockField(a * 14.1, v * 0.38);
    const z =
      v +
      edge *
        (scallops +
          0.62 * seam -
          envelope * (0.9 + 0.45 * lateral) -
          layer * 0.65) +
      0.18 * rockField(v * 0.8, a * 3.5);
    return at(x + hollows * lateral, y, z);
  };
  function surface(
    crossSteps: number,
    alongSteps: number,
    point: (i: number, j: number) => Vector3,
    shade: (i: number, j: number, p: Vector3) => Color3,
    coords: (i: number, j: number) => [number, number],
    reverse = false,
  ) {
    const start = positions.length / 3;
    for (let j = 0; j <= alongSteps; j++)
      for (let i = 0; i <= crossSteps; i++) {
        const u = i / crossSteps,
          v = j / alongSteps;
        const p = point(u, v),
          c = shade(u, v, p);
        positions.push(p.x, p.y, p.z);
        colors.push(c.r, c.g, c.b, 1);
        uvs.push(...coords(u, v));
        if (i < crossSteps && j < alongSteps) {
          const n = start + i + j * (crossSteps + 1),
            next = n + crossSteps + 1;
          if (reverse) indices.push(n, next, n + 1, n + 1, next, next + 1);
          else indices.push(n, n + 1, next, n + 1, next + 1, next);
        }
      }
  }
  const chalk = (p: Vector3, ambient: number, exposed: boolean) => {
    const stratum =
      0.61 +
      0.23 *
        Math.sin(
          p.y * 5.25 +
            0.51 * p.x +
            0.15 * p.z +
            rockField(p.x * 0.22, p.z * 0.22) * 2,
        ) +
      0.15 * rockField(p.x * 0.55, p.z * 0.64 + p.y * 0.63);
    const tide = clamp((1.55 - p.y) * 1.45);
    const cover = exposed
      ? clamp((p.y - 5.05) * 0.82 + rockField(p.x * 0.29, p.z * 0.24) * 0.95)
      : 0;
    const sand = Color3.Lerp(
      new Color3(0.79, 0.74, 0.65),
      new Color3(1, 0.97, 0.91),
      stratum,
    );
    Color3.LerpToRef(sand, new Color3(0.33, 0.42, 0.38), tide * 0.87, sand);
    Color3.LerpToRef(
      sand,
      snow ? new Color3(1, 0.99, 1) : new Color3(0.48, 0.6, 0.35),
      cover * 0.85,
      sand,
    );
    return sand.scale(ambient);
  };
  for (const outer of [0, 1]) {
    surface(
      sides,
      rings,
      (u, t) => vertex(entrance + length * t, u * Math.PI, outer),
      (_u, t, p) =>
        chalk(
          p,
          outer ? 1 : 0.81 + 0.19 * Math.pow(Math.abs(2 * t - 1), 2.4),
          !!outer,
        ),
      (u, t) => [u * 3.6, t * 3.2],
      outer === 1,
    );
  }
  // Turn under the cliff lip in a half ellipse, tangent to the inner and
  // outer vaults. Its profile varies along the arch like scallops in chalk.
  for (const end of [0, 1]) {
    surface(
      sides,
      16,
      (u, k) => {
        const a = u * Math.PI,
          layer = (1 - Math.cos(k * Math.PI)) * 0.5;
        const round =
          Math.sin(k * Math.PI) *
          (0.77 + 0.24 * Math.sin(3.3 * a) + 0.19 * rockField(4.1 * a, end));
        const p = vertex(entrance + end * length, a, layer);
        return p.add(at(0, 0, (2 * end - 1) * round).subtract(at(0, 0, 0)));
      },
      (_u, k, p) => chalk(p, 1, true),
      (u, k) => [u * 3.6, (end ? 3.2 : 0) + (end ? 1 : -1) * k * 0.92],
      end === 0,
    );
  }

  // Rippled shelves extend out of the wall beside the pool. Flattened tops,
  // worn crystalline rims and damp toes catch the light at different heights.
  const shoal = (
    u: number,
    v: number,
    top: number,
    w: number,
    d: number,
    thickness: number,
    id: number,
    segments = 32,
  ) => {
    const profile = [
      [0.03, 1],
      [0.59, 0.99],
      [0.86, 0.91],
      [0.97, 0.76],
      [1, 0.54],
      [0.98, 0.26],
      [0.79, 0],
      [0.03, -0.06],
    ] as const;
    surface(
      segments,
      profile.length - 1,
      (az, k) => {
        const angle = az * Math.PI * 2;
        const [r, y] = profile[Math.round(k * (profile.length - 1))]!;
        const chip =
          0.92 +
          0.1 * rockField(id + Math.cos(angle) * 1.3, Math.sin(angle) * 1.3);
        const tilt =
          Math.min(0.11, thickness * 0.19) * Math.sin(angle + id) * r;
        return at(
          u + Math.cos(angle) * r * w * chip,
          top + (y - 1) * thickness + tilt,
          v + Math.sin(angle) * r * d * chip,
        );
      },
      (_a, _k, p) => chalk(p, 1, false),
      (az, k) => [az * 2.7, k * 0.72],
      true,
    );
  };
  shoal(-3.25, 4.9, 0.7, 1.62, 1.28, 0.83, 11);
  shoal(-3.82, 6.43, 0.37, 1.42, 1.32, 0.84, 12);
  shoal(-3.78, 8.3, 0.16, 1.1, 1.24, 0.7, 13);
  shoal(-3.21, 11.0, 0.42, 1.48, 1.22, 0.73, 14);
  shoal(-2.6, 12.22, 0.37, 1.29, 1.01, 0.68, 15);
  shoal(-0.91, 6.83, 0.3, 0.67, 1.13, 0.67, 16);
  shoal(-0.86, 8.4, 0.35, 0.73, 1.2, 0.77, 17);
  shoal(-1.13, 9.91, 0.26, 0.62, 0.92, 0.63, 18);
  // Small shingle collects in loose pockets below the tide ledges.
  for (const [centerU, centerV] of [
    [-1.14, 5.63],
    [1.38, 6.9],
    [1.78, 11.67],
  ] as const) {
    for (let i = 0; i < 6; i++) {
      const u = centerU + 0.52 * rockField(centerV, i * 3.83);
      const v = centerV + 0.61 * rockField(i * 4.73, centerU);
      const bed = at(u, 0, v);
      const size = 0.075 + 0.054 * rockField(u * 14.3, v * 8.7);
      shoal(
        u,
        v,
        island.heightAt(bed.x, bed.z) + size * 0.42,
        size * 1.34,
        size,
        size * 0.74,
        i + centerV,
        10,
      );
    }
  }
  const shell = new Mesh("tidal grotto • wave-cut vault and sea door", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.colors = colors;
  vd.indices = indices;
  vd.uvs = uvs;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  // Preserve the UV island cuts, but share the shading normal across their seams.
  const joined = new Map<string, Vector3>();
  const keys: string[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const key = [positions[i]!, positions[i + 1]!, positions[i + 2]!]
      .map((n) => Math.round(n * 10000))
      .join(",");
    const n = Vector3.FromArray(normals, i);
    const previous = joined.get(key);
    if (previous) previous.addInPlace(n);
    else joined.set(key, n);
    keys.push(key);
  }
  for (const n of joined.values()) n.normalize();
  keys.forEach((key, i) => joined.get(key)!.toArray(normals, i * 3));
  vd.normals = normals;
  vd.applyToMesh(shell);
  shell.material = material;
  shell.receiveShadows = true;
  shell.isPickable = false;
  shell.freezeWorldMatrix();
  shadows.addShadowCaster(shell);
  const obstacles: CaveObstacle[] = [];
  // Both walls are several metres thick. Two overlapping lines keep walkers
  // off the shell from either side and leave both arch entrances unobstructed.
  for (let v = entrance; v <= entrance + length + 0.1; v += 0.85)
    for (const sign of [-1, 1]) {
      const p = at(midline(v) + sign * (width(v) + 1.18), 0, v);
      obstacles.push({ x: p.x, z: p.z, rx: 1.36, rz: 1.36, top: 7.5 });
    }
  const normal = (name: string, color: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.setAll(0.13);
    return m;
  };
  const wood = normal("salt-cracked oak", "#cda478"),
    bronze = normal("weathered forged iron", "#4d4033");
  wood.diffuseTexture = new Texture(timberUrl, scene);
  wood.bumpTexture = new Texture(timberNormalUrl, scene);
  wood.bumpTexture.gammaSpace = false;
  wood.bumpTexture.level = 0.42;
  const hemp = normal("waxed hemp", "#c09561"),
    lamp = normal("storm lantern • amber glass", "#e2ae71");
  const flame = normal("storm lantern • wick flame", "#ffcd7a");
  lamp.alpha = 0.47;
  lamp.emissiveColor.set(0.64, 0.27, 0.06);
  lamp.specularColor.set(0.91, 0.77, 0.53);
  flame.emissiveColor.set(1, 0.81, 0.42);
  const fittings = new Map<StandardMaterial, Mesh[]>();
  function fitting(mesh: Mesh, mat: StandardMaterial) {
    mesh.material = mat;
    const batch = fittings.get(mat);
    if (batch) batch.push(mesh);
    else fittings.set(mat, [mesh]);
  }
  function cylinder(
    name: string,
    a: Vector3,
    b: Vector3,
    diameter: number,
    mat: StandardMaterial,
    sides = 16,
  ) {
    const axis = b.subtract(a);
    const m = MeshBuilder.CreateCylinder(
      name,
      { height: axis.length(), diameter, tessellation: sides },
      scene,
    );
    m.position.copyFrom(a.add(b).scale(0.5));
    m.rotationQuaternion = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(
      Vector3.UpReadOnly,
      axis.normalize(),
      m.rotationQuaternion,
    );
    fitting(m, mat);
  }
  function tube(
    name: string,
    points: Vector3[],
    radius: number,
    mat: StandardMaterial,
    sides = 6,
  ) {
    fitting(
      MeshBuilder.CreateTube(
        name,
        { path: points, radius, tessellation: sides, cap: Mesh.CAP_ALL },
        scene,
      ),
      mat,
    );
  }
  function beam(
    name: string,
    a: Vector3,
    b: Vector3,
    width: number,
    depth: number,
  ) {
    const direction = b.subtract(a);
    const m = MeshBuilder.CreateBox(
      name,
      { width, depth, height: direction.length() },
      scene,
    );
    m.position.copyFrom(a.add(b).scale(0.5));
    m.rotationQuaternion = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(
      Vector3.UpReadOnly,
      direction.normalize(),
      m.rotationQuaternion,
    );
    fitting(m, wood);
  }

  // The windlass is set obliquely to the passage so the drum and crank can
  // both be seen from the entrance. Double helical rope wraps cast real shadows.
  const u = 2.02,
    v = 9.1;
  const foot = at(u, 0, v),
    base = island.heightAt(foot.x, foot.z);
  const yaw = -0.94,
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  const local = (x: number, y: number, z: number) =>
    at(u + x * c + z * s, base + y, v - x * s + z * c);
  for (const end of [-1, 1]) {
    const z = end * 0.82;
    beam(
      "timber sole",
      local(-0.49, 0.13, z),
      local(0.49, 0.13, z),
      0.18,
      0.25,
    );
    for (const side of [-1, 1])
      beam(
        "oak trestle",
        local(side * 0.4, 0.18, z),
        local(side * 0.065, 1.09, z),
        0.19,
        0.2,
      );
    beam("trestle lintel", local(-0.2, 1, z), local(0.2, 1, z), 0.16, 0.28);
    cylinder(
      "bearing collar",
      local(0, 1.12, z - 0.105),
      local(0, 1.12, z + 0.105),
      0.27,
      bronze,
      18,
    );
  }
  for (const side of [-1, 1])
    beam(
      "skid",
      local(side * 0.36, 0.17, -1.05),
      local(side * 0.36, 0.17, 1.05),
      0.12,
      0.16,
    );
  cylinder(
    "oak windlass drum",
    local(0, 1.12, -0.72),
    local(0, 1.12, 0.72),
    0.55,
    wood,
    30,
  );
  for (const end of [-1, 1]) {
    const z = end * 0.61;
    cylinder(
      "wooden drum cheek",
      local(0, 1.12, z - 0.061),
      local(0, 1.12, z + 0.061),
      0.81,
      wood,
      32,
    );
    cylinder(
      "iron hoop",
      local(0, 1.12, z - 0.024),
      local(0, 1.12, z + 0.024),
      0.825,
      bronze,
      32,
    );
  }
  const line: Vector3[] = [];
  for (let i = 0; i <= 14 * 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    line.push(
      local(
        0.298 * Math.cos(angle),
        1.12 + 0.298 * Math.sin(angle),
        -0.48 + (0.96 * i) / (14 * 24),
      ),
    );
  }
  // The two plys are modelled around the windings, so the hemp stays legible in silhouette.
  tube("wound hawser", line, 0.037, hemp, 8);
  const tarred = normal("tarred rope ply", "#8f704c");
  tube(
    "weathered lay of rope",
    line.map((p, i) =>
      p.add(
        new Vector3(
          0.027 * Math.cos(i * 1.8),
          0.027 * Math.sin(i * 1.8),
          0.013 * Math.sin(i * 1.8),
        ),
      ),
    ),
    0.011,
    tarred,
    5,
  );
  tube(
    "running end of the mooring line",
    [
      line.at(-1)!,
      local(0.4, 0.66, 0.55),
      local(0.52, 0.17, 0.71),
      local(0.68, 0.05, 0.93),
      local(0.77, 0.035, 1.27),
      local(0.74, 0.028, 1.53),
    ],
    0.039,
    hemp,
  );
  cylinder(
    "iron crankshaft",
    local(0, 1.12, -1.1),
    local(0, 1.12, 1.12),
    0.105,
    bronze,
  );
  tube(
    "forged crank",
    [
      local(0, 1.12, -1.11),
      local(-0.31, 0.84, -1.11),
      local(-0.36, 0.81, -1.2),
    ],
    0.052,
    bronze,
  );
  cylinder(
    "worn crank handle",
    local(-0.36, 0.81, -1.19),
    local(-0.36, 0.81, -1.5),
    0.097,
    wood,
  );
  const lampU = u + 0.23,
    lampV = v + 0.63;
  beam(
    "storm lantern post",
    at(lampU + 0.58, base, lampV + 0.26),
    at(lampU + 0.58, 3.52, lampV + 0.26),
    0.14,
    0.15,
  );
  beam(
    "bracket",
    at(lampU - 0.07, 3.47, lampV),
    at(lampU + 0.7, 3.47, lampV + 0.31),
    0.13,
    0.12,
  );
  beam(
    "bracket brace",
    at(lampU + 0.58, 3.08, lampV + 0.26),
    at(lampU + 0.16, 3.45, lampV + 0.07),
    0.075,
    0.09,
  );
  const lampAt = (x: number, y: number, z: number) =>
    at(lampU + x, y, lampV + z);
  const lampPos = lampAt(0, 2.96, 0),
    lampRadius = 0.168;
  const bail = Array.from({ length: 19 }, (_, i) => {
    const a = (i * Math.PI) / 18;
    return lampAt(lampRadius * Math.cos(a), 3.15 + 0.2 * Math.sin(a), 0);
  });
  tube("lantern bail", bail, 0.014, bronze, 7);
  tube(
    "lamp hook",
    [
      lampAt(0, 3.47, 0),
      lampAt(0, 3.31, 0),
      lampAt(0.035, 3.3, 0),
      lampAt(0.045, 3.34, 0),
    ],
    0.012,
    bronze,
  );
  function spun(
    name: string,
    profile: number[][],
    mat: StandardMaterial,
    segments = 32,
  ) {
    const body = MeshBuilder.CreateLathe(
      name,
      {
        shape: profile.map(([r, y]) => new Vector3(r!, y!, 0)),
        tessellation: segments,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
    );
    body.position.copyFrom(lampAt(0, 0, 0));
    fitting(body, mat);
  }
  spun(
    "rolled brass lantern base",
    [
      [0, 2.66],
      [0.11, 2.66],
      [0.159, 2.68],
      [0.173, 2.71],
      [0.153, 2.73],
      [0.135, 2.77],
      [0.152, 2.78],
    ],
    bronze,
  );
  spun(
    "blown amber chimney",
    [
      [0.123, 2.77],
      [0.151, 2.8],
      [0.157, 2.87],
      [0.143, 3.05],
      [0.11, 3.1],
    ],
    lamp,
  );
  spun(
    "pierced lantern hood",
    [
      [0.114, 3.06],
      [0.173, 3.074],
      [0.178, 3.092],
      [0.146, 3.103],
      [0.114, 3.15],
      [0.079, 3.17],
      [0.089, 3.19],
      [0, 3.2],
    ],
    bronze,
  );
  spun(
    "amber flame",
    [
      [0.01, 2.79],
      [0.033, 2.81],
      [0.05, 2.87],
      [0.039, 2.93],
      [0.019, 2.98],
      [0, 3.02],
    ],
    flame,
    16,
  );
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const cage = [
      [0.139, 2.73],
      [0.174, 2.81],
      [0.177, 2.89],
      [0.149, 3.045],
      [0.133, 3.1],
    ];
    tube(
      "curved lantern guard",
      cage.map(([r, y]) =>
        lampAt(Math.cos(angle) * r!, y!, Math.sin(angle) * r!),
      ),
      0.01,
      bronze,
      6,
    );
  }
  new GrottoBounce(material, at(-2.48, 0, 8.1), lampPos, night);
  const light = new PointLight("sheltered amber flame", lampPos, scene);
  light.diffuse.set(1, 0.5, 0.2);
  light.intensity = night ? 3.15 : 2.85;
  light.range = 7.6;
  light.renderPriority = 6;
  const ground = scene.getMeshByName("island-0-0");
  light.includedOnlyMeshes = ground ? [shell, ground] : [shell];
  for (const [mat, meshes] of fittings) {
    const m = Mesh.MergeMeshes(meshes, true, true);
    if (!m) continue;
    m.material = mat;
    m.isPickable = false;
    m.receiveShadows = true;
    m.freezeWorldMatrix();
    if (mat !== lamp && mat !== flame) shadows.addShadowCaster(m);
    light.includedOnlyMeshes.push(m);
  }
  obstacles.push({
    x: foot.x,
    z: foot.z,
    rx: 1.13,
    rz: 1.01,
    top: base + 1.53,
  });
  return obstacles;
}
