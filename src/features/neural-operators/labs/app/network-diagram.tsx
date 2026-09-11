'use client';
import { useState } from 'react';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
import { evaluate } from '@/features/neural-operators/labs/lib/kernel-network';
import type { KernelArchitecture } from '@/features/neural-operators/labs/lib/continuous';
export default function NetworkDiagram({theta, mode, widths, fieldAt}: {theta:number[];mode:KernelArchitecture;widths:number[];fieldAt:(x:number)=>number}) {
  const [x,setX]=useState(.3),[y,setY]=useState(.6);
  const trace=evaluate(theta,x,y,mode,widths,false,fieldAt(x),fieldAt(y));
  const names=mode==='difference'?['y − x']:mode==='temperatures'?['x','y','T₀(x)','T₀(y)']:mode==='temperature_x'?['x','y','T₀(x)']:['x','y'];
  const columns=trace.activations.length;
  const px=(c:number)=>65+c*830/(columns-1), py=(i:number,count:number)=>count===1?245:75+i*340/(count-1);
  return <details open><summary>Network diagram · {widths.join(' → ')} hidden neurons · {theta.length} parameters</summary>
    <div className="paper-controls">{[{label:'Probe x',v:x,set:setX},{label:'Probe y',v:y,set:setY}].map(p=><div className="paper-control" key={p.label}><label>{p.label}<b>{p.v.toFixed(2)}</b></label><Slider aria-label={p.label} min={0} max={1} step={.01} value={[p.v]} onValueChange={v=>p.set(Array.isArray(v)?v[0]:v)}/></div>)}</div>
    <svg viewBox="0 0 960 470" style={{width:'100%'}} role="img" aria-label={`Kernel network with ${names.length} inputs and ${widths.length} hidden layers`}>
      {trace.layers.map((layer,depth)=>Array.from({length:layer.outputs},(_,j)=>Array.from({length:layer.inputs},(_,i)=>{
        const weight=theta[layer.offset+j*(layer.inputs+1)+i];
        return <line key={`${depth}-${j}-${i}`} x1={px(depth)} y1={py(i,layer.inputs)} x2={px(depth+1)} y2={py(j,layer.outputs)} stroke={weight<0?'#245de5':'#e87932'} strokeWidth={.5+Math.min(2,Math.abs(weight)/2)} opacity={.3}><title>Weight {weight.toFixed(5)}</title></line>;
      })))}
      {trace.activations.map((values,c)=><g key={c}><text x={px(c)} y={28} textAnchor="middle" fontSize={13}>{c===0?'Inputs':c===columns-1?'K output':`Layer ${c} · tanh`}</text>{values.map((value,i)=><g key={i}><rect x={px(c)-27} y={py(i,values.length)-13} width={54} height={26} rx={9} fill="white" stroke="#809cc5"/><text x={px(c)} y={py(i,values.length)+4} textAnchor="middle" fontSize={10}>{value.toFixed(3)}</text>{c===0&&<text x={px(c)} y={py(i,values.length)-20} textAnchor="middle" fontSize={12}>{names[i]}</text>}<title>{c>0?`Bias ${theta[trace.layers[c-1].offset+i*(trace.layers[c-1].inputs+1)+trace.layers[c-1].inputs].toFixed(5)}`:'Input value'}</title></g>)}</g>)}
      <text x={480} y={455} textAnchor="middle" fontSize={12}>Blue: negative weights · orange: positive · node numbers: current activations</text>
    </svg><p className="paper-source">Probe temperatures come from the measured input via linear interpolation. This diagram evaluates one kernel value. The output field is computed by a separate quadrature sum. All hidden layers use tanh; the final output is linear.</p>
  </details>;
}
