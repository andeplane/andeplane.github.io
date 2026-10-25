import { continuingYear, smooth } from './clock.ts'
import { COLORS, SAMPLE, pathX, presentY } from './story.ts'
import type { Person, StoryPoint } from './story.ts'
// The position stays anchored to the viewer's life. Only the angle changes.
export const CAMERA_ANGLE_DEGREES=30
export const cameraAmount=(progress:number)=>smooth((progress*120-94)/16)
export function projectPoint(point:StoryPoint,progress:number,viewHeight:number,_viewYear=100) {
 const tilt=cameraAmount(progress),angle=CAMERA_ANGLE_DEGREES*Math.PI/180
 const eyeHeight=288,behind=eyeHeight/Math.tan(angle),focal=624
 const z=behind+(point.year-85)*18
 const depth=Math.max(170,eyeHeight*Math.sin(angle)+z*Math.cos(angle))
 const scale=Math.min(3,focal/depth)
 const anchor=pathX(SAMPLE.find(p=>p.id==='self')!,5,SAMPLE.length,85,SAMPLE)
 const targetX=anchor+(point.x-anchor)*scale
 const targetY=viewHeight*(.6+(eyeHeight*Math.cos(angle)-z*Math.sin(angle))*scale/800)-(point.elevation??0)*scale
 return {x:point.x+(targetX-point.x)*tilt,y:point.y/800*viewHeight+(targetY-point.y/800*viewHeight)*tilt,scale:1+(scale-1)*tilt}
}
export interface FutureLife {
 id:string;parent:string;born:number;generation:number;head:StoryPoint;points:StoryPoint[];color:string;opacity:number;twinkle:number;birth:number
}
const countAt=(generation:number)=>Math.min(64,4*Math.pow(2,generation))
const birthAt=(generation:number,index:number)=>92+generation*24+index/countAt(generation)*20
const laneAt=(generation:number,index:number)=>545+((index+.5)/countAt(generation)-.5)*650*(1+generation*.35)
function adultLane(generation:number,index:number,year:number) {
 const own=laneAt(generation,index),pair=Math.floor(index/2)*2
 const center=(laneAt(generation,pair)+laneAt(generation,pair+1))/2
 const paired=center+(index%2?1:-1)*(10+generation*2)
 return own+(paired-own)*smooth((year-birthAt(generation,index)-16)/8)+Math.sin(year*.22+index)*3
}
function laneX(generation:number,index:number,year:number,root:Person,people:Person[]) {
 const born=birthAt(generation,index)
 const parentIndex=generation>0?Math.floor(index*countAt(generation-1)/countAt(generation)):0
 const parentX=generation===0?pathX(root,people.indexOf(root),people.length,born,people):adultLane(generation-1,parentIndex,born)
 const grow=smooth((year-born)/10)
 return parentX+(adultLane(generation,index,year)-parentX)*grow
}
const levelAt=(generation:number,index:number,year:number)=>Math.sin(index*2.39+generation*1.7)*42+Math.sin(year*.27+index)*7
function elevationAt(generation:number,index:number,year:number) {
 const born=birthAt(generation,index),parentIndex=generation>0?Math.floor(index*countAt(generation-1)/countAt(generation)):0
 const parent=generation===0?0:levelAt(generation-1,parentIndex,born)
 return parent+(levelAt(generation,index,year)-parent)*smooth((year-born)/10)
}
// Individual lives, not a capped decorative tree. New generations are generated
// from world time forever, while the visible window stays bounded for rendering.
export function futureLives(progress:number,afterEnding=0,people:Person[]=SAMPLE):FutureLife[] {
 const now=continuingYear(progress,afterEnding),seconds=progress*120+afterEnding
 if(now<92)return[]
 const roots=people.filter(p=>p.id==='grandchild-1'||p.id==='grandchild-2')
 if(!roots.length)return[]
 const last=Math.max(0,Math.floor((now-92)/24))
 // Keep the first generations as the visible ancestry, plus the moving frontier.
 // Old lives remain behind; new ones do not erase the tree that led to them.
 const generations=[...new Set([...Array.from({length:Math.min(last+1,6)},(_,i)=>i),...Array.from({length:Math.min(last+1,3)},(_,i)=>last-i)])].sort((a,b)=>a-b)
 const lives:FutureLife[]=[]
 for(const generation of generations)for(let index=0;index<countAt(generation);index++) {
  const born=birthAt(generation,index),age=now-born
  if(age<0)continue
  const root=roots[index%roots.length],year=Math.min(now,born+82)
  const point=(year:number):StoryPoint=>({x:laneX(generation,index,year,root,people),y:presentY(now)+(now-year)*40,year,elevation:elevationAt(generation,index,year)})
  const head=point(year),points:StoryPoint[]=[]
  for(let sample=born;sample<year;sample+=2)points.push(point(sample))
  points.push(head)
  const parentIndex=generation>0?Math.floor(index*countAt(generation-1)/countAt(generation)):0
  lives.push({id:`future-${generation}-${index}`,parent:generation?`future-${generation-1}-${parentIndex}`:root.id,born,generation,head,points,color:age>82?'#8d99a9':COLORS[(index+generation*3+6)%COLORS.length],opacity:smooth(age/.65)*(1-.8*smooth((age-82)/8)),twinkle:.7+.3*Math.sin(seconds*(.7+index%3*.12)+index*2.7+generation),birth:age<1.6?Math.sin(Math.PI*age/1.6):0})
 }
 return lives.sort((a,b)=>b.born-a.born).slice(0,384).reverse()
}
