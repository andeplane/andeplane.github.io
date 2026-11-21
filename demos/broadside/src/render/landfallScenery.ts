import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { CaveObstacle } from "../shared/pirate-world/input/caveWalk";
import { Rng } from "../sim/rng";
import { landfallHeight, landfallNoise, landfallReserved, type LandfallSite } from "../game/landfall";
import { islandSurface } from "./islandSurface";
import { worldStyle, type WorldStyle } from "./worldStyle";

export const vec = (x: number, y: number, z: number) => new Vector3(x, y, z);
const TAU = 2 * Math.PI;
type Point = { x: number; z: number };

function segmentDistance(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

/** A footworn trail bends around the landmark's base into the sheltered dig clearing. */
function trailDistance(x: number, z: number, site: LandfallSite) {
  const bend = { x: site.landmark.x * .48, z: site.landmark.z - 2.6 };
  return Math.min(segmentDistance(x, z, site.spawn, bend), segmentDistance(x, z, bend, site.dig));
}

export function terrainStyle(world:number, biome:LandfallSite["settings"]["biome"]): WorldStyle {
  const s=worldStyle(world);
  switch (biome) {
    case "winter": return {...s, grass:"#c8d9df", grassDark:"#a8c1ca", wetSand:"#839fa9", sand:"#dbe5e4",
      leaf:"#2e615d",leafLight:"#689286",rock:"#81949c",rockDark:"#566d79",sky:"#b5d2e2",sun:"#fff0ce",
      deepWater:"#17435d",shallowWater:"#69adba",fog:"#90acbb"};
    case "alpine": return {...s,grass:"#9aab77",grassDark:"#6e846a",sand:"#cfbf9b",rock:"#89918b",
      leaf:"#315949",leafLight:"#628065", deepWater:"#174653",shallowWater:"#66a7a5"};
    case "temperate": return {...s,grass:"#829c63",grassDark:"#587d56",leaf:"#386748",leafLight:"#87a85e"};
    case "tropical": return s;
  }
}

export class IslandScenery {
  readonly obstacles: CaveObstacle[] = [];
  readonly rng: Rng;
  readonly style: WorldStyle;
  readonly stone: StandardMaterial;
  readonly matte: StandardMaterial;
  readonly glow: StandardMaterial;
  private parts = new Map<StandardMaterial, Mesh[]>();
  private leaves: number[] = [];
  private leafColors: number[] = [];
  constructor(readonly scene: Scene, readonly world: number, readonly site: LandfallSite, readonly seed: number, private shadows: ShadowGenerator) {
    this.style = terrainStyle(world,site.settings.biome);
    this.rng = new Rng(seed ^ (8139 + world * 10979));
    this.stone = islandSurface(scene, true);
    this.matte = new StandardMaterial("paint, timber and leaves", scene);
    this.matte.backFaceCulling = false; this.matte.twoSidedLighting = true;
    this.matte.specularColor.setAll(.045);
    this.glow = new StandardMaterial("mineral light", scene);
    this.glow.emissiveColor.set(.75, .75, .75); this.glow.linkEmissiveWithDiffuse = true;
    this.glow.specularColor.setAll(.15);
  }
  floor(x: number, z: number) { return landfallHeight(this.world, x, z, this.seed, this.site.settings); }
  fertility(x: number, z: number) {
    return .52 + .34 * landfallNoise(this.seed ^ 773, x * .095, z * .095)
      + .14 * landfallNoise(this.seed ^ 141, x * .24, z * .24);
  }
  solid(x: number, z: number, rx: number, rz: number, height: number) {
    this.obstacles.push({ x, z, rx, rz, top: this.floor(x,z) + height });
  }
  private paint(mesh: Mesh, hex: string, m: StandardMaterial) {
    const c = Color3.FromHexString(hex);
    const colors = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < colors.length; i += 4) { colors[i] = c.r; colors[i+1] = c.g; colors[i+2] = c.b; colors[i+3] = 1; }
    mesh.setVerticesData("color", colors); mesh.material = m;
    if (!this.parts.has(m)) this.parts.set(m, []);
    this.parts.get(m)!.push(mesh);
    return mesh;
  }
  pole(name: string, a: Vector3, b: Vector3, bottom: number, top: number, color: string, sides = 9, m = this.matte) {
    const direction = b.subtract(a);
    const mesh = MeshBuilder.CreateCylinder(name, { height: direction.length(), diameterBottom: bottom, diameterTop: top, tessellation: sides }, this.scene);
    mesh.position.copyFrom(a.add(b).scale(.5));
    direction.normalize();
    mesh.rotation.set(Math.acos(Math.max(-1, Math.min(1, direction.y))), Math.atan2(direction.x, direction.z), 0);
    return this.paint(mesh, color, m);
  }
  stoneBlock(name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, m = this.stone) {
    const block = MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, this.scene);
    block.position.set(x,y,z);
    return this.paint(block, color, m);
  }
  boulder(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, m = this.stone) {
    const rock = MeshBuilder.CreateIcoSphere("sea-worn boulder", { radius: 1, subdivisions: 1, flat: true }, this.scene);
    rock.position.set(x,y,z); rock.scaling.set(sx,sy,sz); rock.rotation.y = this.rng.range(0, TAU);
    return this.paint(rock, color, m);
  }
  triangle(a: Vector3,b: Vector3,c: Vector3,hex: string) {
    const color = Color3.FromHexString(hex);
    for (const v of [a,b,c]) {
      this.leaves.push(v.x,v.y,v.z); this.leafColors.push(color.r,color.g,color.b,1);
    }
  }
  terrain() {
    const ground = MeshBuilder.CreateGround("island-0-0", {width:96,height:96,subdivisions:128},this.scene);
    const pos = ground.getVerticesData("position")!, colors: number[] = [], normals: number[] = [], uvs: number[] = [];
    const style = this.style, sand = Color3.FromHexString(style.sand), grass = Color3.FromHexString(style.grass);
    const dark = Color3.FromHexString(style.grassDark), wet = Color3.FromHexString(style.wetSand);
    const clamp = (v: number) => Math.max(0,Math.min(1,v));
    for (let i=0;i<pos.length;i+=3) {
      const x=pos[i]!,z=pos[i+2]!, y=this.floor(x,z), d = trailDistance(x,z,this.site);
      const grain = this.fertility(x,z)-.5;
      const canopy = Color3.Lerp(grass,dark,clamp(.42 + grain*1.16));
      const beach = Color3.Lerp(wet,sand,clamp((y-.12)*2));
      const crest = Math.max(0, y - 3.5);
      const beachLimit = .44 + this.site.settings.beach * 2.65;
      const vegetation = clamp((y-beachLimit+grain*.55)*1.4)*clamp((d-1.05+grain)*.83);
      const rock = Color3.FromHexString(style.rock);
      const cover = Color3.Lerp(canopy,rock,clamp((crest-2.3-grain*2)*.23));
      const c = Color3.Lerp(beach,cover,vegetation).scale(.96+grain*.10);
      if(this.site.settings.biome==="winter" || this.site.settings.biome==="alpine") {
        const frost=this.site.settings.biome==="winter" ? clamp((y-.37+grain*.5)*1.7) : clamp((y-7.6+grain)*.39);
        Color3.LerpToRef(c,Color3.FromHexString("#e4edf2"),frost*(.8+grain*.2),c);
      }
      pos[i+1] = y; colors.push(c.r,c.g,c.b,1); uvs.push(x*.26,z*.26);
    }
    VertexData.ComputeNormals(pos,ground.getIndices()!,normals);
    ground.setVerticesData("position",pos); ground.setVerticesData("normal",normals);
    ground.setVerticesData("color",colors); ground.setVerticesData("uv",uvs);
    ground.material = islandSurface(this.scene); ground.receiveShadows = true; ground.isPickable = false;
  }
  /** Split palm leaflets expose slivers of sky; the folds catch alternating bands of sunlight. */
  palm(x: number,z: number,height: number,lean: number,heading: number) {
    const y = this.floor(x,z)-.20, style = this.style, rng = this.rng;
    const axis = vec(Math.sin(heading),0,Math.cos(heading));
    const trunkAt = (t: number) => vec(x,y+height*t,z).add(axis.scale(lean*t*t));
    for (let i=0;i<7;i++) {
      const t=i/7, r=height*(.060-.032*t);
      this.pole("curved palm trunk",trunkAt(t),trunkAt((i+1)/7),r,r*.95,i%3===0?"#937151":style.trunk,7);
      this.pole("palm growth scar",trunkAt(t+.04),trunkAt(t+.055),r*1.04,r,"#b39168",7);
    }
    const crown=trunkAt(1);
    for (let i=0;i<11;i++) {
      const a=i*2.4+rng.range(-.13,.13), dir=vec(Math.sin(a),0,Math.cos(a)), across=vec(dir.z,0,-dir.x);
      const len=height*rng.range(.45,.69), lift=height*(i%3===0?.26:.17);
      const stem = (t: number) => crown.add(dir.scale(t*len)).add(vec(0,Math.sin(t*Math.PI)*lift-t*t*height*.15,0));
      for (let j=0;j<9;j++) {
        const t=j/10, tip=(j+1)/10, center=stem(t), end=stem(tip);
        for (const side of [-1,1]) {
          const spread=(.18+Math.sin((t+.08)*Math.PI)*.82)*height*.135;
          const edge=center.add(dir.scale(len*.23)).add(across.scale(spread*side)).add(vec(0,-.17*height*(1-t*.5),0));
          const fold=Vector3.Lerp(edge,end,.46).add(vec(0,.09,0));
          this.triangle(center,end,fold,i%3===0?style.leafLight:style.leaf);
          this.triangle(center,fold,edge,side<0?style.leaf:style.leafLight);
        }
      }
    }
    this.solid(x,z,.28,.28,height);
  }
  conifer(x:number,z:number,height:number,winter:boolean) {
    const rng=this.rng,y=this.floor(x,z)-.14,style=this.style;
    this.pole("fir bole",vec(x,y,z),vec(x,y+height,z),height*.062,height*.02,"#665747",8);
    for(let tier=0;tier<7;tier++) {
      const t=tier/7, radius=(1-t*.86)*height*.24, top=vec(x,y+height*(.59+t*.48),z);
      const count=12;
      for(let j=0;j<count;j++) {
        const a=j*TAU/count+t*2.4,b=(j+1)*TAU/count+t*2.4;
        const leaf=(angle:number,r:number)=>vec(x+r*Math.sin(angle),y+height*(.18+t*.83),z+r*Math.cos(angle));
        const left=leaf(a,radius*rng.range(.7,1)),right=leaf(b,radius*rng.range(.73,1));
        const tip=leaf((a+b)/2,radius*1.09);tip.y-=height*.045;
        this.triangle(top,left,tip,style.leaf);
        this.triangle(top,tip,right,winter&&tier%2===0?"#b7d3d5":style.leafLight);
        if(winter) {
          const cap=Vector3.Lerp(tip,top,.16);
          this.triangle(top,Vector3.Lerp(left,top,.24),cap,"#dee8e6");
          this.triangle(top,cap,Vector3.Lerp(right,top,.32),"#cbdedc");
        }
      }
    }
    this.solid(x,z,.24,.24,height);
  }
  broadleaf(x:number,z:number,height:number,shrub=false) {
    const y=this.floor(x,z)-.09,style=this.style,rng=this.rng;
    const feet=vec(x,y,z),fork=vec(x+.15,y+height*.58,z);
    if(!shrub) this.pole("split broadleaf trunk",feet,fork,height*.077,height*.045,"#74604a",8);
    for(let j=0;j<(shrub?4:6);j++) {
      const a=j*2.4;
      const l=height*.24*rng.range(.75,1.12),end=vec(x+Math.sin(a)*l,y+height*(.72+j*.043),z+Math.cos(a)*l);
      if(!shrub) this.pole("crown branch",fork,end,height*.036,height*.01,"#7b644c",7);
      this.boulder(end.x,end.y,end.z,height*.25,height*.21,height*.26,j%3===0?style.leafLight:style.leaf,this.matte);
    }
    if(!shrub)this.solid(x,z,.27,.27,height);
  }
  populate() {
    const style=this.style, rng=this.rng, {site}=this;
    for (let i=0;i<248;i++) {
      const x=rng.range(-33,33), z=rng.range(-29,29), y=this.floor(x,z), d=trailDistance(x,z,site);
      if(landfallReserved(site,x,z) || y<.45 || d<4.2 || Math.hypot(x-site.landmark.x,z-site.landmark.z)<5 || Math.hypot(x-site.dig.x,z-site.dig.z)<4) continue;
      const fertility = this.fertility(x,z);
      const lushness=site.settings.vegetation;
      if (i<Math.round(150*lushness) && fertility>.60-lushness*.18 && y<10.2 && y>.52+site.settings.beach*.85) {
        if(this.obstacles.some(o=>Math.hypot(o.x-x,o.z-z)<2.6))continue;
        const habitat=site.settings.biome;
        if (i%4===0 && habitat!=="winter") this.broadleaf(x,z,rng.range(.56,1.03),true);
        else if (habitat==="tropical") this.palm(x,z,rng.range(4.4,8.4),rng.range(.3,2),rng.range(0,TAU));
        else if (habitat==="temperate") this.broadleaf(x,z,rng.range(3.6,6.2));
        else this.conifer(x,z,rng.range(3.5,7.6),habitat==="winter");
      } else if (i%3===0 && fertility<.50) {
        const size=rng.range(.65,2.3);
        this.boulder(x,y-.2,z,size,size*rng.range(.6,1.5),size*.76,i%2?style.rock:style.rockDark);
        this.solid(x,z,size*.8,size*.61,size*1.1);
      }
    }
    // Low growth stays in small, uneven colonies between clearings.
    for(let i=0;i<Math.round(1580*site.settings.vegetation);i++) {
      const x=rng.range(-34,34),z=rng.range(-30,30),y=this.floor(x,z);
      if(landfallReserved(site,x,z) || this.fertility(x,z)<.43 || y<.52+site.settings.beach*.86 || y>9.3 || trailDistance(x,z,site)<2 || Math.hypot(x-site.dig.x,z-site.dig.z)<2.2) continue;
      const base=vec(x,y-.06,z), height=rng.range(.22,1.0);
      for(let j=0;j<7;j++) {
        const a=j*2.399+ i, dir=vec(Math.sin(a),0,Math.cos(a)), across=vec(dir.z,0,-dir.x);
        const tip=base.add(dir.scale(.55*height)).add(vec(0,height*rng.range(.7,1.3),0));
        const fold=Vector3.Lerp(base,tip,.51).add(vec(0,.085,0)), w=rng.range(.03,.13);
        this.triangle(base,fold.add(across.scale(w)),tip,style.leafLight);
        this.triangle(base,tip,fold.subtract(across.scale(w)),style.leaf);
      }
    }
    // Offshore stacks give the horizon a second, softer plane beyond the beach.
    for(let i=0;i<19;i++) {
      const a=i*.96+.7, r=rng.range(75,165), width=rng.range(7,20), h=rng.range(5,17);
      for(let j=0;j<3;j++) this.boulder(Math.sin(a)*r+j*width*.42,-1,Math.cos(a)*r+j*2,
        width*(1-j*.18),h*(1-j*.2),width*.74,style.rockDark);
    }
  }
  finish() {
    if(this.leaves.length) {
      const mesh = new Mesh("island leaf folds",this.scene), data = new VertexData();
      data.positions=this.leaves; data.colors=this.leafColors;
      data.indices=Array.from({length:this.leaves.length/3},(_,i)=>i);
      VertexData.ComputeNormals(data.positions,data.indices,data.normals=[]); data.applyToMesh(mesh);
      mesh.material=this.matte; mesh.receiveShadows=true; mesh.isPickable=false;
      mesh.freezeWorldMatrix(); this.shadows.addShadowCaster(mesh);
    }
    for(const [material,parts] of this.parts) {
      const merged=Mesh.MergeMeshes(parts,true,true);
      if(!merged) continue;
      merged.name="landfall "+material.name; merged.isPickable=false; merged.receiveShadows=true;
      merged.freezeWorldMatrix(); this.shadows.addShadowCaster(merged);
    }
    this.parts.clear(); this.leaves=[]; this.leafColors=[];
  }
}
