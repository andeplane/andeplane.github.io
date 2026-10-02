import type { Command, Session } from './engine';
import type { Point } from './rootWorld';
export interface Lesson {id:string;title:string;body:string;task:string;kind:'read'|'grow'|'action'|'pause';highlight?:'vitals'|'tools'|'clock'}
export const lessons:Lesson[]=[
 {id:'welcome',title:'You are growing a living plant.',body:'Above the soil, leaves use sunlight to make sugars. Below it, you steer roots to find water and nutrients. Both parts have to survive together.',task:'This is a safe practice plant. Your saved game and supplies are kept separate.',kind:'read'},
 {id:'route-water',title:'Move your first root.',body:'The bright dot below the stem is the growing tip. Stones block it. A click sets a destination; the root grows there over time.',task:'Click the glowing “Grow here” marker below the stone. You can also hold WASD or the arrow keys to steer.',kind:'grow'},
 {id:'water-patch',title:'Find water in the soil.',body:'Blue circles marked H₂O contain water. Touch one with a root and it supplies water gradually. A patch eventually runs out.',task:'Click the glowing blue water patch. Watch your root connect to it.',kind:'grow'},
 {id:'route-nitrogen',title:'Water connected. Now find nitrogen.',body:'Gold circles marked N contain nitrogen: a mineral used to build plant tissue. It is different from the sugars made in the leaves.',task:'First click “Grow here” below the stone on the right. This route leaves room to grow around it.',kind:'grow'},
 {id:'nitrogen-patch',title:'Connect a nutrient patch.',body:'Your leaves supply carbon; your roots supply water and minerals. Growth needs all three. Nitrogen alone cannot replace light.',task:'Click the glowing gold nitrogen patch. Connected patches count toward your assignment.',kind:'grow'},
 {id:'readings',title:'Read the two survival gauges.',body:'VITALITY is plant health. CARBON RESERVES are stored sugars: roots and new tissue spend them. If reserves fall, more light may help; building more roots also costs carbon.',task:'You have connected two patches. In the real assignment, you must also reach 6.5 g of plant tissue with at least 75% vitality by day 10.',kind:'read',highlight:'vitals'},
 {id:'water-tool',title:'Try watering once.',body:'Your water allowance is finite. This tool adds 100 mL to the soil. Too much water removes air from the root zone, so repeated watering can hurt even a wilting plant.',task:'Press 2, or select WATER on the tool belt. Then click “Water here” in the soil.',kind:'action',highlight:'tools'},
 {id:'shade',title:'Try a response to heat.',body:'Shade reduces heat and water demand, but also reduces sunlight and sugar production. During a heatwave, look at the plant before deciding how much shade it needs.',task:'Press 4, or select SHADE. Then click “Apply shade here” in the soil to add 20% shade.',kind:'action',highlight:'tools'},
 {id:'equipment',title:'Spend the grant carefully.',body:'The € amount is a research grant supplied at the start of each level. Plants do not earn money. Equipment uses that grant; powered equipment also uses electricity.',task:'Press E to open equipment, then press 1 or select Drainage insert. It helps a tomato avoid waterlogged roots.',kind:'action'},
 {id:'branch',title:'Explore with another root.',body:'A branch creates another growing tip from your existing root network. The bright tip shows which one you control. Tab switches between tips.',task:'Press B, or choose “Branch a root” below. New root growth spends carbon reserves.',kind:'action'},
 {id:'pause',title:'Give yourself time to think.',body:'Game hours pass quickly. You can stop time while you inspect the plant and plan. Watch the day and hour on the clock: it stops when you pause.',task:'Time is running now. Press P, Space, or choose “Pause time” below to stop it.',kind:'pause',highlight:'clock'},
 {id:'finish',title:'Ready for your first assignment.',body:'Connect water and nitrogen early. Watch vitality and carbon reserves. When heat arrives, balance shade and cooling against the light your plant needs.',task:'P pauses. H opens the field guide. T repeats this tutorial at any time. Your real plant and grant are waiting exactly where you left them.',kind:'read'},
];
export function lessonTarget(index:number,s:Session):Point|null {
 const id=lessons[index].id;
 if(id==='route-water')return{x:-.18,y:-.95};
 if(id==='water-patch')return{x:s.world.deposits[0].x,y:s.world.deposits[0].y};
 if(id==='route-nitrogen')return{x:-.18,y:-1.42};
 if(id==='nitrogen-patch')return{x:s.world.deposits[3].x,y:s.world.deposits[3].y};
 if(id==='water-tool'||id==='shade')return{x:1.3,y:-1.9};
 return null;
}
export function lessonSatisfied(index:number,s:Session,paused:boolean):boolean {
 const id=lessons[index].id,tip=s.world.paths[s.world.active].at(-1)!;
 if(id==='route-water'||id==='route-nitrogen'){const point=lessonTarget(index,s)!;return Math.hypot(tip.x-point.x,tip.y-point.y)<.09;}
 if(id==='water-patch')return s.world.deposits[0].connected;
 if(id==='nitrogen-patch')return s.world.deposits[3].connected;
 if(id==='water-tool')return s.game.water<.89;
 if(id==='shade')return s.game.shade>=.19;
 if(id==='equipment')return s.game.equipment.includes('drainage');
 if(id==='branch')return s.world.paths.length>1;
 return id==='pause'&&paused;
}
export function lessonAllows(index:number,c:Command):boolean {
 const lesson=lessons[index];
 if(lesson.kind==='grow')return ['target','direction'].includes(c.type);
 if(lesson.id==='water-tool')return c.type==='water';
 if(lesson.id==='shade')return c.type==='shade';
 if(lesson.id==='equipment')return c.type==='buy'&&c.item==='drainage';
 if(lesson.id==='branch')return c.type==='branch';
 return false;
}
