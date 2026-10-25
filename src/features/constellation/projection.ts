import { clamp, continuingYear, smooth } from './clock.ts'
import { COLORS, SAMPLE, pathX, presentY } from './story.ts'
import type { Person, StoryPoint } from './story.ts'
export const cameraAmount=(progress:number)=>smooth((progress*120-96)/20)
export function projectPoint(point:StoryPoint,progress:number,viewHeight:number) {
 const tilt=cameraAmount(progress),depth=(point.year-10)/18
 const scale=Math.min(3,1/Math.max(.1,.6+depth*.55))
 const targetX=430+(point.x-430)*scale,targetY=viewHeight*(.16+.44*scale)
 return {x:point.x+(targetX-point.x)*tilt,y:point.y/800*viewHeight+(targetY-point.y/800*viewHeight)*tilt,scale:1+(scale-1)*tilt}
}
export interface FutureLife {
 id:string;parent:string;born:number;generation:number;head:StoryPoint;points:StoryPoint[];color:string;opacity:number;twinkle:number;birth:number
}
const countAt=(generation:number)=>Math.min(64,4*Math.pow(2,generation))
const birthAt=(generation:number,index:number)=>92+generation*24+index/countAt(generation)*20
const laneAt=(generation:number,index:number)=>220+(index+.5)/countAt(generation)*650+Math.sin(generation*.7)*5
function laneX(generation:number,index:number,year:number,root:Person,people:Person[]) {
 const born=birthAt(generation,index)
 const parentIndex=generation>0?Math.floor(index*countAt(generation-1)/countAt(generation)):0
 const parentX=generation===0?pathX(root,people.indexOf(root),people.length,born,people):laneAt(generation-1,parentIndex)+Math.sin(born*.22+parentIndex)*3
 const grow=smooth((year-born)/10)
 return parentX+(laneAt(generation,index)-parentX)*grow+Math.sin(year*.22+index)*3*grow
}
// Individual lives, not a capped decorative tree. New generations are generated
// from world time forever, while the visible window stays bounded for rendering.
export function futureLives(progress:number,afterEnding=0,people:Person[]=SAMPLE):FutureLife[] {
 const now=continuingYear(progress,afterEnding),seconds=progress*120+afterEnding
 if(now<92)return[]
 const roots=people.filter(p=>p.id==='grandchild-1'||p.id==='grandchild-2')
 if(!roots.length)return[]
 const last=Math.max(0,Math.floor((now-92)/24)),first=Math.max(0,last-4)
 const lives:FutureLife[]=[]
 for(let generation=first;generation<=last;generation++)for(let index=0;index<countAt(generation);index++) {
  const born=birthAt(generation,index),age=now-born
  if(age<0||age>90)continue
  const root=roots[index%roots.length],year=Math.min(now,born+82)
  const point=(year:number):StoryPoint=>({x:laneX(generation,index,year,root,people),y:presentY(now)+(now-year)*40,year})
  const head=point(year),points:StoryPoint[]=[]
  for(let sample=born;sample<year;sample+=2)points.push(point(sample))
  points.push(head)
  const parentIndex=generation>0?Math.floor(index*countAt(generation-1)/countAt(generation)):0
  lives.push({id:`future-${generation}-${index}`,parent:generation?`future-${generation-1}-${parentIndex}`:root.id,born,generation,head,points,color:COLORS[(index+generation*3+6)%COLORS.length],opacity:smooth(age/.65)*(1-smooth((age-82)/8)),twinkle:.7+.3*Math.sin(seconds*(.7+index%3*.12)+index*2.7+generation),birth:age<1.6?Math.sin(Math.PI*age/1.6):0})
 }
 return lives.sort((a,b)=>b.born-a.born).slice(0,160).reverse()
}
