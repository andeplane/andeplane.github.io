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
import reliefUrl from "./grotto/tidal-limestone-normal.webp";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Two connected, eroded chambers. Walking and the tide pool use the island
 * heightfield. Overhangs need their own mesh and collision along the side walls. */
export function buildGrotto(scene: Scene, island: GeneratedIsland, shadows: ShadowGenerator, night = false): CaveObstacle[] {
  const cave = island.site.grotto;
  const rockField = simplexField(cave.seed ^ 0xa85f48bd);
  const sin = Math.sin(cave.yaw), cos = Math.cos(cave.yaw);
  const at = (u: number, y: number, v: number) => new Vector3(cave.entry.x + u*cos + v*sin, y, cave.entry.z - u*sin + v*cos);
  const midline = (v: number) => .56 * Math.sin((v - 3) * .43);
  const width = (v: number) => 3.16 + .95 * Math.sin((v - 2.6) * .40) + .42 * Math.sin(v * .81);
  const entrance = 3, length = 11;
  const material = new StandardMaterial("salt-cut limestone", scene);
  material.diffuseTexture = new Texture(limestoneUrl, scene);
  material.bumpTexture = new Texture(reliefUrl, scene);
  material.bumpTexture.level = .52;
  material.diffuseTexture.anisotropicFilteringLevel = material.bumpTexture.anisotropicFilteringLevel = 4;
  material.specularColor.set(.06,.065,.06);
  material.backFaceCulling = false;
  material.twoSidedLighting = true;

  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const sides = 48, rings = 32;
  const snow = island.site.settings.biome === "winter";
  const vertex = (v: number, a: number, layer: number) => {
    const roof = Math.sin(a), lateral = Math.cos(a);
    const seam = rockField(v*.28, a*1.45);
    const bedding = rockField(lateral*2.2, v*.60) * .18;
    const w = width(v) + .30*seam + .29*Math.sin(a*3.1 + v*.47);
    const rise = 4.25 + .43*Math.sin(v*.66 + .7) + .26*rockField(v*.28, lateral*1.7);
    const envelope = Math.pow(Math.max(0, roof), .76);
    const sit = .33;
    const wall = (w + layer*(2.45 + .85*seam + .58*Math.sin(v*.72 + a))) * lateral;
    const x = wall + midline(v) + envelope*(.47*Math.sin(v*.43) + seam*.36);
    const y = sit + envelope*(rise + (1.85 + .6*seam + .72*Math.sin(v*.35 + a))*layer) + bedding;
    const edge = Math.exp(-Math.abs(v-entrance)*.6) - Math.exp(-Math.abs(v-entrance-length)*.6);
    const z = v + edge*(.62*seam - envelope*(.9+.45*lateral) - layer*.9) + .18*rockField(v*.8, a*3.5);
    return at(x,y,z);
  };
  function surface(crossSteps: number, alongSteps: number, point: (i: number,j: number)=>Vector3,
    shade: (i: number,j: number,p:Vector3)=>Color3, coords: (i: number,j: number)=>[number,number], reverse=false) {
    const start=positions.length/3;
    for(let j=0;j<=alongSteps;j++) for(let i=0;i<=crossSteps;i++) {
      const u=i/crossSteps, v=j/alongSteps;
      const p=point(u,v), c=shade(u,v,p);
      positions.push(p.x,p.y,p.z); colors.push(c.r,c.g,c.b,1); uvs.push(...coords(u,v));
      if(i<crossSteps&&j<alongSteps) {
        const n=start+i+j*(crossSteps+1), next=n+crossSteps+1;
        if(reverse) indices.push(n,next,n+1,n+1,next,next+1);
        else indices.push(n,n+1,next,n+1,next+1,next);
      }
    }
  }
  const chalk = (p:Vector3, ambient:number, exposed:boolean) => {
    const stratum = .61 + .23*Math.sin(p.y*5.25 + .51*p.x + .15*p.z + rockField(p.x*.22,p.z*.22)*2)
      + .15*rockField(p.x*.55,p.z*.64+p.y*.63);
    const tide = clamp((1.55-p.y)*1.45);
    const cover = exposed ? clamp((p.y-5.05)*.82 + rockField(p.x*.29,p.z*.24)*.95) : 0;
    const sand = Color3.Lerp(new Color3(.79,.74,.65),new Color3(1,.97,.91),stratum);
    Color3.LerpToRef(sand,new Color3(.33,.42,.38),tide*.87,sand);
    Color3.LerpToRef(sand,snow ? new Color3(1,.99,1) : new Color3(.48,.60,.35),cover*.85,sand);
    return sand.scale(ambient);
  };
  for(const outer of [0,1]) {
    surface(sides,rings,(u,t)=>vertex(entrance+length*t,u*Math.PI,outer),
      (_u,t,p)=>chalk(p,outer ? 1 : .66 + .30*Math.pow(Math.abs(2*t-1),2.4),!!outer),
      (u,t)=>[u*3.60,t*3.2],outer===1);
  }
  // The front and sea-door arêtes join the inner vault to its eroded outer cliff.
  for(const t of [0,1]) {
    surface(sides,6,(u,k)=>vertex(entrance+t*length,u*Math.PI,k),
      (_u,k,p)=>chalk(p,.84+k*.15,true),
      (u,k)=>[u*4.2,k*.95],t===0);
  }
  const shell=new Mesh("tidal grotto • wave-cut vault and sea door",scene);
  const vd=new VertexData();vd.positions=positions;vd.colors=colors;vd.indices=indices;vd.uvs=uvs;
  const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);vd.normals=normals;vd.applyToMesh(shell);
  shell.material=material;shell.receiveShadows=true;shell.isPickable=false;shell.freezeWorldMatrix();
  shadows.addShadowCaster(shell);
  const obstacles:CaveObstacle[]=[];
  // Both walls are several metres thick. Two overlapping lines keep walkers
  // off the shell from either side and leave both arch entrances unobstructed.
  for(let v=entrance;v<=entrance+length+.1;v+=.85) for(const sign of [-1,1]) {
    const p=at(midline(v)+sign*(width(v)+1.18),0,v);
    obstacles.push({x:p.x,z:p.z,rx:1.36,rz:1.36,top:7.5});
  }
  const normal = (name:string, color:string) => {
    const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.setAll(.13);return m;
  };
  const wood=normal("pitch-soaked winch timber","#785632"), bronze=normal("aged bronze castings","#745731");
  const hemp=normal("coiled hemp","#b79561"), lamp=normal("amber lantern panes","#ffba59");
  lamp.emissiveColor.set(1,.63,.24);
  const fittings=new Map<StandardMaterial,Mesh[]>();
  function fitting(mesh: Mesh, mat: StandardMaterial) {
    mesh.material=mat;
    const batch=fittings.get(mat);
    if(batch)batch.push(mesh);else fittings.set(mat,[mesh]);
  }
  function cylinder(name:string, a:Vector3, b:Vector3, diameter:number, mat:StandardMaterial, sides=16) {
    const axis=b.subtract(a);
    const m=MeshBuilder.CreateCylinder(name,{height:axis.length(),diameter,tessellation:sides},scene);
    m.position.copyFrom(a.add(b).scale(.5));m.rotationQuaternion=Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly,axis.normalize(),m.rotationQuaternion);
    fitting(m,mat);
  }
  // A shore crew's rope drum and hanging storm lantern give the chamber a
  // human scale. Their silhouettes face the land door across the tidal pool.
  const v=9.2, u=2.05, lampPos=at(u,2.9,v+.55);
  const foot=at(u,0,v), base=island.heightAt(foot.x,foot.z);
  for(const d of [-.63,.63]) {
    cylinder("windlass cheek",at(u-.26,base,v+d),at(u,base+.96,v+d),.17,wood);
    cylinder("windlass cheek",at(u+.26,base,v+d),at(u,base+.96,v+d),.17,wood);
  }
  cylinder("oak windlass drum",at(u,base+.86,v-.77),at(u,base+.86,v+.77),.48,wood,22);
  for(let i=0;i<14;i++) {
    const d=v-.38+i*.06;
    cylinder("rope turn",at(u,base+.86,d),at(u,base+.86,d+.049),.52,hemp);
  }
  for(const d of [-.57,.57])cylinder("drum flange",at(u,base+.86,v+d),at(u,base+.86,v+d+.08),.65,bronze);
  cylinder("lantern post",at(u+.31,base,v+.91),at(u+.31,3.38,v+.91),.13,wood);
  cylinder("lantern bracket",at(u+.31,3.34,v+.91),at(u,3.34,v+.55),.09,wood);
  cylinder("lantern hanger",at(u,3.07,v+.55),at(u,3.34,v+.55),.025,bronze);
  cylinder("storm lantern",at(u,2.75,v+.55),at(u,3.02,v+.55),.21,lamp,12);
  for(const y of [2.72,3.03])cylinder("lamp cover",at(u,y,v+.55),at(u,y+.045,v+.55),.27,bronze);
  for(let i=0;i<4;i++) {
    const angle=i*Math.PI/2;
    const x=u+.112*Math.sin(angle), z=v+.55+.112*Math.cos(angle);
    cylinder("lamp cage",at(x,2.75,z),at(x,3.04,z),.018,bronze,6);
  }
  const light=new PointLight("sheltered amber flame",lampPos,scene);
  light.diffuse.set(1,.58,.27); light.intensity=night ? 2.2 : 1.2;light.range=6;
  light.includedOnlyMeshes=[shell];
  for(const [mat, meshes] of fittings) {
    const m=Mesh.MergeMeshes(meshes,true,true);
    if(m) {m.material=mat;m.isPickable=false;m.receiveShadows=true;m.freezeWorldMatrix();shadows.addShadowCaster(m);light.includedOnlyMeshes.push(m);}
  }
  obstacles.push({x:foot.x,z:foot.z,rx:.93,rz:.92,top:base+1.35});
  return obstacles;
}
