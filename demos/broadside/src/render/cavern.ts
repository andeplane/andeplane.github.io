import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { caveFloor } from "../input/caveLayout";
import { hoardHeight, hoardGrowth } from "../input/caveHoard";
import type { CaveObstacle } from "../input/caveWalk";
import { buildDeepCave } from "./deepCave";
import { Scene } from "@babylonjs/core/scene.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import {
  Matrix,
  Quaternion,
  Vector3,
} from "@babylonjs/core/Maths/math.vector.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
import { Rng } from "../sim/rng";

/** Sculpted, open-front chamber: real relief, overhead daylight and a growing hoard. */
export class Cavern {
  readonly stone: StandardMaterial;
  readonly ledge: StandardMaterial;
  readonly floor: StandardMaterial;
  private spill: Mesh;
  readonly gold: StandardMaterial;
  readonly wood: StandardMaterial;
  readonly iron: StandardMaterial;
  readonly shadow: ShadowGenerator;
  private lanterns: TransformNode[] = [];
  readonly lamps: PointLight[] = [];
  private hoards: TransformNode[] = [];
  private heaps: {
    x: number;
    z: number;
    r: number;
    height: number;
    root: TransformNode;
  }[] = [];
  readonly obstacles: CaveObstacle[] = [];
  private time = 0;
  constructor(
    private scene: Scene,
    spots: Vector3[],
  ) {
    const s = scene,
      rng = new Rng(7164);
    const material = (name: string, color: string, glow = 0) => {
      const m = new StandardMaterial(name, s);
      m.diffuseColor = Color3.FromHexString(color);
      m.emissiveColor = m.diffuseColor.scale(glow);
      m.specularColor.set(0.1, 0.09, 0.07);
      m.maxSimultaneousLights = 6;
      return m;
    };
    const albedo = new Texture(
      `${import.meta.env.BASE_URL}textures/cave/rock-color.jpg`,
      s,
    );
    const normal = new Texture(
      `${import.meta.env.BASE_URL}textures/cave/rock-normal.jpg`,
      s,
    );
    normal.level = 0.75;
    this.stone = material("ancient fractured cavern stone", "#ac9a86", 0.06);
    this.stone.diffuseTexture = albedo;
    this.stone.bumpTexture = normal;
    this.stone.specularPower = 40;
    this.ledge = this.stone.clone("exposed pale rock shelves")!;
    this.ledge.diffuseColor = Color3.FromHexString("#c1ad96");
    const damp = this.stone.clone("damp dark rock")!;
    damp.diffuseColor = Color3.FromHexString("#657375");
    damp.specularColor.set(0.22, 0.26, 0.26);
    this.gold = material("tarnished pirate gold", "#bc8b3e", 0.03);
    this.gold.specularColor = Color3.FromHexString("#ffe6aa");
    this.gold.specularPower = 80;
    this.iron = material("salt worn forged iron", "#393b3e");
    this.iron.specularPower = 50;
    this.wood = material("weathered oak", "#795637", 0.025);
    const timber = new DynamicTexture(
      "oak grain",
      { width: 256, height: 512 },
      s,
      false,
    );
    const tc = timber.getContext() as CanvasRenderingContext2D;
    tc.fillStyle = "#b09a7c";
    tc.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 220; i++) {
      tc.strokeStyle = `rgba(35,20,12,${rng.range(0.05, 0.3)})`;
      tc.lineWidth = rng.range(0.4, 2);
      tc.beginPath();
      const x = rng.range(0, 256);
      tc.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 16)
        tc.lineTo(x + Math.sin(y * 0.025 + i) * rng.range(1, 4), y);
      tc.stroke();
    }
    timber.update();
    this.wood.diffuseTexture = timber;
    const rope = material("frayed hemp rope", "#76634b");
    const sack = material("coarse canvas sacks", "#877356");
    sack.diffuseTexture = timber;
    const flame = material("lantern amber glass", "#ffb857", 1.7);
    const crystal = material("small minerals in the rock", "#72aeb2", 0.15);
    // The only shadow-casting light is the broken skylight; lamps use cheap local light.
    const daylight = new SpotLight(
      "daylight through roof opening",
      new Vector3(1, 18, 9),
      new Vector3(-0.12, -1, -0.24),
      1.2,
      2,
      s,
    );
    daylight.diffuse = Color3.FromHexString("#d9edff");
    daylight.intensity = 2.6;
    daylight.renderPriority = 8;
    daylight.range = 44;
    daylight.shadowMinZ = 1;
    daylight.shadowMaxZ = 42;
    this.shadow = new ShadowGenerator(innerWidth < 700 ? 512 : 1024, daylight);
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
    this.shadow.darkness = 0.35;
    this.shadow.bias = 0.001;
    this.shadow.normalBias = 0.03;

    const bed = MeshBuilder.CreateGround(
      "rippling fractured bedrock",
      { width: 44, height: 54, subdivisions: 75, updatable: true },
      s,
    );
    const bp = bed.getVerticesData("position")!;
    for (let i = 0; i < bp.length; i += 3)
      bp[i + 1] = this.floorHeight(bp[i]!, bp[i + 2]! + 5);
    bed.updateVerticesData("position", bp);
    bed.convertToFlatShadedMesh();
    bed.position.z = 5;
    const floor = this.stone.clone("rough wet cave floor")!;
    const ft = albedo.clone();
    ft.uScale = 8;
    ft.vScale = 9;
    const fn = normal.clone();
    fn.uScale = 8;
    fn.vScale = 9;
    floor.diffuseTexture = ft;
    floor.bumpTexture = fn;
    floor.diffuseColor = Color3.FromHexString("#777f7c");
    floor.emissiveColor.set(0.055, 0.055, 0.05);
    this.floor = floor;
    bed.material = floor;
    bed.receiveShadows = true;
    bed.isPickable = false;
    // A few broad geological ribs replace a necklace of identical wall boulders.
    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j < 9; j++) {
        const z = -11 + j * 4.2;
        const r = this.rock(
          "layered cave flank",
          new Vector3(
            side * (17 + rng.range(-1, 1)),
            3 + rng.range(-0.4, 0.7),
            z,
          ),
          new Vector3(rng.range(3, 4.5), rng.range(5, 7), rng.range(3, 4)),
          j * 0.6 + side,
        );
        r.rotation.z = side * 0.22;
        const upper = this.rock(
          "vault overhang",
          new Vector3(
            side * (14 + rng.range(-0.7, 0.7)),
            10 + rng.range(-0.5, 0.8),
            z + 1,
          ),
          new Vector3(4.5, 2.4, 3.8),
          j + 19,
        );
        upper.rotation.z = side * 0.35;
      }
    }
    for (let j = 0; j < 9; j++) {
      const x = -17 + j * 4.3;
      if (Math.abs(x) > 6)
        this.rock(
          "rugged back wall",
          new Vector3(x, 3.9 + rng.range(-0.3, 0.3), 23 + rng.range(-1, 1)),
          new Vector3(3.4, 6.4, 3.5),
          j + 41,
        );
      this.rock(
        "rear cave roof",
        new Vector3(x, 10.2, 20),
        new Vector3(4.3, 2.8, 4.8),
        j + 60,
      );
    }
    // Continuous vaulted bedrock, with a horizontal skylight cut through its thickness.
    this.ceiling();
    const sky = material("pale sky through the broken roof", "#e0efff", 1.8);
    const skyTexture = new DynamicTexture(
      "daylit clouds beyond the hole",
      { width: 256, height: 128 },
      s,
      false,
    );
    const sc = skyTexture.getContext() as CanvasRenderingContext2D;
    const skyGradient = sc.createLinearGradient(0, 0, 0, 128);
    skyGradient.addColorStop(0, "#abc7dc");
    skyGradient.addColorStop(1, "#eff4eb");
    sc.fillStyle = skyGradient;
    sc.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 12; i++) {
      const cloud = sc.createRadialGradient(i * 24, 60, 0, i * 24, 60, 48);
      cloud.addColorStop(0, "#ffffffb0");
      cloud.addColorStop(1, "#ffffff00");
      sc.fillStyle = cloud;
      sc.fillRect(0, 0, 256, 128);
    }
    skyTexture.update();
    sky.emissiveTexture = skyTexture;
    sky.emissiveColor.set(2.8, 2.9, 3.0);
    sky.fogEnabled = false;
    sky.disableLighting = true;
    sky.backFaceCulling = false;
    const skyBeyondRoof = MeshBuilder.CreateGround(
      "sky above the roof",
      { width: 80, height: 100 },
      s,
    );
    skyBeyondRoof.position.set(1, 20, 45);
    skyBeyondRoof.material = sky;
    skyBeyondRoof.isPickable = false;
    // Hanging limestone teeth and floor stalagmites are clustered along the sides.
    for (let i = 0; i < 36; i++) {
      const side = i % 2 ? 1 : -1,
        z = rng.range(-9, 23),
        x = side * rng.range(12.8, 16.8);
      const h = rng.range(0.8, 3.1);
      const tooth = MeshBuilder.CreateCylinder(
        "weathered stalactite",
        {
          height: h,
          diameterTop: rng.range(0.5, 1.25),
          diameterBottom: 0.025,
          tessellation: 9,
          subdivisions: 3,
        },
        s,
      );
      tooth.position.set(x, 9 - h * 0.5, z);
      tooth.rotation.z = rng.range(-0.12, 0.12);
      tooth.material = this.stone;
      tooth.isPickable = false;
      if (i % 3 === 0) {
        const stalagmite = MeshBuilder.CreateCylinder(
          "limestone growing from floor",
          {
            height: h * 0.9,
            diameterTop: 0.07,
            diameterBottom: 0.9,
            tessellation: 9,
          },
          s,
        );
        stalagmite.position.set(x - side * 0.8, h * 0.45, z - 1);
        stalagmite.material = damp;
        stalagmite.isPickable = false;
      }
    }
    // Shallow irregular puddles, with dark edges embedded in the rough ground.
    const water = material("still cave puddles", "#293d43", 0.04);
    water.specularColor.set(0.5, 0.62, 0.7);
    water.specularPower = 110;
    for (const [x, z, sx, sz] of [
      [-9, -8, 2.2, 1.1],
      [11, 9, 1.9, 0.7],
      [-11, 15, 1.4, 0.8],
    ]) {
      const p = this.rock(
        "shallow water between stones",
        new Vector3(x!, this.floorHeight(x!, z!) + 0.018, z!),
        new Vector3(sx!, 0.018, sz!),
        33,
      );
      p.material = water;
      p.receiveShadows = false;
    }
    for (let i = 0; i < 100; i++) {
      const x = rng.range(-16, 16),
        z = rng.range(-11, 22);
      if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
      const r = this.rock(
        "fallen stone",
        new Vector3(x, this.floorHeight(x, z) + 0.1, z),
        new Vector3(
          rng.range(0.2, 0.9),
          rng.range(0.2, 0.65),
          rng.range(0.2, 0.9),
        ),
        i + 100,
      );
      r.material = i % 4 === 0 ? damp : this.stone;
    }
    // Spare lanterns frame the hoard; the skylight remains the visual center.
    for (const side of [-1, 1]) {
      const path = [];
      for (let j = 0; j <= 16; j++) {
        const t = j / 16;
        path.push(
          new Vector3(
            side * (12.5 - 2 * Math.sin(t * Math.PI)),
            7.5 - 1.2 * Math.sin(t * Math.PI),
            -5 + t * 24,
          ),
        );
      }
      const wire = MeshBuilder.CreateTube(
        "old lantern rope",
        { path, radius: 0.04, tessellation: 5 },
        s,
      );
      wire.material = rope;
      wire.isPickable = false;
      for (let j = 0; j < 4; j++) {
        const t = (j + 0.5) / 4,
          p = new Vector3(
            side * (12.5 - 2 * Math.sin(t * Math.PI)),
            7.5 - 1.2 * Math.sin(t * Math.PI),
            -5 + t * 24,
          );
        this.lantern(p, flame);
      }
      const light = new PointLight(
        "warm lantern spill",
        new Vector3(side * 9, 5, 5),
        s,
      );
      light.diffuse = Color3.FromHexString("#ffb66e");
      light.intensity = 1.45;
      light.range = 32;
      this.lamps.push(light);
    }
    // Soft ribbons of airborne light from the opening, rather than a solid cone.
    const beamTex = new DynamicTexture(
      "soft light shaft",
      { width: 64, height: 256 },
      s,
      false,
    );
    const bc = beamTex.getContext() as CanvasRenderingContext2D;
    const image = bc.createImageData(64, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 64; x++) {
        const at = (y * 64 + x) * 4,
          fade =
            Math.pow(Math.sin((x / 63) * Math.PI), 3) *
            Math.sin((y / 255) * Math.PI);
        image.data[at] = 240;
        image.data[at + 1] = 242;
        image.data[at + 2] = 235;
        image.data[at + 3] = Math.round(fade * 75);
      }
    bc.putImageData(image, 0, 0);
    beamTex.update();
    beamTex.hasAlpha = true;
    const beam = material("dust lit by daylight", "#f1f5eb", 1);
    beam.disableLighting = true;
    beam.diffuseTexture = beamTex;
    beam.useAlphaFromDiffuseTexture = true;
    beam.backFaceCulling = false;
    beam.alpha = 0.75;
    beam.disableDepthWrite = true;
    s.setRenderingAutoClearDepthStencil(1, false);
    for (let i = 0; i < 6; i++) {
      const top =
          i === 0
            ? new Vector3(1, 12.1, 9)
            : new Vector3(-0.4 + i * 0.75, 12.1, 8.5 + i * 0.16),
        bottom =
          i === 0
            ? new Vector3(-0.5, 0.1, 5)
            : new Vector3(-2 + i * 1.25, 0.1, 3 + i * 0.55),
        w = i === 0 ? 1.3 : 0.12 + i * 0.045;
      const mesh = new Mesh("visible skylight ray", s),
        v = new VertexData();
      v.positions = [
        top.x - w,
        top.y,
        top.z,
        top.x + w,
        top.y,
        top.z,
        bottom.x + w * 3,
        bottom.y,
        bottom.z,
        bottom.x - w * 3,
        bottom.y,
        bottom.z,
      ];
      v.indices = [0, 1, 2, 0, 2, 3];
      v.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
      v.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
      v.applyToMesh(mesh);
      mesh.material = beam;
      mesh.isPickable = false;
      mesh.renderingGroupId = 1;
    }
    const dustTexture = new DynamicTexture(
      "soft illuminated dust",
      32,
      s,
      false,
    );
    const dc = dustTexture.getContext() as CanvasRenderingContext2D,
      dg = dc.createRadialGradient(16, 16, 0, 16, 16, 15);
    dg.addColorStop(0, "#ffffff");
    dg.addColorStop(0.25, "#ffffffe0");
    dg.addColorStop(1, "#ffffff00");
    dc.fillStyle = dg;
    dc.fillRect(0, 0, 32, 32);
    dustTexture.update();
    dustTexture.hasAlpha = true;
    const dust = new ParticleSystem("dust in the sun shaft", 100, s);
    dust.particleTexture = dustTexture;
    dust.emitter = new Vector3(0, 4, 7);
    dust.minEmitBox = new Vector3(-4, -3, -4);
    dust.maxEmitBox = new Vector3(4, 6, 5);
    dust.color1 = new Color4(0.8, 0.85, 1, 0.3);
    dust.color2 = new Color4(1, 0.86, 0.6, 0.25);
    dust.colorDead = new Color4(0.6, 0.7, 0.8, 0);
    dust.minSize = 0.026;
    dust.maxSize = 0.075;
    dust.minLifeTime = 5;
    dust.maxLifeTime = 9;
    dust.emitRate = 12;
    dust.direction1 = new Vector3(-0.08, -0.12, -0.04);
    dust.direction2 = new Vector3(0.04, -0.025, 0.08);
    dust.minEmitPower = 0.3;
    dust.maxEmitPower = 0.6;
    dust.gravity = Vector3.Zero();
    dust.start();

    // Instanced doubloons give the hoard real silhouettes without thousands of draw calls.
    const coin = MeshBuilder.CreateCylinder(
      "doubloon source",
      { height: 0.028, diameter: 0.2, tessellation: 18 },
      s,
    );
    const face = new DynamicTexture("engraved doubloon faces", 256, s, true);
    const coinFace = face.getContext() as CanvasRenderingContext2D;
    coinFace.fillStyle = "#e7bc5b";
    coinFace.fillRect(0, 0, 256, 256);
    for (const r of [112, 102, 83]) {
      coinFace.beginPath();
      coinFace.arc(128, 128, r, 0, Math.PI * 2);
      coinFace.strokeStyle = r === 102 ? "#725117" : "#f2d782";
      coinFace.lineWidth = 5;
      coinFace.stroke();
    }
    coinFace.strokeStyle = "#947128";
    coinFace.lineWidth = 8;
    coinFace.beginPath();
    coinFace.moveTo(128, 57);
    coinFace.lineTo(128, 199);
    coinFace.moveTo(57, 128);
    coinFace.lineTo(199, 128);
    coinFace.stroke();
    coinFace.fillStyle = "#ecoinFacea69";
    coinFace.beginPath();
    coinFace.moveTo(128, 73);
    coinFace.lineTo(153, 128);
    coinFace.lineTo(128, 183);
    coinFace.lineTo(103, 128);
    coinFace.closePath();
    coinFace.fill();
    face.update();
    const coinMetal = this.gold.clone("engraved gold coin metal")!;
    coinMetal.diffuseTexture = face;
    coinMetal.diffuseColor = Color3.White();
    coinMetal.specularPower = 45;
    coinMetal.emissiveColor.set(0.07, 0.045, 0.005);
    coin.material = coinMetal;
    coin.isVisible = false;
    coin.isPickable = false;
    const coinsTexture = new DynamicTexture(
      "dense doubloon mosaic",
      512,
      s,
      true,
    );
    coinsTexture.wrapU = coinsTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    const cc = coinsTexture.getContext() as CanvasRenderingContext2D;
    cc.fillStyle = "#b48832";
    cc.fillRect(0, 0, 512, 512);
    const normalCoins = new DynamicTexture("raised coin rims", 512, s, true);
    normalCoins.wrapU = normalCoins.wrapV = Texture.WRAP_ADDRESSMODE;
    const nc = normalCoins.getContext() as CanvasRenderingContext2D;
    nc.fillStyle = "rgb(128,128,255)";
    nc.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 53; row++)
      for (let col = 0; col < 53; col++) {
        const x = col * 10 + (row % 2 ? 5 : 0) + rng.range(-1.5, 1.5),
          y = row * 10 + rng.range(-1.5, 1.5),
          r = rng.range(6, 7.3);
        const shine = cc.createLinearGradient(x - r, y - r, x + r, y + r);
        shine.addColorStop(0, "#f0d27e");
        shine.addColorStop(0.55, "#c79d48");
        shine.addColorStop(1, "#a87c29");
        cc.fillStyle = shine;
        cc.beginPath();
        cc.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
        cc.fill();
        cc.strokeStyle = "#866222";
        cc.lineWidth = 1.1;
        cc.stroke();
        cc.beginPath();
        cc.ellipse(x, y, r - 1.4, (r - 1.4) * 0.8, 0, Math.PI, Math.PI * 2);
        cc.strokeStyle = "#f9dfa0";
        cc.lineWidth = 0.8;
        cc.stroke();
        nc.fillStyle = "rgb(128,128,255)";
        nc.beginPath();
        nc.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
        nc.fill();
        for (let edge = 0; edge < 4; edge++) {
          nc.beginPath();
          nc.ellipse(
            x,
            y,
            r,
            r * 0.8,
            0,
            (edge * Math.PI) / 2,
            ((edge + 1) * Math.PI) / 2,
          );
          nc.strokeStyle = [
            "rgb(180,150,232)",
            "rgb(105,180,232)",
            "rgb(76,105,232)",
            "rgb(150,76,232)",
          ][edge]!;
          nc.lineWidth = 1.5;
          nc.stroke();
        }
      }
    normalCoins.update();
    normalCoins.level = 0.45;
    coinsTexture.update();
    const heapMaterial = this.gold.clone(
      "massed coins below the loose doubloons",
    )!;
    heapMaterial.diffuseTexture = coinsTexture;
    heapMaterial.bumpTexture = normalCoins;
    heapMaterial.diffuseColor = Color3.White();
    heapMaterial.specularPower = 18;
    heapMaterial.specularColor.set(0.45, 0.3, 0.08);
    heapMaterial.emissiveColor.set(0.11, 0.065, 0.01);
    buildDeepCave(this, s);
    const piles = [
      [-12, 11, 2.7],
      [-10, 18, 2.4],
      [11, 16, 2.8],
      [12, -3, 2.3],
      [-12, -5, 2.1],
      [8, -8, 2.2],
      [-7, -6, 2.8],
      [8, 4, 3.0],
      [-8, 32, 3.5],
      [-8, 44, 4],
      [8, 32, 3.2],
      [8, 46, 3.8],
      [-4, 46, 3.2],
      [2, 46, 3.6],
      [-8, 35, 3],
      [24, 30, 2.6],
      [32, 30, 2.8],
      [32, 44, 3],
      [24, 44, 2.7],
    ];
    for (let i = 0; i < piles.length; i++) {
      const [x, z, r] = piles[i]!,
        root = new TransformNode("growing treasure hoard " + i, s);
      this.hoards.push(root);
      const peak = (i < 8 ? 2.3 : 3.5) * (0.88 + 0.16 * Math.sin(i * 1.7));
      this.heaps.push({ x: x!, z: z!, r: r!, height: peak, root });
      const mound = new Mesh("continuous buried hoard", s),
        moundData = new VertexData();
      const mp: number[] = [],
        mi: number[] = [],
        mu: number[] = [];
      for (let ring = 0; ring <= 40; ring++)
        for (let k = 0; k <= 64; k++) {
          const a = (k / 64) * Math.PI * 2,
            distance = (ring / 40) * r!;
          const cx = x! + Math.cos(a) * distance,
            cz = z! + Math.sin(a) * distance;
          mp.push(
            cx,
            this.floorHeight(cx, cz) + hoardHeight(distance, r!, peak) + 0.02,
            cz,
          );
          mu.push(cx * 0.6, cz * 0.6);
          if (ring < 40 && k < 64) {
            const n = ring * 65 + k;
            mi.push(n, n + 65, n + 1, n + 1, n + 65, n + 66);
          }
        }
      const mn: number[] = [];
      VertexData.ComputeNormals(mp, mi, mn);
      moundData.positions = mp;
      moundData.indices = mi;
      moundData.normals = mn;
      moundData.uvs = mu;
      moundData.applyToMesh(mound);
      mound.parent = root;
      mound.material = heapMaterial;
      mound.isPickable = false;
      mound.receiveShadows = true;
      const loose = MeshBuilder.CreateCylinder(
        "dense loose doubloons " + i,
        { height: 0.028, diameter: 0.2, tessellation: 18 },
        s,
      );
      loose.material = coinMetal;
      loose.parent = root;
      loose.isVisible = true;
      loose.isPickable = false;
      loose.receiveShadows = true;
      const matrices = new Float32Array(1800 * 16),
        coinColors = new Float32Array(1800 * 4);
      for (let j = 0; j < 1800; j++) {
        const shade = rng.range(0.88, 1.1);
        coinColors.set(
          [shade, shade * rng.range(0.95, 1), shade * 0.9, 1],
          j * 4,
        );
        const a = rng.range(0, Math.PI * 2),
          distance = Math.sqrt(rng.next()) * r!;
        const cx = x! + Math.cos(a) * distance,
          cz = z! + Math.sin(a) * distance;
        const h = hoardHeight(distance, r!, peak);
        // Dense, almost touching coins sit on the terrain rather than hovering above it.
        const slope = (px: number, pz: number) =>
          this.floorHeight(px, pz) +
          hoardHeight(Math.hypot(px - x!, pz - z!), r!, peak);
        const normal = new Vector3(
          -(slope(cx + 0.02, cz) - slope(cx - 0.02, cz)) / 0.04,
          1,
          -(slope(cx, cz + 0.02) - slope(cx, cz - 0.02)) / 0.04,
        ).normalize();
        const axis = new Vector3(normal.z, 0, -normal.x).normalize();
        const rotation = Quaternion.RotationAxis(
          axis,
          Math.acos(normal.y),
        ).multiply(Quaternion.RotationAxis(Vector3.Up(), rng.range(0, 6)));
        Matrix.Compose(
          new Vector3(1, 1, 1).scale(rng.range(0.85, 1.2)),
          rotation,
          new Vector3(cx, this.floorHeight(cx, cz) + h + 0.035, cz),
        ).copyToArray(matrices, j * 16);
      }
      loose.thinInstanceSetBuffer("matrix", matrices, 16, true);
      loose.thinInstanceSetBuffer("color", coinColors, 4, true);
      // Canvas sacks are imperfect, bulging shapes with tied mouths.
      for (let j = 0; j < 2; j++) {
        const bx = x! + (j ? 0.8 : -0.8),
          bz = z! + r! * 0.7;
        const bag = this.rock(
          "bulging canvas gold sack",
          new Vector3(bx, 0.72, bz),
          new Vector3(0.7, 0.9, 0.65),
          j + i * 2,
        );
        bag.parent = root;
        bag.material = sack;
        const neck = MeshBuilder.CreateCylinder(
          "tied sack mouth",
          {
            height: 0.3,
            diameterTop: 0.25,
            diameterBottom: 0.4,
            tessellation: 10,
          },
          s,
        );
        neck.position.set(bx, 1.48, bz);
        neck.material = sack;
        neck.parent = root;
        const tie = MeshBuilder.CreateTorus(
          "sack rope knot",
          { diameter: 0.3, thickness: 0.055, tessellation: 14 },
          s,
        );
        tie.position.set(bx, 1.45, bz);
        tie.parent = root;
        tie.material = rope;
      }
    }
    this.spill = MeshBuilder.CreateCylinder(
      "coins spilling across the walking paths",
      { height: 0.028, diameter: 0.2, tessellation: 12 },
      s,
    );
    this.spill.material = coinMetal;
    this.spill.isPickable = false;
    this.spill.receiveShadows = true;
    const spillMatrices = new Float32Array(6000 * 16);
    for (let i = 0; i < 6000; i++) {
      const room = i % 3;
      const x =
        room === 0
          ? rng.range(-12, 12)
          : room === 1
            ? rng.range(-10, 10)
            : rng.range(23, 34);
      let z =
        room === 0
          ? rng.range(-10, 19)
          : room === 1
            ? rng.range(29, 47)
            : rng.range(29, 46);
      if (room === 1 && z > 37 && z < 40) z = 36.8;
      Matrix.Compose(
        new Vector3(1, 1, 1).scale(rng.range(0.8, 1.15)),
        Quaternion.RotationAxis(Vector3.Up(), rng.range(0, 6)),
        new Vector3(x, this.floorHeight(x, z) + 0.024, z),
      ).copyToArray(spillMatrices, i * 16);
    }
    this.spill.thinInstanceSetBuffer("matrix", spillMatrices, 16, true);
    // Salvaged supplies, rope coils and an old anchor make this a pirate's home.
    for (const [x, z] of [
      [-14, 1],
      [-13, 15],
      [13, 12],
      [12, -7],
    ]) {
      for (let j = 0; j < 2; j++)
        this.barrel(new Vector3(x! + j * 0.9, 0.7, z! + j * 0.4));
      const crate = MeshBuilder.CreateBox(
        "salvaged wooden crate",
        { width: 1.4, height: 1.1, depth: 1.2 },
        s,
      );
      crate.position.set(x! + 1.8, 0.55, z! - 0.7);
      crate.material = this.wood;
      crate.rotation.y = 0.23;
      crate.receiveShadows = true;
      for (const y of [-0.38, 0.38]) {
        const brace = MeshBuilder.CreateBox(
          "crate cross brace",
          { width: 1.45, height: 0.12, depth: 0.08 },
          s,
        );
        brace.parent = crate;
        brace.position.set(0, y, -0.64);
        brace.material = this.wood;
      }
      const diagonal = MeshBuilder.CreateBox(
        "crate diagonal brace",
        { width: 1.6, height: 0.13, depth: 0.08 },
        s,
      );
      diagonal.parent = crate;
      diagonal.position.z = -0.65;
      diagonal.rotation.z = 0.55;
      diagonal.material = this.wood;
      for (let j = 0; j < 4; j++) {
        const coil = MeshBuilder.CreateTorus(
          "coiled mooring rope",
          { diameter: 0.85 - j * 0.14, thickness: 0.07, tessellation: 28 },
          s,
        );
        coil.position.set(x! + 1.5, 0.1 + j * 0.025, z! + 1);
        coil.scaling.z = 0.8;
        coil.material = rope;
        coil.isPickable = false;
      }
    }
    const anchor = new TransformNode("old ships anchor", s);
    anchor.position.set(9, 0.3, 18);
    anchor.rotation.z = 0.3;
    const shank = MeshBuilder.CreateCylinder(
      "anchor shank",
      { height: 2.5, diameter: 0.16, tessellation: 10 },
      s,
    );
    shank.parent = anchor;
    shank.position.y = 1.3;
    shank.material = this.iron;
    const stock = MeshBuilder.CreateBox(
      "anchor wooden stock",
      { width: 1.7, height: 0.18, depth: 0.2 },
      s,
    );
    stock.parent = anchor;
    stock.position.y = 1.9;
    stock.material = this.wood;
    const ring = MeshBuilder.CreateTorus(
      "anchor eye",
      { diameter: 0.42, thickness: 0.09, tessellation: 24 },
      s,
    );
    ring.parent = anchor;
    ring.position.y = 2.6;
    ring.rotation.x = Math.PI / 2;
    ring.material = this.iron;
    for (const side of [-1, 1]) {
      const arm = MeshBuilder.CreateTube(
        "anchor curved fluke",
        {
          path: [
            new Vector3(0, 0.65, 0),
            new Vector3(side * 0.65, 0.25, 0),
            new Vector3(side * 1, 0.65, 0),
          ],
          radius: 0.12,
          tessellation: 9,
        },
        s,
      );
      arm.parent = anchor;
      arm.material = this.iron;
      const point = MeshBuilder.CreateCylinder(
        "anchor spear tip",
        { height: 0.45, diameterTop: 0, diameterBottom: 0.38, tessellation: 3 },
        s,
      );
      point.parent = anchor;
      point.position.set(side * 1, 0.78, 0);
      point.rotation.z = -side * 0.5;
      point.material = this.iron;
    }
    const flagTexture = new DynamicTexture(
      "faded pirate banner",
      { width: 256, height: 320 },
      s,
      false,
    );
    const fc = flagTexture.getContext() as CanvasRenderingContext2D;
    fc.fillStyle = "#202222";
    fc.fillRect(0, 0, 256, 320);
    fc.strokeStyle = "#c5bb9a";
    fc.lineWidth = 13;
    for (const flip of [-1, 1]) {
      fc.beginPath();
      fc.moveTo(128 - flip * 62, 190);
      fc.lineTo(128 + flip * 62, 255);
      fc.stroke();
    }
    fc.fillStyle = "#c5bb9a";
    fc.beginPath();
    fc.ellipse(128, 130, 52, 59, 0, 0, Math.PI * 2);
    fc.fill();
    fc.fillRect(99, 163, 58, 26);
    fc.fillStyle = "#202222";
    for (const x of [108, 148]) {
      fc.beginPath();
      fc.ellipse(x, 135, 14, 17, 0, 0, Math.PI * 2);
      fc.fill();
    }
    fc.beginPath();
    fc.moveTo(128, 153);
    fc.lineTo(119, 166);
    fc.lineTo(137, 166);
    fc.fill();
    for (let j = 0; j < 4; j++) fc.fillRect(105 + j * 12, 177, 4, 13);
    flagTexture.update();
    const flagMat = material("weathered skull flag", "#a49b83");
    flagMat.diffuseTexture = flagTexture;
    flagMat.emissiveTexture = flagTexture;
    flagMat.emissiveColor.set(0.12, 0.12, 0.12);
    flagMat.backFaceCulling = false;
    const flag = MeshBuilder.CreateGround(
      "captain's torn banner",
      { width: 2.2, height: 2.7, subdivisions: 10, updatable: true },
      s,
    );
    const fv = flag.getVerticesData("position")!;
    for (let j = 0; j < fv.length; j += 3)
      fv[j + 1] = Math.sin(fv[j]! * 3 + fv[j + 2]!) * 0.14;
    flag.updateVerticesData("position", fv);
    flag.rotation.x = -Math.PI / 2;
    flag.position.set(-9, 4.3, 18);
    flag.material = flagMat;
    flag.isPickable = false;
    // Mineral veins and tiny quartz crystals tucked between the wall stones.
    for (let i = 0; i < 24; i++) {
      const x = (i % 2 ? 1 : -1) * rng.range(13, 15.5),
        z = rng.range(-8, 21),
        h = rng.range(0.22, 0.7);
      const q = MeshBuilder.CreateCylinder(
        "natural quartz",
        { height: h, diameterTop: 0, diameterBottom: 0.15, tessellation: 6 },
        s,
      );
      q.position.set(x, this.floorHeight(x, z) + h * 0.5, z);
      q.rotation.z = rng.range(-0.4, 0.4);
      q.material = crystal;
      q.isPickable = false;
    }
    // Fine cobwebs in the unused corners, visible against the warm light.
    for (const side of [-1, 1]) {
      const origin = new Vector3(side * 15, 7, 18),
        paths: Vector3[][] = [];
      for (let j = 0; j < 7; j++) {
        const angle = (j / 6) * Math.PI * 0.7;
        paths.push([
          origin,
          origin.add(
            new Vector3(
              -side * Math.cos(angle) * 2,
              -Math.sin(angle) * 2,
              0.05,
            ),
          ),
        ]);
      }
      for (let j = 1; j < 5; j++) {
        const row = [];
        for (let k = 0; k < 7; k++) {
          const a = (k / 6) * Math.PI * 0.7;
          row.push(
            origin.add(
              new Vector3(
                -side * Math.cos(a) * j * 0.4,
                -Math.sin(a) * j * 0.4,
                0.05,
              ),
            ),
          );
        }
        paths.push(row);
      }
      const web = MeshBuilder.CreateLineSystem(
        "delicate cave cobweb",
        { lines: paths },
        s,
      );
      web.color = new Color3(0.5, 0.47, 0.4);
      web.alpha = 0.22;
      web.isPickable = false;
    }
    for (const mesh of s.meshes) {
      if (/barrel body|salvaged wooden crate|stalagmite/.test(mesh.name))
        this.block(mesh as Mesh);
    }
    this.mergeStaticGeometry();
  }
  private ceiling(): void {
    const segments = 64,
      bands = 9,
      cx = 1,
      cz = 9;
    const edge = (angle: number) => {
      const rough = 1 + 0.1 * Math.sin(angle * 5) + 0.065 * Math.cos(angle * 9);
      return {
        x: cx + Math.cos(angle) * 3.9 * rough,
        z: cz + Math.sin(angle) * 3.1 * rough,
      };
    };
    const roofHeight = (x: number, z: number) =>
      12.65 -
      3.8 * Math.pow(x / 18, 2) -
      0.3 * Math.pow((z - 8) / 25, 2) +
      0.17 * Math.sin(x * 0.8 + z * 0.35) +
      0.09 * Math.cos(z * 1.7 - x * 0.4);
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [];
    for (let band = 0; band <= bands; band++)
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2,
          dx = Math.cos(a),
          dz = Math.sin(a),
          inner = edge(a);
        const tx = dx > 0 ? (18 - cx) / dx : (-18 - cx) / dx,
          tz = dz > 0 ? (26 - cz) / dz : (-12 - cz) / dz;
        const reach = Math.min(tx, tz),
          t = band / bands;
        const x = inner.x * (1 - t) + (cx + dx * reach) * t,
          z = inner.z * (1 - t) + (cz + dz * reach) * t;
        positions.push(x, roofHeight(x, z), z);
        uvs.push(x / 6, z / 6);
        if (band < bands && i < segments) {
          const n = band * (segments + 1) + i;
          indices.push(
            n,
            n + 1,
            n + segments + 1,
            n + 1,
            n + segments + 2,
            n + segments + 1,
          );
        }
      }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.uvs = uvs;
    const roof = new Mesh("vaulted ceiling with an open skylight", this.scene);
    data.applyToMesh(roof);
    roof.convertToFlatShadedMesh();
    const roofMaterial = this.stone.clone("fractured ceiling underside")!;
    roofMaterial.backFaceCulling = false;
    roof.material = roofMaterial;
    roof.isPickable = false;
    roof.receiveShadows = true;
    // The eroded shaft exposes real thickness; the bright sky sits well above it.
    const throatPositions: number[] = [],
      throatUV: number[] = [],
      throatIndices: number[] = [];
    for (let layer = 0; layer <= 3; layer++)
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2,
          p = edge(a),
          t = layer / 3;
        const x = cx + (p.x - cx) * (1 + 0.1 * t),
          z = cz + (p.z - cz) * (1 + 0.1 * t) + t * 2.6;
        throatPositions.push(x, roofHeight(p.x, p.z) + t * 0.7, z);
        throatUV.push((i / segments) * 5, t);
        if (layer < 3 && i < segments) {
          const n = layer * (segments + 1) + i;
          throatIndices.push(
            n,
            n + 1,
            n + segments + 1,
            n + 1,
            n + segments + 2,
            n + segments + 1,
          );
        }
      }
    const tn: number[] = [];
    VertexData.ComputeNormals(throatPositions, throatIndices, tn);
    const td = new VertexData();
    td.positions = throatPositions;
    td.indices = throatIndices;
    td.normals = tn;
    td.uvs = throatUV;
    const throat = new Mesh("broken roof throat", this.scene);
    td.applyToMesh(throat);
    throat.convertToFlatShadedMesh();
    throat.material = roofMaterial;
    throat.isPickable = false;
    throat.receiveShadows = true;
  }
  private mergeStaticGeometry(): void {
    const groups = new Map<string, Mesh[]>();
    for (const mesh of [...this.scene.meshes]) {
      if (
        !(mesh instanceof Mesh) ||
        mesh.instances.length ||
        mesh.thinInstanceCount > 0 ||
        mesh.name === "visible skylight ray" ||
        mesh.name === "doubloon source" ||
        mesh.getChildMeshes().length
      )
        continue;
      let parent = mesh.parent,
        dynamic = false;
      while (parent) {
        if (
          parent.name.startsWith("hanging pirate lantern") ||
          parent.name.startsWith("growing treasure hoard")
        )
          dynamic = true;
        parent = parent.parent;
      }
      if (dynamic) continue;
      const caster = /barrel|crate|anchor|stalagmite|ceiling|roof throat/.test(
        mesh.name,
      );
      const key = mesh.material!.uniqueId + ":" + caster;
      const group = groups.get(key) ?? [];
      group.push(mesh);
      groups.set(key, group);
    }
    for (const [key, meshes] of groups) {
      const merged =
        meshes.length > 1 ? Mesh.MergeMeshes(meshes, true, true) : meshes[0];
      if (!merged) continue;
      merged.name = "cavern scenery " + key;
      merged.isPickable = false;
      merged.receiveShadows = true;
      if (key.endsWith("true")) this.shadow.addShadowCaster(merged);
    }
  }

  get walkingGeometry() {
    return {
      obstacles: this.obstacles,
      heaps: this.heaps.map((h) => ({
        x: h.x,
        z: h.z,
        r: h.r,
        peak: h.height,
        scale: h.root.scaling.y,
        enabled: h.root.isEnabled(),
      })),
    };
  }
  walkHeight(x: number, z: number): number {
    let top = this.floorHeight(x, z);
    for (const h of this.heaps) {
      if (!h.root.isEnabled()) continue;
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < h.r)
        top = Math.max(
          top,
          (this.floorHeight(x, z) + hoardHeight(d, h.r, h.height) + 0.02) *
            h.root.scaling.y,
        );
    }
    return top;
  }
  floorHeight(x: number, z: number): number {
    return caveFloor(x, z);
  }
  rock(
    name: string,
    position: Vector3,
    scale: Vector3,
    seed: number,
    flatTop = false,
  ): Mesh {
    const r = MeshBuilder.CreateIcoSphere(
      name,
      { radius: 1, subdivisions: 3, updatable: true },
      this.scene,
    );
    const vertices = r.getVerticesData("position")!;
    for (let j = 0; j < vertices.length; j += 3) {
      const x = vertices[j]!,
        y = vertices[j + 1]!,
        z = vertices[j + 2]!;
      const rough =
        1 +
        0.1 * Math.sin(x * 7 + z * 5 + seed) +
        0.05 * Math.cos(y * 13 + seed * 0.7);
      vertices[j] = x * rough;
      vertices[j + 1] = flatTop && y > 0.12 ? 0.55 : y * rough;
      vertices[j + 2] = z * rough;
    }
    r.updateVerticesData("position", vertices);
    r.convertToFlatShadedMesh();
    r.position.copyFrom(position);
    r.scaling.copyFrom(scale);
    r.rotation.y = seed * 0.71;
    r.material = this.stone;
    r.isPickable = false;
    r.receiveShadows = true;
    if (/treasure rock ledge|fallen stone|ledge rubble|deep rubble/.test(name))
      this.block(r);
    return r;
  }
  block(mesh: Mesh): void {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    const a = box.minimumWorld,
      b = box.maximumWorld;
    if (a.y > 1.8 || b.y < 0.35) return;
    this.obstacles.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      rx: (b.x - a.x) * 0.4,
      rz: (b.z - a.z) * 0.4,
      top: b.y,
    });
  }
  lantern(p: Vector3, glass: StandardMaterial): void {
    const root = new TransformNode("hanging pirate lantern", this.scene);
    root.position.copyFrom(p);
    root.rotation.z = 0.1;
    this.lanterns.push(root);
    const part = (
      name: string,
      h: number,
      top: number,
      bottom: number,
      y: number,
      mat: StandardMaterial,
    ) => {
      const m = MeshBuilder.CreateCylinder(
        name,
        {
          height: h,
          diameterTop: top,
          diameterBottom: bottom,
          tessellation: 12,
        },
        this.scene,
      );
      m.parent = root;
      m.position.y = y;
      m.material = mat;
      m.isPickable = false;
      return m;
    };
    part("lantern golden glass", 0.75, 0.42, 0.5, -0.8, glass);
    part("lantern hood", 0.17, 0.2, 0.65, -0.34, this.iron);
    part("lantern brass foot", 0.13, 0.55, 0.3, -1.22, this.gold);
    const link = MeshBuilder.CreateTorus(
      "lantern hanging ring",
      { diameter: 0.26, thickness: 0.045, tessellation: 16 },
      this.scene,
    );
    link.parent = root;
    link.position.y = -0.18;
    link.rotation.x = Math.PI / 2;
    link.material = this.iron;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5;
      const bar = MeshBuilder.CreateCylinder(
        "lantern protective rib",
        { height: 0.85, diameter: 0.045, tessellation: 6 },
        this.scene,
      );
      bar.parent = root;
      bar.position.set(Math.cos(a) * 0.25, -0.78, Math.sin(a) * 0.25);
      bar.material = this.iron;
    }
    part("lantern suspension chain", 0.18, 0.035, 0.035, 0.02, this.iron);
  }
  private barrel(p: Vector3): void {
    const barrel = MeshBuilder.CreateCylinder(
      "bulging oak barrel",
      {
        height: 1.65,
        diameterTop: 1.05,
        diameterBottom: 1.05,
        tessellation: 16,
        subdivisions: 5,
        updatable: true,
      },
      this.scene,
    );
    const v = barrel.getVerticesData("position")!;
    for (let j = 0; j < v.length; j += 3) {
      const bulge = 1 + 0.18 * Math.cos((v[j + 1]! / 1.65) * Math.PI);
      v[j] = v[j]! * bulge;
      v[j + 2] = v[j + 2]! * bulge;
    }
    barrel.updateVerticesData("position", v);
    barrel.position.copyFrom(p);
    barrel.material = this.wood;
    for (const y of [-0.6, -0.15, 0.5]) {
      const ring = MeshBuilder.CreateTorus(
        "rusted barrel hoop",
        {
          diameter: 1.08 + 0.18 * Math.cos((y / 1.65) * Math.PI),
          thickness: 0.07,
          tessellation: 24,
        },
        this.scene,
      );
      ring.parent = barrel;
      ring.position.y = y;
      ring.material = this.iron;
      ring.isPickable = false;
    }
  }
  refresh(count: number): void {
    this.spill.setEnabled(count > 0);
    this.spill.thinInstanceCount = Math.min(6000, 500 + count * 400);
    // A single voyage spills coins into every chamber. The first five voyages grow broad
    // banks of gold; later voyages raise them into towering, overlapping fortunes.
    this.hoards.forEach((h, i) => {
      h.setEnabled(count > 0);
      h.scaling.y = hoardGrowth(count);
      // Deeper chambers start modestly but never remain empty after the first find.
      if (i >= 8) h.scaling.y *= 0.85;
    });
  }
  animate(dt: number): void {
    this.time += dt;
    this.lanterns.forEach(
      (l, i) => (l.rotation.z = Math.sin(this.time * 0.7 + i * 1.3) * 0.045),
    );
    const camera = this.scene.activeCamera!;
    const nearest = [...this.lamps]
      .sort(
        (a, b) =>
          Vector3.DistanceSquared(a.position, camera.position) -
          Vector3.DistanceSquared(b.position, camera.position),
      )
      .slice(0, 2);
    this.lamps.forEach((l) => {
      l.setEnabled(nearest.includes(l));
      l.renderPriority = 1;
    });
    this.lamps.forEach(
      (l, i) =>
        (l.intensity =
          2.6 +
          Math.sin(this.time * 7 + i) * 0.04 +
          Math.sin(this.time * 13 + i) * 0.025),
    );
  }
}
