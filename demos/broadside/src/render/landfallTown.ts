import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial.js";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";
import { villageMaterial, surfaceMetres, type VillageSurface } from "./landfallTownMaterials";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { TownHouse, TownPath, TownPlan } from "../game/landfallTown";
import type { CaveObstacle } from "../shared/pirate-world/input/caveWalk";

type Point = [number, number, number];
type Height = (x: number, z: number) => number;
const wood = "#684836", cut = "#987044", dark = "#493f36";
const plaster = ["#f1d5a0", "#e2a581", "#c6d4be", "#eee0c0", "#e9c175"];
const paint = ["#42767b", "#446153", "#aa624c", "#647e9b", "#6e895c"];
const tiles = ["#a34e38", "#ad6342", "#8e513b", "#ba7654", "#a85b41"];
const slate = ["#556570", "#605f68", "#697983", "#6c7880", "#546769"];

/** All lots share a mesh, with a single indexed batch for each visible surface. */
class TownGeometry {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];
  private bySurface = new Map<VillageSurface, number[]>();
  private palette = new Map<string, Color3>();
  transform: (p: Point) => Point = p => p;

  face(hex: string, ...local: Point[]): void {
    this.surface("plain", hex, ...local);
  }

  surface(kind: VillageSurface, hex: string, ...local: Point[]): void {
    const vertices = local.map(p => this.transform(p));
    const first = this.positions.length / 3;
    const [a, b, c] = vertices as [Point, Point, Point];
    const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]] as Point;
    const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]] as Point;
    const nx = ab[1]*ac[2] - ab[2]*ac[1], ny = ab[2]*ac[0] - ab[0]*ac[2], nz = ab[0]*ac[1] - ab[1]*ac[0];
    const length = Math.hypot(nx, ny, nz) || 1;
    let tint = this.palette.get(hex);
    if (!tint) { tint = Color3.FromHexString(hex); this.palette.set(hex, tint); }
    // Project each façade in its house-local frame. Roof and ground UVs use the
    // same origin across strokes and courses, so joints line up across triangles.
    const l0 = local[0]!, l1 = local[1]!, l2 = local[2]!;
    const ux = l1[0]-l0[0], uy = l1[1]-l0[1], uz = l1[2]-l0[2];
    const vx = l2[0]-l0[0], vy = l2[1]-l0[1], vz = l2[2]-l0[2];
    const sx = Math.abs(uy*vz-uz*vy), sy = Math.abs(uz*vx-ux*vz), sz = Math.abs(ux*vy-uy*vx);
    const scale = surfaceMetres[kind];
    for (const [i,point] of vertices.entries()) {
      const [x,y,z] = local[i]!;
      if (kind === "tiles" || kind === "slate" || sy > Math.max(sx,sz)) this.uvs.push(x/scale,z/scale);
      else this.uvs.push((sx>sz ? z : x)/scale,y/scale);
      this.positions.push(...point);
      this.normals.push(nx / length, ny / length, nz / length);
      this.colors.push(tint.r, tint.g, tint.b, 1);
    }
    // Babylon takes clockwise front faces in its left-handed scene.
    let indices = this.bySurface.get(kind);
    if (!indices) { indices=[]; this.bySurface.set(kind,indices); }
    for (let i = 2; i < vertices.length; i++) indices.push(first, first + i, first + i - 1);
  }

  box(hex: string, x: number, y: number, z: number, width: number, height: number, depth: number, kind: VillageSurface = "boards"): void {
    const left = x - width/2, right = x + width/2, bottom = y - height/2, top = y + height/2;
    const front = z - depth/2, back = z + depth/2;
    this.surface(kind,hex,[left,bottom,front],[left,top,front],[right,top,front],[right,bottom,front]);
    this.surface(kind,hex,[left,bottom,back],[right,bottom,back],[right,top,back],[left,top,back]);
    this.surface(kind,hex,[left,bottom,front],[left,bottom,back],[left,top,back],[left,top,front]);
    this.surface(kind,hex,[right,bottom,front],[right,top,front],[right,top,back],[right,bottom,back]);
    this.surface(kind,hex,[left,top,front],[left,top,back],[right,top,back],[right,top,front]);
    this.surface(kind,hex,[left,bottom,front],[right,bottom,front],[right,bottom,back],[left,bottom,back]);
  }

  /** Tapered turned pieces share the same batch as the walls and roofs. */
  turned(hex: string, x: number, y: number, z: number, base: number, top: number, height: number, sides = 8, kind: VillageSurface = "plain") {
    const ring = (i: number, r: number, dy: number): Point => [
      x + r * Math.cos(i * 2 * Math.PI / sides), y + dy, z + r * Math.sin(i * 2 * Math.PI / sides),
    ];
    const cap: Point[] = [];
    for (let i = 0; i < sides; i++) {
      this.surface(kind, hex, ring(i, base, 0), ring(i, top, height), ring(i + 1, top, height), ring(i + 1, base, 0));
      cap.unshift(ring(i, top, height));
    }
    this.surface(kind, hex, ...cap);
  }

  finish(scene: Scene, shadows: ShadowGenerator, night: boolean): void {
    if (!this.positions.length) return;
    const mesh = new Mesh("village houses and lanes", scene);
    const geometry = new VertexData();
    geometry.positions = this.positions; geometry.indices = Array.from(this.bySurface.values()).flat();
    geometry.uvs = this.uvs;
    geometry.normals = this.normals; geometry.colors = this.colors;
    geometry.applyToMesh(mesh);
    const materials = new MultiMaterial("coastal building surfaces",scene);
    mesh.material = materials; mesh.isPickable = false;
    mesh.releaseSubMeshes();
    let indexOffset=0;
    for (const [kind, indices] of this.bySurface) {
      const materialIndex=materials.subMaterials.push(villageMaterial(scene,kind,night))-1;
      new SubMesh(materialIndex,0,mesh.getTotalVertices(),indexOffset,indices.length,mesh);
      indexOffset+=indices.length;
    }
    mesh.receiveShadows = true; mesh.freezeWorldMatrix();
    shadows.addShadowCaster(mesh);
  }
}

function shingles(
  batch: TownGeometry, halfW: number, halfD: number, ridge: number, lip: number,
  hip: number, colors: readonly string[], color: number, snow: boolean,
) {
  const surface: VillageSurface = snow ? "snow" : colors === slate ? "slate" : "tiles";
  const courseCount = Math.ceil(halfD / .39);
  const tileCount = Math.ceil(halfW * 2 / .57);
  for (const side of [-1,1]) {
    for (let row = 0; row < courseCount; row++) {
      const stagger = surface === "tiles" || snow ? 0 : (row%2)*.5;
      const point = (u: number, t: number, lift: number): Point => [
        (2 * u - 1) * (halfW - hip * (1 - t)),
        ridge + (lip-ridge)*t + lift, side*halfD*t,
      ];
      for (let col = 0; col < tileCount + (stagger ? 1 : 0); col++) {
        const u0 = Math.max(0, (col-stagger)/tileCount), u1 = Math.min(1, (col+1-stagger)/tileCount);
        const t0 = row/courseCount, t1 = (row+1)/courseCount;
        const lift = snow ? .028 : .055;
        const sample = (col * 7 + row * 11 + color * 5) % 17;
        const tint = colors[(color + (sample < 4 ? 1 : sample === 6 ? 2 : 0)) % colors.length]!;
        const segments = surface === "tiles" ? 4 : 1;
        const arch = (t: number) => surface === "tiles" ? .072*Math.sin(Math.PI*t) : 0;
        for (let segment=0; segment<segments; segment++) {
          const p=segment/segments, q=(segment+1)/segments;
          const left=u0+(u1-u0)*p, right=u0+(u1-u0)*q;
          const sheet=[point(left,t0,arch(p)),point(left,t1,arch(p)+lift),
            point(right,t1,arch(q)+lift),point(right,t0,arch(q))];
          batch.surface(surface,tint,...(side<0 ? sheet.reverse() : sheet));
          const edge=[point(left,t1,0),point(right,t1,0),point(right,t1,arch(q)+lift),point(left,t1,arch(p)+lift)];
          batch.surface(surface,tint,...(side>0 ? edge : edge.reverse()));
        }
      }
    }
    batch.box(snow ? "#d2e1e0" : wood,0,lip-.065,side*halfD,halfW*2,.14,.14);
    for (let r = -2; r <= 2; r++)
      batch.box(cut,r*halfW*.42,lip-.12,side*(halfD-.20),.11,.14,.43);
    if (snow) {
      for (let i=0; i<9; i++) {
        const x=(i-4)*halfW*.213;
        const length=.12+.14*(1+Math.sin(i*3.71+side*color));
        batch.turned("#dae5e7",x,lip-length,side*halfD,.008,.045,length,5);
      }
    }
    if (hip > 0) {
      const r: Point = [side*(halfW-hip),ridge,0], a: Point = [side*halfW,lip,-halfD], b: Point = [side*halfW,lip,halfD];
      batch.surface(surface,colors[color]!, ...(side > 0 ? [r,b,a] : [r,a,b]));
    }
  }
  const ridgeLen = (halfW-hip)*2;
  const caps = Math.ceil(ridgeLen/.58);
  for (let c=0; c<caps; c++) {
    const x = -ridgeLen/2 + (c+.5)*ridgeLen/caps;
    batch.box(snow ? "#f5f5f0" : colors[(color+(c%3 === 0 ? 1 : 0))%colors.length]!, x,ridge+.055,0,ridgeLen/caps-.012,.135,.21,surface);
  }
}

function dormer(batch: TownGeometry, x: number, z: number, y: number, width: number, wall: string, tile: string, snow: boolean) {
  const hw=width/2, eave=y+.65, peak=eave+.48;
  batch.box(wall,x,y+.18,z+.34,width,.94,.68,snow ? "boards" : "lime");
  batch.surface(snow ? "boards" : "lime",wall,[x-hw,eave,z],[x,eave+.48,z],[x+hw,eave,z]);
  batch.box(wood,x,y+.30,z-.025,width*.66,.59,.07);
  batch.box("#efbf78",x,y+.3,z-.08,width*.51,.46,.05,"glass");
  batch.box(cut,x,y+.3,z-.12,.055,.48,.035);
  for (const side of [-1,1]) {
    const edge=x+side*(hw+.14);
    const panel: Point[]=[[x,peak,z-.17],[x,peak,z+.94],[edge,eave-.08,z+.94],[edge,eave-.08,z-.17]];
    batch.surface(snow ? "snow" : "tiles",snow ? "#e9eff0" : tile,...(side > 0 ? panel : panel.reverse()));
    batch.box(wood,edge,eave-.11,z+.38,.11,.1,1.15);
  }
  batch.box(snow ? "#f4f5ee" : tile,x,peak+.01,z+.38,.11,.1,1.12);
}

function barrel(batch: TownGeometry, x: number, z: number, scale: number) {
  batch.turned("#ac8152",x,.02,z,.25*scale,.31*scale,.40*scale,10,"boards");
  batch.turned("#a37645",x,.02+.40*scale,z,.31*scale,.25*scale,.39*scale,10,"boards");
  for (const y of [.13,.62]) batch.turned("#545958",x,.02+y*scale,z,.285*scale,.29*scale,.065*scale,10);
  batch.turned("#c09860",x,.02+.79*scale,z,.24*scale,.24*scale,.025,10);
}

function windowBox(batch: TownGeometry, x: number, z: number, winter: boolean, color: number) {
  batch.box("#92583f",x,.87,z,1.02,.20,.29);
  batch.box("#ba7951",x,.95,z,1.08,.075,.34);
  batch.box("#537450",x,1.01,z,.9,.12,.21);
  const petals = ["#d54f60","#ecaa4c","#f2dad3","#db7d9a","#d5b3e5"];
  for (let i=0; i<5; i++) {
    const dx = x+(i-2)*.18, top = 1.10 + (i%2)*.075;
    batch.turned("#498452",dx,1.02,z,.07,.035,top-1.02,5);
    batch.turned(winter ? "#d6e6df" : petals[(color+i%2)%petals.length]!,dx,top,z,.09,.055,.075,6);
  }
}

/** The painted fish projects beyond the awning, facing both approaches along the lane. */
function fishSign(batch: TownGeometry, x: number, front: number) {
  const center = front - 1.46;
  batch.box(wood,x,2.81,front-.98,.11,.13,2.06);
  for (const d of [-.30,.30]) batch.box(dark,x,2.63,center+d,.032,.30,.032);
  batch.box("#6d513b",x,2.25,center,.12,.58,1.10);
  for (const side of [-1,1]) {
    const surface=x+side*.063;
    const paintFace=(hex: string, offset: number, yz: [number,number][]) => {
      const face: Point[] = yz.map(([z,y])=>[surface+side*offset,2.25+y,center+z]);
      batch.face(hex,...(side>0 ? face.reverse() : face));
    };
    paintFace("#24545a",.002,[[-.50,-.24],[.50,-.24],[.50,.24],[-.50,.24]]);
    paintFace("#efca82",.007,[[-.39,-.15],[-.14,-.025],[-.14,.025],[-.39,.16]]);
    paintFace("#f0d798",.010,[[-.24,0],[-.04,-.13],[.18,-.12],[.39,0],[.23,.115],[.01,.17]]);
    paintFace("#6f9b96",.013,[[-.14,.01],[.11,-.035],[.29,.04],[.12,-.09],[-.02,-.10]]);
    paintFace("#2d4743",.016,[[.20,.038],[.236,.021],[.256,.054],[.222,.075]]);
  }
}

function shopfront(batch: TownGeometry, h: TownHouse, front: number, accent: string, winter: boolean) {
  const halfW = h.frontage/2, depth = 1.02;
  for (let i=0; i<9; i++) {
    const x0 = (i/9-.5)*h.frontage, x1 = ((i+1)/9-.5)*h.frontage;
    const stripe = i%2 ? accent : "#f0d9af", tip=front-depth;
    const sag = (x:number,t:number):Point => [x,2.40-.24*t-.11*Math.sin(Math.PI*t)-.07*t*(1-(2*x/h.frontage)**2),front-.04-(depth-.04)*t];
    for (let j=0;j<4;j++) batch.surface("linen",stripe,sag(x0,j/4),sag(x1,j/4),sag(x1,(j+1)/4),sag(x0,(j+1)/4));
    batch.surface("linen",stripe,sag(x0,1),sag(x1,1),[(x0+x1)/2,1.91,tip-.025]);
  }
  for (const x of [-halfW+.12,halfW-.12]) batch.box(cut,x,1.04,front-depth,.09,2.08,.09);
  // Fishmonger’s tray and coopered cask stay on the porch, outside the lane.
  const x=halfW*.65;
  for (const dx of [-.35,.35]) batch.box(wood,x+dx,.34,front-.58,.11,.68,.45);
  batch.box("#a67541",x,.73,front-.58,1.03,.14,.59);
  for (let i=0; i<3; i++) {
    const z=front-.76+i*.17;
    batch.face("#a0c7c1",[x-.30,.814,z],[x-.06,.826,z+.07],[x+.20,.816,z],[x-.06,.826,z-.07]);
    batch.face("#618f97",[x+.15,.819,z],[x+.32,.819,z+.067],[x+.32,.819,z-.067]);
  }
  barrel(batch,-halfW*.66,front-.52,.89);
  // A hemp fishing net hangs from the fish tray: paired diagonal strands droop toward its middle.
  const netPoint=(u:number,v:number):Point=>[
    x+(u-.5)*.85, .76-v*.48-.065*Math.sin(Math.PI*u),front-.91-.08*Math.sin(Math.PI*v),
  ];
  for(let row=0;row<4;row++) for(let col=0;col<6;col++) {
    const u=col/6,v=row/4;
    for(const invert of [false,true]) {
      const bottomU=u+(invert?0:1/6), topU=u+(invert?1/6:0);
      const a=netPoint(topU,v),b=netPoint(bottomU,v+.25);
      batch.face("#d5b880",a,[a[0]+.011,a[1],a[2]],[b[0]+.011,b[1],b[2]],b);
    }
  }
  fishSign(batch,halfW-.18,front);
  if (winter) batch.box("#dce7e4",0,2.36,front-.075,h.frontage,.06,.12);
}

function drawHouse(batch: TownGeometry, h: TownHouse, floor: number, biome: string) {
  const winter = biome === "winter", highland = biome === "alpine";
  const halfW = h.frontage / 2, halfD = h.depth / 2, eaves = h.eaves;
  const front = -halfD, accent = paint[h.color]!;
  const roof = (winter || highland ? slate : tiles)[h.color]!;
  const rise = h.rise * (winter || highland ? 1.34 : 1);
  const walls = winter ? ["#9d634a","#a77751","#b38a6d","#916448","#bb9873"][h.color]! : plaster[h.color]!;
  batch.transform = ([x, y, z]) => [h.x - h.facing * z, floor + y, h.z + h.facing * x];
  batch.box("#c4b49d",0,-.05,0,h.frontage+.25,.94,h.depth+.25,"stone");
  batch.box(walls,0,eaves/2+.21,0,h.frontage,eaves-.42,h.depth,winter ? "boards" : "lime");
  for (const x of [-halfW, halfW]) for (const z of [-halfD, halfD])
    batch.box(wood,x,eaves/2,z,.14,eaves,.14);
  for (const y of [.30, eaves-.14])
    batch.box(wood,0,y,0,h.frontage+.18,.16,h.depth+.16);
  const hipped = h.variant === "store" || (h.variant === "cottage" && h.color % 3 === 0);
  const hip = hipped ? halfW * .45 : 0;
  // The back wall often faces the beach, so give it glazing and a hearth too.
  for (const x of [-halfW*.50, halfW*.50]) {
    batch.box(wood,x,1.42,halfD+.03,.88,1,.12);
    batch.box("#e3ba81",x,1.44,halfD+.115,.70,.79,.075,"glass");
    batch.box(cut,x,1.44,halfD+.162,.07,.84,.055);
    batch.box(wood,x,.91,halfD+.10,1,.10,.27);
  }
  for (const side of [-1,1]) {
    const x = halfW * side;
    if (!hipped) {
      const gable: Point[] = [[x,eaves,front],[x,eaves,halfD],[x,eaves+rise,0]];
      if (side > 0) gable.reverse();
      batch.surface(winter ? "boards" : "lime",walls,...gable);
      for (const r of [-1,0,1]) {
        const timberH = rise * (r === 0 ? .9 : .5);
        batch.box(cut,x,eaves+timberH/2,r*halfD*.43,.13,timberH,.12);
      }
    }
    batch.box(accent,x+side*.045,1.4,0,.15,.90,.84);
    batch.box("#efc785",x+side*.12,1.4,0,.055,.69,.52,"glass");
    batch.box(wood,x+side*.155,1.4,0,.035,.72,.055);
    batch.box(cut,x+side*.155,1.4,0,.045,.06,.56);
  }
  const ridge = eaves + rise;
  const snow = ["#eef1e9","#e5ede9","#e4e9e8","#f0f2ed","#dce7e8"];
  shingles(batch,halfW+.36,halfD+.40,ridge,eaves-.18,hip,
    winter ? snow : highland ? slate : tiles,h.color,winter);
  if (h.variant === "loft" || (!hipped && h.color % 2 === 0)) {
    const z = -halfD*.84, y = eaves + rise*.27;
    dormer(batch,-halfW*.27,z,y, h.variant === "loft" ? 1.38 : .94,walls,roof,winter);
  }
  const chimneyX = halfW*.58;
  batch.box("#bd9e86",chimneyX,ridge-.02,.31,.44,1.26,.52,"stone");
  for (let row=0; row<4; row++) {
    batch.box(row%2 ? "#927c68" : "#ad8870",chimneyX,ridge-.27+row*.22,.31,.465,.08,.545);
  }
  batch.box(winter ? "#e0e7df" : "#a7967a",chimneyX,ridge+.62,.31,.57,.15,.65);
  batch.turned("#8e513b",chimneyX,ridge+.70,.31,.14,.12,.23,8);
  batch.turned("#593e33",chimneyX,ridge+.92,.31,.15,.15,.05,8);
  // Street-facing façade, with windows on either side of the door.
  batch.box(dark,0,.96,front-.04,1.02,1.72,.13);
  batch.box(accent,0,.92,front-.115,.79,1.54,.095);
  batch.box("#dab675",.24,.9,front-.18,.065,.085,.075);
  batch.box("#c5baa1",0,.13,front-.28,1.27,.24,.56,"stone");
  for (const x of [-halfW*.65, halfW*.65]) {
    batch.box(wood,x,1.44,front-.055,.79,1.04,.15);
    const glass = h.color%2 === 0 && x>0 ? "#c5c6a4" : "#e7c18a";
    batch.box(glass,x,1.45,front-.14,.60,.83,.04,"glass");
    // Broken diagonal reflections in the old glass sit just behind the mullions.
    const paneZ=front-.164, tint=glass === "#c5c6a4" ? "#dbe2c6" : "#f1d4a6";
    batch.face(tint,[x-.29,1.50,paneZ],[x-.29,1.64,paneZ],[x+.08,1.85,paneZ],[x+.26,1.85,paneZ]);
    batch.face(tint,[x+.27,1.48,paneZ],[x+.27,1.42,paneZ],[x-.19,1.11,paneZ],[x-.27,1.11,paneZ]);
    batch.box(dark,x,1.45,front-.18,.045,.85,.04);
    batch.box(dark,x,1.46,front-.18,.65,.045,.04);
    batch.box(cut,x,.91,front-.12,.96,.085,.27);
    for (const side of [-1,1]) {
      const shutter=x+side*.53;
      batch.box(accent,shutter,1.44,front-.075,.27,.95,.105);
      for (let l=0;l<4;l++) {
        const y=1.10+l*.20;
        batch.box(accent,shutter,y,front-.142,.24,.04,.055);
      }
      for (const y of [1.17,1.76]) batch.box("#494641",shutter-side*.047,y,front-.171,.16,.038,.028,"plain");
    }
  }
  if (!winter && (h.variant === "store" || h.color%2 === 0)) {
    // A shallow half-round lintel of hand-set wedge stones frames the entrance.
    const stone=["#ccb997","#bbac8e","#dfc9a4","#c5aa89"];
    for(let k=0;k<9;k++) {
      const edge=(step:number,r:number,z:number):Point=>[r*Math.cos(step*Math.PI/9),1.70+r*Math.sin(step*Math.PI/9),z];
      const a=edge(k+.035,.46,front-.12),b=edge(k+1-.035,.46,front-.12);
      const c=edge(k+1-.035,.61,front-.12),d=edge(k+.035,.61,front-.12);
      batch.surface("stone",stone[k%stone.length]!,a,b,c,d);
      batch.surface("stone",stone[k%stone.length]!,d,c,edge(k+1-.035,.61,front),edge(k+.035,.61,front));
    }
  }
  // Door panels, latch and a lamp under the rain hood.
  for (const y of [.53,1.16]) batch.box(wood,0,y,front-.174,.60,.035,.035);
  batch.box("#d1ab71",0,1.64,front-.165,.58,.17,.045);
  batch.box(dark,.61,1.88,front-.15,.30,.08,.34);
  batch.turned("#e7ae62",.61,1.55,front-.24,.11,.13,.27,6,"glass");
  batch.turned("#414d47",.61,1.82,front-.24,.18,.075,.13,6);
  batch.box("#aa9b83",0,.06,front-.55,1.4,.12,.47,"stone");
  if (h.variant === "store") {
    shopfront(batch,h,front,accent,winter);
  } else {
    windowBox(batch,-halfW*.65,front-.26,winter,h.color);
    if (h.variant === "loft") {
      // The balcony has a generous overhang with projecting joists below its floor.
      const level = eaves-.99;
      batch.box(wood,0,level,front-.43,1.75,.13,.85);
      for (const x of [-.76, .76]) batch.box(cut,x,level-.10,front-.43,.12,.16,.98);
      for (const x of [-.8,-.4,0,.4,.8]) batch.box(accent,x,level+.28,front-.8,.07,.54,.07);
      batch.box(cut,0,level+.58,front-.8,1.77,.10,.12);
      batch.box(wood,0,level+.43,front-.06,.78,.91,.15);
      batch.box("#e9c683",0,level+.50,front-.15,.59,.66,.065,"glass");
    } else {
      const canopyWidth=1.36;
      batch.face(roof,[-canopyWidth/2,2.10,front],[canopyWidth/2,2.10,front],
        [canopyWidth/2,1.94,front-.65],[-canopyWidth/2,1.94,front-.65]);
      batch.box(wood,0,1.91,front-.65,canopyWidth+.07,.10,.11);
      for (const x of [-.58,.58]) batch.box(cut,x,1.82,front-.32,.09,.12,.63);
    }
    if (h.color % 2) barrel(batch,halfW*.79,front-.42,.78);
  }
}

function drawLane(batch: TownGeometry, path: TownPath, height: Height, winter: boolean): void {
  const dx = path.b.x-path.a.x, dz = path.b.z-path.a.z, len = Math.hypot(dx,dz);
  const acrossX = -dz/len, acrossZ = dx/len;
  const steps = Math.ceil(len/.35);
  const sidePath = path.width < 2 && len < 4;
  const phase = path.a.x*.93 + path.b.z*1.41 + path.b.x;
  const point = (step: number, side: number, shoulder = false): Point => {
    const t=step/steps, along=t*len;
    const taper=sidePath ? 1-.52*t : 1;
    const waviness=.09*Math.sin(phase+along*2.37+side)+.035*Math.sin(along*6.21+side*phase);
    const radius=path.width*.5*taper + waviness + (shoulder ? .14 : -.06);
    const x=path.a.x+dx*t+side*acrossX*radius, z=path.a.z+dz*t+side*acrossZ*radius;
    return [x,height(x,z)+(shoulder ? -.035 : .048),z];
  };
  const color = winter ? "#d3cfc0" : "#d9c7a6";
  const rim = winter ? "#d0cbbd" : "#a99b79";
  for (let i=0; i<steps; i++) {
    batch.surface("cobbles",color,point(i,-1),point(i,1),point(i+1,1),point(i+1,-1));
    for (const side of [-1,1]) {
      const strip = [point(i,side),point(i,side,true),point(i+1,side,true),point(i+1,side)];
      batch.surface("cobbles",rim,...(side>0 ? strip : strip.reverse()));
    }
  }
  if (sidePath) {
    // Small worn flagstones emerge from the dirt ahead of the threshold.
    for (let i=0; i<3; i++) {
      const t=.48+i*.13, offset=.09*Math.sin(phase+i*4);
      const cx=path.a.x+dx*t+acrossX*offset, cz=path.a.z+dz*t+acrossZ*offset;
      const stones: Point[]=[];
      for(let k=0;k<7;k++) {
        const angle=-2*Math.PI*k/7+.28*i, spread=.86+.14*Math.sin(k*2.3+phase);
        const lateral=.29*Math.cos(angle)*spread, longitudinal=.16*Math.sin(angle)*spread;
        const x=cx+acrossX*lateral+dx/len*longitudinal, z=cz+acrossZ*lateral+dz/len*longitudinal;
        stones.push([x,height(x,z)+.06,z]);
      }
      batch.face(winter ? "#aca99d" : ["#ac9e85","#a29986","#b5a98d"][i]!,...stones.reverse());
    }
  }
}

export function buildSettlement(
  scene: Scene, site: { town: TownPlan; settings: { biome: string } }, height: Height, shadows: ShadowGenerator, night = false,
): CaveObstacle[] {
  const batch = new TownGeometry(), obstacles: CaveObstacle[] = [];
  for (const path of site.town.paths) drawLane(batch,path,height,site.settings.biome === "winter");
  for (const h of site.town.houses) {
    const floor = height(h.x,h.z);
    drawHouse(batch,h,floor,site.settings.biome);
    // Rounded shoulders at the building corners let a walker slide along the façade.
    for (const k of [-1,0,1]) obstacles.push({
      x:h.x,z:h.z+k*h.frontage*.30,rx:h.depth*.52,rz:h.frontage*.24,top:floor+h.eaves,
    });
  }
  batch.finish(scene, shadows, night);
  return obstacles;
}
