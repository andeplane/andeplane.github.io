import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Pause, Play, RotateCcw, ArrowUpRight, Plus, Minus, Maximize2 } from 'lucide-react'
import { andersPath, BOB_MASS, editMode, fitPath, FRAME_MASS, loopPath, maskedPath } from './model'
import type { ModelKind, Point, Settings, Solution, Target } from './model'
import { nameTarget } from './handwriting'
import CoefficientEditor from './CoefficientEditor'
import HowItWorks from './HowItWorks'
import { createScene } from './scene'
import './pendulum-writer.css'

const defaults: Settings={count:24,duration:6,damping:0,kind:'coupled'}
const mm=(v:number)=>v<.1?v.toFixed(3):v.toFixed(1)

function paperTransform(solution:Solution) {
  const points=solution.target.map(p=>[p[0]-solution.origin[0],p[1]-solution.origin[1]])
    .concat(solution.trace.map(p=>[p[0]/solution.scale,p[1]/solution.scale]))
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1])
  const lowX=Math.min(...xs),highX=Math.max(...xs),lowY=Math.min(...ys),highY=Math.max(...ys)
  const gain=Math.min(510/Math.max(highX-lowX,1e-8),210/Math.max(highY-lowY,1e-8))
  return {gain,cx:(lowX+highX)/2,cy:(lowY+highY)/2}
}

function pathString(points: Point[], solution: Solution, physical=false, mask?:boolean[], draw=true, reference=solution) {
  const {gain,cx,cy}=paperTransform(reference)
  const transformed: Point[]=points.map(p=>{
    const x=physical?p[0]/solution.scale:p[0]-solution.origin[0]
    const y=physical?p[1]/solution.scale:p[1]-solution.origin[1]
    return [300+(x-cx)*gain,140+(y-cy)*gain]
  })
  return maskedPath(transformed,mask??points.map(()=>true),draw)
}

function saveBlob(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export default function PendulumWriter() {
  const [draft,setDraft]=useState(defaults)
  const [target,setTarget]=useState<Target>(andersPath)
  const [solution,setSolution]=useState<Solution>(()=>fitPath(andersPath(),defaults))
  const [name,setName]=useState('Anders'),[targetLabel,setTargetLabel]=useState('Anders'),[nameBusy,setNameBusy]=useState(false),[edited,setEdited]=useState(false)
  const [time,setTime]=useState(0),[playing,setPlaying]=useState(false)
  const [showTarget,setShowTarget]=useState(true),[liftPen,setLiftPen]=useState(true),[drawing,setDrawing]=useState(false)
  const [custom,setCustom]=useState<Point[][]>([]),[error,setError]=useState(''),[sceneError,setSceneError]=useState(false)
  const [paperView,setPaperView]=useState({zoom:1,x:0,y:0})
  const sceneHost=useRef<HTMLDivElement>(null),solutionRef=useRef(solution),timeRef=useRef(0),strokeRef=useRef<Point[][]>([]),liftRef=useRef(liftPen)
  const fittedRef=useRef(solution),firstName=useRef(true),nameTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),paperSvgRef=useRef<SVGSVGElement>(null)
  const pointers=useRef(new Map<number,Point>()),panStart=useRef<{point:Point;x:number;y:number}|null>(null),pinch=useRef<{distance:number;center:Point}|null>(null)
  solutionRef.current=solution;liftRef.current=liftPen
  useEffect(()=>{
    if(!sceneHost.current)return
    try{return createScene(sceneHost.current,()=>solutionRef.current,()=>timeRef.current,()=>liftRef.current)}catch{setSceneError(true)}
  },[])
  useEffect(()=>{
    if(firstName.current){firstName.current=false;return}
    setNameBusy(true)
    nameTimer.current=setTimeout(()=>fitName(),300)
    return()=>clearTimeout(nameTimer.current)
  },[name])
  useEffect(()=>{
    const svg=paperSvgRef.current;if(!svg)return
    const wheel=(e:WheelEvent)=>{
      if(drawing||(!e.ctrlKey&&!e.metaKey))return
      e.preventDefault()
      const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY
      const matrix=svg.getScreenCTM(),local=matrix?point.matrixTransform(matrix.inverse()):point
      zoomPaper(Math.exp(-e.deltaY*.005),[local.x,local.y])
    }
    svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel)
  },[drawing])
  useEffect(()=>{
    if(!playing)return
    let frame=0,last=performance.now(),reported=0
    const animate=(now:number)=>{
      // Do not jump ahead after switching tabs.
      const dt=document.hidden?0:Math.min((now-last)/1000,.05);last=now
      timeRef.current=Math.min(solution.settings.duration,timeRef.current+dt)
      if(now-reported>50){setTime(timeRef.current);reported=now}
      if(timeRef.current>=solution.settings.duration){setPlaying(false);setTime(timeRef.current)}
      else frame=requestAnimationFrame(animate)
    }
    frame=requestAnimationFrame(animate);return()=>cancelAnimationFrame(frame)
  },[playing,solution])
  const seek=(t:number)=>{timeRef.current=t;setTime(t)}
  const togglePlay=()=>{if(time>=solution.settings.duration)seek(0);setPlaying(!playing)}
  // Fitting only sets the machine up: the 3D view holds every pendulum at its
  // starting angle until the visitor presses play, unless they asked to release.
  function release(path:Target=target,settings=draft,label=targetLabel,play=false) {
    clearTimeout(nameTimer.current)
    try {const fitted=fitPath(path,settings);setSolution(fitted);fittedRef.current=fitted;setTarget(path);setTargetLabel(label);seek(0);setPlaying(play);setError('');setDrawing(false);setEdited(false);setPaperView({zoom:1,x:0,y:0})}
    catch(e){setError(e instanceof Error?e.message:'Could not fit this stroke.')}
    setNameBusy(false)
  }
  function fitName() {
    clearTimeout(nameTimer.current)
    try{release(nameTarget(name),draft,name.trim())}catch(e){setError(e instanceof Error?e.message:'Could not create this name.');setNameBusy(false)}
  }
  function zoomPaper(factor:number,anchor:Point=[300,140],shift:Point=[0,0]) {
    setPaperView(view=>{
      const zoom=Math.max(.5,Math.min(12,view.zoom*factor)),ratio=zoom/view.zoom
      return {zoom,x:anchor[0]-300-(anchor[0]-300-view.x)*ratio+shift[0],y:anchor[1]-140-(anchor[1]-140-view.y)*ratio+shift[1]}
    })
  }
  const changeMode=(mode:number,axis:0|1,amplitude:number,phase:number)=>{
    setSolution(current=>editMode(current,mode,axis,amplitude,phase));setEdited(true);setPlaying(false);seek(solution.settings.duration)
  }
  const fraction=time/solution.settings.duration
  const returnCount=Math.floor(fraction*solution.trace.length)+1
  const inReturn=!solution.penMask[Math.min(solution.penMask.length-1,Math.floor(fraction*solution.penMask.length))]
  const changed=Object.keys(draft).some(k=>draft[k as keyof Settings]!==solution.settings[k as keyof Settings])
  const exportConditions=()=>{
    const s=solution
    if(s.settings.kind==='fourier') {
      saveBlob(new Blob([JSON.stringify({model:'Ideal independent sine waves; not physical frame initial conditions',settings:s.settings,origin:s.origin,penLiftEnabled:liftPen,penMask:s.penMask.map(draw=>!liftPen||draw),
        modes:Array.from({length:s.settings.count},(_,i)=>({frequencyRadiansPerSecond:2*Math.PI*(i+1)/s.settings.duration,cosine:s.coefficients[2*i],sine:s.coefficients[2*i+1]}))},null,2)],{type:'application/json'}),'pendulum-writer-fourier-parameters.json')
      return
    }
    saveBlob(new Blob([JSON.stringify({model:s.settings.kind,settings:s.settings,units:'SI: metres, kilograms, seconds, radians',frameMass:FRAME_MASS,bobMass:BOB_MASS,
      assumptions:'Linear small-angle pendulums; pure x/y frame translation; four-wire suspension reduced to isotropic stiffness; uniform viscous modal damping; no collisions or pencil contact force. Pen lift on return requires a separate mechanism.',
      suspensionLength:s.system.suspension,frameStiffnessPerAxis:s.system.stiffness,framePosition:s.initial.frame,frameVelocity:s.initial.velocity,
      paperOriginRelativeToFrameEquilibrium:s.origin.map(v=>-v*s.scale),writingWidthMm:s.widthMm,shapeRmsPercent:s.errorPercent,penLiftEnabled:liftPen,
      modeCoefficientsMeters:s.coefficients.map(point=>point.map(v=>v*s.scale)),modeFrequenciesRadiansPerSecond:s.system.frequencies,
      penLiftSchedule:s.penMask.map((draw,i)=>({time:i/s.penMask.length*s.settings.duration,draw:!liftPen||draw})),
      pendulums:s.system.lengths.flatMap((length,i)=>[0,1].map(axis=>({axis:axis===0?'x':'y',length,mass:BOB_MASS,
        angle:s.initial.relative[i][axis]/length,angularVelocity:s.initial.relativeVelocity[i][axis]/length})))},null,2)],{type:'application/json'}),'pendulum-writer-initial-conditions.json')
  }
  const exportSvg=()=>{
    const stroke=pathString(solution.trace,solution,true,liftPen?solution.penMask:undefined)
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 280"><title>Pendulum Writer — simulated stroke</title><path d="${stroke}" fill="none" stroke="#203b35" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    saveBlob(new Blob([svg],{type:'image/svg+xml'}),'pendulum-writing.svg')
  }
  const pointerPoint=(event:React.PointerEvent<SVGSVGElement>): Point=>{
    const point=event.currentTarget.createSVGPoint();point.x=event.clientX;point.y=event.clientY
    const matrix=event.currentTarget.getScreenCTM()
    const local=matrix?point.matrixTransform(matrix.inverse()):point
    return [local.x,local.y]
  }
  const startPaperGesture=(e:React.PointerEvent<SVGSVGElement>)=>{
    if(drawing&&!e.isPrimary)return
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)
    const p=pointerPoint(e)
    if(drawing){strokeRef.current=[...strokeRef.current,[p]];setCustom(strokeRef.current);return}
    pointers.current.set(e.pointerId,p)
    if(pointers.current.size===1)panStart.current={point:p,x:paperView.x,y:paperView.y}
    else {
      const [a,b]=[...pointers.current.values()]
      pinch.current={distance:Math.hypot(a[0]-b[0],a[1]-b[1]),center:[(a[0]+b[0])/2,(a[1]+b[1])/2]}
    }
  }
  const movePaperGesture=(e:React.PointerEvent<SVGSVGElement>)=>{
    if(!e.currentTarget.hasPointerCapture(e.pointerId))return
    const p=pointerPoint(e)
    if(drawing){const strokes=strokeRef.current.map(stroke=>stroke.slice());strokes[strokes.length-1].push(p);strokeRef.current=strokes;setCustom(strokes);return}
    pointers.current.set(e.pointerId,p)
    if(pointers.current.size>1&&pinch.current) {
      const [a,b]=[...pointers.current.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1])
      const center:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2]
      zoomPaper(distance/Math.max(pinch.current.distance,1),pinch.current.center,[center[0]-pinch.current.center[0],center[1]-pinch.current.center[1]])
      pinch.current={distance,center}
    }else if(panStart.current){const start=panStart.current;setPaperView(view=>({...view,x:start.x+p[0]-start.point[0],y:start.y+p[1]-start.point[1]}))}
  }
  const endPaperGesture=(e:React.PointerEvent<SVGSVGElement>)=>{
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
    pointers.current.delete(e.pointerId);pinch.current=null
    const remaining=[...pointers.current.values()][0]
    panStart.current=remaining?{point:remaining,x:paperView.x,y:paperView.y}:null
  }
  const {gain:paperGain,cx:paperX,cy:paperY}=paperTransform(fittedRef.current)
  const pen=solution.at(time).frame
  return (
    <div className="pw-root">
      <Link className="pw-backlink" to="/projects">← All experiments</Link>
      <header className="pw-header">
        <div><p className="pw-eyebrow">An experiment in mechanical handwriting</p><h1>Pendulum Writer<span>.</span></h1></div>
        <p>Can a suspended wooden cross learn to write your name?<br/>Give its pendulums the right start, then let go.</p>
      </header>

      <section aria-labelledby="pw-simulator-title">
      <div className="pw-section-heading pw-simulator-heading"><p className="pw-eyebrow">01 / Try it yourself</p><h2 id="pw-simulator-title">The simulator</h2></div>
      <form className="pw-name-form" onSubmit={e=>{e.preventDefault();fitName()}}>
        <label htmlFor="pw-name">Your name<input id="pw-name" type="text" autoComplete="given-name" maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="Type your name"/></label>
        <button type="submit">Write name <ArrowUpRight size={17}/></button><span aria-live="polite">{nameBusy?'Fitting the amplitudes…':`Target: ${targetLabel}. Amplitudes update as you type.`}</span>
      </form>

      <section className="pw-lab" aria-label="Pendulum drawing laboratory">
        <div className="pw-apparatus">
          <div className="pw-scene" ref={sceneHost}>{sceneError&&<p className="pw-webgl-error">3D preview unavailable. The drawing and physics still work below.</p>}</div>
          <div className="pw-scene-label"><span className="pw-live-dot"/> {solution.settings.count*2} {solution.settings.kind==='coupled'?'pendulums · four suspension wires':'ideal oscillators · schematic apparatus'}</div>
          {!playing&&!drawing&&!sceneError&&<button type="button" className="pw-scene-play" onClick={togglePlay}><Play size={18}/> {time===0?'Release':time>=solution.settings.duration?'Play again':'Resume'}</button>}
          <div className="pw-scene-bottom"><span><i className="pw-cyan"/> x bank <i className="pw-orange"/> y bank</span><span>Drag to orbit · scroll to zoom</span></div>
        </div>

        <aside className="pw-controls" aria-label="Machine settings">
          <div className="pw-control-title"><span>Machine settings</span><span aria-live="polite">{changed?'Changes pending':edited?'Edited':'Fitted'}</span></div>
          <label>Motion model<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as ModelKind})}><option value="coupled">Coupled frame (small angles)</option><option value="fourier">Ideal Fourier sum</option></select></label>
          <label htmlFor="pw-count"><span>Pendulums per axis <output>{draft.count}</output></span><input id="pw-count" type="range" min="4" max="36" step="2" value={draft.count} onChange={e=>setDraft({...draft,count:Number(e.target.value)})}/></label>
          <label htmlFor="pw-duration"><span>Drawing duration <output>{draft.duration} s</output></span><input id="pw-duration" type="range" min="3" max="12" step="1" value={draft.duration} onChange={e=>setDraft({...draft,duration:Number(e.target.value)})}/></label>
          <label htmlFor="pw-damping"><span>Damping <output>{draft.damping.toFixed(2)} s⁻¹</output></span><input id="pw-damping" type="range" min="0" max="0.08" step="0.01" value={draft.damping} onChange={e=>setDraft({...draft,damping:Number(e.target.value)})}/></label>
          <div className="pw-presets"><button type="button" onClick={()=>release(loopPath(),draft,'Loops')}>Try loops</button><button type="button" aria-pressed={drawing} onClick={()=>{clearTimeout(nameTimer.current);setNameBusy(false);setPlaying(false);setDrawing(!drawing);setCustom([]);strokeRef.current=[];setError('');setPaperView({zoom:1,x:0,y:0})}}>Draw a target</button></div>
          <button className="pw-primary" type="button" onClick={()=>release(drawing?{strokes:custom}:target,draft,drawing?'Your drawing':targetLabel,true)}>{drawing?'Fit my drawing & release':'Fit & release'} <ArrowUpRight size={17}/></button>
          {error&&<p className="pw-error" role="alert">{error}</p>}
          <p className="pw-control-note">Fitting sets every initial position and velocity, shown held in the 3D view. After release, the machine evolves freely.</p>
          {solution.settings.kind==='coupled'&&<p className="pw-control-note">Small-angle Newton equations. Pencil contact and collisions are not simulated.</p>}
        </aside>
      </section>

      <section className="pw-paper-section" aria-label="Drawing output">
        <div className="pw-paper-heading"><div><p className="pw-eyebrow">The drawing</p><h3>{drawing?'Draw your target':targetLabel==='Your drawing'?'Your drawing':targetLabel==='Loops'?'Loop pattern':`Writing ${targetLabel}`}</h3></div><span className="pw-status" aria-live="polite">{drawing?'Lift between strokes':edited?'Coefficients edited':time>=solution.settings.duration?'Drawing complete':inReturn?(liftPen?'Pen lifted · travel':'Pen down · travel'):playing?'Drawing…':time===0?'Ready to release':'Paused'}</span></div>
        <div className="pw-view-tools"><span>{drawing?'Draw with mouse or touch.':'Drag to pan · Ctrl/⌘ + scroll to zoom'}</span><div><button type="button" aria-label="Zoom out drawing" disabled={drawing} onClick={()=>zoomPaper(1/1.5)}><Minus size={15}/></button><output>{paperView.zoom.toFixed(1)}×</output><button type="button" aria-label="Zoom in drawing" disabled={drawing} onClick={()=>zoomPaper(1.5)}><Plus size={15}/></button><button type="button" aria-label="Fit drawing to view" onClick={()=>setPaperView({zoom:1,x:0,y:0})}><Maximize2 size={15}/></button>{drawing&&<button type="button" onClick={()=>{setCustom([]);strokeRef.current=[]}}>Clear drawing</button>}</div></div>
        <div className={`pw-paper ${drawing?'pw-draw-mode':''}`}>
          <svg ref={paperSvgRef} viewBox="0 0 600 280" role="img" aria-label={drawing?'Draw a target with one or more strokes here':'Magnified target and simulated pendulum handwriting'}
            onPointerDown={startPaperGesture} onPointerMove={movePaperGesture} onPointerUp={endPaperGesture}
            onPointerCancel={e=>{pointers.current.delete(e.pointerId);pinch.current=null;panStart.current=null}}>
            <title>{drawing?'Draw a target':'Simulated handwriting, magnified to fit the page'}</title>
            {drawing?<path d={custom.map(stroke=>maskedPath(stroke,stroke.map(()=>true))).join(' ')} className="pw-ink"/>:<g data-paper-view="true" transform={`translate(${300+paperView.x},${140+paperView.y}) scale(${paperView.zoom}) translate(-300,-140)`}>
              {showTarget&&<path className="pw-target" d={pathString(solution.target,solution,false,solution.penMask,true,fittedRef.current)}/>}
              <path className="pw-ink" d={pathString(solution.trace.slice(0,returnCount),solution,true,liftPen?solution.penMask:undefined,true,fittedRef.current)}/>
              {liftPen&&<path className="pw-return" d={pathString(solution.trace.slice(0,returnCount),solution,true,solution.penMask,false,fittedRef.current)}/>}
              <circle className="pw-pencil-dot" cx={300+(pen[0]/solution.scale-paperX)*paperGain} cy={140+(pen[1]/solution.scale-paperY)*paperGain} r="3"/>
            </g>}
          </svg>
          <div className="pw-paper-footer"><span>{drawing?`${custom.length} strokes · lift between strokes`:solution.settings.kind==='coupled'?`Physical writing width ${mm(solution.widthMm)} mm · view magnified`:'Ideal independent oscillators · mathematical construction'}</span>{!drawing&&<span>{solution.errorPercent.toFixed(2)}% shape RMS</span>}</div>
        </div>
        <div className="pw-transport">
          <button type="button" aria-label={playing?'Pause drawing':'Play drawing'} onClick={togglePlay}>{playing?<Pause size={18}/>:<Play size={18}/>}</button>
          <button type="button" aria-label="Restart drawing" onClick={()=>{seek(0);setPlaying(true)}}><RotateCcw size={18}/></button>
          <input aria-label="Drawing time" type="range" min="0" max={solution.settings.duration} step="0.01" value={time} onChange={e=>{setPlaying(false);seek(Number(e.target.value))}}/>
          <output>{time.toFixed(1)} / {solution.settings.duration} s</output>
        </div>
        <div className="pw-options"><label><input type="checkbox" checked={showTarget} onChange={e=>setShowTarget(e.target.checked)}/> Target guide</label><label><input type="checkbox" checked={liftPen} onChange={e=>setLiftPen(e.target.checked)}/> Lift pencil between strokes</label><button type="button" onClick={exportSvg}><Download size={14}/> Save drawing</button><button type="button" onClick={exportConditions}><Download size={14}/> {solution.settings.kind==='coupled'?'Initial conditions':'Wave parameters'}</button></div>
      </section>
      <CoefficientEditor solution={solution} edited={edited} onEdit={changeMode} onRestore={()=>{setSolution(fittedRef.current);setEdited(false);seek(0);setPlaying(true)}}/>
      </section>
      <HowItWorks/>
      <details className="pw-method"><summary>Model details and what a real build still needs</summary><p>The physical mode uses a linear small-angle model: two independent banks of planar pendulums on one translating frame. Each bank includes the other bank’s mass in its frame inertia. Gravity supplies the restoring forces; the four ceiling wires are approximated by one isotropic suspension stiffness. The coupled mass and stiffness matrices determine the motion.</p><p>The 3D view magnifies frame travel and compresses pendulum lengths to make the mechanism legible. It is a schematic, not a scale drawing. Rotation, nonlinear swings, bob collisions, air resistance details, pencil friction, and vertical contact are not simulated. Damping is a uniform viscous approximation. Lifting the pencil between strokes is a separate timed mechanism; turn it off to see its travel marks.</p><p>The physical fit is scaled so a conservative bound on every swing stays within 10°. Fast, short pendulums resolve fine details, but the resulting word can be small. Editing a mode recomputes this size bound. Amplitude percentages refer to the reference drawing span; the editor also reports each mode’s actual frame contribution in millimetres.</p><dl className="pw-facts"><div><dt>Pendulum lengths</dt><dd>{(Math.min(...solution.system.lengths)*100).toFixed(1)}–{(Math.max(...solution.system.lengths)*100).toFixed(0)} cm</dd></div><div><dt>Suspension length</dt><dd>{solution.system.suspension.toFixed(2)} m</dd></div><div><dt>Bare frame / each bob</dt><dd>{FRAME_MASS} kg / {BOB_MASS*1000} g</dd></div></dl><p>This demonstrates a possible trajectory in the model, not a tested wooden machine. “Shape RMS” compares the pen-down fitted curve with its target at the same times, divided by the reference drawing span. The JSON download records physical lengths, angles, angular velocities and the pen-lift schedule.</p><p>Typed names use public-domain <a href="https://github.com/techninja/hersheytextjs" target="_blank" rel="noreferrer">Hershey centreline script glyphs</a>, rather than tracing font outlines. Related: <a href="https://ucscphysicsdemo.sites.ucsc.edu/harmonograph/" target="_blank" rel="noreferrer">UCSC’s harmonograph demonstration</a> · <a href="https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/pages/part-i-mechanical-vibrations-and-waves/lecture-3/" target="_blank" rel="noreferrer">MIT on normal modes</a></p></details>
    </div>
  )
}
