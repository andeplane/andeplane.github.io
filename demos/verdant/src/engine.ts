/** The complete deterministic game. No rendering, browser globals, clocks, or async work. */
import { act, advance, buyEquipment, clamp, createGame, equipmentInfo, validSave } from './simulation';
import type { Action, Equipment, GameState } from './simulation';
import { absorb, branchRoot, createWorld, growRoot } from './rootWorld';
import type { Point, RootWorld } from './rootWorld';
import { getLevel, levels } from './levels';
export const STEP_HOURS=.25;
export const ROOT_UNITS_PER_HOUR=.64;
export type Command =
 | {type:'target';point:Point} | {type:'direction';point:Point} | {type:'branch'} | {type:'switch-tip';index?:number}
 | {type:'water';amount:100|250|500} | {type:'feed';source:'mineral'|'prey'} | {type:'prune'}
 | {type:'shade';value:number} | {type:'ventilation';value:number} | {type:'lamp';enabled:boolean} | {type:'buy';item:Equipment};
export interface CommandRecord {tick:number;command:Command;accepted:boolean}
export interface Result {won:boolean;stars:number;reasons:string[]}
export interface Session {engineVersion:3;levelId:string;seed:number;ticks:number;carryHours:number;game:GameState;world:RootWorld;direction:Point|null;commands:CommandRecord[];rejected:number;result:Result|null}
export interface CommandResult {session:Session;accepted:boolean;message:string}
export function createSession(levelId=levels[0].id,seed=1):Session {
 const level=getLevel(levelId);if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed must be an unsigned 32-bit integer.');
 return {engineVersion:3,levelId,seed,ticks:0,carryHours:0,game:createGame(level.species,levelId),world:createWorld(level.species,levelId,seed),direction:null,commands:[],rejected:0,result:null};
}
const finitePoint=(p:Point)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
export function dispatch(state:Session,command:Command):CommandResult {
 let game=state.game,world=state.world,direction=state.direction,message='',accepted=game.status==='active';
 if(!accepted)message='The experiment has ended.';
 else switch(command.type){
 case 'target': if(!finitePoint(command.point)||Math.abs(command.point.x)>3.9||command.point.y< -2.5||command.point.y>-.08){accepted=false;message='Aim inside the root zone.';}else {world={...world,target:{...command.point},message:''};direction=null;message='Root destination set.';}break;
 case 'direction': if(!finitePoint(command.point)){accepted=false;message='Invalid direction.';}else {const len=Math.hypot(command.point.x,command.point.y);direction=len>0?{x:command.point.x/len,y:command.point.y/len}:null;if(direction)world={...world,target:null};}break;
 case 'branch': if(world.paths.length>=8){accepted=false;message='Eight growing tips: switch to an existing one.';}else {world=branchRoot(world);direction=null;message=world.message;}break;
 case 'switch-tip': {const i=command.index??(world.active+1)%world.paths.length;if(!Number.isInteger(i)||i<0||i>=world.paths.length){accepted=false;message='Unknown root tip.';}else{world={...world,active:i,target:null,message:''};direction=null;message='Switched growing tip.';}break;}
 case 'water': if(![100,250,500].includes(command.amount)){accepted=false;message='Invalid water dose.';}else{game=act(game,`water${command.amount}` as Action);accepted=game!==state.game;message=accepted?`${command.amount} mL applied. Watch aeration.`:'Water allowance exhausted.';}break;
 case 'feed': if(!['mineral','prey'].includes(command.source)){accepted=false;message='Unknown nutrient source.';}else{game=act(game,command.source==='prey'?'prey':'feed');accepted=game!==state.game;message=accepted?command.source==='prey'?'Prey supplies nitrogen, with a carbon cost.':'Nitrogen added. Dissolved salts also increased.':'Cannot supply these nutrients.';}break;
 case 'prune': game=act(game,'prune');accepted=game!==state.game;message=accepted?'Canopy reduced: less light capture and water demand.':'This specimen cannot be pruned.';break;
 case 'buy': if(!equipmentInfo.some(i=>i.id===command.item)){accepted=false;message='Unknown equipment.';}else{game=buyEquipment(game,command.item);accepted=game!==state.game;message=accepted?`${equipmentInfo.find(i=>i.id===command.item)!.name} installed.`:'Already installed or insufficient grant.';if(accepted&&command.item==='lamp')game={...game,lamp:true};if(accepted&&command.item==='fan')game={...game,ventilation:.5};}break;
 case 'shade': if(!Number.isFinite(command.value)||command.value<0||command.value>.7){accepted=false;message='Shade must be between 0 and 70%.';}else{game={...game,shade:command.value};message=`Shade: ${Math.round(command.value*100)}%.`;}break;
 case 'ventilation': {const max=game.equipment.includes('fan')&&game.energy>0?1:.35;if(!Number.isFinite(command.value)||command.value<0||command.value>max){accepted=false;message='Forced ventilation requires a powered fan.';}else{game={...game,ventilation:command.value};message=`Ventilation: ${Math.round(command.value*100)}%.`;}break;}
 case 'lamp': if(typeof command.enabled!=='boolean'||!game.equipment.includes('lamp')||(command.enabled&&game.energy<=0)){accepted=false;message='An installed light and electricity are required.';}else{game={...game,lamp:command.enabled};message=command.enabled?'Grow light enabled.':'Grow light off.';}break;
 default: accepted=false;message='Unknown command.';
 }
 const record:CommandRecord={tick:state.ticks,command:structuredClone(command),accepted};
 return {session:{...state,game,world,direction,commands:[...state.commands,record],rejected:state.rejected+(accepted?0:1)},accepted,message};
}
/** Any time batch follows exactly the same quarter-hour rules, including root construction. */
export function step(state:Session,hours:number):Session {
 if(!Number.isFinite(hours)||hours<0)throw new Error('Advance time must be finite and non-negative.');
 if(state.game.status!=='active'||hours===0)return state;
 const total=state.carryHours+hours,steps=Math.floor(total/STEP_HOURS+1e-9);
 if(!steps)return {...state,carryHours:total};
 let s:Session={...state,game:{...state.game,equipment:[...state.game.equipment],logs:[...state.game.logs],history:[...state.game.history],seen:[...state.game.seen]},world:{...state.world},carryHours:Math.max(0,total-steps*STEP_HOURS)};
 for(let i=0;i<steps&&s.game.status==='active';i++){
   // Subdivide geometric extension so obstacles cannot be crossed even at high time speed.
   for(let j=0;j<4&&(s.direction||s.world.target);j++){const r=growRoot(s.world,s.game,s.direction,ROOT_UNITS_PER_HOUR*STEP_HOURS/4);s.world=r.world;s.game=r.game;if(r.blocked){s.direction=null;break;}}
   const a=absorb(s.world,s.game,STEP_HOURS);s.world=a.world;s.game=advance(a.game,STEP_HOURS,true);s.ticks++;
   if(s.game.status!=='active'){
     const level=getLevel(s.levelId),reasons:string[]=[];
     if(s.game.health<75)reasons.push(`Vitality ${s.game.health.toFixed(0)}% is below 75%.`);
     if(s.game.biomass<level.mission.target)reasons.push(`Biomass ${s.game.biomass.toFixed(2)} g is below ${level.mission.target.toFixed(1)} g.`);
     if(s.world.connections<level.roots)reasons.push(`Roots reached ${s.world.connections}/${level.roots} required resource patches.`);
     const won=reasons.length===0;
     const preserved=s.game.budget>=level.mission.budget*.2&&s.game.water>=level.mission.water*.15&&s.game.energy>=level.mission.energy*.1;
     const stars=won?1+(s.game.health>=90?1:0)+(preserved?1:0):0;
     s.result={won,stars,reasons};s.game={...s.game,status:won?'success':'failed',logs:[{time:s.game.time,title:won?'Assignment completed':'Assignment ended',text:won?`${stars} research stars earned. The next assignment is unlocked.`:reasons.join(' '),type:'event' as const},...s.game.logs].slice(0,80)};s.carryHours=0;s.direction=null;s.world={...s.world,target:null};
   }
 }
 return s;
}
export function replay(levelId:string,seed:number,records:CommandRecord[],untilTick:number):Session {
 let s=createSession(levelId,seed);let previous=0;
 for(const r of records){if(!Number.isInteger(r.tick)||r.tick<previous||r.tick>untilTick)throw new Error('Replay commands must be in tick order.');s=step(s,(r.tick-s.ticks)*STEP_HOURS);const result=dispatch(s,r.command);if(result.accepted!==r.accepted)throw new Error('Replay command acceptance diverged.');s=result.session;previous=r.tick;}
 return step(s,(untilTick-s.ticks)*STEP_HOURS);
}
export const serialize=(s:Session)=>JSON.stringify(s);
export function deserialize(text:string):Session {
 const s=JSON.parse(text) as Session;
 if(!s||s.engineVersion!==3||!getLevel(s.levelId,false)||!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!Number.isInteger(s.ticks)||s.ticks<0||s.ticks>2400||!Number.isFinite(s.carryHours)||s.carryHours<0||s.carryHours>=STEP_HOURS||!validSave(s.game))throw new Error('Invalid engine save.');
 const baseline=createSession(s.levelId,s.seed),w=s.world;
 if(s.game.levelId!==s.levelId||s.game.species!==baseline.game.species||Math.abs(s.game.time-(8+s.ticks*STEP_HOURS))>1e-7||!w||w.species!==s.game.species||!Array.isArray(w.paths)||w.paths.length<1||w.paths.length>8||w.paths.some(p=>!Array.isArray(p)||p.length<1||p.length>10000||p.some(q=>!finitePoint(q)||Math.abs(q.x)>3.9||q.y< -2.5||q.y>-.06))||!Number.isInteger(w.active)||w.active<0||w.active>=w.paths.length||!Number.isFinite(w.totalLength)||w.totalLength<0||typeof w.message!=='string'||(w.target&&!finitePoint(w.target))||(s.direction&&!finitePoint(s.direction)))throw new Error('Invalid root save.');
 if(!Array.isArray(w.rocks)||JSON.stringify(w.rocks)!==JSON.stringify(baseline.world.rocks)||!Array.isArray(w.deposits)||w.deposits.length!==baseline.world.deposits.length||w.deposits.some((d,i)=>{const b=baseline.world.deposits[i];return !d||d.id!==b.id||d.x!==b.x||d.y!==b.y||d.radius!==b.radius||d.kind!==b.kind||d.initial!==b.initial||!Number.isFinite(d.amount)||d.amount<0||d.amount>b.initial||typeof d.connected!=='boolean';})||w.connections!==w.deposits.filter(d=>d.connected).length||!Array.isArray(s.commands)||s.commands.some(r=>!r||!Number.isInteger(r.tick)||r.tick<0||r.tick>s.ticks||typeof r.accepted!=='boolean'||!r.command||typeof r.command.type!=='string')||!Number.isInteger(s.rejected)||s.rejected<0)throw new Error('Invalid resource save.');
 if((s.game.status==='active')!==(s.result===null)||s.result&&(!Array.isArray(s.result.reasons)||typeof s.result.won!=='boolean'||s.result.won!==(s.game.status==='success')||!Number.isInteger(s.result.stars)||s.result.stars<0||s.result.stars>3))throw new Error('Invalid result save.');
 return s;
}
export interface Campaign {version:1;best:Record<string,number>}
export const newCampaign=():Campaign=>({version:1,best:{}});
export function unlocked(c:Campaign,id:string):boolean {const l=getLevel(id);return l.number===1||!!c.best[levels[l.number-2].id];}
export function recordWin(c:Campaign,s:Session):Campaign {if(!s.result?.won)return c;return{version:1,best:{...c.best,[s.levelId]:Math.max(c.best[s.levelId]??0,s.result.stars)}};}
export function restoreCampaign(text:string|null):Campaign {try{const c=JSON.parse(text??'null') as Campaign;if(c.version!==1||!c.best||Object.entries(c.best).some(([id,n])=>!getLevel(id,false)||!Number.isInteger(n)||n<1||n>3))return newCampaign();return c;}catch{return newCampaign();}}
