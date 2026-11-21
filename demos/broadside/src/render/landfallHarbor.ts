import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { GeneratedIsland } from "../game/landfall";
import { timberTexture } from "../shared/pirate-world/render/timber";

type Point = { x: number; z: number };
export interface HarborDeck {
  center: Point;
  /** Contains just the pier boards. The skiff and surrounding sea remain off limits. */
  heightAt(x: number, z: number): number | undefined;
}

const deckLevel = .70;
function berthFor(island: GeneratedIsland) {
  const { town, settings } = island.site, floor = island.heightAt;
  if (!town.paths.length) return null;
  const preferredLength = settings.settlement === "village" ? 8.8 : 6.7;
  const width = settings.settlement === "village" ? 2.3 : 1.9;
  const approaches = new Set(town.paths.filter(path => path.width >= 2).flatMap(path => [path.a, path.b]));
  let best: { x: number; z: number; dx: number; dz: number; length: number; width: number; side: number } | null = null;
  let bestScore = Infinity;
  for (const entry of approaches) {
    for (let arc = 0; arc < 36; arc++) {
      const angle = arc * Math.PI / 18, vx = Math.sin(angle), vz = Math.cos(angle);
      for (let r = .75; r < Math.min(38,bestScore); r += .75) {
        let x = entry.x + vx*r, z = entry.z + vz*r;
        if (town.houses.some(h => Math.abs(x-h.x) < h.depth/2+.55 && Math.abs(z-h.z) < h.frontage/2+.55)) break;
        const elevation = floor(x,z);
        if (elevation > deckLevel) continue;
        // Bisect the bracket: on a headland a single marching step can jump
        // from dry land to open water. The landward deck end must meet terrain.
        let low = r-.75, high = r;
        for(let n=0;n<5;n++) {
          const mid = (low+high)/2;
          if(floor(entry.x+vx*mid,entry.z+vz*mid)>deckLevel) low=mid; else high=mid;
        }
        x=entry.x+vx*high; z=entry.z+vz*high;
        const gx = floor(x-.6,z)-floor(x+.6,z), gz = floor(x,z-.6)-floor(x,z+.6);
        const slope = Math.hypot(gx,gz);
        const dx = slope > .02 ? gx/slope : vx, dz = slope > .02 ? gz/slope : vz;
        if (dx*vx + dz*vz < .42) break; // a glancing approach crosses the bank
        const at = (u: number, t: number) => floor(x + dz*u + dx*t, z - dx*u + dz*t);
        for (let length=preferredLength;length<=preferredLength+7;length+=1.4) {
          const score = r + (length-preferredLength)*1.6 + (1-dx*vx-dz*vz)*2;
          if (score >= bestScore) break;
          if (at(0,length/2) > .30 || at(0,length) > -.3 || at(0,-.6) < .32) continue;
          if (Array.from({length:9},(_,i)=>(i+1)*length/9)
            .some(t => [-width*.48,0,width*.48].some(u=>at(u,t)>deckLevel+.03))) continue;
          for (const side of [-1,1]) {
            const boat = side*(width/2 + 1.38);
            if ([-.85,0,.85].some(offset => [length-4.5,length-2,length+.4]
              .some(t => at(boat+offset,t) > -.30))) continue;
            // A long shelf needs a longer pier to reach navigable water.
            best = {x,z,dx,dz,width,length,side}; bestScore=score;
            break;
          }
        }
        break;
      }
    }
  }
  return best;
}

/** A terrain-sited working landing, built in local lateral/out-to-sea coordinates. */
export function buildHarbor(scene: Scene, island: GeneratedIsland, shadows: ShadowGenerator): HarborDeck | null {
  const berth = berthFor(island);
  if (!berth) return null;
  const { x, z, dx, dz, width, length, side } = berth;
  const material = new StandardMaterial("salt-weathered harbor paint and rope",scene);
  material.specularColor.setAll(.065);
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  const timber = new StandardMaterial("open-grained landing boards",scene);
  timber.diffuseTexture = timberTexture(scene, "pier timber, salt and knots");
  timber.specularColor.setAll(.035);
  const batches = new Map([[material, [] as Mesh[]],[timber, [] as Mesh[]]]);
  const V = (u: number,y: number,t: number) => new Vector3(u,y,t);
  const paint = (mesh: Mesh,tint: string,mat = material) => {
    const c=Color3.FromHexString(tint), colors = new Float32Array(mesh.getTotalVertices()*4);
    for(let i=0;i<colors.length;i+=4){colors[i]=c.r; colors[i+1]=c.g; colors[i+2]=c.b; colors[i+3]=1;}
    mesh.setVerticesData("color",colors);
    mesh.material=mat; batches.get(mat)!.push(mesh); return mesh;
  };
  const timberBox = (u: number,y: number,t: number,w: number,h: number,d: number,color: string) => {
    const b=MeshBuilder.CreateBox("salted dock timber",{width:w,height:h,depth:d},scene);
    b.position.set(u,y,t);return paint(b,color,timber);
  };
  const tube = (name:string,path:Vector3[],r:number,color:string,mat=material) =>
    paint(MeshBuilder.CreateTube(name,{path,radius:r,tessellation:8,cap:Mesh.CAP_ALL},scene),color,mat);
  const strands = ["#f3e4ba","#fdf2c8","#eee4bf","#e8d4b4","#f6ebcc"];
  for(const rail of [-1,1]) {
    timberBox(rail*width*.38,deckLevel-.23,length*.5,.18,.32,length+.8,"#c8c2ab");
    for(let j=0;j<4;j++){
      const t=j*length/3, u=rail*(width/2-.09);
      const bed=island.heightAt(x+dz*u+dx*t,z-dx*u+dz*t);
      const top = deckLevel + (j === 0 ? .1 : .44);
      tube("tide-marked mooring pile",[V(u,bed-.25,t),V(u,top,t)],.13,"#bdb79f",timber);
      if(j) {
        const turns=Array.from({length:39},(_,i)=>V(u+Math.cos(i*.5)*.141,top-.19+i*.0025,t+Math.sin(i*.5)*.141));
        tube("turns of tarred rope",turns,.023,"#9f8763");
      }
    }
  }
  const boardCount=Math.ceil((length+.85)/.31), pitch=(length+.85)/boardCount;
  for(let i=0;i<boardCount;i++){
    const plank=timberBox(0,deckLevel-.061,-.72+(i+.5)*pitch,width+.05*Math.sin(i*3.2),.122,pitch-.012,strands[i%strands.length]!);
    plank.rotation.y=Math.sin(i*2.9)*.004;
  }

  // A double-ended clinker hull. Each strake flares from the keel and the
  // sheer rises at the stems; the inside stays open between the three thwarts.
  const boat=side*(width/2+1.38), mid=length-2.1, half=2.36;
  const hullPoint=(rail:number,i:number,band:number)=>{
    const f=i/18, belly=Math.pow(Math.max(.001,Math.sin(Math.PI*f)),.76);
    const flare=[0,.43,.71,.91,1], height=[-.22,-.10,.12,.35,.51];
    return V(boat+rail*belly*.9*flare[band]!,height[band]!+.20*(1-belly),mid+(f*2-1)*half);
  };
  const hullPaint=["#453b30","#78583e","#377279","#b69b6e"];
  for(const rail of [-1,1]){
    for(let j=0;j<4;j++){
      const strip=Array.from({length:2},(_,k)=>Array.from({length:19},(_,i)=>hullPoint(rail,i,j+k)));
      paint(MeshBuilder.CreateRibbon("lapstrake fishing boat",{pathArray:strip,sideOrientation:Mesh.DOUBLESIDE},scene),hullPaint[j]!);
    }
    tube("bent oak gunwale",Array.from({length:19},(_,i)=>hullPoint(rail,i,4)),.055,"#cdac7c");
  }
  // A raised plank sole covers the animated sea surface inside the hull.
  // Each board narrows towards the stems along the same curved hull sections.
  for(let board=0;board<5;board++) {
    const pathArray=[board,board+1].map(edge => Array.from({length:19},(_,i)=>{
      const left=hullPoint(-1,i,2),right=hullPoint(1,i,2);
      const p=Vector3.Lerp(left,right,edge/5);
      p.y+=.04;
      return p;
    }));
    paint(MeshBuilder.CreateRibbon("shaped floorboards",{pathArray,sideOrientation:Mesh.DOUBLESIDE},scene),
      board%2 ? "#956944" : "#a37a54");
  }
  for(const i of [5,9,13]){
    const a=hullPoint(-1,i,3),b=hullPoint(1,i,3);
    timberBox(boat,.33,a.z,b.x-a.x,.085,.22,"#edcca4");
  }
  const mast = mid+.52;
  tube("fishing skiff mast",[V(boat,.12,mast),V(boat+.055,3.45,mast-.08)],.058,"#b38c59");
  tube("lug yard",[V(boat,2.62,mid-1.42),V(boat,3.21,mid+1.48)],.052,"#8b694b");
  tube("gathered ochre sail",[V(boat,2.58,mid-1.36),V(boat-.055,2.54,mid-.7),
    V(boat+.035,2.73,mid+.05),V(boat-.02,2.85,mid+.79),V(boat,3.12,mid+1.41)],.13,"#dfad73");
  for(const f of [.18,.49,.79]){
    const t=mid-1.36+2.77*f, y=2.54+f*.53;
    tube("sail gasket",[V(boat-.14,y+.17,t),V(boat-.15,y-.04,t),V(boat,y-.12,t),V(boat+.14,y,t)],.025,"#795f49");
  }
  for(const end of [-1,1]){
    const stem = mid+end*half;
    tube("mast stay",[V(boat,.67,stem),V(boat+.05,3.38,mast-.08)],.019,"#a38e70");
    const cleat = end < 0 ? 2*length/3 : length, u=side*(width/2-.09);
    tube("boat painter",[V(boat,.65,stem),V((u+boat)/2,.40,(cleat+stem)/2),V(u,deckLevel+.36,cleat)],.03,"#a89269");
  }

  for(const [mat,parts] of batches) {
    const mesh=Mesh.MergeMeshes(parts,true,true)!;
    mesh.name=mat === timber ? "village landing jetty" : "moored fishing skiff";
    mesh.material=mat; mesh.position.set(x,0,z);mesh.rotation.y=Math.atan2(dx,dz);
    mesh.freezeWorldMatrix();mesh.receiveShadows=true;mesh.isPickable=false;
    shadows.addShadowCaster(mesh);
  }
  return {
    center:{x:x+dx*length/2,z:z+dz*length/2},
    heightAt(px,pz) {
      const u=(px-x)*dz-(pz-z)*dx, t=(px-x)*dx+(pz-z)*dz;
      return Math.abs(u)<=width/2-.12 && t>=-.72 && t<=length+.13 ? deckLevel : undefined;
    },
  };
}
