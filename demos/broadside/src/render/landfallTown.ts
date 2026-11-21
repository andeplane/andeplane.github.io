import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
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

/** Emit flat shaded, vertex-coloured architecture directly into a single mesh. */
class TownGeometry {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private palette = new Map<string, Color3>();
  transform: (p: Point) => Point = p => p;

  face(hex: string, ...local: Point[]): void {
    const vertices = local.map(p => this.transform(p));
    const first = this.positions.length / 3;
    const [a, b, c] = vertices as [Point, Point, Point];
    const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]] as Point;
    const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]] as Point;
    const nx = ab[1]*ac[2] - ab[2]*ac[1], ny = ab[2]*ac[0] - ab[0]*ac[2], nz = ab[0]*ac[1] - ab[1]*ac[0];
    const length = Math.hypot(nx, ny, nz) || 1;
    let tint = this.palette.get(hex);
    if (!tint) { tint = Color3.FromHexString(hex); this.palette.set(hex, tint); }
    for (const point of vertices) {
      this.positions.push(...point);
      this.normals.push(nx / length, ny / length, nz / length);
      this.colors.push(tint.r, tint.g, tint.b, 1);
    }
    // Babylon takes clockwise front faces in its left-handed scene.
    for (let i = 2; i < vertices.length; i++) this.indices.push(first, first + i, first + i - 1);
  }

  box(hex: string, x: number, y: number, z: number, width: number, height: number, depth: number): void {
    const left = x - width/2, right = x + width/2, bottom = y - height/2, top = y + height/2;
    const front = z - depth/2, back = z + depth/2;
    this.face(hex,[left,bottom,front],[left,top,front],[right,top,front],[right,bottom,front]);
    this.face(hex,[left,bottom,back],[right,bottom,back],[right,top,back],[left,top,back]);
    this.face(hex,[left,bottom,front],[left,bottom,back],[left,top,back],[left,top,front]);
    this.face(hex,[right,bottom,front],[right,top,front],[right,top,back],[right,bottom,back]);
    this.face(hex,[left,top,front],[left,top,back],[right,top,back],[right,top,front]);
    this.face(hex,[left,bottom,front],[right,bottom,front],[right,bottom,back],[left,bottom,back]);
  }

  finish(scene: Scene, shadows: ShadowGenerator): void {
    if (!this.positions.length) return;
    const mesh = new Mesh("village houses and lanes", scene);
    const geometry = new VertexData();
    geometry.positions = this.positions; geometry.indices = this.indices;
    geometry.normals = this.normals; geometry.colors = this.colors;
    geometry.applyToMesh(mesh);
    const material = new StandardMaterial("painted village timber", scene);
    material.diffuseColor = Color3.White(); material.specularColor.setAll(.025);
    mesh.material = material; mesh.isPickable = false;
    mesh.receiveShadows = true; mesh.freezeWorldMatrix();
    shadows.addShadowCaster(mesh);
  }
}

function drawHouse(batch: TownGeometry, h: TownHouse, floor: number, biome: string) {
  const winter = biome === "winter", highland = biome === "alpine";
  const halfW = h.frontage / 2, halfD = h.depth / 2, eaves = h.eaves;
  const front = -halfD, accent = paint[h.color]!;
  const roof = (winter || highland ? slate : tiles)[h.color]!;
  const rise = h.rise * (winter || highland ? 1.34 : 1);
  const walls = winter ? ["#9d634a","#a77751","#b38a6d","#916448","#bb9873"][h.color]! : plaster[h.color]!;
  batch.transform = ([x, y, z]) => [h.x - h.facing * z, floor + y, h.z + h.facing * x];
  batch.box("#797367",0,-.14,0,h.frontage+.25,.74,h.depth+.25);
  batch.box(walls,0,eaves/2+.1,0,h.frontage,eaves-.2,h.depth);
  for (const x of [-halfW, halfW]) for (const z of [-halfD, halfD])
    batch.box(wood,x,eaves/2,z,.14,eaves,.14);
  for (const y of [.30, eaves-.14])
    batch.box(wood,0,y,0,h.frontage+.18,.16,h.depth+.16);
  // Gables close the ends. Ridge runs parallel with the street.
  for (const side of [-1,1]) {
    const x = halfW * side;
    const gable: Point[] = [[x,eaves,front],[x,eaves,h.depth/2],[x,eaves+rise,0]];
    if (side > 0) gable.reverse();
    batch.face(walls,...gable);
    batch.box(cut,x,eaves+rise*.43,0,.11,rise*.86,.12);
    batch.box(accent,x+side*.045,1.4,0,.15,.84,.77);
    batch.box("#efc785",x+side*.12,1.4,0,.055,.64,.47);
    batch.box(wood,x+side*.155,1.4,0,.035,.68,.055);
  }
  const roofHalfD = halfD + .38, roofHalfW = halfW + .32;
  const ridge = eaves + rise, lip = eaves - .2;
  for (const side of [-1,1]) {
    const z = side * roofHalfD;
    const sideRoof = (color: string, strip: number, strips: number, y: number) => {
      const x0 = -roofHalfW + 2 * roofHalfW * strip / strips;
      const x1 = -roofHalfW + 2 * roofHalfW * (strip + 1) / strips;
      const surface: Point[] = [[x0,ridge+y,0],[x0,lip+y,z],[x1,lip+y,z],[x1,ridge+y,0]];
      if (side < 0) surface.reverse();
      batch.face(color, ...surface);
    };
    const strips = Math.ceil(h.frontage * 1.25);
    for (let strip=0; strip<strips; strip++) {
      sideRoof(winter ? (strip%3 ? "#eef2eb" : "#dfebea") : strip%3 ? roof : (highland ? slate : tiles)[(h.color+1)%5]!, strip, strips, 0);
    }
    batch.box(winter ? "#cbdad9" : wood,0,lip-.07,z,2*roofHalfW,.14,.11);
  }
  batch.box(winter ? "#f4f5ee" : roof,0,ridge+.005,0,h.frontage+.70,.12,.16);
  const chimneyX = halfW * .58;
  batch.box("#7e7569",chimneyX,ridge+.02,.31,.42,1.05,.52);
  batch.box(winter ? "#e0e7df" : "#a7967a",chimneyX,ridge+.56,.31,.55,.15,.65);
  // Street-facing façade, with windows on either side of the door.
  batch.box(dark,0,.96,front-.04,1.02,1.72,.13);
  batch.box(accent,0,.92,front-.115,.79,1.54,.095);
  batch.box("#dab675",.24,.9,front-.18,.065,.085,.075);
  batch.box("#9d9580",0,.13,front-.28,1.27,.24,.56);
  for (const x of [-halfW*.65, halfW*.65]) {
    batch.box(wood,x,1.44,front-.055,.79,1.04,.15);
    batch.box("#efc785",x,1.45,front-.14,.60,.83,.04);
    batch.box(dark,x,1.45,front-.18,.045,.85,.04);
    batch.box(dark,x,1.46,front-.18,.65,.045,.04);
    batch.box(cut,x,.91,front-.12,.96,.085,.27);
    for (const side of [-1,1]) batch.box(accent,x+side*.52,1.44,front-.075,.21,.95,.105);
  }
  if (h.variant === "store") {
    for (let i=0; i<9; i++) {
      const x0 = (i/9-.5)*h.frontage, x1 = ((i+1)/9-.5)*h.frontage;
      const stripe = i%2 ? accent : "#e7c494";
      batch.face(stripe,[x0,2.14,front-.04],[x1,2.14,front-.04],[x1,1.91,front-1.04],[x0,1.91,front-1.04]);
      batch.box(stripe,(x0+x1)/2,1.83,front-1.04,x1-x0,.16,.035);
    }
    for (const x of [-halfW+.12, halfW-.12]) batch.box(cut,x,.95,front-1.04,.085,1.9,.085);
  } else if (h.variant === "loft") {
    batch.box(wood,0,eaves-.55,front-.08,.88,.7,.15);
    batch.box(accent,0,eaves-.55,front-.16,.66,.5,.075);
  }
}

function drawLane(batch: TownGeometry, path: TownPath, height: Height, winter: boolean): void {
  const dx = path.b.x-path.a.x, dz = path.b.z-path.a.z, len = Math.hypot(dx,dz);
  const acrossX = -dz/len * path.width/2, acrossZ = dx/len * path.width/2;
  const steps = Math.ceil(len/.65);
  const point = (step: number, side: number): Point => {
    const x = path.a.x + dx*step/steps + side*acrossX, z = path.a.z + dz*step/steps + side*acrossZ;
    return [x,height(x,z)+.045,z];
  };
  const color = winter ? "#c7beb0" : "#b59e77";
  for (let i=0; i<steps; i++) batch.face(color,point(i,-1),point(i,1),point(i+1,1),point(i+1,-1));
}

export function buildSettlement(
  scene: Scene, site: { town: TownPlan; settings: { biome: string } }, height: Height, shadows: ShadowGenerator,
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
  batch.finish(scene, shadows);
  return obstacles;
}
