import { elapsedAtYear, smooth } from './clock.ts'
import { flowingPath } from './curves.ts'
import { MEMORIAL_SKY, projectMemorial } from './memorial.ts'

// Individual lives gently dissolve into an impression of generations. This
// motion uses seconds, not the accelerating year clock: the horizon stays calm.
export const futureAbstraction=(year:number)=>smooth((year-120)/80)
const PALETTE=['#9ac8d6','#b2c9b1','#cabbd5','#d6c69f','#a7b6d5','#d1b0ba']
const noise=(seed:number)=>{const n=Math.sin(seed*127.1+311.7)*43758.5453;return n-Math.floor(n)}
const canopyPoint=(level:number,index:number,height:number,seconds:number)=>{
  const depth=level/5
  return {
    x:460+((index+.5)/2**level-.5)*level*104+(noise(level*53+index)-.5)*14*depth
      +Math.sin(seconds*.035+index*.64+level)*5*depth,
    y:height*(.49-level*.057+(noise(level*31+index)-.5)*.014*depth),
  }
}
type Point={x:number;y:number}
// A partial cubic grows from its ancestor. Its tip and tangent match the
// complete curve, so a new fork never jumps or opens a gap in the family.
function connect(a:Point,b:Point,part=1) {
  const t=smooth(part),dy=b.y-a.y,dx=b.x-a.x
  return `M${a.x},${a.y} C${a.x},${a.y+dy*.5*t} ${a.x+dx*t*t},${a.y+dy*(t-.5*t*t)} ${a.x+dx*(3*t*t-2*t*t*t)},${a.y+dy*(1.5*t-1.5*t*t+t*t*t)}`
}
// The canopy belongs to this family. Its two roots are the remembered couple;
// each fork shares its parent's exact endpoint. There are no unrelated emitters.
export function descendantCanopy(year:number,height:number,ancestors=['self','partner'],tilt=1,seconds=elapsedAtYear(year)) {
  const amount=futureAbstraction(year)
  if(amount===0)return[]
  const point=(level:number,index:number)=>canopyPoint(level,index,height,seconds)
  const root=point(0,0)
  const branches=ancestors.map((id,i)=>({
    id,from:id,to:'descendants',
    path:connect(projectMemorial({...MEMORIAL_SKY[id],year:85},tilt,height),root),
    opacity:amount*.22,color:PALETTE[i],
  }))
  for(let level=1;level<=5;level++)for(let index=0;index<2**level;index++) {
    branches.push({id:`canopy-${level}-${index}`,from:level===1?'descendants':`canopy-${level-1}-${Math.floor(index/2)}`,to:`canopy-${level}-${index}`,
      path:connect(point(level-1,Math.floor(index/2)),point(level,index)),
      opacity:amount*smooth((year-110-level*12)/20)*.14,color:PALETTE[level%PALETTE.length]})
  }
  // The remembered trunk stays. New cohorts keep growing from its outer
  // branches, splitting and receding into the haze. Only the distant cohorts
  // retire; this bounds the DOM without stopping growth or replaying a life.
  const clock=seconds-elapsedAtYear(175),latest=Math.floor(clock/12)
  for(let cohort=Math.max(0,latest-3);cohort<=latest;cohort++)for(let leaf=0;leaf<32;leaf++) {
    const seed=cohort*79+leaf*3,age=clock-cohort*12-noise(seed)*8
    if(age<=0||age>=36)continue
    const opacity=amount*smooth(age/2)*(1-smooth((age-25)/11))
    const root=point(5,leaf),sign=leaf<16?-1:1
    const fork={x:root.x+sign*(8+noise(seed+1)*10),y:root.y-height*(.047+noise(seed+2)*.015)}
    const id=`generation-${cohort}-${leaf}`
    branches.push({id,from:`canopy-5-${leaf}`,to:id,path:connect(root,fork,age/10),opacity:opacity*.15,color:PALETTE[(leaf+cohort)%PALETTE.length]})
    if(age<=10)continue
    for(let child=0;child<2;child++) {
      const tip={x:fork.x+(child===0?-1:1)*(7+noise(seed+child+4)*11),y:height*(.055+noise(seed+child+7)*.045)}
      const childId=`${id}-${child}`
      branches.push({id:childId,from:id,to:childId,path:connect(fork,tip,(age-10)/13),opacity:opacity*.085,color:PALETTE[(leaf+cohort+child)%PALETTE.length]})
    }
  }
  return branches
}
export function futureFlow(year:number,seconds:number,height:number) {
  const amount=futureAbstraction(year)
  if(amount===0)return[]
  const fullness=8+36*smooth((year-120)/200)
  return Array.from({length:44},(_,i)=>{
    const leaf=Math.floor((i+.5)/44*32)
    const phase=(seconds/48+i*.61803398875)%1
    const end=.12+.88*phase,start=Math.max(0,end-.48)
    const points=Array.from({length:21},(_,j)=>{
      const t=start+(end-start)*j/20
      const level=Math.min(4,Math.floor(t*5)),part=t*5-level
      const parent=canopyPoint(level,Math.floor(leaf/2**(5-level)),height,seconds)
      const child=canopyPoint(level+1,Math.floor(leaf/2**(4-level)),height,seconds)
      // Light travels through the same shared forks as the canopy itself.
      // No orbiting or independent particles are introduced at the horizon.
      return {x:parent.x+(child.x-parent.x)*smooth(part),y:parent.y+(child.y-parent.y)*(1.5*part-1.5*part**2+part**3)}
    })
    // Interleave the reveal across the fan, rather than filling left to right.
    const rank=(i*17)%44
    const opacity=amount*smooth((fullness-rank)/5)*smooth(phase/.16)*(1-smooth((phase-.78)/.22))
    return {id:i,path:flowingPath(points),color:PALETTE[i%PALETTE.length],opacity}
  })
}
