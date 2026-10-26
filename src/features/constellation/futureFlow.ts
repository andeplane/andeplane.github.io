import { smooth } from './clock.ts'
import { flowingPath } from './curves.ts'
import { MEMORIAL_SKY, projectMemorial } from './memorial.ts'

// Individual lives gently dissolve into an impression of generations. This
// motion uses seconds, not the accelerating year clock: the horizon stays calm.
export const futureAbstraction=(year:number)=>smooth((year-120)/80)
const PALETTE=['#9ac8d6','#b2c9b1','#cabbd5','#d6c69f','#a7b6d5','#d1b0ba']
const canopyPoint=(level:number,index:number,height:number)=>({
  x:460+((index+.5)/2**level-.5)*level*104,
  y:height*(.49-level*.057),
})
// The canopy belongs to this family. Its two roots are the remembered couple;
// each fork shares its parent's exact endpoint. There are no unrelated emitters.
export function descendantCanopy(year:number,height:number,ancestors=['self','partner'],tilt=1) {
  const amount=futureAbstraction(year)
  if(amount===0)return[]
  const point=(level:number,index:number)=>canopyPoint(level,index,height)
  const connect=(a:{x:number;y:number},b:{x:number;y:number})=>`M${a.x},${a.y} C${a.x},${a.y+(b.y-a.y)*.5} ${b.x},${a.y+(b.y-a.y)*.5} ${b.x},${b.y}`
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
      const parent=canopyPoint(level,Math.floor(leaf/2**(5-level)),height)
      const child=canopyPoint(level+1,Math.floor(leaf/2**(4-level)),height)
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
