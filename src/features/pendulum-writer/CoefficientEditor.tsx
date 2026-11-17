import { useState } from 'react'
import { modeParameters } from './model'
import type { Solution } from './model'

interface Props { solution:Solution; edited:boolean; onEdit:(mode:number,axis:0|1,amplitude:number,phase:number)=>void; onRestore:()=>void }

export default function CoefficientEditor({solution,edited,onEdit,onRestore}:Props) {
  const [selected,setSelected]=useState(0),[axis,setAxis]=useState<0|1>(0),[zoom,setZoom]=useState(1)
  const count=solution.coefficients.length/2,index=Math.min(selected,count-1)
  const modes=Array.from({length:count},(_,i)=>[modeParameters(solution,i,0),modeParameters(solution,i,1)])
  const current=modes[index][axis]
  const maximum=Math.max(50,Math.ceil(Math.max(...modes.flat().map(m=>m.amplitudePercent))/10)*10)
  return <section className="pw-coefficients" aria-labelledby="pw-coefficient-title">
    <div className="pw-editor-heading"><div><h3 id="pw-coefficient-title">Oscillation amplitudes</h3><p>Type a name to fit these waves. Select a mode and change its amplitude or phase to reshape the drawing.</p></div><button type="button" onClick={onRestore} disabled={!edited}>Restore fitted coefficients</button></div>
    <div className="pw-spectrum-tools"><div className="pw-axis-buttons" aria-label="Axis to edit"><button type="button" aria-pressed={axis===0} onClick={()=>setAxis(0)}><i className="pw-cyan"/> Edit x</button><button type="button" aria-pressed={axis===1} onClick={()=>setAxis(1)}><i className="pw-orange"/> Edit y</button></div><label htmlFor="pw-spectrum-zoom">Spectrum zoom <input id="pw-spectrum-zoom" type="range" min="1" max="3" step=".25" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><output>{zoom.toFixed(1)}×</output></label></div>
    <div className="pw-spectrum-label"><span>{maximum.toFixed(1)}% of reference span</span><span>{count} {solution.settings.kind==='coupled'?'coupled modes':'harmonics'} per axis</span></div>
    <div className="pw-spectrum-scroll" aria-label="Scroll to inspect higher frequency modes">
      <div className="pw-spectrum" style={{minWidth:`calc(var(--pw-mode-column) * ${count*zoom})`}}>
        {modes.map(([x,y],i)=><button type="button" key={i} className={i===index?'pw-mode pw-mode-selected':'pw-mode'}
          aria-pressed={i===index} aria-label={`Mode ${i+1}, ${x.frequency.toFixed(2)} hertz, x amplitude ${x.amplitudePercent.toFixed(2)} percent, y amplitude ${y.amplitudePercent.toFixed(2)} percent`}
          onClick={()=>setSelected(i)}>
          <span className="pw-mode-bars"><span className="pw-amplitude-x" style={{height:`${x.amplitudePercent/maximum*100}%`}}/><span className="pw-amplitude-y" style={{height:`${y.amplitudePercent/maximum*100}%`}}/></span><span>{i+1}</span>
        </button>)}
      </div>
    </div>
    <div className="pw-mode-editor">
      <div className="pw-mode-detail"><span>Mode {index+1} · {axis===0?'x':'y'} axis</span><strong>{current.frequency.toFixed(2)} Hz</strong><span>Frame contribution {current.frameAmplitudeMm.toFixed(3)} mm</span></div>
      <div><label htmlFor="pw-mode-amplitude">Amplitude <output>{current.amplitudePercent.toFixed(2)}%</output></label><div className="pw-mode-input"><input id="pw-mode-amplitude" type="range" min="0" max="100" step=".01" value={current.amplitudePercent} onChange={e=>onEdit(index,axis,Number(e.target.value),current.phase)}/><input aria-label="Amplitude value in percent" type="number" min="0" max="100" step=".01" value={Number(current.amplitudePercent.toFixed(2))} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isFinite(value)&&value>=0&&value<=100)onEdit(index,axis,value,current.phase)}}/></div></div>
      <div><label htmlFor="pw-mode-phase">Starting phase <output>{current.phase.toFixed(0)}°</output></label><div className="pw-mode-input"><input id="pw-mode-phase" type="range" min="-180" max="180" step="1" value={current.phase} onChange={e=>onEdit(index,axis,current.amplitudePercent,Number(e.target.value))}/><input aria-label="Phase value in degrees" type="number" min="-180" max="180" step="1" value={Math.round(current.phase)} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isFinite(value)&&value>=-180&&value<=180)onEdit(index,axis,current.amplitudePercent,value)}}/></div></div>
    </div>
    <p className="pw-editor-note">{solution.settings.kind==='coupled'?'A coupled mode moves several pendulums together. The bars show each mode’s contribution to the frame; physical size is scaled to keep swings within 10°.':'Each bar is an independent sine wave. Its height controls the swing size, and its phase controls where that swing begins.'}</p>
  </section>
}
