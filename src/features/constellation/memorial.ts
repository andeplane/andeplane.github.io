import { progressAtAge, smooth } from './clock.ts'
import type { Person, StoryPoint } from './story.ts'
export const RISE_SECONDS=5
// An original seven-star shelter: a broad, asymmetric arch, with You at its
// base. The route is a simple perimeter, never a crossing star polygon.
export const MEMORIAL_SKY:Record<string,{x:number;y:number}>={
  self:{x:440,y:450},partner:{x:285,y:405},mom:{x:185,y:300},
  grandma:{x:250,y:170},grandpa:{x:575,y:135},dad:{x:700,y:265},brother:{x:610,y:390},
}
export function memorialState(person:Person,progress:number,afterEnding=0) {
  const since=person.end!==null&&person.exit!=='fade'?progress*120+afterEnding-progressAtAge(person.end)*120:-Infinity
  const hold=person.id==='brother'?1.8:0,landedFor=since-hold-RISE_SECONDS
  return {since,hold,rise:smooth((since-hold)/RISE_SECONDS),landedFor,landed:landedFor>=0,cross:smooth((since-hold-RISE_SECONDS+1)/1),distance:smooth(landedFor/4)}
}
export function memorialDestination(person:Person,deathX:number) {
  return MEMORIAL_SKY[person.id]??{x:deathX,y:260}
}
// Memorials are a lasting foreground, not old particles thrown behind the
// perspective camera. The whole shape settles gently as the view lowers.
export function projectMemorial(point:StoryPoint,tilt:number,viewHeight:number) {
  const foregroundX=400+(point.x-440)*.70
  const foregroundY=viewHeight*(.62+(point.y-300)/800*.38)
  return {x:point.x+(foregroundX-point.x)*tilt,y:point.y/800*viewHeight+(foregroundY-point.y/800*viewHeight)*tilt,scale:1-.12*tilt}
}
export function deathPeel(person:Person,age:number,x:number) {
  if(person.end===null||person.exit==='fade'||person.id==='self')return x
  return x-Math.min(150,Math.max(0,x-114))*smooth((age-person.end+6)/6)
}
export const CONSTELLATION_ORDER=['self','partner','mom','grandma','grandpa','dad','brother','self']
export function constellationSegments(people:Person[],progress:number,afterEnding=0) {
  const self=people.find(p=>p.id==='self')
  if(!self||self.end===null)return[]
  const start=progressAtAge(self.end)*120+RISE_SECONDS+.5,elapsed=progress*120+afterEnding-start
  const order=CONSTELLATION_ORDER.filter(id=>people.some(p=>p.id===id&&p.end!==null&&p.end<=self.end!&&memorialState(p,progress,afterEnding).landed))
  if(order[0]!=='self'||order.at(-1)!=='self')return[]
  return order.slice(1).map((id,i)=>({from:order[i],to:id,draw:smooth((elapsed-i*.8)/1.2)})).filter(segment=>segment.draw>0)
}
