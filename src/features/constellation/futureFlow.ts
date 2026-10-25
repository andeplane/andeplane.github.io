import { smooth } from './clock.ts'
import { flowingPath } from './curves.ts'

// Individual lives gently dissolve into an impression of generations. This
// motion uses seconds, not the accelerating year clock: the horizon stays calm.
export const futureAbstraction=(year:number)=>smooth((year-120)/80)
const PALETTE=['#9ac8d6','#b2c9b1','#cabbd5','#d6c69f','#a7b6d5','#d1b0ba']
export function futureFlow(year:number,seconds:number,height:number) {
  const amount=futureAbstraction(year)
  if(amount===0)return[]
  const fullness=8+36*smooth((year-120)/200)
  return Array.from({length:44},(_,i)=>{
    const lane=(i+.5)/44-.5
    const phase=(seconds/48+i*.61803398875)%1
    const end=.12+.88*phase,start=Math.max(0,end-.48)
    const points=Array.from({length:21},(_,j)=>{
      const t=start+(end-start)*j/20
      const fan=Math.sin(Math.PI*t)*570+90
      const sway=Math.sin(t*Math.PI*2+i*1.7+seconds*.045)*12*Math.sin(Math.PI*t)
      return {x:460+lane*fan+sway,y:height*(.49-.30*t)}
    })
    // Interleave the reveal across the fan, rather than filling left to right.
    const rank=(i*17)%44
    const opacity=amount*smooth((fullness-rank)/5)*smooth(phase/.16)*(1-smooth((phase-.78)/.22))
    return {id:i,path:flowingPath(points),color:PALETTE[i%PALETTE.length],opacity}
  })
}
