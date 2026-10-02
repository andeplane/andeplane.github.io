import { clamp } from './simulation';
import { getLevel } from './levels';
import type { GameState, Species } from './simulation';
export interface Point { x:number; y:number }
export interface Deposit { id:number; x:number; y:number; radius:number; kind:'water'|'nitrogen'; amount:number; initial:number; connected:boolean }
export interface Rock { x:number; y:number; radius:number }
export interface RootWorld { species:Species; paths:Point[][]; active:number; deposits:Deposit[]; rocks:Rock[]; target:Point|null; totalLength:number; connections:number; message:string }
export function createWorld(species:Species, levelId?:string, seed=1):RootWorld {
  const water=species==='cactus'?.28:species==='flytrap'?.5:.42;
  const deposits:Deposit[]=[{id:0,x:-1.35,y:-.85,radius:.4,kind:'water',amount:water,initial:water,connected:false},{id:1,x:2.4,y:-1.6,radius:.48,kind:'water',amount:water,initial:water,connected:false},{id:2,x:-2.8,y:-2.05,radius:.5,kind:'water',amount:water,initial:water,connected:false},{id:3,x:.8,y:-1.3,radius:.28,kind:'nitrogen',amount:species==='flytrap'?8:40,initial:species==='flytrap'?8:40,connected:false},{id:4,x:-2.5,y:-.5,radius:.28,kind:'nitrogen',amount:species==='flytrap'?6:35,initial:species==='flytrap'?6:35,connected:false}];
  let terrain:Rock[]=[{x:-.65,y:-.52,radius:.24},{x:.32,y:-.95,radius:.25},{x:1.68,y:-1.7,radius:.33},{x:-1.85,y:-1.7,radius:.28},{x:2.8,y:-.75,radius:.25}];
  if(levelId){const l=getLevel(levelId);let rng=seed>>>0;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};deposits.splice(0,deposits.length,...l.patches.map((p,id)=>({...p,id,x:p.x+(random()-.5)*.10,y:p.y+(random()-.5)*.08,initial:p.amount,connected:false})));terrain=l.rocks.map(r=>({...r}));}
  return{species,paths:[[{x:0,y:-.06},{x:0,y:-.26}]],active:0,deposits,rocks:terrain,target:null,totalLength:.2,connections:0,message:''};
}
export function branchRoot(w:RootWorld):RootWorld {
  if(w.paths.length>=8)return{...w,message:'Eight growing tips. Press Tab to switch between them.'};
  const path=w.paths[w.active];const source=path[Math.max(0,Math.floor(path.length*.55))];
  return{...w,paths:[...w.paths,[{...source}]],active:w.paths.length,target:null,message:'A new root tip. Growth uses carbohydrate reserves.'};
}
export function growRoot(w:RootWorld,s:GameState,direction:Point|null,distance:number):{world:RootWorld;game:GameState;blocked:boolean} {
  if(s.status!=='active'||s.carbon<.025)return{world:w,game:s,blocked:false};
  const path=w.paths[w.active],tip=path.at(-1)!;let dx=direction?.x||0,dy=direction?.y||0;
  if(w.target&&!direction){dx=w.target.x-tip.x;dy=w.target.y-tip.y;distance=Math.min(distance,Math.hypot(dx,dy));}
  distance=Math.max(0,Math.min(distance,(s.carbon-.025)/.075));
  const len=Math.hypot(dx,dy);if(len<.001)return{world:w,game:s,blocked:false};
  const p={x:clamp(tip.x+dx/len*distance,-3.9,3.9),y:clamp(tip.y+dy/len*distance,-2.5,-.08)};
  if(w.rocks.some(r=>segmentDistance(r,tip,p)<r.radius+.035))return{world:{...w,target:null,message:'Rock ahead. Grow around it.'},game:s,blocked:true};
  const travelled=Math.hypot(p.x-tip.x,p.y-tip.y);if(travelled<.0001)return{world:{...w,target:null},game:s,blocked:true};
  const paths=w.paths.map((points,i)=>i===w.active?[...points,p]:points);
  const deposits=w.deposits.map(d=>({...d,connected:d.connected||Math.hypot(p.x-d.x,p.y-d.y)<d.radius+.08}));
  const connections=deposits.filter(d=>d.connected).length;
  const target=w.target&&Math.hypot(p.x-w.target.x,p.y-w.target.y)<.05?null:w.target;
  const world={...w,paths,deposits,target,totalLength:w.totalLength+travelled,connections,message:connections>w.connections?'Root hairs reached a resource patch. Uptake will continue over time.':''};
  return{world,game:{...s,carbon:s.carbon-travelled*.075},blocked:false};
}
export function absorb(w:RootWorld,s:GameState,hours:number):{world:RootWorld;game:GameState} {
  let moisture=s.moisture,nitrogen=s.nitrogen;
  const capacity=s.equipment.includes('drainage')?.49:s.species==='flytrap'?.7:.6;
  const deposits=w.deposits.map(d=>{if(!d.connected||d.amount<=0)return d;
    const amount=Math.min(d.amount,d.kind==='water'?Math.max(0,Math.min(.008*hours,(capacity-moisture)*2)):1.5*hours);
    if(d.kind==='water'){if(moisture>=capacity)return d;moisture=Math.min(capacity,moisture+amount/2);}else nitrogen+=amount;
    return{...d,amount:Math.max(0,d.amount-amount)};
  });return{world:{...w,deposits},game:{...s,moisture,nitrogen}};
}

export function segmentDistance(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y;const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
