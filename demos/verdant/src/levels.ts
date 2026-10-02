import { missionFor } from './missions';
import type { Mission, Species } from './missions';
export interface MapPatch { x:number; y:number; radius:number; kind:'water'|'nitrogen'; amount:number }
export interface MapRock { x:number; y:number; radius:number }
export interface Level { id:string; number:number; species:Species; title:string; lesson:string; roots:number; mission:Mission; patches:MapPatch[]; rocks:MapRock[] }
const rocks:MapRock[]=[{x:-.65,y:-.52,radius:.24},{x:.32,y:-.95,radius:.25},{x:1.68,y:-1.7,radius:.33},{x:-1.85,y:-1.7,radius:.28},{x:2.8,y:-.75,radius:.25}];
const patches=(water:number,nitrogen:number):MapPatch[]=>[
 {x:-1.35,y:-.85,radius:.4,kind:'water',amount:water}, {x:2.4,y:-1.6,radius:.48,kind:'water',amount:water},
 {x:-2.8,y:-2.05,radius:.5,kind:'water',amount:water}, {x:.8,y:-1.3,radius:.28,kind:'nitrogen',amount:nitrogen},
 {x:-2.5,y:-.5,radius:.28,kind:'nitrogen',amount:nitrogen}];
function level(number:number,id:string,species:Species,title:string,lesson:string,roots:number,changes:Partial<Mission>,map:MapPatch[],terrain:MapRock[]):Level {
 const mission={...missionFor(species),...changes,title};mission.objective=`Reach ${mission.target.toFixed(1)} g, ≥75% vitality, and ${roots} connected soil patches by day ${mission.days}.`;
 return {id,number,species,title,lesson,roots,mission,patches:map,rocks:terrain};
}
export const levels:Level[]=[
 level(1,'first-roots','tomato','First roots','Roots use carbon to reach water and minerals. Establish a network before the heat arrives.',2,
 {days:10,target:6.5,budget:95,water:.9,initialN:50,description:'Guide roots around stones to reach moisture and nitrogen. Establish the tomato before the first heatwave.'},patches(.35,35),rocks),
 level(2,'after-sunset','cactus','After sunset','CAM separates nighttime CO₂ uptake from daytime assimilation. Restraint beats frequent watering.',2,
 {days:18,target:4.0,budget:85,water:.45,description:'A desert succulent gathers carbon at night. Explore carefully: building roots spends the reserves it needs for growth.'},patches(.24,25),rocks.map(r=>({...r,x:-r.x}))),
 level(3,'hungry-bog','flytrap','The hungry bog','Prey supplies nitrogen, not the sunlight needed to build carbohydrates. Preserve wet, aerated soil.',3,
 {days:16,target:5.8,budget:64,water:1.1,description:'A bog specialist needs steady moisture and a modest supply of mineral nutrients. Establish three resource connections; spend your grant carefully.'},patches(.38,7).map((p,i)=>({...p,x:i===3?1.5:p.x,y:i===3?-1.15:p.y})),rocks.map(r=>({...r,y:Math.max(-2.3,r.y-.12)}))),
 level(4,'under-glass','tomato','Heat under glass','Cooling, humidity, transpiration, and carbon gain are coupled. Shade alone cannot solve a heatwave.',3,
 {days:12,target:8.0,budget:90,water:.45,energy:3,initialN:50,temperature:26,heatStart:4,heatEnd:9,heatBoost:8,description:'A prolonged heatwave hits a dry greenhouse. Reach deep moisture, manage cooling, and build enough biomass before the grant runs out.'},patches(.30,45).map((p,i)=>({...p,x:i===0?-1.5:p.x,y:i===0?-1.4:p.y})),[...rocks,{x:-.92,y:-1.1,radius:.24}]),
 level(5,'warm-nights','cactus','Warm nights','Respiration runs at night too. Target cooling when the CAM plant takes in CO₂, with a finite electricity allowance.',3,
 {days:20,target:4.0,budget:92,water:.4,energy:3.6,temperature:30,nightBoost:5,heatBoost:4,description:'Warm nights threaten the cactus carbon budget. A fan can help, but continuous cooling will exhaust the energy allowance.'},patches(.22,30).map(p=>({...p,x:-p.x})),[...rocks.map(r=>({...r,x:-r.x})),{x:.8,y:-1.55,radius:.26}]),
 level(6,'clouded-bog','flytrap','The clouded bog','Extra nitrogen cannot replace light. Supplemental photons help only while electricity and water remain.',3,
 {days:18,target:7.1,budget:80,water:1.0,energy:3.5,initialN:6,light:.58,cloudStart:3,cloudEnd:12,cloudFactor:.55,heatBoost:5,description:'A long cloudy spell limits photosynthesis. Budget a grow light, find moisture, and provide enough nitrogen without salt buildup.'},patches(.30,7).map((p,i)=>({...p,y:i===4?-1.05:p.y})),[...rocks,{x:-2,y:-.7,radius:.3}]),
];
export function getLevel(id:string,strict?:true):Level;
export function getLevel(id:string,strict:false):Level|undefined;
export function getLevel(id:string,strict=true):Level|undefined {const l=levels.find(l=>l.id===id);if(!l&&strict)throw new Error(`Unknown level: ${id}`);return l;}
export const nextLevel=(id:string)=>levels[levels.findIndex(l=>l.id===id)+1]??null;
