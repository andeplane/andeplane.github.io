import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";

export interface TreasureCabin { meshes: Mesh[]; lamps: PointLight[]; timber: StandardMaterial; frame: StandardMaterial; floorY: number; }

/** Original aged oak, with fine grain relief and worn fibres, rather than orange painted walls. */
function oakTextures(scene: Scene) {
  const size = 256, color = new Uint8Array(size * size * 3), normal = new Uint8Array(size * size * 3);
  const height = (x: number, y: number) => {
    const bend = Math.sin(y * .019) * 1.8 + Math.sin(y * .051 + x * .09) * .6;
    const grain = Math.sin((x + bend) * .81) + Math.sin((x + bend) * 2.23) * .35;
    return grain * .7 + Math.sin(x * 12.989 + y * 78.233) * .16;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 3, fibre = height(x, y), wear = Math.sin(x * .11 + y * .003) * 6;
    color[i] = 118 + fibre * 9 + wear; color[i + 1] = 104 + fibre * 8 + wear; color[i + 2] = 84 + fibre * 7 + wear;
    normal[i] = 128 + (height(x - 1, y) - height(x + 1, y)) * 14;
    normal[i + 1] = 128 + (height(x, y - 1) - height(x, y + 1)) * 8; normal[i + 2] = 254;
  }
  const texture = (name: string, data: Uint8Array) => {
    const t = RawTexture.CreateRGBTexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    t.name = name; t.anisotropicFilteringLevel = 4; return t;
  };
  const albedo = texture("cabin oak worn fibres", color), relief = texture("cabin oak grain relief", normal);
  albedo.gammaSpace = true; relief.level = .38;
  return { albedo, relief };
}

/** A bevelled solid, including the end grain: all joins have thickness and softened edges. */
function bevelBox(scene: Scene, name: string, w: number, h: number, d: number, bevel = .025): Mesh {
  const half = [w / 2, h / 2, d / 2], inset = half.map(n => Math.max(n * .5, n - bevel));
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const face = (points: number[][]) => {
    const verts = points.map(p => Vector3.FromArray(p)), n = Vector3.Cross(verts[1]!.subtract(verts[0]!), verts[2]!.subtract(verts[0]!));
    const centre = verts.reduce((v, p) => v.addInPlace(p), Vector3.Zero());
    // Babylon's left-handed mesh convention needs clockwise outward faces.
    if (Vector3.Dot(n, centre) > 0) points.reverse();
    const offset = positions.length / 3;
    for (const p of points) {
      positions.push(...p);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ay >= ax && ay >= az) uvs.push(p[0]! / w + .5, p[2]! / 3 + .5);
      else if (az >= ax) uvs.push(p[1]! / h + .5, p[0]! / 3 + .5);
      else uvs.push(p[1]! / h + .5, p[2]! / 3 + .5);
    }
    for (let i = 1; i < points.length - 1; i++) indices.push(offset, offset + i, offset + i + 1);
  };
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    face([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const p = [0, 0, 0]; p[axis] = sign * half[axis]!; p[a] = u! * inset[a]!; p[b] = v! * inset[b]!; return p;
    }));
  }
  for (let axis = 0; axis < 3; axis++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    face([[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([end, edge]) => {
      const p = [0, 0, 0]; p[axis] = end! * inset[axis]!;
      p[a] = sa * (edge ? inset[a]! : half[a]!); p[b] = sb * (edge ? half[b]! : inset[b]!); return p;
    }));
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    face([[sx * half[0]!, sy * inset[1]!, sz * inset[2]!], [sx * inset[0]!, sy * half[1]!, sz * inset[2]!], [sx * inset[0]!, sy * inset[1]!, sz * half[2]!]]);
  }
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.uvs = uvs;
  VertexData.ComputeNormals(positions, indices, data.normals = []);
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh); return mesh;
}

/** A fitted beam with an octagonal bevel profile swept along an actual curved centreline. */
function curvedBeam(scene: Scene, name: string, path: Vector3[], width: number, depth: number): Mesh {
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const c = .22, profile = [[-.5 + c, -.5], [.5 - c, -.5], [.5, -.5 + c], [.5, .5 - c], [.5 - c, .5], [-.5 + c, .5], [-.5, .5 - c], [-.5, -.5 + c]];
  let distance = 0;
  for (let i = 0; i < path.length; i++) {
    if (i) distance += Vector3.Distance(path[i]!, path[i - 1]!);
    const tangent = path[Math.min(path.length - 1, i + 1)]!.subtract(path[Math.max(0, i - 1)]!).normalize();
    const normal = new Vector3(-tangent.y, tangent.x, 0).normalize();
    for (let j = 0; j < 8; j++) {
      const p = path[i]!.add(normal.scale(profile[j]![0]! * width)); p.z += profile[j]![1]! * depth;
      positions.push(p.x, p.y, p.z); uvs.push(j / 8, distance / 3);
      if (i) { const a = (i - 1) * 8 + j, b = (i - 1) * 8 + (j + 1) % 8; indices.push(a, b, a + 8, b, b + 8, a + 8); }
    }
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, (path.length - 1) * 8, (path.length - 1) * 8 + i, (path.length - 1) * 8 + i + 1);
  for (let i = 0; i < indices.length; i += 3) [indices[i], indices[i + 1]] = [indices[i + 1]!, indices[i]!];
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.uvs = uvs;
  VertexData.ComputeNormals(positions, indices, data.normals = []);
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh); mesh.convertToFlatShadedMesh(); return mesh;
}

/** The treasure room is built as fitted ship joinery, batched by finish for phone rendering. */
export function buildTreasureCabin(scene: Scene, shadows: ShadowGenerator, options: { walkable?: boolean } = {}): TreasureCabin {
  const textures = oakTextures(scene), parts = new Map<StandardMaterial, Mesh[]>(), lamps: PointLight[] = [];
  const material = (name: string, hex: string, timber = false) => {
    const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor.set(.14, .12, .085); m.specularPower = 40; m.maxSimultaneousLights = 4;
    if (timber) { m.diffuseTexture = textures.albedo; m.bumpTexture = textures.relief; }
    parts.set(m, []); return m;
  };
  const deck = [material("cabin deck oak", "#a79b83", true), material("cabin deck worn oak", "#b7aa91", true), material("cabin deck aged oak", "#958b76", true)];
  const wall = material("cabin weathered hull planking", "#9c907a", true), frame = material("cabin dark carved oak", "#8b785a", true);
  if (options.walkable) { wall.diffuseColor=Color3.FromHexString("#8c826d"); wall.specularColor.set(.065,.055,.038); }
  const relief = options.walkable ? material("cabin worn carved relief", "#9a8060", true) : frame;
  if(options.walkable) {
    frame.diffuseColor=Color3.FromHexString("#554b40");
    for(const m of deck)m.diffuseColor.scaleInPlace(.76);
    wall.diffuseColor=Color3.FromHexString("#776455");
    textures.relief.level=.56;
  }
  const iron = material("cabin forged black iron", "#302e28"), brass = material("cabin rubbed antique brass", "#ae8b4d"), rope = material("cabin tarred hemp", "#6d6250");
  brass.specularColor.set(.5, .38, .19); brass.specularPower = 64; iron.specularColor.set(.15, .15, .12);
  const add = (mesh: Mesh, mat: StandardMaterial, parent?: TransformNode) => { mesh.material = mat; if (parent) mesh.parent = parent; parts.get(mat)!.push(mesh); return mesh; };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: StandardMaterial, parent?: TransformNode, bevel = .025) => {
    const mesh = add(bevelBox(scene, name, w, h, d, bevel), mat, parent); mesh.position.set(x, y, z); return mesh;
  };
  const beam = (name: string, path: Vector3[], width: number, depth: number, mat: StandardMaterial, parent?: TransformNode) =>
    add(curvedBeam(scene, name, path, width, depth), mat, parent);

  // Staggered solid boards retain the existing physical floor at y=.7.
  for (let column = 0; column < 22; column++) {
    const x = (column - 10.5) * .415;
    for (let row = 0; row < 7; row++) {
      const start = -7.5 + row * 2.5 - (column % 3) * .8, end = Math.min(7.5, start + 2.49), z0 = Math.max(-7.5, start);
      if (end <= z0) continue;
      box("fitted cabin deck board", .413, .14, end - z0, x, .63, (z0 + end) / 2, deck[(column + row * 2) % 3]!, undefined, .004);
      for (const dz of [-1, 1]) if (end - z0 > .4) {
        const nail = MeshBuilder.CreateCylinder("deck iron fastening", { diameter: .025, height: .008, tessellation: 6 }, scene);
        nail.position.set(x - .12, .704, (z0 + end) / 2 + dz * ((end - z0) / 2 - .1)); add(nail, iron);
      }
    }
  }
  const hullX = (y: number) => 4.25 + Math.sin((y - .7) / 5.55 * Math.PI) * .6;
  const sidePorts = (side: number): [number, number][] => !options.walkable ? [] : side < 0 ? [[-2.55, -.45], [.9, 3]] : [[.9, 3]];
  const hullStrip = (side: number, bottom: number, top: number, backing: number) => {
    const ys = [bottom, ...[2.2, 3.9].filter(y => y > bottom && y < top), top];
    for (let j = 1; j < ys.length; j++) {
      const y0 = ys[j - 1]!, y1 = ys[j]!, inPort = (y0 + y1) / 2 > 2.2 && (y0 + y1) / 2 < 3.9;
      const spans: [number, number][] = []; let start = -7.55;
      for (const [a, b] of inPort ? sidePorts(side) : []) { spans.push([start, a]); start = b; }
      spans.push([start, 7.5]);
      for (const [a, b] of spans) {
        const mesh = MeshBuilder.CreateRibbon(backing ? "caulked hull lining" : "fitted hull strake", { pathArray: [[new Vector3(side * (hullX(y0) + backing), y0, a), new Vector3(side * (hullX(y0) + backing), y0, b)], [new Vector3(side * (hullX(y1) + backing), y1, a), new Vector3(side * (hullX(y1) + backing), y1, b)]], sideOrientation: Mesh.DOUBLESIDE }, scene);
        const p=mesh.getVerticesData(VertexBuffer.PositionKind)!,uv:number[]=[];
        for(let n=0;n<p.length;n+=3)uv.push((p[n+1]!-y0)/(y1-y0)+Math.floor(y0*10)*.173,p[n+2]!/3+y0*.219);
        mesh.setVerticesData(VertexBuffer.UVKind,uv);
        add(mesh, wall);
      }
    }
  };
  for (const side of [-1, 1]) {
    if(options.walkable)for (let i = 0; i < 24; i++) hullStrip(side, .65 + i / 24 * 5.6, .65 + (i + 1) / 24 * 5.6, .06);
    else { const lining=MeshBuilder.CreateRibbon("continuous caulked hull lining",{pathArray:Array.from({length:25},(_,i)=>{const y=.65+i/24*5.6;return[new Vector3(side*(hullX(y)+.06),y,-7.55),new Vector3(side*(hullX(y)+.06),y,7.5)];}),sideOrientation:Mesh.DOUBLESIDE},scene);add(lining,wall); }
  }
  for (const side of [-1, 1]) for (let course = 0; course < 12; course++) {
    const y0 = .7 + course * .45, y1 = y0 + .442;
    if(options.walkable)hullStrip(side, y0, y1, 0);
    else add(MeshBuilder.CreateRibbon("curved hull strake",{pathArray:[[new Vector3(side*hullX(y0),y0,-7.5),new Vector3(side*hullX(y0),y0,7.4)],[new Vector3(side*hullX(y1),y1,-7.5),new Vector3(side*hullX(y1),y1,7.4)]],sideOrientation:Mesh.DOUBLESIDE},scene),wall);
  }
  // Broad curved ribs continue into the overhead beams, with genuine scarf joinery.
  const ribPath = (z: number) => {
    const p: Vector3[] = [];
    for (let i = 0; i <= 16; i++) { const y = .74 + i / 16 * 5.1; p.push(new Vector3(-hullX(y) + .1, y, z)); }
    for (let i = 1; i < 16; i++) { const x = -4.0 + i / 16 * 8; p.push(new Vector3(x, 5.84 + Math.sin(i / 16 * Math.PI) * .32, z)); }
    for (let i = 16; i >= 0; i--) { const y = .74 + i / 16 * 5.1; p.push(new Vector3(hullX(y) - .1, y, z)); }
    return p;
  };
  for (const z of [-6.8, -3.3, .2, 3.7, 7.1]) beam("joined curved cabin rib", ribPath(z), .24, .29, frame);
  for (let i = 0; i < 18; i++) {
    const x = (i - 8.5) * .51, y = 6.05 - Math.abs(x) * .045;
    box("cabin overhead plank", .5, .12, 15, x, y, 0, wall);
  }
  box("continuous ceiling backing", 9.5, .16, 15.2, 0, 6.18, 0, wall);
  for (let i = 0; i < 12; i++) {
    const y = .92 + i * .45;
    if (!options.walkable) box("rear cabin bulkhead board", 9.1, .445, .16, 0, y, -7.5, wall);
    else {
      box("port entrance bulkhead board", 3.35, .445, .16, -2.875, y, -7.5, wall);
      if (y < 3.3) box("starboard entrance bulkhead board", 3.35, .445, .16, 2.875, y, -7.5, wall);
      else {
        box("stairwell inner bulkhead board", 1.25, .445, .16, 1.825, y, -7.5, wall);
        box("stairwell outer bulkhead board", .5, .445, .16, 4.3, y, -7.5, wall);
      }
      if (y + .2225 > 4.5) {
        const bottom = Math.max(4.5, y - .2225), top = y + .2225;
        box("door lintel panelling", 2.4, top - bottom, .16, 0, (top + bottom) / 2, -7.5, wall);
      }
    }
  }
  if (options.walkable) {
    for (const [x, w] of [[-2.875, 3.35], [1.825, 1.25], [4.3, .5]]) box("closed entrance bulkhead backing", w!, 5.55, .08, x!, 3.475, -7.61, wall);
    box("closed lower stair bulkhead backing", 3.35, 2.6, .08, 2.875, 2, -7.61, wall);
    box("closed entrance lintel backing", 2.4, 1.75, .08, 0, 5.375, -7.61, wall);
    for (const x of [-1.25, 1.25]) box("treasure doorway oak jamb", .2, 3.8, .3, x, 2.6, -7.42, frame);
    box("treasure doorway oak lintel", 2.7, .22, .3, 0, 4.5, -7.42, frame);
  }

  // Bowed transom with five glazed arched lights, recessed panels and moulded reveals.
  const windowRoots: TransformNode[] = [];
  const crown = MeshBuilder.CreateRibbon("continuous fitted stern crown", { pathArray: [4.8, 6.23].map(y =>
    Array.from({ length: 25 }, (_, i) => { const x = -4.7 + i / 24 * 9.4; return new Vector3(x, y, 7.48 - x * x * .035); })), sideOrientation: Mesh.DOUBLESIDE }, scene); add(crown, wall);
  for (const side of [-1, 1]) {
    const cheek = MeshBuilder.CreateRibbon("fitted transom cheek", { pathArray: Array.from({ length: 25 }, (_, i) => {
      const y = .69 + i / 24 * 5.55;
      return [new Vector3(side * 3.94, y, 6.73), new Vector3(side * hullX(y), y, 7.4)];
    }), sideOrientation: Mesh.DOUBLESIDE }, scene); add(cheek, wall);
  }
  const glass = material("stern window old sea glass", "#9ab3ac");
  glass.alpha = .13; glass.specularColor.set(.36, .43, .40); glass.specularPower = 96; glass.backFaceCulling = false;
  for (let n = 0; n < 5; n++) {
    const cx = (n - 2) * 1.6, z = 7.28 - cx * cx * .035;
    const root = new TransformNode("fitted arched stern window", scene); root.position.set(cx, 0, z); root.rotation.y = Math.atan(cx * .07); windowRoots.push(root);
    box("stern lower oak panel", 1.59, .92, .24, 0, 1.16, 0, wall, root);
    box("raised stern panel", 1.29, .58, .07, 0, 1.16, -.157, frame, root);
    for (const x of [-.79, .79]) box("stern window upright", .18, 3.68, .3, x, 3.15, 0, frame, root);
    const arch = Array.from({ length: 25 }, (_, i) => { const a = Math.PI - i / 24 * Math.PI; return new Vector3(Math.cos(a) * .65, 4.14 + Math.sin(a) * .56, -.03); });
    const reveal = [new Vector3(-.65, 1.83, -.03), ...arch, new Vector3(.65, 1.83, -.03)];
    beam("arched oak window reveal", reveal, .17, .3, frame, root);
    beam("worn inner window moulding", reveal.map(v => v.add(new Vector3(0, 0, -.175))), .045, .055, options.walkable ? relief : brass, root);
    box("deep stern window sill", 1.55, .14, .48, 0, 1.79, -.12, frame, root);
    for (const x of [-.22, .22]) {
      const top=options.walkable?4.14+.56*Math.sqrt(1-(x/.65)**2):4.44,bottom=options.walkable?1.84:1.82;
      box("leaded window vertical bar",.026,top-bottom,.04,x,(top+bottom)/2,.085,iron,root,.004);
    }
    for (const y of [2.57, 3.36, 4.14]) box("leaded window crossbar", 1.25, .027, .04, 0, y, .085, iron, root, .004);
    const boundary = [new Vector3(-.59, 1.88, .1), ...arch.map(v => new Vector3(v.x * .91, v.y - .015, .1)), new Vector3(.59, 1.88, .1)];
    const positions = boundary.flatMap(v => [v.x, v.y, v.z]), indices: number[] = [];
    for (let i = 1; i < boundary.length - 1; i++) indices.push(0, i + 1, i);
    const pane = new Mesh("old glazed stern window", scene), data = new VertexData(); data.positions = positions; data.indices = indices;
    data.uvs=boundary.flatMap(v=>[(v.x+.65)/1.3,(v.y-1.88)/2.82]);
    VertexData.ComputeNormals(positions, indices, data.normals = []); data.applyToMesh(pane); add(pane, glass, root);
    const spandrel = MeshBuilder.CreateRibbon("fitted arch spandrel timber", { pathArray: [arch.map(v => new Vector3(v.x, v.y + .12, .04)), arch.map(v => new Vector3(v.x, 5.36, .04))], sideOrientation: Mesh.DOUBLESIDE }, scene); add(spandrel, wall, root);
    if(options.walkable)for(const x of[-.7,.7])box("fitted window spandrel shoulder",.18,1.25,.18,x,4.74,.09,wall,root);
    box("stern upper cornice", 1.6, .2, .39, 0, 5.34, -.04, frame, root);
    if(options.walkable) {
      // Thick stepped cornices and shell/scroll carving echo the native stern's
      // restrained bronze-brown relief, never a luminous gold window outline.
      box("stern carved cornice lower roll",1.64,.1,.42,0,5.18,-.12,frame,root);
      box("stern carved cornice crown",1.67,.11,.49,0,5.48,-.1,relief,root);
      box("stern raised panel lower rail",1.38,.08,.08,0,.89,-.2,relief,root);
      for(const x of[-.61,.61])box("stern raised panel side moulding",.065,.52,.075,x,1.17,-.2,relief,root);
      for(const side of[-1,1]) {
        const scroll=Array.from({length:29},(_,i)=>{const t=i/28,a=t*Math.PI*2.1,r=.23*(1-t)+.035;return new Vector3(side*(.29+Math.cos(a)*r),4.95+Math.sin(a)*r*.65,-.19-t*.018);});
        beam("carved stern volute",scroll,.045,.07,relief,root);
        for(let leaf=0;leaf<3;leaf++) {
          const x=side*(.24+leaf*.105),y=5.02+leaf*.018;
          beam("carved acanthus leaf",[new Vector3(x,y,-.22),new Vector3(x+side*.07,y+.12,-.25),new Vector3(x+side*.025,y+.2,-.19)],.065,.04,relief,root);
        }
      }
      for(let flute=-3;flute<=3;flute++) {
        const a=flute*.2;
        beam("carved shell fan",[new Vector3(0,4.86,-.18),new Vector3(Math.sin(a)*.18,5.01,-.25),new Vector3(Math.sin(a)*.27,5.13-Math.abs(flute)*.018,-.19)],.025,.045,relief,root);
      }
    }
    box("stern cornice rubbed edge", 1.6, .035, .04, 0, 5.24, -.255, options.walkable ? relief : brass, root, .008);
    for (const x of [-.78, .78]) {
      const column = MeshBuilder.CreateLathe("turned stern pilaster", { shape: [new Vector3(.1, 0), new Vector3(.13, .12), new Vector3(.085, .19), new Vector3(.064, 1.5), new Vector3(.1, 1.61), new Vector3(.13, 1.7)], tessellation: 12, cap: Mesh.CAP_ALL }, scene);
      column.position.set(x, 1.93, -.22); add(column, frame, root);
      for (const y of [2.04, 3.55]) {
        const collar = MeshBuilder.CreateTorus("pilaster brass collar", { diameter: .2, thickness: .025, tessellation: 12 }, scene); collar.position.set(x, y, -.22); add(collar, options.walkable ? iron : brass, root);
      }
    }
  }

  if(options.walkable)for(const side of[-1,1]) {
    box("curved hull chair rail",.16,.14,14.9,side*(hullX(1.96)-.08),1.96,0,frame);
    for(const z of[-5,-1.5,2,5.5])beam("fitted wainscot stile",Array.from({length:9},(_,i)=>{const y=.8+i/8*1.08;return new Vector3(side*(hullX(y)-.06),y,z);}),.07,.09,frame);
    for(const[a,b]of sidePorts(side)) {
      const root=new TransformNode("framed outward cabin port",scene);root.position.set(side*(hullX(3.05)-.02),0,(a+b)/2);root.rotation.y=side*Math.PI/2;windowRoots.push(root);
      const half=(b-a)/2;
      for(const x of[-half,half])box("side port oak jamb",.18,1.9,.34,x,3.05,0,frame,root);
      box("side port moulded head",b-a+.3,.17,.38,0,3.9,-.025,frame,root);
      box("side port deep sill",b-a+.34,.18,.5,0,2.2,-.1,frame,root);
      const pane=MeshBuilder.CreatePlane("clear outward side glazing",{width:b-a-.16,height:1.55,sideOrientation:Mesh.DOUBLESIDE},scene);pane.position.set(0,3.05,.12);add(pane,glass,root);
      box("side port lead upright",.028,1.65,.04,0,3.05,.08,iron,root,.004);
      box("side port lead crossbar",b-a-.13,.028,.04,0,3.05,.08,iron,root,.004);
      for(const sign of[-1,1]) {
        const shutter=box("folded oak port shutter",.38,1.75,.08,sign*(half+.21),3.05,-.11,wall,root);shutter.rotation.y=sign*.65;
        for(const y of[2.55,3.55])box("forged shutter hinge",.25,.055,.045,sign*(half+.16),y,-.2,iron,root,.006);
      }
    }
  }

  // Caged lanterns hang on forged brackets; the flame sits inside real caps and ribs.
  const flame = material("cabin lantern warm flame", "#ffd897"); flame.emissiveColor = Color3.FromHexString("#ffbd65").scale(1.25);
  const lanternGlass = material("cabin lantern amber panes", "#b68138"); lanternGlass.emissiveColor = Color3.FromHexString("#c08232").scale(.7);
  // The first two lights are a symmetric forward pair within each material's
  // four-light budget (sky + sun + port + starboard), never two lamps on one side.
  for (const z of [-2.7, 6.3]) for (const x of [-3.65, 3.65]) {
    const y = 4.0, light = new PointLight("shielded cabin lantern", new Vector3(x, y, z), scene);
    light.diffuse = Color3.FromHexString("#ffcc89"); light.intensity = z > 0 ? .72 : 1.15; light.range = 11; lamps.push(light);
    const shell = MeshBuilder.CreateCylinder("six sided lantern glass", { height: .56, diameter: .28, tessellation: 6 }, scene); shell.position.set(x, y, z); add(shell, lanternGlass);
    const wick = MeshBuilder.CreateSphere("small lantern flame", { diameter: .11, segments: 8 }, scene); wick.position.set(x, y - .03, z); wick.scaling.y = 1.7; add(wick, flame);
    for (const dy of [-.32, .32]) {
      const cap = MeshBuilder.CreateCylinder("lantern domed brass cap", { height: .13, diameterTop: dy > 0 ? .17 : .36, diameterBottom: dy > 0 ? .36 : .17, tessellation: 12 }, scene); cap.position.set(x, y + dy, z); add(cap, brass);
    }
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const cage = MeshBuilder.CreateCylinder("lantern iron cage rib", { height: .6, diameter: .022, tessellation: 5 }, scene); cage.position.set(x + Math.cos(a) * .15, y, z + Math.sin(a) * .15); add(cage, iron);
    }
    const ring = MeshBuilder.CreateTorus("lantern suspension ring", { diameter: .18, thickness: .026, tessellation: 12 }, scene); ring.position.set(x, y + .49, z); ring.rotation.x = Math.PI / 2; add(ring, iron);
    const chain = MeshBuilder.CreateCylinder("lantern suspension chain", { height: 1.14, diameter: .022, tessellation: 6 }, scene); chain.position.set(x, 5.14, z); add(chain, iron);
    box("lantern overhead fixing", .25, .08, .25, x, 5.73, z, iron);
  }

  // Coopered barrels and secured rope sit in the peripheral recesses, outside the cargo slots.
  for (const x of [-4.0, 4.0]) {
    const barrel = MeshBuilder.CreateLathe("coopered provision barrel", { shape: [new Vector3(.35, 0), new Vector3(.4, .12), new Vector3(.46, .68), new Vector3(.41, 1.25), new Vector3(.35, 1.34)], tessellation: 18, cap: Mesh.CAP_ALL }, scene);
    barrel.position.set(x, .72, 5.65); add(barrel, wall);
    for (const dy of [.12, .34, 1.02, 1.24]) {
      const hoop = MeshBuilder.CreateTorus("forged barrel hoop", { diameter: dy < .2 || dy > 1.1 ? .79 : .87, thickness: .05, tessellation: 24 }, scene); hoop.position.set(x, .72 + dy, 5.65); add(hoop, iron);
    }
    for (let loop = 0; loop < 4; loop++) {
      const coil = MeshBuilder.CreateTorus("secured hemp rope coil", { diameter: .63 + loop * .09, thickness: .045, tessellation: 28 }, scene); coil.position.set(x, .74 + loop * .007, 3.9); add(coil, rope);
    }
    box("barrel deck chock", 1.03, .12, .16, x, .76, 5.13, frame);
    box("barrel deck chock", 1.03, .12, .16, x, .76, 6.17, frame);
  }
  const meshes: Mesh[] = [];
  for (const [mat, list] of parts) if (list.length) {
    for (const mesh of list) mesh.computeWorldMatrix(true);
    const merged = Mesh.MergeMeshes(list, true, true)!; merged.name = `treasure cabin · ${mat.name}`;
    merged.material = mat; merged.receiveShadows = mat !== glass && mat !== flame && mat !== lanternGlass; merged.isPickable = false; meshes.push(merged);
    // Tiny fittings do not cast exaggerated shadows from the room's normal bias.
    if (mat === frame || mat === relief) shadows.addShadowCaster(merged, false);
  }
  for (const root of windowRoots) root.dispose();
  return { meshes, lamps, timber: wall, frame, floorY: .7 };
}
