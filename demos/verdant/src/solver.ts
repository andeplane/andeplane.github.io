/** Reference players use only observations and the public command API. No state edits. */
import { conditions } from './simulation';
import { getLevel } from './levels';
import { createSession, dispatch, step } from './engine';
import type { Command, Session } from './engine';
import { segmentDistance } from './rootWorld';
import type { Point } from './rootWorld';
export type Policy='expert'|'neglect'|'overwater'|'shade'|'no-equipment';
const GRID=.12;
export function route(s:Session,destination:Point):Point[] {
 const tip=s.world.paths[s.world.active].at(-1)!;
 // A small fixed grid is sufficient for the research vessel; shortest-path distances are deterministic.
 const nodes:Point[]=[tip,destination];
 for(let y=-2.44;y<=-.14;y+=GRID)for(let x=-3.8;x<=3.8;x+=GRID)if(!s.world.rocks.some(r=>Math.hypot(r.x-x,r.y-y)<r.radius+.08))nodes.push({x,y});
 const dist=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),done=new Uint8Array(nodes.length);dist[0]=0;
 // Spatial buckets keep neighbor lookup bounded rather than scanning all node pairs.
 const buckets=new Map<string,number[]>();nodes.forEach((p,i)=>{const k=`${Math.floor(p.x/GRID)},${Math.floor(p.y/GRID)}`;const b=buckets.get(k)??[];b.push(i);buckets.set(k,b);});
 const heap:{i:number;score:number}[]=[];const push=(entry:{i:number;score:number})=>{let k=heap.push(entry)-1;while(k>0){const parent=(k-1)>>1;if(heap[parent].score<=entry.score)break;heap[k]=heap[parent];k=parent;}heap[k]=entry;};
 const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let k=0;while(k*2+1<heap.length){let child=k*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[k]=heap[child];k=child;}heap[k]=last;}return first;};
 push({i:0,score:Math.hypot(tip.x-destination.x,tip.y-destination.y)});
 while(heap.length){const {i}=pop();if(done[i])continue;done[i]=1;if(i===1)break;const p=nodes[i],bx=Math.floor(p.x/GRID),by=Math.floor(p.y/GRID);
 for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(const j of buckets.get(`${bx+dx},${by+dy}`)??[]){if(done[j])continue;const q=nodes[j],length=Math.hypot(q.x-p.x,q.y-p.y);if(length>GRID*2.2||s.world.rocks.some(r=>segmentDistance(r,p,q)<r.radius+.075))continue;const d=dist[i]+length;if(d<dist[j]){dist[j]=d;prev[j]=i;push({i:j,score:d+Math.hypot(q.x-destination.x,q.y-destination.y)});}}
 }
 if(!Number.isFinite(dist[1]))throw new Error(`Unreachable resource in ${s.levelId}`);
 const path:Point[]=[];for(let i=1;i>0;i=prev[i])path.push(nodes[i]);return path.reverse();
}
export function runEpisode(levelId:string,seed=1,policy:Policy='expert'):Session {
 let s=createSession(levelId,seed);const level=getLevel(levelId);const command=(c:Command)=>{s=dispatch(s,c).session;};
 if(policy!=='neglect'&&policy!=='overwater'&&policy!=='shade'&&policy!=='no-equipment'){
   if(s.game.species!=='flytrap')command({type:'buy',item:'drainage'});
   if(level.number===4||level.number===5)command({type:'buy',item:'fan'});
   if(level.number===6)command({type:'buy',item:'lamp'});
 }
 if(policy==='shade')command({type:'shade',value:.7});
 let waypoints:Point[]=[];let nextPatch=0;const order=level.number===4?[0,3,4,1,2]:level.roots===2?[0,3]:[0,3,4];
 const decisionTicks=Math.floor((level.mission.days*24-8)/.25);
 for(let tick=0;tick<decisionTicks+1&&s.game.status==='active';tick++){
  if(policy!=='neglect'){
    const tip=s.world.paths[s.world.active].at(-1)!;
    while(waypoints.length&&Math.hypot(tip.x-waypoints[0].x,tip.y-waypoints[0].y)<.07)waypoints.shift();
    if(!waypoints.length&&nextPatch<order.length)waypoints=route(s,s.world.deposits[order[nextPatch++]]);
    if(waypoints.length&&!s.world.target)command({type:'target',point:waypoints[0]});
  }
  const c=conditions(s.game);
  if(tick%4===0){
   if(policy==='expert'||policy==='no-equipment'){
     const moisture=s.game.species==='flytrap'?.44:s.game.species==='cactus'?.12:.30;
     if(s.game.moisture<moisture&&s.game.water>=.1)command({type:'water',amount:100});
     if(s.game.nitrogen<(s.game.species==='flytrap'?7:18)&&s.game.budget>=(s.game.species==='flytrap'?8:12))command({type:'feed',source:s.game.species==='flytrap'?'prey':'mineral'});
     const shade=s.game.species==='tomato'&&c.temperature>35?.2:0;
     if(shade!==s.game.shade)command({type:'shade',value:shade});
     const powered=s.game.equipment.includes('fan')&&s.game.energy>0;
     const vent=level.number===5?(c.daylight===0&&powered?1:c.heatwave?.35:0):c.heatwave?(powered?1:.35):0;
     if(vent!==s.game.ventilation)command({type:'ventilation',value:vent});
     if(s.game.equipment.includes('lamp')){const lamp=c.hour>=9&&c.hour<17&&c.day>=3&&c.day<=12&&s.game.energy>0;if(lamp!==s.game.lamp)command({type:'lamp',enabled:lamp});}
   }else if(policy==='overwater'&&tick%48===0){command({type:'water',amount:500});command({type:'feed',source:'mineral'});}
  }
  const batch=!waypoints.length&&nextPatch>=order.length&&tick%4===0?4:1;
  s=step(s,.25*batch);tick+=batch-1;
 }
 return s;
}
