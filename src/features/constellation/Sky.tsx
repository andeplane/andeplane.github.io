import { useRef } from 'react'
import type { Person } from './story'
import { YEAR_SPACING, ageAxis, personAppearance, personLabelOpacity, personName, smooth, starPosition, storyAge, trailPoints } from './story'
import { cameraAmount, futureBranches, projectPoint } from './projection.ts'
import { StableLabelLayout } from './labels.ts'
const stars = Array.from({length:240},(_,i)=>({x:((Math.sin(i*127.1+311.7)*43758.5453)%1+1)%1*800,y:((Math.sin(i*269.5+183.3)*43758.5453)%1+1)%1,r:i%13===0?1.3:i%4===0?.8:.5}))
interface Props { people: Person[]; progress: number; width?: number; viewHeight?: number; afterEnding?: number; id?: string; title?: string }
export default function Sky({people,progress,width=800,viewHeight=800,afterEnding=0,id='sky',title='A life among family and friends, continuing into the future'}:Props) {
  const age=storyAge(progress)
  const tilt=cameraAmount(progress)
  const axis=ageAxis(progress)
  const points=people.map((p,i)=>starPosition(p,i,people.length,progress,people))
  const positions=points.map(p=>({...p,...projectPoint(p,progress,viewHeight)}))
  const appearances=people.map(p=>personAppearance(p,progress))
  const paths=people.map((p,i)=>trailPoints(p,i,people.length,progress,people).map(point=>projectPoint(point,progress,viewHeight))).map(points=>points.length?'M'+points.map(p=>`${p.x},${p.y}`).join(' L'):'')
  const labelItems=people.map((p,i)=>({id:p.id,name:personName(p,progress),x:positions[i].x,y:positions[i].y,memorial:p.end!==null&&p.exit!=='fade'&&age>p.end+.7,opacity:personLabelOpacity(p,progress),visible:positions[i].visible && personLabelOpacity(p,progress)>.002}))
  const stableLabels=useRef(new StableLabelLayout())
  const previousTime=useRef(progress*120+afterEnding)
  const seconds=progress*120+afterEnding
  const delta=Math.max(0,seconds-previousTime.current)
  previousTime.current=seconds
  const labels=stableLabels.current.update(labelItems,width,viewHeight,delta)
  const axisFont=Math.min(36,13*800/width)
  const axisY=(year:number)=>projectPoint({x:80,y:505+(age-year)*YEAR_SPACING,year},progress,viewHeight).y
  const currentY=axisY(age)
  const tickYs=[currentY]
  const ticks=axis.ticks.filter(t=>Math.abs(t.age-age)> .6).map(t=>({...t,y:axisY(t.age)})).filter(t=>{
    if(t.y<35||t.y>viewHeight*.94||tickYs.some(y=>Math.abs(y-t.y)<axisFont*1.8))return false
    tickYs.push(t.y);return true
  })
  const branches=futureBranches(progress,afterEnding)
  return <svg className="cl-sky-svg" viewBox={`0 0 800 ${viewHeight}`} role="img" aria-labelledby={`${id}-title`} xmlns="http://www.w3.org/2000/svg">
    <title id={`${id}-title`}>{title}</title>
    <rect width="800" height={viewHeight} fill="#080e1b"/>
    <defs>
      <radialGradient id={`${id}-nebula`}><stop stopColor="#1c2939" stopOpacity=".58"/><stop offset="1" stopColor="#080e1b" stopOpacity="0"/></radialGradient>
      <linearGradient id={`${id}-fade`} x2="0" y2="1"><stop stopColor="white"/><stop offset=".76" stopColor="white"/><stop offset="1" stopColor="black"/></linearGradient>
      <mask id={`${id}-mask`}><rect x="104" width="690" height={viewHeight*(1-.25*tilt)} fill={`url(#${id}-fade)`}/></mask>
      <clipPath id={`${id}-bounds`}><rect x="104" y="15" width="690" height={viewHeight*.73-15}/></clipPath>
      {people.map((p,i)=><radialGradient key={p.id} id={`${id}-glow-${p.id}`}><stop stopColor={appearances[i].color} stopOpacity={appearances[i].glowOpacity}/><stop offset="1" stopColor={appearances[i].color} stopOpacity="0"/></radialGradient>)}
    </defs>
    <ellipse cx="410" cy={viewHeight*.32} rx="480" ry={viewHeight*.55} fill={`url(#${id}-nebula)`}/>
    <g fill="#d4deed">{stars.map((s,i)=><circle key={i} cx={s.x} cy={s.y*viewHeight} r={s.r} opacity={i%3===0?.55:.24}/>)}</g>
    <g className="cl-age-axis" fontFamily="system-ui, sans-serif" fontSize={axisFont} fill="#a4afbd">
      <path d={`M80 25V${viewHeight*.94}`} stroke="#8391a3" strokeOpacity=".25" strokeWidth=".8"/>
      <text x="64" y="24" textAnchor="end" fontSize={axisFont*.8}>{age<85?'Age':'Years'}</text>
      {ticks.map(t=><g key={t.age}><path d={`M71 ${t.y}h9`} stroke="#a4afbd" strokeOpacity=".55"/><text x="64" y={t.y} dy=".35em" textAnchor="end">{t.age}</text></g>)}
      <circle cx="80" cy={currentY} r="3" fill="#d4c5a4"/>
      <text className="cl-current-age" x="64" y={currentY} dy=".35em" textAnchor="end" fill="#e1d2af">{Math.max(0,Math.floor(age))}</text>
    </g>
    <g mask={`url(#${id}-mask)`} fill="none">
      {branches.map(b=>{const a=projectPoint({...b.from,y:505+(age-b.from.year)*YEAR_SPACING},progress,viewHeight),z=projectPoint({...b.to,y:505+(age-b.to.year)*YEAR_SPACING},progress,viewHeight);return <g key={b.id} opacity={b.opacity}><path d={`M${a.x} ${a.y}C${a.x} ${(a.y+z.y)/2} ${z.x} ${(a.y+z.y)/2} ${z.x} ${z.y}`} stroke="#aebfc9" strokeWidth=".9"/><circle cx={z.x} cy={z.y} r="1.2" fill="#cbd7dc"/></g>})}
      {people.map((p,i)=>{const since=age-(p.end??age);const opacity=p.exit==='fade'?positions[i].opacity:p.end!==null&&since>=0?positions[i].opacity*((1-smooth(since/8))*(1-tilt)+.14*tilt):positions[i].opacity;return <g key={p.id} stroke={appearances[i].color} opacity={opacity}><path d={paths[i]} strokeWidth="9" vectorEffect="non-scaling-stroke" opacity=".06"/><path d={paths[i]} strokeWidth="4" vectorEffect="non-scaling-stroke" opacity=".2"/><path d={paths[i]} strokeWidth={1.8*(1-.45*tilt)} vectorEffect="non-scaling-stroke" opacity=".95"/></g>})}
    </g>
    {people.map((p,i)=>{const pos=positions[i];if(!pos.visible)return null;const ended=p.end!==null&&p.exit!=='fade'&&age>=p.end;const size=Math.max(.65,Math.min(1.2,pos.scale));const a=appearances[i];return <g key={p.id} data-person={p.id} opacity={pos.opacity}><g clipPath={`url(#${id}-bounds)`}><circle cx={pos.x} cy={pos.y} r={a.glowRadius*size} fill={`url(#${id}-glow-${p.id})`}/><circle cx={pos.x} cy={pos.y} r={a.radius*size} fill={a.core}/>{ended&&<path d={`M${pos.x-7*size} ${pos.y}h${14*size} M${pos.x} ${pos.y-7*size}v${14*size}`} stroke={a.color} strokeWidth=".6" opacity=".65"/>}</g></g>})}
    {labels.map(label=>{const i=people.findIndex(p=>p.id===label.id),p=people[i],pos=positions[i],a=appearances[i];return <g key={label.id} data-label={label.id} opacity={labelItems[i].opacity}><path d={`M${pos.x} ${pos.y}L${label.leader.x} ${label.leader.y}`} fill="none" stroke={a.label} strokeWidth=".55" opacity=".27"/><text className="cl-star-label" x={label.x} y={label.y} fill={a.label} textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="500" paintOrder="stroke" stroke="#080e1b" strokeWidth="2" strokeLinejoin="round" fontSize={label.font}><title>{personName(p,progress)}</title>{label.lines.map((line,n)=><tspan key={n} x={label.x} dy={n?label.lineHeight:0}>{line}</tspan>)}</text></g>})}
  </svg>
}
