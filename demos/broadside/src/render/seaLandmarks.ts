import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { IslandDef } from "../game/levels";
import { landmarkSites } from "../game/landmarkLayout";
import { Rng } from "../sim/rng";

/** Five permanent places, batched by material rather than one draw per plank. */
export function buildSeaLandmarks(scene: Scene, shadows: ShadowGenerator, grain: StandardMaterial) {
  const material = (name: string, shine = .06, glow = 0) => {
    const m = new StandardMaterial(`sea landmark ${name}`, scene);
    m.diffuseColor = Color3.White(); m.specularColor.setAll(shine);
    if (glow) { m.emissiveColor.setAll(glow); m.linkEmissiveWithDiffuse = true; }
    return m;
  };
  const masonry = material("weathered masonry"), timber = material("timber and plaster");
  masonry.diffuseTexture = timber.diffuseTexture = grain.diffuseTexture;
  const metal = material("iron and ropes", .14), roof = material("roof tiles");
  const glass = material("lantern glass", .18, .6), minerals = material("moonstone", .5, .24);
  const cloth = material("pirate canvas");
  cloth.backFaceCulling = false; cloth.twoSidedLighting = true;

  return (root: TransformNode, def: IslandDef, surface: (x: number, z: number) => number) => {
    const rng = new Rng((Math.imul(Math.round(def.pos.x), 19391) ^ Math.imul(Math.round(def.pos.z), 73771)) >>> 0);
    const batches = new Map<StandardMaterial, Mesh[]>(), flags: Mesh[] = [], lamps: PointLight[] = [];
    const prefix = `sea-${def.landmark}-${def.pos.x}-${def.pos.z}`;
    const r = def.radius, wood = "#69503a", pale = "#b6a88a", stone = "#859083", iron = "#293630";
    const add = (mesh: Mesh, m: StandardMaterial, hex: string) => {
      mesh.material = m; mesh.isPickable = false; mesh.receiveShadows = true;
      const c = Color3.FromHexString(hex), colors: number[] = [];
      for (let i = 0; i < mesh.getTotalVertices(); i++) colors.push(c.r, c.g, c.b, 1);
      mesh.setVerticesData("color", colors);
      const batch = batches.get(m) ?? []; batch.push(mesh); batches.set(m, batch);
      return mesh;
    };
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number,
      m = timber, hex = wood) => {
      const mesh = add(MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene), m, hex);
      mesh.position.set(x, y, z); return mesh;
    };
    const cylinder = (name: string, diameter: number, height: number, x: number, y: number, z: number,
      m = timber, hex = wood, top = diameter) => {
      const mesh = add(MeshBuilder.CreateCylinder(name, {
        diameterBottom: diameter, diameterTop: top, height, tessellation: 24,
      }, scene), m, hex);
      mesh.position.set(x, y, z); return mesh;
    };
    const tube = (name: string, path: Vector3[], radius: number, m = timber, hex = wood) =>
      add(MeshBuilder.CreateTube(name, { path, radius, tessellation: 8, cap: Mesh.CAP_ALL }, scene), m, hex);
    const torus = (name: string, diameter: number, thickness: number, x: number, y: number, z: number,
      m = metal, hex = iron) => {
      const mesh = add(MeshBuilder.CreateTorus(name, { diameter, thickness, tessellation: 20 }, scene), m, hex);
      mesh.position.set(x, y, z); return mesh;
    };
    const meshSurface = (name: string, positions: number[], indices: number[], m: StandardMaterial, hex: string) => {
      const mesh = new Mesh(name, scene), data = new VertexData();
      data.positions = positions; data.indices = indices;
      data.uvs = positions.flatMap((_, i) => i % 3 === 0 ? [positions[i]! * .3, positions[i + 2]! * .3] : []);
      VertexData.ComputeNormals(positions, indices, data.normals = []);
      data.applyToMesh(mesh); return add(mesh, m, hex);
    };
    const base = (x: number, z: number, w: number, d: number) =>
      Math.max(...[-1, 1].flatMap(a => [-1, 1].map(b => surface(x + a * w / 2, z + b * d / 2))));
    const lantern = (x: number, y: number, z: number, light = false) => {
      cylinder("lantern bottom", .58, .12, x, y, z, metal);
      cylinder("amber window panes", .44, .72, x, y + .42, z, glass, "#ffc477");
      cylinder("lantern rain cap", .75, .3, x, y + .94, z, metal, iron, .2);
      for (const dx of [-.24, .24]) for (const dz of [-.24, .24])
        box("lantern frame", .045, .8, .045, x + dx, y + .42, z + dz, metal, iron);
      torus("lantern hanger", .25, .045, x, y + 1.15, z).rotation.x = Math.PI / 2;
      if (light) {
        // Same bounded two-nearest-lamp selection as the other island scenery.
        const l = new PointLight("island amber torch", new Vector3(x, y + .45, z), scene);
        l.parent = root; l.diffuse = Color3.FromHexString("#ffc07b"); l.range = 24; l.intensity = 1.25;
        lamps.push(l);
      }
    };
    const barrel = (x: number, y: number, z: number) => {
      cylinder("coopered barrel", 1.25, 1.75, x, y + .88, z, timber, "#89674b");
      for (const dy of [.22, 1.52]) torus("barrel hoop", 1.3, .095, x, y + dy, z);
      cylinder("barrel lid", 1.23, .07, x, y + 1.78, z, timber, "#a0865c");
      for (let a = 0; a < 10; a++) {
        const t = a * Math.PI / 5;
        tube("barrel stave seam", [new Vector3(x + Math.sin(t) * .63, y + .13, z + Math.cos(t) * .63),
          new Vector3(x + Math.sin(t) * .63, y + 1.62, z + Math.cos(t) * .63)], .016, metal, "#3d3228");
      }
    };
    const crate = (x: number, y: number, z: number) => {
      box("cargo crate", 1.5, 1.45, 1.5, x, y + .72, z, timber, "#967553");
      for (const dx of [-.67, .67]) box("crate corner", .12, 1.5, 1.6, x + dx, y + .72, z);
      const brace = box("diagonal crate brace", 1.8, .13, .1, x, y + .72, z - .8);
      brace.rotation.z = .72;
    };
    const pirateFlag = (x: number, y: number, z: number, height = 7) => {
      cylinder("pirate flagstaff", .16, height, x, y + height / 2, z, timber, pale);
      const mesh = new Mesh(`${prefix}-pirate-flag`, scene), data = new VertexData();
      const positions: number[] = [], colors: number[] = [], indices: number[] = [];
      const nx = 32, ny = 24;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / ny;
        positions.push(u * 4.5, -v * 2.9, 0);
        const head = ((u - .45) / .17) ** 2 + ((v - .34) / .21) ** 2 < 1;
        const jaw = u > .32 && u < .58 && v > .36 && v < .59;
        const eye = ((u - .39) / .037) ** 2 + ((v - .34) / .06) ** 2 < 1
          || ((u - .51) / .037) ** 2 + ((v - .34) / .06) ** 2 < 1;
        const nose = Math.abs(u - .45) < .025 && v > .43 && v < .5;
        const teeth = v > .53 && v < .62 && (Math.floor(u * 50) % 3 === 0);
        const bones = u > .22 && u < .69 &&
          (Math.abs(v - (.74 + (u - .45) * .65)) < .035 || Math.abs(v - (.74 - (u - .45) * .65)) < .035);
        const c = Color3.FromHexString(((head || jaw) && !eye && !nose && !teeth) || bones ? "#d9d0ad" : "#202d2b");
        colors.push(c.r, c.g, c.b, 1);
        if (i < nx && j < ny) {
          const a = j * (nx + 1) + i;
          indices.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
        }
      }
      data.positions = positions; data.indices = indices; data.colors = colors;
      VertexData.ComputeNormals(positions, indices, data.normals = []);
      data.applyToMesh(mesh, true); mesh.parent = root; mesh.position.set(x, y + height - .35, z);
      mesh.material = cloth; mesh.isPickable = false; flags.push(mesh);
    };
    const house = (x: number, z: number, width: number, depth: number, color: string, tiles: string, store = false) => {
      const y = base(x, z, width, depth) + .16, height = store ? 5 : 4;
      const footing = 1.5;
      box("stone house foundation", width + .25, footing, depth + .25, x, y - footing / 2, z, masonry, "#706c58");
      box(store ? "smuggler warehouse" : "harbour house", width, height, depth, x, y + height / 2, z, timber, color);
      for (const dx of [-width / 2, width / 2]) for (const dz of [-depth / 2, depth / 2])
        box("exposed house timber", .24, height + .2, .24, x + dx, y + height / 2, z + dz);
      for (const dy of [.28, height - .2])
        box("house front crossbeam", width + .3, .22, .22, x, y + dy, z - depth / 2 - .08);
      box("dark doorway", 1.4, 2.6, .12, x, y + 1.3, z - depth / 2 - .07, metal, "#243129");
      for (let i = 0; i < 6; i++) box("door planking", .19, 2.45, .07, x - .5 + i * .2, y + 1.23,
        z - depth / 2 - .16, timber, i % 2 ? "#503b2c" : "#604837");
      for (const dx of [-width * .32, width * .32]) {
        box("golden window", 1, 1.35, .14, x + dx, y + 2.3, z - depth / 2 - .09, glass, "#bbae77");
        box("window vertical mullion", .09, 1.5, .2, x + dx, y + 2.3, z - depth / 2 - .2);
        box("window horizontal mullion", 1.15, .09, .2, x + dx, y + 2.3, z - depth / 2 - .2);
        for (const side of [-1, 1]) box("wooden window shutter", .3, 1.6, .18, x + dx + side * .72,
          y + 2.3, z - depth / 2 - .12, timber, "#466254");
      }
      const w = width / 2 + .65, d = depth / 2 + .6, e = y + height, ridge = e + 2.7;
      meshSurface("sloped tiled roof", [x-w,e,z-d,x,ridge,z-d,x-w,e,z+d,x,ridge,z+d,
        x,ridge,z-d,x+w,e,z-d,x,ridge,z+d,x+w,e,z+d], [0,1,2,1,3,2,4,5,6,5,7,6], roof, tiles);
      for (const dz of [-depth / 2, depth / 2]) {
        meshSurface("plastered gable", [x-width/2,e,z+dz,x+width/2,e,z+dz,x,ridge-.25,z+dz],
          dz < 0 ? [0,1,2] : [0,2,1], timber, color);
        tube("gable verge", [new Vector3(x-w,e,z+dz), new Vector3(x,ridge,z+dz), new Vector3(x+w,e,z+dz)], .16);
      }
      for (let row = 1; row < 5; row++) for (const sign of [-1, 1]) {
        const t = row / 5;
        tube("overlapping roof tile course", [new Vector3(x+sign*w*t,ridge-2.7*t+.025,z-d),
          new Vector3(x+sign*w*t,ridge-2.7*t+.025,z+d)], .055, roof, "#66503e");
      }
      tube("ridge tiles", [new Vector3(x,ridge+.06,z-d), new Vector3(x,ridge+.06,z+d)], .17, roof, tiles);
      box("stone chimney", 1, 3, 1, x - width * .28, ridge, z + depth * .25, masonry, "#8a8670");
      box("chimney cap", 1.3, .25, 1.3, x - width * .28, ridge + 1.5, z + depth * .25, masonry, pale);
      lantern(x + 1.05, y + 2.6, z - depth / 2 - .55);
      for (let i = 0; i < 3; i++) box("front stone step", 2.6, .22, .55, x, y - .1 - i * .18,
        z - depth / 2 - .25 - i * .5, masonry, "#aea58e");
      return y;
    };
    const dock = (width = 6, length = 12) => {
      const z = -r * .83;
      for (let i = 0; i < length * 2; i++) box("weathered wharf plank", width, .28, .45,
        0, 1.15 + Math.sin(i * 1.7) * .012, z - i * .47, timber, i % 3 ? "#8c7352" : "#a08963");
      for (const x of [-width / 2 + .25, width / 2 - .25]) {
        box("long wharf beam", .35, .65, length, x, .72, z - length / 2);
        const line: Vector3[] = [];
        for (let i = 0; i < 4; i++) {
          const dz = z - i * (length - .7) / 3;
          cylinder("wharf mooring piling", .5, 4, x, .5, dz);
          torus("mooring rope around post", .55, .08, x, 2.15, dz, metal, "#baac82");
          line.push(new Vector3(x, 2.6, dz));
          if (i < 3) line.push(new Vector3(x, 2.22, dz - (length - .7) / 6));
        }
        tube("sagging wharf rope", line, .055, metal, "#b5a079");
        lantern(x, 2.9, z + .5, true);
      }
      return z;
    };
    const rowboat = (x: number, z: number) => {
      const positions: number[] = [], indices: number[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, half = Math.sin(Math.PI * t) ** .6 * 1.25, zz = z - 3 + t * 6;
        for (const [xx, yy] of [[-half,1],[-half*.7,.2],[0,-.15],[half*.7,.2],[half,1]]) positions.push(x+xx!,yy!,zz);
        if (i < 20) for (let j = 0; j < 4; j++) {
          const a = i * 5 + j; indices.push(a,a+5,a+1,a+1,a+5,a+6);
        }
        if (i % 4 === 0) tube("rowboat rib", [new Vector3(x-half,1,zz), new Vector3(x,.15,zz), new Vector3(x+half,1,zz)], .07);
      }
      meshSurface("curved rowboat hull", positions, indices, timber, "#84573e");
      for (const dz of [-1.35, 0, 1.35]) box("rowboat bench", 1.9, .14, .4, x, .85, z+dz, timber, pale);
      tube("loose boat oar", [new Vector3(x-1,.95,z-2), new Vector3(x+1,1.1,z+2)], .06, timber, pale);
      tube("boat mooring line", [new Vector3(x,1,z-3),new Vector3(x/2,.6,z-2),new Vector3(2.7,1.6,z)], .045, metal, pale);
    };
    const arch = (x: number, z: number, width: number, y: number) => {
      const rad = width / 2;
      for (const dx of [-rad, rad]) {
        box("ancient arch pier", 1.6, 3.6, 2.1, x+dx, y+1.8, z, masonry, stone);
        box("arch pier capital", 2.1, .35, 2.5, x+dx, y+3.55, z, masonry, pale);
      }
      for (let i = 0; i < 13; i++) {
        // Wedge-shaped stones meet along radial joints. Rotated rectangles
        // interpenetrate and leave a saw-toothed inner edge.
        const a0 = i * Math.PI / 13 + .003, a1 = (i + 1) * Math.PI / 13 - .003;
        const corners = [-1.075, 1.075].flatMap(dz => [
          [x+Math.cos(a0)*(rad-.75), y+3.6+Math.sin(a0)*(rad-.75), z+dz],
          [x+Math.cos(a0)*(rad+.8), y+3.6+Math.sin(a0)*(rad+.8), z+dz],
          [x+Math.cos(a1)*(rad+.8), y+3.6+Math.sin(a1)*(rad+.8), z+dz],
          [x+Math.cos(a1)*(rad-.75), y+3.6+Math.sin(a1)*(rad-.75), z+dz],
        ]);
        const positions: number[] = [], indices: number[] = [];
        for (const face of [[0,1,2,3],[4,7,6,5],[0,3,7,4],[1,5,6,2],[0,4,5,1],[3,2,6,7]]) {
          const n = positions.length / 3;
          positions.push(...face.flatMap(v => corners[v]!));
          indices.push(n,n+1,n+2,n,n+2,n+3);
        }
        meshSurface("carved arch voussoir",positions,indices,masonry,i % 3 ? stone : pale);
      }
    };

    if (def.landmark === "harbour") {
      dock(6, 11); rowboat(7, -r-.4);
      const sites = landmarkSites(def);
      for (let i = 0; i < 3; i++) {
        const p = sites[i]!;
        house(p.x*r, p.z*r, i === 2 ? 8 : 7, 6, ["#c1af83", "#829992", "#b79b79"][i]!, "#9a5b43");
      }
      const p = sites[3]!, x = p.x*r, z = p.z*r, y = surface(x,z);
      cylinder("port lighthouse stone base", 5.2, 2, x,y+.9,z,masonry,pale);
      for (let i = 0; i < 4; i++) cylinder("port lighthouse band", 4-i*.4, 3, x,y+3+i*3,z,
        masonry,i%2?"#486160":"#ded3b0",3.6-i*.4);
      cylinder("lighthouse gallery", 4.1,.4,x,y+13.7,z,metal);
      cylinder("lighthouse lantern", 2.2,2,x,y+14.9,z,glass,"#e3d29a");
      cylinder("lighthouse copper roof", 3.6,1.8,x,y+16.8,z,roof,"#57756a",0);
      for (let i=0;i<8;i++) {
        const a=i*Math.PI/4;
        cylinder("lighthouse gallery baluster",.08,1,x+Math.sin(a)*1.8,y+14.3,z+Math.cos(a)*1.8,metal);
      }
      torus("lighthouse gallery railing",3.6,.06,x,y+14.8,z);
      pirateFlag(-2,surface(-2,0),0);
      for (let i=0;i<4;i++) barrel(-4-i%2*1.6, surface(-4-i%2*1.6,-r*.6),-r*.6+Math.floor(i/2)*1.6);
      for (let i=0;i<3;i++) crate(4+i%2*1.6,surface(4+i%2*1.6,-r*.58),-r*.58+Math.floor(i/2)*1.6);
    } else if (def.landmark === "smugglers") {
      dock(5.5,12); rowboat(-8,-r-1); rowboat(8,-r+1);
      for (const [i,p] of landmarkSites(def).slice(0,2).entries()) {
        const x=p.x*r,z=p.z*r,y=house(x,z,9,7,i?"#6d8170":"#937959","#4d6256",true);
        for (let j=0;j<3;j++) barrel(x-3+j*1.7,y,z-5.3);
        crate(x+3,y,z-5.4);
      }
      const z=r*.3,y=surface(0,z);
      for (let i=0;i<9;i++) {
        const a=i*Math.PI/8;
        const rock=add(MeshBuilder.CreateIcoSphere("smugglers cave cliff",{radius:1,subdivisions:3,flat:false},scene),masonry,"#6b756b");
        rock.position.set(Math.cos(a)*6,y+1+Math.sin(a)*6,z);
        rock.scaling.set(2.7,2.8,3.5);
      }
      // Recessed entrance behind a real rock arch; no illuminated portal plane.
      for (const x of [-4.1, 4.1]) {
        box("cave entrance timber support", .65, 4.2, .65, x, y + 2.1, z - 1.8);
        lantern(x, y + 2.6, z - 2.3);
      }
      box("cave entrance crossbeam", 9.2, .65, .8, 0, y + 4.5, z - 1.8);
      box("cave recess",6,4.5,.3,0,y+2.2,z+2.8,metal,"#162522");
      pirateFlag(-4,y,z-5);
      for (let i=0;i<4;i++) crate(-5+i*3,surface(-5+i*3,-r*.52),-r*.52);
    } else if (def.landmark === "stormkeep") {
      dock(5,10);
      const z=r*.12,y=base(0,z,18,18);
      cylinder("stormkeep battered sea tower",11,10,0,y+5,z,masonry,"#687b78",9);
      torus("sea tower stone belt",10.5,.38,0,y+2,z,masonry,pale);
      cylinder("open lookout platform",10.7,.75,0,y+10,z,masonry,stone);
      for(let i=0;i<12;i++) {
        const a=i*Math.PI/6;
        const m=box("sea tower crenellation",1.5,1.7,1.5,Math.sin(a)*4.65,y+11,z+Math.cos(a)*4.65,masonry,stone);
        m.rotation.y=a;
      }
      for(let i=0;i<8;i++) {
        const a=i*Math.PI/4, xx=Math.sin(a)*r*.37,zz=z+Math.cos(a)*r*.37;
        const yy=surface(xx,zz);
        const m=box("sea fort broken wall",r*.29,3.5+(i%3)*.8,1.5,xx,yy+1.4,zz,masonry,"#79877c");
        m.rotation.y=a;
        if(i%2===0) {
          const gun=cylinder("old coastal cannon",.85,3.5,xx,yy+3.1,zz,metal,iron,.65);
          gun.rotation.set(Math.PI/2,a,0);
          box("fort cannon carriage",1.7,.6,2.2,xx,yy+2.35,zz);
        }
      }
      box("tower narrow doorway",1.8,3.5,.15,0,y+1.75,z-5.4,metal,"#1e302d");
      pirateFlag(0,y+10,z,8);
      lantern(-3,surface(-3,-r*.5)+2,-r*.5); lantern(3,surface(3,-r*.5)+2,-r*.5);
    } else if (def.landmark === "ruins") {
      dock(5,9);
      const z=r*.12,y=base(0,z,18,17)+.1;
      box("lost temple terrace",19,1.4,18,0,y-.55,z,masonry,"#afa58c");
      for(let i=0;i<5;i++) box("temple broad stair",10,.28,1.05,0,y-.15-i*.26,z-8.5-i*.9,masonry,pale);
      arch(0,z-5,10,y+.15); arch(0,z+5,10,y+.15);
      for(const x of [-8,8]) for(const dz of [-5,0,5]) {
        const height=dz===0?2.6:6.8;
        cylinder("fluted temple pillar",1.8,height,x,y+height/2,z+dz,masonry,stone,1.65);
        for(let i=0;i<8;i++) {
          const a=i*Math.PI/4;
          tube("temple pillar flute",[new Vector3(x+Math.sin(a)*.82,y+.3,z+dz+Math.cos(a)*.82),
            new Vector3(x+Math.sin(a)*.75,y+height-.25,z+dz+Math.cos(a)*.75)],.075,masonry,pale);
        }
        cylinder("ancient column capital",2.4,.35,x,y+height,z+dz,masonry,pale);
      }
      const fallen=cylinder("fallen temple column",1.65,6,8,y+.8,z-2,masonry,stone);
      fallen.rotation.z=Math.PI/2;
      for(let i=0;i<9;i++) {
        const xx=rng.range(-10,10),zz=z+rng.range(-10,10);
        const stoneBlock=box("scattered temple masonry",rng.range(.6,1.4),.6,1.3,xx,surface(xx,zz)+.3,zz,masonry,stone);
        stoneBlock.rotation.y=rng.range(-1,1);
      }
    } else if (def.landmark === "moonstone") {
      dock(5,9);
      const z=r*.12,y=base(0,z,16,16)+.15;
      cylinder("moonstone sanctuary",17,1.3,0,y-.5,z,masonry,"#6e8381");
      for(let i=0;i<4;i++) box("sanctuary stair",7,.3,1.15,0,y-.1-i*.28,z-7.7-i,masonry,pale);
      arch(0,z+4.5,9,y+.2);
      for(const x of [-7.5,7.5]) cylinder("sanctuary broken pillar",1.8,4,x,y+2,z,masonry,"#80968d");
      for(let i=0;i<13;i++) {
        const a=i*2.4,dist=i<3?1.2:6.4,xx=Math.sin(a)*dist,zz=z+Math.cos(a)*dist;
        const height=i<3?6-i:2+rng.range(0,2);
        const shard=cylinder("moonstone crystal spire",i<3?2.1:.9,height,xx,y+height/2,zz,minerals,
          i%2?"#8acfc6":"#95a9c6",0);
        shard.rotation.z=Math.sin(a)*.16;
        cylinder("crystal stone socket",i<3?2.7:1.3,.5,xx,y+.2,zz,masonry,"#70857e");
      }
      for(let i=0;i<4;i++) {
        const x=(i%2?1:-1)*r*.58,zz=(-.25+Math.floor(i/2)*.6)*r,yy=surface(x,zz);
        for(let j=0;j<3;j++) cylinder("moonstone cairn",2.5-j*.65,.65,x,yy+.3+j*.6,zz,masonry,stone);
      }
    }
    // Sources have no parent while merging, so their local transforms are baked
    // once and the complete settlement follows its island across world seams.
    for (const [m, parts] of batches) {
      const merged=Mesh.MergeMeshes(parts,true,true)!;
      merged.name=`${prefix}-${m.name}`; merged.parent=root; merged.material=m;
      merged.isPickable=false; merged.receiveShadows=true; shadows.addShadowCaster(merged);
    }
    return (time: number) => {
      for (const flag of flags) {
        const p=flag.getVerticesData("position")!;
        for(let i=0;i<p.length;i+=3) {
          const x=p[i]!,y=p[i+1]!;
          p[i+2]=Math.sin(x*2.2-time*2.7+y*.7)*Math.min(1,x*.5)*.24;
        }
        flag.updateVerticesData("position",p);
        const normals: number[]=[]; VertexData.ComputeNormals(p,flag.getIndices()!,normals);
        flag.updateVerticesData("normal",normals);
      }
      lamps.forEach((l,i)=>{ l.intensity=1.2+Math.sin(time*3.1+i)*.035; });
    };
  };
}
