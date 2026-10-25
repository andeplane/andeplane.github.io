import { progressAtAge, smooth } from './clock.ts'
import type { Person } from './story.ts'
const RISE_SECONDS=2.4
// A remembered life has a place in the sky, separate from its finished trail.
const SKY:Record<string,{x:number;y:number}>={
  grandma:{x:180,y:170},grandpa:{x:680,y:130},mom:{x:150,y:335},dad:{x:650,y:290},
  brother:{x:420,y:240},partner:{x:260,y:405},
}
export function memorialState(person:Person,progress:number,afterEnding=0) {
  const since=person.end!==null&&person.exit!=='fade'?progress*120+afterEnding-progressAtAge(person.end)*120:-Infinity
  const hold=person.id==='brother'?1.8:0
  const rise=smooth((since-hold)/RISE_SECONDS),landedFor=since-hold-RISE_SECONDS
  const ringProgress=Math.max(0,Math.min(1,landedFor/1.4))
  const pulse=landedFor>=0&&landedFor<1.4?Math.sin(Math.PI*ringProgress):0
  return {since,hold,rise,landed:landedFor>=0,pulse,ringRadius:7+24*ringProgress,ringOpacity:pulse*.65,cross:smooth((since-hold-RISE_SECONDS+.5)/.5),distance:smooth(landedFor/3)}
}
export function memorialDestination(person:Person,deathX:number) {
  return SKY[person.id]??{x:deathX,y:person.id==='self'?450:260}
}
export function deathPeel(person:Person,age:number,x:number) {
  if(person.end===null||person.exit==='fade'||person.id==='self')return x
  return x-Math.min(190,Math.max(0,x-114))*smooth((age-person.end+3)/3)
}
export const CONSTELLATION_ORDER=['self','partner','mom','grandma','grandpa','dad','brother','self']
export function constellationSegments(people:Person[],progress:number,afterEnding=0) {
  const self=people.find(p=>p.id==='self')
  if(!self||self.end===null)return[]
  const start=progressAtAge(self.end)*120+2.7,elapsed=progress*120+afterEnding-start
  const order=CONSTELLATION_ORDER.filter(id=>people.some(p=>p.id===id&&p.end!==null&&p.end<=self.end!&&memorialState(p,progress,afterEnding).landed))
  if(order[0]!=='self'||order.at(-1)!=='self')return[]
  return order.slice(1).map((id,i)=>({from:order[i],to:id,draw:smooth((elapsed-i*.6)/.8)})).filter(segment=>segment.draw>0)
}
