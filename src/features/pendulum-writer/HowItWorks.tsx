import { useEffect, useMemo, useState } from 'react'
import { fitPath } from './model'
import { letterA } from './handwriting'

export default function HowItWorks() {
  const duration=3
  const [terms,setTerms]=useState(3),[time,setTime]=useState(duration),[playing,setPlaying]=useState(false)
  const solution=useMemo(()=>fitPath(letterA,{count:terms,duration,damping:0,kind:'coupled'}),[terms])
  useEffect(()=>{
    if(!playing)return
    let frame=0;const start=performance.now()
    const tick=(now:number)=>{const t=Math.min(duration,(now-start)/1000);setTime(t);if(t<duration)frame=requestAnimationFrame(tick);else setPlaying(false)}
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame)
  },[playing,terms])
  const all=solution.target.map(p=>[p[0]-solution.origin[0],p[1]-solution.origin[1]])
    .concat(solution.trace.map(p=>[p[0]/solution.scale,p[1]/solution.scale]))
  const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2
  const gain=Math.min(350/(Math.max(...xs)-Math.min(...xs)),210/(Math.max(...ys)-Math.min(...ys)))
  const path=(actual:boolean,limit=solution.target.length)=>{
    const points=actual?solution.trace:solution.target
    return points.slice(0,Math.min(limit,Math.floor(solution.penFraction*points.length))).map((p,i)=>{
      const x=actual?p[0]/solution.scale:p[0]-solution.origin[0],y=actual?p[1]/solution.scale:p[1]-solution.origin[1]
      return `${i?'L':'M'}${220+(x-cx)*gain},${135+(y-cy)*gain}`
    }).join(' ')
  }
  const motion=solution.at(time)
  return <section className="pw-how" aria-labelledby="pw-how-title">
    <div className="pw-section-heading"><p className="pw-eyebrow">02 / Build an A out of a few swings</p><h2 id="pw-how-title">How it works</h2><p>Start with one letter. A pen moving through the A has a horizontal position, x, and a vertical position, y. Each is a signal we can approximate by adding simple oscillations.</p></div>
    <div className="pw-a-controls"><span>Number of pendulums</span><div>{[1,2,3,6].map(n=><button type="button" key={n} aria-pressed={n===terms} onClick={()=>{setTerms(n);setTime(0);setPlaying(true)}}>{n*2}</button>)}</div><button type="button" onClick={()=>{setTime(0);setPlaying(true)}}>Replay A</button></div>
    <div className="pw-a-demo">
      <div className="pw-a-swings">
        {([0,1] as const).map(axis=><div key={axis}><h3>{axis===0?'x':'y'}: {terms} {terms===1?'pendulum':'pendulums'} acting on the frame</h3><svg viewBox={`0 0 ${Math.max(220,terms*50)} 100`} role="img" aria-label={`${terms} coupled pendulums contributing to ${axis===0?'horizontal':'vertical'} motion, with swing angles magnified`}>
          {Array.from({length:terms},(_,i)=>{
            const angle=motion.relative[i][axis]/solution.system.lengths[i]*5,width=Math.max(220,terms*50)
            const x=terms===1?width/2:40+i*(width-80)/(terms-1),length=45-18*i/Math.max(1,terms-1),bx=x+Math.sin(angle)*length,by=13+Math.cos(angle)*length
            return <g key={i}><line x1={x} y1="13" x2={bx} y2={by}/><circle cx={x} cy="13" r="2" className="pw-a-pivot"/><circle cx={bx} cy={by} r="5" className={axis===0?'pw-a-bob-x':'pw-a-bob-y'}/><text x={x} y="84" textAnchor="middle">{i+1}</text></g>
          })}
        </svg></div>)}
        <p>Coupled-frame model, with fewer pendulums. Swing angles are magnified 5×; the drawing is magnified too.</p>
      </div>
      <div className="pw-a-paper"><svg viewBox="0 0 440 270" role="img" aria-label={`Letter A drawn by a coupled frame with ${terms} pendulums per axis`}><title>A drawn with a few pendulums</title><path className="pw-target" d={path(false)}/><path className="pw-ink" d={path(true,Math.floor(time/duration*solution.trace.length)+1)}/></svg><div><span>{terms} x + {terms} y · {solution.widthMm.toFixed(1)} mm wide</span><span>{solution.errorPercent.toFixed(1)}% shape RMS</span></div></div>
    </div>
    <div className="pw-how-steps"><article><span>1</span><h3>Choose the path.</h3><p>Turn the drawing into x(t) and y(t). The machine needs to know where the pencil should be at each moment, including the travel when it is lifted.</p></article><article><span>2</span><h3>Find the shared swings.</h3><p>The pendulums and hanging frame form oscillation modes. Fit their amplitudes and phases to the two signals. Select 2, 4, 6 or 12 pendulums above to see how changing the machine changes the fit.</p></article><article><span>3</span><h3>Start them, then let go.</h3><p>Amplitude and phase become starting positions and velocities. Gravity and the pendulums’ reaction forces move the frame; the pencil follows it. No force pulls the pencil along the target letter.</p></article></div>
  </section>
}
