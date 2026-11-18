import "@babylonjs/loaders/glTF/glTFFileLoader.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_emissive_strength.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { type AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { type AssetContainer } from "@babylonjs/core/assetContainer.js";
import { type Node } from "@babylonjs/core/node.js";
import { type Scene } from "@babylonjs/core/scene.js";
import { SHIP_SPECS, type ShipClass } from "../sim/ships";
import { PALETTE } from "./palette";
import { isPhoneRendering } from "../shared/pirate-world/render/quality";
import { PRIVATE_PEARL, privatePearlModelUrl } from "../privatePearl";
import { canvasWeave, splitPublicCanvas } from "./shipCanvas";

export const SHIP_CLASSES: readonly ShipClass[] = [
  "sloop",
  "brigantine",
  "galleon",
  "warship",
];

/** Livery decides sail colour on the procedural fallback and tints sails on loaded models. */
export type Livery = "player" | "pirate" | "boss";

const modelUrl = (cls: ShipClass) =>
  `${import.meta.env.BASE_URL}assets/ships/${cls}.glb`;

/**
 * Loads ship models exported by tools/blender/build_ships.py. Any class without a
 * .glb falls back to a procedural model so the game always runs.
 */
export class ShipModels {
  private readonly containers = new Map<ShipClass, AssetContainer>();
  private playerContainer: AssetContainer | null = null;

  constructor(private readonly scene: Scene) {}

  async load(): Promise<{ loaded: ShipClass[]; missing: ShipClass[]; blackPearl: boolean }> {
    const loaded: ShipClass[] = [];
    const missing: ShipClass[] = [];
    await Promise.all(
      SHIP_CLASSES.map(async (cls) => {
        try {
          const head = await fetch(modelUrl(cls), { method: "HEAD" });
          const type = head.headers.get("content-type") ?? "";
          // Vite's dev server answers unknown paths with index.html.
          if (!head.ok || type.includes("text/html"))
            throw new Error("not found");
          const container = await LoadAssetContainerAsync(modelUrl(cls), this.scene);
          if (this.scene.isDisposed) { container.dispose(); return; }
          this.containers.set(cls, container);
          loaded.push(cls);
        } catch {
          missing.push(cls);
        }
      }),
    );
    if (this.scene.isDisposed) return { loaded, missing, blackPearl: false };
    const pearlUrl = PRIVATE_PEARL ? privatePearlModelUrl(isPhoneRendering(this.scene.getEngine())) : `${import.meta.env.BASE_URL}assets/ships/black-pearl.glb`;
    try {
      const head = await fetch(pearlUrl, { method: "HEAD" });
      if (!head.ok || head.headers.get("content-type")?.includes("text/html"))
        throw new Error("not found");
      const container = await LoadAssetContainerAsync(pearlUrl, this.scene);
      if (this.scene.isDisposed) container.dispose();
      else this.playerContainer = container;
    } catch {
      this.playerContainer = null;
    }
    return { loaded, missing, blackPearl: this.playerContainer !== null };
  }

  /** A fresh copy of the ship, bow pointing +Z, waterline at y = 0, scaled to spec length. */
  create(cls: ShipClass, livery: Livery, name: string): TransformNode {
    const holder = new TransformNode(`${name}-model`, this.scene);
    const container = livery === "player" && this.playerContainer
      ? this.playerContainer
      : this.containers.get(cls);
    if (container) {
      const entries = container.instantiateModelsToScene(
        (n) => `${name}-${n}`,
        true,
        { doNotInstantiate: true },
      );
      const align = new TransformNode(`${name}-align`, this.scene);
      align.parent = holder;
      for (const root of entries.rootNodes) root.parent = align;
      alignModel(holder, align, SHIP_SPECS[cls].length);
      if (livery !== "player") tintSails(holder, livery);
      else {
        splitPublicCanvas(holder, SHIP_SPECS[cls].length, SHIP_SPECS[cls].beam, this.scene);
        finishPlayerShip(holder, SHIP_SPECS[cls].length, SHIP_SPECS[cls].beam, this.scene);
      }
    } else {
      buildFallbackShip(this.scene, cls, livery, holder);
    }
    return holder;
  }
}

/** Keep the existing Pearl geometry and attribution; give its timber and cloth distinct finishes. */
function finishPlayerShip(root: TransformNode, length: number, beam: number, scene: Scene): void {
  // The purchased model has its own authored textures, UVs and material response.
  if (!root.getChildMeshes().some(mesh => mesh.name.includes("Black_Pearl_"))) return;
  let clothWeave: ReturnType<typeof canvasWeave> | undefined;
  root.computeWorldMatrix(true);
  const inverse = root.getWorldMatrix().clone().invert();
  for (const mesh of root.getChildMeshes(false)) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial)) continue;
    material.maxSimultaneousLights = 4;
    material.directIntensity = 1.12;
    if (/aged_teak_deck|weathered_ebony_hull/.test(material.name)) {
      const isDeck = material.name.includes("aged_teak_deck");
      // This STL's material groups include mixed surfaces. A planar wood map
      // over the whole group made its thin sheets look like broken timber.
      material.albedoColor.set(...(isDeck ? [.145, .098, .058] : [.055, .047, .039]) as [number, number, number]);
      material.metallic = 0; material.roughness = .8;
      material.emissiveColor.set(isDeck ? .025 : .009, isDeck ? .014 : .005, isDeck ? .006 : .002);
    } else if (material.name.includes("black_canvas")) {
      material.albedoColor.set(.09, .105, .10);
      material.roughness = .9; material.metallic = 0;
      material.backFaceCulling = false; material.twoSidedLighting = true;
      material.emissiveColor.set(.012, .015, .015);
      const weave = clothWeave ??= canvasWeave(scene);
      material.bumpTexture = weave.normal; weave.normal.level = .22;
      material.metallicTexture = weave.roughness;
      material.useRoughnessFromMetallicTextureAlpha = false;
      material.useRoughnessFromMetallicTextureGreen = true;
      material.useMetallnessFromMetallicTextureBlue = true;
      if (mesh instanceof Mesh) {
        mesh.makeGeometryUnique(); mesh.computeWorldMatrix(true);
        const matrix = mesh.getWorldMatrix().multiply(inverse);
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const uvs: number[] = [];
        for (let i = 0; i < positions.length; i += 3) {
          const p = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), matrix);
          uvs.push(p.x * 8, p.y * 8);
        }
        mesh.setVerticesData(VertexBuffer.UVKind, uvs);
      }
    } else if (material.name.includes("iron_cannons")) {
      material.albedoColor.set(.08, .09, .087);
      material.metallic = .35; material.roughness = .53;
    }
  }
}

const findByName = (root: Node, fragment: string): Node[] =>
  root
    .getDescendants(false)
    .filter((n) => n.name.toLowerCase().includes(fragment.toLowerCase()));

/**
 * Point the bow marker exported from Blender along +Z and scale to the spec length.
 * Doing this from data, rather than hard-coding axis conversions, survives any
 * exporter or handedness changes.
 */
const alignModel = (
  holder: TransformNode,
  align: TransformNode,
  length: number,
) => {
  holder.computeWorldMatrix(true);
  align
    .getDescendants(false)
    .forEach((n) => (n as TransformNode).computeWorldMatrix?.(true));
  const bow = findByName(align, "bow_marker")[0] as TransformNode | undefined;
  if (bow) {
    const p = bow.getAbsolutePosition();
    align.rotation.y = -Math.atan2(p.x, p.z);
    align.computeWorldMatrix(true);
  }
  const { min, max } = align.getHierarchyBoundingVectors(
    true,
    (m) => m.isVisible && !m.name.toLowerCase().includes("marker"),
  );
  const measured = max.z - min.z;
  if (measured > 0.01) align.scaling.setAll(length / measured);
};

const tintSails = (root: TransformNode, livery: Livery) => {
  const color = livery === "boss" ? PALETTE.bossSail : PALETTE.pirateSail;
  for (const n of findByName(root, "sail")) {
    const mesh = n as AbstractMesh;
    const mat = mesh.material as unknown as {
      albedoColor?: Color3;
      diffuseColor?: Color3;
    } | null;
    if (!mat) continue;
    if (mat.albedoColor) mat.albedoColor = color.clone();
    if (mat.diffuseColor) mat.diffuseColor = color.clone();
  }
};

/** Simple but characterful procedural ship used until Blender models exist. */
const buildFallbackShip = (
  scene: Scene,
  cls: ShipClass,
  livery: Livery,
  parent: TransformNode,
) => {
  const spec = SHIP_SPECS[cls];
  const L = spec.length;
  const B = spec.beam;
  const mat = (name: string, c: Color3, emissive?: Color3) => {
    const m = new StandardMaterial(`${parent.name}-${name}`, scene);
    m.diffuseColor = c;
    m.specularColor = new Color3(0.05, 0.05, 0.05);
    if (emissive) m.emissiveColor = emissive;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    return m;
  };
  const hullMat = mat("hull", PALETTE.wood);
  const deckMat = mat("deck", Color3.FromHexString("#b88a57"));
  const trimMat = mat(
    "trim",
    livery === "boss"
      ? Color3.FromHexString("#d4a63a")
      : livery === "player"
        ? Color3.FromHexString("#2d5fa0")
        : Color3.FromHexString("#1d1d1d"),
  );
  const sailMat = mat(
    "sail",
    livery === "boss"
      ? PALETTE.bossSail
      : livery === "pirate"
        ? PALETTE.pirateSail
        : PALETTE.sail,
  );
  const glowMat = mat(
    "glow",
    Color3.FromHexString("#ffd27a"),
    Color3.FromHexString("#ffb347"),
  );

  // Hull: lofted cross-sections from stern to bow.
  const stations = 16;
  const sectionPts = 7;
  const positions: number[] = [];
  const indices: number[] = [];
  const halfWidth = (t: number) =>
    t < 0.45
      ? (B / 2) * (1 - 0.3 * ((0.45 - t) / 0.45) ** 2)
      : (B / 2) * Math.sqrt(Math.max(0.004, 1 - ((t - 0.45) / 0.55) ** 2.2));
  const top = (t: number) =>
    1.6 +
    (1.4 * Math.max(0, 0.3 - t)) / 0.3 +
    (0.8 * Math.max(0, t - 0.8)) / 0.2;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const z = (t - 0.5) * L;
    const hw = halfWidth(t);
    for (let j = 0; j < sectionPts; j++) {
      const s = j / (sectionPts - 1); // 0 = keel, 1 = rail
      const y = -1.6 + (top(t) + 1.6) * s;
      const x =
        hw *
        Math.pow(Math.sin((Math.min(1, s / 0.75) * Math.PI) / 2), 0.7) *
        (s > 0.75 ? 1 - (0.1 * (s - 0.75)) / 0.25 : 1);
      positions.push(x, y, z);
    }
    for (let j = 0; j < sectionPts; j++) {
      const p = positions.slice(
        (i * 2 * sectionPts + j) * 3,
        (i * 2 * sectionPts + j) * 3 + 3,
      );
      positions.push(-p[0]!, p[1]!, p[2]!);
    }
  }
  const row = sectionPts * 2;
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < sectionPts - 1; j++) {
      for (const side of [0, sectionPts]) {
        const a = i * row + side + j;
        const b = (i + 1) * row + side + j;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    // Close the keel line between the two sides.
    const k0 = i * row;
    const k1 = (i + 1) * row;
    indices.push(k0, k0 + sectionPts, k1, k1, k0 + sectionPts, k1 + sectionPts);
  }
  const hull = new Mesh(`${parent.name}-hull`, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  VertexData.ComputeNormals(positions, indices, (vd.normals = []));
  vd.applyToMesh(hull);
  hull.convertToFlatShadedMesh();
  hull.material = hullMat;
  hull.parent = parent;

  const deck = MeshBuilder.CreateBox(
    `${parent.name}-deck`,
    { width: B * 0.86, height: 0.2, depth: L * 0.82 },
    scene,
  );
  deck.position.set(0, 1.25, -L * 0.04);
  deck.material = deckMat;
  deck.parent = parent;
  const stripe = MeshBuilder.CreateBox(
    `${parent.name}-stripe`,
    { width: B * 1.02, height: 0.35, depth: L * 0.62 },
    scene,
  );
  stripe.position.set(0, 0.7, -L * 0.06);
  stripe.material = trimMat;
  stripe.parent = parent;
  const castle = MeshBuilder.CreateBox(
    `${parent.name}-castle`,
    { width: B * 0.8, height: 1.4, depth: L * 0.2 },
    scene,
  );
  castle.position.set(0, 1.9, -L * 0.36);
  castle.material = hullMat;
  castle.parent = parent;
  const lantern = MeshBuilder.CreateSphere(
    `${parent.name}-lantern`,
    { diameter: 0.6 },
    scene,
  );
  lantern.position.set(0, 3.1, -L * 0.47);
  lantern.material = glowMat;
  lantern.parent = parent;

  const masts =
    cls === "sloop"
      ? [0.1]
      : cls === "brigantine"
        ? [0.25, -0.1]
        : [0.28, 0.0, -0.26];
  masts.forEach((m, i) => {
    const h = L * (i === 1 || masts.length === 1 ? 0.95 : 0.8);
    const mast = MeshBuilder.CreateCylinder(
      `${parent.name}-mast-${i}`,
      { height: h, diameterTop: 0.25, diameterBottom: 0.5, tessellation: 8 },
      scene,
    );
    mast.position.set(0, 1.2 + h / 2, m * L);
    mast.material = hullMat;
    mast.parent = parent;
    for (const [k, frac] of [
      [0, 0.62],
      [1, 0.36],
    ] as const) {
      const w = B * (k === 0 ? 1.5 : 1.15);
      const sh = h * 0.24;
      const sail = MeshBuilder.CreatePlane(
        `${parent.name}-Sail-${i}-${k}`,
        { width: w, height: sh, sideOrientation: Mesh.DOUBLESIDE },
        scene,
      );
      // Pivot at the top edge so furling shrinks the sail up to its yard.
      sail.setPivotPoint(new Vector3(0, sh / 2, 0));
      sail.position.set(0, 1.2 + h * frac, m * L + 0.3);
      sail.material = sailMat;
      sail.parent = parent;
      const yard = MeshBuilder.CreateCylinder(
        `${parent.name}-yard-${i}-${k}`,
        { height: w * 1.08, diameter: 0.22, tessellation: 6 },
        scene,
      );
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, 1.2 + h * frac + sh / 2, m * L + 0.25);
      yard.material = hullMat;
      yard.parent = parent;
    }
  });
  const bowsprit = MeshBuilder.CreateCylinder(
    `${parent.name}-bowsprit`,
    { height: L * 0.3, diameterTop: 0.15, diameterBottom: 0.35 },
    scene,
  );
  bowsprit.rotation.x = Math.PI / 2 - 0.35;
  bowsprit.position.set(0, 2.4, L * 0.55);
  bowsprit.material = hullMat;
  bowsprit.parent = parent;
};
