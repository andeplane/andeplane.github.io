import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { deckHeight, deckHalfWidth, HARBOUR_BUILDINGS, HARBOUR_CARGO } from "../input/harbourLayout";
import { Rng } from "../sim/rng";
import { bindLocalLights } from "./localLights";

/** A walking version of the Pearl: continuous decks, stairs and close-up joinery. */
export function buildHarbourScenery(scene: Scene, shadow: ShadowGenerator) {
  const rng = new Rng(78031), parts: Mesh[] = [], flags: Mesh[] = [], lamps: PointLight[] = [];
  const mat = (name: string, hex: string, glow = 0) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor.set(0.12, 0.1, 0.08);
    m.emissiveColor = m.diffuseColor.scale(glow);
    return m;
  };
  const timber = new DynamicTexture("weathered harbour planks", 512, scene, true);
  const ctx = timber.getContext();
  ctx.fillStyle = "#795b3e"; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = ["#87694b", "#755437", "#9b7851"][i % 3]!;
    ctx.fillRect(i * 64 + 2, 0, 61, 512);
    for (let j = 0; j < 34; j++) {
      const x = i * 64 + rng.range(4, 59);
      ctx.strokeStyle = j % 3 ? "#3c261c40" : "#cba37342";
      ctx.lineWidth = rng.range(0.4, 1.3); ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin(y * 0.023 + j) * 2.5, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#392f25";
    for (const y of [12, 244, 269, 499]) {
      ctx.beginPath(); ctx.arc(i * 64 + 8, y, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(i * 64 + 56, y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillRect(i * 64, i % 2 ? 256 : 128, 64, 2);
  }
  timber.wrapU = timber.wrapV = Texture.WRAP_ADDRESSMODE;
  timber.update();
  const deck = mat("aged teak walking deck", "#ffffff"); deck.diffuseTexture = timber;
  const wood = mat("dark weathered dock timber", "#ac9679"); wood.diffuseTexture = timber;
  const hull = mat("Black Pearl ebony planking", "#514b43"); hull.diffuseTexture = timber;
  const iron = mat("black wrought iron", "#262a29"), brass = mat("tarnished brass", "#b4985b");
  const rope = mat("hemp ropes", "#9b8968"), cloth = mat("black pirate canvas", "#273432");
  cloth.backFaceCulling = false; cloth.twoSidedLighting = true;
  const stone = mat("harbour stone", "#827e6a"), roof = mat("aged terracotta", "#8d4937");
  const glow = mat("warm lantern glass", "#edb367", 0.55);
  const plaster = ["#c2a474", "#9b7f64", "#6d8982", "#bcb28e"].map((c, i) => mat("port plaster " + i, c));
  const add = (m: Mesh, material: StandardMaterial) => {
    m.material = material; m.isPickable = false; m.receiveShadows = true; parts.push(m); return m;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, m = wood) => {
    const mesh = add(MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene), m);
    mesh.position.set(x, y, z); return mesh;
  };
  const cylinder = (name: string, diameter: number, height: number, x: number, y: number, z: number, m = wood, sides = 12) => {
    const mesh = add(MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: sides }, scene), m);
    mesh.position.set(x, y, z); return mesh;
  };
  const tube = (name: string, path: Vector3[], radius: number, m = rope) =>
    add(MeshBuilder.CreateTube(name, { path, radius, tessellation: 6, cap: Mesh.CAP_ALL }, scene), m);
  const torus = (name: string, diameter: number, thickness: number, x: number, y: number, z: number, m = iron) => {
    const mesh = add(MeshBuilder.CreateTorus(name, { diameter, thickness, tessellation: 20 }, scene), m);
    mesh.position.set(x, y, z); return mesh;
  };
  const surface = (name: string, positions: number[], indices: number[], uvs: number[], m: StandardMaterial) => {
    const mesh = new Mesh(name, scene), data = new VertexData();
    data.positions = positions; data.indices = indices; data.uvs = uvs;
    VertexData.ComputeNormals(positions, indices, data.normals = []);
    data.applyToMesh(mesh); return add(mesh, m);
  };
  const skyTex = new DynamicTexture("Port Blackwater sunset", {width:1024,height:512}, scene, false);
  const skyCtx = skyTex.getContext() as CanvasRenderingContext2D;
  const skyGradient = skyCtx.createLinearGradient(0,0,0,512);
  skyGradient.addColorStop(0,"#182c40"); skyGradient.addColorStop(.3,"#586c7b");
  skyGradient.addColorStop(.46,"#b19b87"); skyGradient.addColorStop(.52,"#d9b18d");
  skyGradient.addColorStop(.65,"#66757b"); skyGradient.addColorStop(1,"#273f4c");
  skyCtx.fillStyle=skyGradient; skyCtx.fillRect(0,0,1024,512);
  for(let i=0;i<16;i++) {
    const x=rng.range(0,1024),y=rng.range(150,230),r=rng.range(20,65);
    const cloud=skyCtx.createRadialGradient(x,y,0,x,y,r);
    cloud.addColorStop(0,"#d4c6b322");cloud.addColorStop(1,"#d4c6b300");
    skyCtx.fillStyle=cloud;skyCtx.fillRect(x-r,y-r,r*2,r*2);
  }
  skyTex.update();
  const skyMat=mat("painted dusk sky", "#000000"); skyMat.disableLighting=true; skyMat.fogEnabled=false;
  skyMat.emissiveTexture=skyTex;skyMat.emissiveColor=Color3.Black();
  const skyDome=MeshBuilder.CreateSphere("harbour evening sky",{diameter:600,segments:24,sideOrientation:Mesh.BACKSIDE},scene);
  skyDome.material=skyMat;skyDome.infiniteDistance=true;skyDome.isPickable=false;
  // A lofted hull and continuous planked surface follow the same walking profile.
  const hp: number[] = [], hi: number[] = [], hu: number[] = [];
  for (let i = 0; i <= 64; i++) {
    const z = -24 + i * 0.75, half = deckHalfWidth(z), y = deckHeight(z);
    for (const [x, height] of [[-half, y + 0.25], [-half * 0.85, 0.1], [0, -2.3], [half * 0.85, 0.1], [half, y + 0.25]]) {
      hp.push(x!, height!, z); hu.push((hp.length / 3 % 5) * 0.65, z / 4);
    }
    if (i < 64) for (let j = 0; j < 4; j++) {
      const a = i * 5 + j; hi.push(a, a + 1, a + 5, a + 1, a + 6, a + 5);
    }
    if (i < 64) {
      const nz = z + 0.75, nextHalf = deckHalfWidth(nz), ny = deckHeight(nz);
      surface("walking deck plank section", [-half, y, z, half, y, z, nextHalf, ny, nz, -nextHalf, ny, nz],
        [0, 1, 2, 0, 2, 3], [-half / 2, z / 4, half / 2, z / 4, nextHalf / 2, nz / 4, -nextHalf / 2, nz / 4], deck);
    }
  }
  surface("Black Pearl curved hull", hp, hi, hu, hull).material!.backFaceCulling = false;
  for (const z of [-24,24]) {
    const h=deckHalfWidth(z),y=deckHeight(z);
    surface("closed bow and transom",[-h,y,z,-h*.85,.1,z,0,-2.3,z,h*.85,.1,z,h,y,z],
      [0,1,2,0,2,3,0,3,4],[0,0,0,.8,.5,1,1,.8,1,0],hull);
  }
  for (const side of [-1, 1]) {
    const path: Vector3[] = [], trim: Vector3[] = [];
    for (let z = -24; z <= 24; z += 0.75) {
      path.push(new Vector3(side * deckHalfWidth(z), deckHeight(z) + 1.1, z));
      trim.push(new Vector3(side * (deckHalfWidth(z) + 0.04), deckHeight(z) + 0.12, z));
      if (Math.round(z * 4) % 6 === 0 && !(side > 0 && z >= -5 && z <= -1))
        cylinder("deck rail baluster", 0.17, 1.1, side * deckHalfWidth(z), deckHeight(z) + 0.55, z);
    }
    if (side < 0) tube("port handrail", path, 0.14, hull);
    else {
      tube("starboard aft handrail", path.filter(p => p.z <= -5.25), 0.14, hull);
      tube("starboard fore handrail", path.filter(p => p.z >= -0.75), 0.14, hull);
    }
    tube("golden hull trim", trim, 0.055, brass);
    for (const z of [-7, 1, 8]) {
      if (side > 0 && z === -7) continue;
      const x = side * 4.6, y = deckHeight(z);
      box("cannon carriage", 1.5, 0.48, 1.4, x, y + 0.4, z);
      for (const dz of [-0.5, 0.5]) {
        const wheel = cylinder("cannon carriage wheel", 0.6, 0.18, x, y + 0.3, z + dz, iron);
        wheel.rotation.z = Math.PI / 2;
      }
      const gun = cylinder("bronze black cannon", 0.52, 2.1, x + side * 0.3, y + 0.9, z, iron, 20);
      gun.rotation.z = Math.PI / 2;
      const muzzle = torus("cannon muzzle ring", 0.53, 0.09, x + side * 1.35, y + 0.9, z, brass);
      muzzle.rotation.z = Math.PI / 2;
    }
  }
  tube("stern gallery handrail", [new Vector3(-4.8, 6.5, -23.7), new Vector3(4.8, 6.5, -23.7)], 0.14, hull);
  box("stern carved gallery", 9.8, 2.6, 0.4, 0, 4.5, -24, hull);
  for (let x = -4; x <= 4; x += 1.5) {
    box("stern amber window frame", 1.15, 1.5, 0.12, x, 4.7, -24.25, brass);
    box("stern amber window", 0.86, 1.22, 0.13, x, 4.7, -24.33, glow);
    box("stern window crossbar", 0.05, 1.3, 0.16, x, 4.7, -24.4, hull);
  }
  // Narrow stair treads over the smooth collision ramps; no tall invisible steps.
  for (const [from, to] of [[-16, -12], [12, 15]])
    for (let z = from!; z < to!; z += 0.25) {
      const h = deckHeight(z + 0.125);
      box("deck stair tread", deckHalfWidth(z) * 2 - 0.5, 0.09, 0.24, 0, h + 0.02, z + 0.125, deck);
    }
  const wheel = torus("captain's wheel", 1.5, 0.12, 0, 6.75, -21, wood);
  wheel.rotation.x = Math.PI / 2;
  cylinder("helm pedestal", 0.4, 1.2, 0, 6, -21, brass);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    tube("wheel spoke", [new Vector3(0, 6.75, -21), new Vector3(Math.sin(a), 6.75 + Math.cos(a), -21)], 0.065, wood);
  }
  box("navigation table", 2.3, 0.14, 1.5, -2.8, 6.55, -19, wood);
  for (const x of [-3.7, -1.9]) cylinder("chart table leg", 0.15, 1.1, x, 6, -19);
  box("captain's parchment chart", 1.7, 0.025, 1.1, -2.8, 6.64, -19, plaster[0]);
  const compass = torus("table compass", 0.4, 0.08, -2.25, 6.7, -18.7, brass);
  cylinder("compass glass", 0.32, 0.04, compass.position.x, 6.72, compass.position.z, iron);
  for (const z of [-10, 3, 15]) {
    const height = z === 3 ? 33 : 27, base = deckHeight(z);
    cylinder("tall ebony mast", 1, height, 0, base + height / 2, z, hull, 16);
    for (let y = base + 1; y < base + height; y += 3)
      torus("mast iron collar", 1.01, 0.07, 0, y, z, iron);
    for (const side of [-1, 1])
      for (let k = 0; k < 3; k++)
        tube("standing rigging", [new Vector3(side * (deckHalfWidth(z) - 0.3), base + 0.4, z - 2 + k * 2), new Vector3(0, base + height * 0.85, z)], 0.035);
    for (let row = 0; row < 3; row++) {
      const y = base + 9 + row * 6.7, width = (3 - row * 0.62) * 4.6;
      tube("sail yard", [new Vector3(-width / 2 - 0.7, y, z), new Vector3(width / 2 + 0.7, y, z)], 0.13, hull);
      const paths: Vector3[][] = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8, line: Vector3[] = [];
        for (let k = 0; k <= 10; k++) {
          const u = k / 10;
          line.push(new Vector3((u - 0.5) * width * (1 - t * 0.12), y - t * 5.8,
            z + Math.sin(u * Math.PI) * Math.sin(t * Math.PI) * 1.5));
        }
        paths.push(line);
      }
      add(MeshBuilder.CreateRibbon("black canvas sail", { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE }, scene), cloth);
    }
  }
  tube("bowsprit", [new Vector3(0, 4.9, 20), new Vector3(0, 8, 32)], 0.25, hull);
  for (const x of [-3.5, 3.5]) {
    cylinder("rum barrel", 1.25, 1.6, x, 4.4, -10);
    for (const y of [3.9, 4.9]) torus("barrel iron band", 1.26, 0.08, x, y, -10, iron);
  }
  box("deck hatch frame", 2.6, 0.14, 3, -2.3, 3.7, 5, hull);
  for (let z = 3.8; z < 6.4; z += 0.28) box("hatch grating", 2.4, 0.1, 0.1, -2.3, 3.79, z, iron);
  cylinder("capstan", 0.95, 1, 2.7, 4.1, 11);
  torus("anchor rope coil", 1.6, 0.13, -3.5, 3.69, -3, rope);
  torus("anchor rope coil inner", 1.2, 0.13, -3.5, 3.7, -3, rope);

  // Cobblestones repeat at human scale, rather than a plain slab beneath the town.
  const cobbles = new DynamicTexture("quayside cobblestone courses", 512, scene, true);
  const cc = cobbles.getContext(); cc.fillStyle = "#4d5046"; cc.fillRect(0,0,512,512);
  for (let row=0; row<8; row++) for (let col=-1; col<8; col++) {
    const x=col*74+(row%2)*37, y=row*64;
    const tone=Math.floor(rng.range(105,148));
    cc.fillStyle=`rgb(${tone+8},${tone+3},${tone-13})`;
    cc.fillRect(x+3,y+3,68,58);
    cc.fillStyle="#ffffff12"; cc.fillRect(x+5,y+5,64,2);
    for(let k=0;k<45;k++) { cc.fillStyle=k%2?"#25292022":"#dddbbf28"; cc.fillRect(x+rng.range(5,68),y+rng.range(6,58),rng.range(1,3),1); }
  }
  cobbles.wrapU=cobbles.wrapV=Texture.WRAP_ADDRESSMODE;
  cobbles.uScale=12; cobbles.vScale=20; cobbles.update();
  const quayStone=mat("old quayside cobbles", "#ffffff"); quayStone.diffuseTexture=cobbles;
  box("solid harbour quay", 50, 4.8, 86, 40, 0, 0, quayStone);
  for (let z = -38; z <= 39; z += 2) {
    box("quay coping stone", 1.6, 0.3, 1.9, 16, 2.55, z, stone);
    box("timber landing boards", 5, 0.18, 1.85, 18.5, 2.48, z, deck);
  }
  for (const z of [-23, -12, 9, 22, 36]) {
    cylinder("mooring bollard", 0.6, 1.1, 17, 2.95, z, iron);
    cylinder("dock pile", 0.6, 5.5, 15.5, 0.6, z, wood);
    if (z === -12 || z === 9) tube("ship mooring line", [new Vector3(6, deckHeight(z) + 0.5, z), new Vector3(10, 2.8, z + 1), new Vector3(17, 3.1, z)], 0.07);
  }
  for (let x = 6; x <= 17; x += 0.45) {
    const y = 3.6 - (x - 6) / 11 * 1.2;
    const p = box("gangplank plank", 0.43, 0.18, 3.7, x, y - 0.1, -3, deck);
    p.rotation.z = -Math.atan(1.2 / 11);
  }
  for (const z of [-4.85, -1.15]) {
    tube("gangplank hand rope", [new Vector3(6, 4.5, z), new Vector3(11.5, 3.9, z), new Vector3(17, 3.3, z)], 0.05);
    for (const x of [6, 11.5, 17]) cylinder("gangplank post", 0.12, 1, x, 4.1 - (x - 6) / 11 * 1.2, z);
  }
  const lantern = (x: number, y: number, z: number) => {
    box("lantern bracket", 0.12, 0.15, 0.65, x, y + 0.7, z, iron);
    box("amber lantern panes", 0.45, 0.65, 0.45, x, y, z, glow);
    for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25])
      box("lantern iron corner", 0.045, 0.8, 0.045, x + dx, y, z + dz, iron);
    box("lantern cap", 0.6, 0.09, 0.6, x, y + 0.4, z, iron);
    box("lantern base", 0.6, 0.08, 0.6, x, y - 0.4, z, iron);
  };
  for (const z of [-28, -8, 14, 34]) {
    cylinder("quay lamppost", 0.22, 4.3, 19, 4.55, z, iron);
    lantern(19, 6.5, z);
    const l = new PointLight("harbour lantern", new Vector3(19, 6.5, z), scene);
    l.diffuse = Color3.FromHexString("#ffb766"); l.intensity = 1.1; l.range = 18; lamps.push(l);
  }
  lantern(-4, 7, -22); lantern(4, 7, -22);
  const shipLamp = new PointLight("quarterdeck lantern", new Vector3(0, 7.4, -20), scene);
  shipLamp.diffuse = Color3.FromHexString("#ffbf81"); shipLamp.range = 17; shipLamp.intensity = 0.65; lamps.push(shipLamp);
  for (const [i, b] of HARBOUR_BUILDINGS.entries()) {
    const base = 2.4, y = base + b.height / 2;
    box(b.name, b.width, b.height, b.depth, b.x, y, b.z, plaster[i % plaster.length]);
    for (const side of [-1, 1]) {
      const r = box("sloping tiled roof", b.width * 0.6, 0.32, b.depth + 1.6,
        b.x + side * b.width * 0.25, base + b.height + 1.45, b.z, roof);
      r.rotation.z = side * -0.48;
      for (let j = 0; j < 7; j++) {
        const t = j / 7, x = b.x + side * t * b.width * 0.5;
        box("roof tile ridge", 0.11, 0.1, b.depth + 1.7, x, base + b.height + 2.5 - t * 2.3, b.z, roof);
      }
    }
    const frontX = b.x - b.width / 2 - 0.08;
    for (const dz of [-b.depth * 0.33, 0, b.depth * 0.33]) {
      box("facade upright timber", 0.22, b.height, 0.25, frontX, y, b.z + dz, hull);
      for (const h of [2.8, 5.8]) {
        box("wooden window frame", 0.15, 1.65, 1.55, frontX - 0.04, base + h, b.z + dz, wood);
        box("lit tavern window", 0.17, 1.3, 1.2, frontX - 0.12, base + h, b.z + dz, glow);
        box("window mullion", 0.19, 1.4, 0.08, frontX - 0.23, base + h, b.z + dz, wood);
      }
    }
    box("half timber facade beam", 0.24, 0.2, b.depth, frontX, base + 4.2, b.z, hull);
    box("tavern doorway", 0.18, 2.8, 1.8, frontX - 0.15, base + 1.4, b.z, hull);
    box("balcony platform", 1.7, 0.2, b.depth * 0.7, frontX - 0.7, base + 4.1, b.z, wood);
    for (let z = b.z - b.depth * 0.33; z < b.z + b.depth * 0.33; z += 0.7)
      box("balcony upright", 0.12, 1.05, 0.12, frontX - 1.5, base + 4.65, z, wood);
    box("balcony rail", 0.15, 0.13, b.depth * 0.7, frontX - 1.5, base + 5.2, b.z, wood);
    // The inland alley is a real facade too: shutters, window ledges and beams.
    const backX = b.x + b.width / 2 + .08;
    for (const dz of [-b.depth*.33, 0, b.depth*.33]) {
      box("inland facade timber", .22, b.height, .24, backX, y, b.z+dz, hull);
      for (const h of [2.8,5.8]) {
        box("alley window frame", .15,1.6,1.45,backX+.04,base+h,b.z+dz,wood);
        box("alley window glass", .17,1.25,1.05,backX+.12,base+h,b.z+dz,glow);
        box("alley window mullion", .19,1.3,.07,backX+.21,base+h,b.z+dz,wood);
        box("alley window sill", .5,.12,1.65,backX+.18,base+h-.8,b.z+dz,wood);
        for (const sz of [-1,1]) for(let k=0;k<5;k++)
          box("wooden shutter slat", .14,.21,.43,backX+.18,base+h-.52+k*.26,b.z+dz+sz*.81,wood);
      }
    }
    box("inland horizontal beam", .24,.2,b.depth,backX,base+4.2,b.z,hull);
    for (const end of [-1,1]) {
      const wallZ=b.z+end*(b.depth/2+.09);
      for(const x of [b.x-b.width*.3,b.x+b.width*.3]) {
        box("side wall upright", .2,b.height,.18,x,y,wallZ,hull);
        for(const h of [2.8,5.8]) {
          box("side window frame",1.4,1.5,.18,x,base+h,wallZ+end*.03,wood);
          box("side window pane",1.12,1.2,.19,x,base+h,wallZ+end*.12,glow);
          box("side window crossbar",.09,1.25,.2,x,base+h,wallZ+end*.2,wood);
        }
      }
      tube("gable roof verge",[new Vector3(b.x-b.width*.54,base+b.height+.25,wallZ+end*.6),new Vector3(b.x,base+b.height+2.58,wallZ+end*.6),new Vector3(b.x+b.width*.54,base+b.height+.25,wallZ+end*.6)],.09,wood);
    }
    const chimney = box("brick chimney", 1, 3, 1, b.x + 2, base + b.height + 2.5, b.z - 2, stone);
    box("chimney cap", 1.3, 0.25, 1.3, chimney.position.x, chimney.position.y + 1.6, chimney.position.z, stone);
    lantern(frontX - 0.55, base + 3, b.z + 1.7);
    const sign = new DynamicTexture("hand painted sign " + b.name, {width:512,height:128}, scene, true);
    sign.drawText(b.name, null, 83, "bold 40px Georgia", "#ead5a0", "#332e25", true);
    const signMat = mat("sign " + b.name, "#ffffff"); signMat.diffuseTexture = sign;
    const board = add(MeshBuilder.CreatePlane("tavern sign", {width:4,height:1,sideOrientation:Mesh.DOUBLESIDE}, scene), signMat);
    board.position.set(frontX - 0.4, base + 3.7, b.z); board.rotation.y = Math.PI / 2;
  }
  for (const {x,z} of HARBOUR_CARGO) {
    box("merchant cargo crate", 1.4, 1.3, 1.4, x, 3.05, z, wood);
    for (const dz of [-0.55, 0.55]) box("crate binding", 1.45, 0.13, 0.13, x, 3.3, z + dz, iron);
  }
  // A fortified headland frames the town and hides the back of the set.
  for (let i = 0; i < 16; i++) {
    const rock = add(MeshBuilder.CreateIcoSphere("harbour cliffs", {radius:1,subdivisions:2}, scene), stone);
    rock.position.set(72 + rng.range(-3, 3), 5, -60 + i * 8);
    rock.scaling.set(rng.range(10, 17), rng.range(12, 24), 12);
  }
  cylinder("harbour watchtower", 8, 21, 65, 14, 43, stone, 16);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    box("watchtower battlement", 1.2, 1.8, 1.2, 65 + Math.sin(a) * 3.8, 25, 43 + Math.cos(a) * 3.8, stone);
  }
  // One pirate pennant remains separate so it can move gently in the sea breeze.
  const flagTex = new DynamicTexture("Pearl Jolly Roger", 256, scene, true);
  const fc = flagTex.getContext() as CanvasRenderingContext2D; fc.fillStyle = "#172523"; fc.fillRect(0,0,256,256);
  fc.strokeStyle = "#e7dbc0"; fc.lineWidth = 12;
  fc.beginPath(); fc.moveTo(55,185);fc.lineTo(201,224);fc.moveTo(201,185);fc.lineTo(55,224);fc.stroke();
  fc.fillStyle = "#e7dbc0";fc.beginPath();fc.ellipse(128,102,48,53,0,0,Math.PI*2);fc.fill();fc.fillRect(98,134,60,34);
  fc.fillStyle = "#172523";for(const x of [108,148]){fc.beginPath();fc.ellipse(x,104,12,16,0,0,Math.PI*2);fc.fill();}
  flagTex.update();const flagMat=mat("pirate flag", "#ffffff");flagMat.diffuseTexture=flagTex;flagMat.backFaceCulling=false;
  const flag=MeshBuilder.CreatePlane("fluttering Jolly Roger",{width:3,height:2,sideOrientation:Mesh.DOUBLESIDE},scene);
  flag.material=flagMat;flag.position.set(1.5,36,-10);flags.push(flag);
  // Batch static scenery by material, including shadows: no draw call per plank.
  for (const material of new Set(parts.map(p => p.material))) {
    const batch = Mesh.MergeMeshes(parts.filter(p => p.material === material), true, true);
    if (!batch) continue;
    batch.name = "harbour static " + material?.name; batch.material = material;
    batch.isPickable = false; batch.receiveShadows = true; batch.freezeWorldMatrix();
    shadow.addShadowCaster(batch);
  }
  bindLocalLights(lamps, scene.meshes);
  return (time: number) => {
    flags.forEach((f, i) => { f.rotation.y = Math.sin(time * 1.3 + i) * 0.16; f.rotation.z = Math.sin(time * 1.7) * 0.04; });
  };
}
