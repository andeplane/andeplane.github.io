'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { sourceValue } from '@/features/neural-operators/labs/lib/heat-source';
import NetworkDiagram from './network-diagram';
import { NativeSelect, NativeSelectOption } from '@/features/neural-operators/labs/components/ui/native-select';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger, DialogClose } from '@/features/neural-operators/labs/components/ui/dialog';
import { applyLearned, targetReference, sampleAt, transportDiagnostics } from '@/features/neural-operators/labs/lib/continuous';
import type { TargetMode, Aggregation } from '@/features/neural-operators/labs/lib/continuous';
import type { KernelArchitecture } from '@/features/neural-operators/labs/lib/continuous';
import KernelMap from './kernel-map';
import { contributionTex } from '@/features/neural-operators/labs/lib/equations';
import { applyIntegral, cellWidths, createTrainer, error, neuralKernel, points, probe, reference, smoothKernel, trainKernel, trainingPairs } from '@/features/neural-operators/labs/lib/continuous';

export function Control({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return <div className="paper-control"><label>{label}<b>{value}</b></label><Slider aria-label={label} min={min} max={max} step={step} value={[value]} onValueChange={v => onChange(Array.isArray(v) ? v[0] : v)} /></div>;
}
export function Plot({ lines, dots, region, label, onAddPoint, range = [-1, 1.6] }: { lines: { values: number[]; color: string; name: string; xs?: number[] }[]; dots?: { x: number; y: number; weight?: number }[]; region?: [number, number]; label: string; onAddPoint?: (x: number) => void; range?: [number, number] }) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  function position(svg: SVGSVGElement, clientX: number, clientY: number) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return point.x >= 36 && point.x <= 660 && point.y >= 24 && point.y <= 222 ? (point.x - 36) / 624 : null;
  }
  const cells = onAddPoint && dots ? dots.map((p, i) => ({
    left: i === 0 ? 0 : (dots[i - 1].x + p.x) / 2,
    right: i === dots.length - 1 ? 1 : (p.x + dots[i + 1].x) / 2,
    x: p.x,
  })) : [];
  const selectedCell = cells.length ? (hoverX === null ? Math.floor(cells.length / 2) : Math.max(0, cells.findIndex(c => hoverX >= c.left && hoverX <= c.right))) : -1;
  const cell = cells[selectedCell];
  const px = (x: number) => 36 + x * 624, py = (y: number) => 222 - (y - range[0]) / (range[1] - range[0]) * 198;
  return <figure className="paper-plot"><figcaption>{label}</figcaption><svg viewBox="0 0 700 252" role={onAddPoint ? 'group' : 'img'} aria-label={label} style={onAddPoint ? { cursor: 'crosshair' } : undefined} onPointerMove={e => { if (onAddPoint) setHoverX(position(e.currentTarget, e.clientX, e.clientY)); }} onPointerLeave={() => setHoverX(null)} onClick={e => { const x = position(e.currentTarget, e.clientX, e.clientY); if (onAddPoint && x !== null) onAddPoint(x); }}>
    {region && <rect x={px(Math.max(0, region[0]))} y={24} width={Math.max(0, Math.min(1, region[1]) - Math.max(0, region[0])) * 624} height={198} fill="#f9b366" opacity={0.23} />}
    {cells.map((c, i) => <g key={i} pointerEvents="none"><rect x={px(c.left)} y={24} width={(c.right - c.left) * 624} height={198} fill={i === selectedCell ? '#f9b366' : i % 2 ? '#dce7f8' : '#edf3fc'} opacity={i === selectedCell ? 0.25 : 0.35} /><line x1={px(c.left)} x2={px(c.left)} y1={24} y2={222} stroke="#b8c8da" strokeWidth={0.6} strokeDasharray="2 3" /></g>)}
    <path d={`M36 24V222H660 M36 ${py(0)}H660`} fill="none" stroke="#b8c8da" strokeWidth="1" />
    <text x={36} y={242}>0</text><text x={648} y={242}>1</text><text x={340} y={242}>physical coordinate x</text>
    {lines.map((line, k) => <path key={k} d={line.values.map((v, i) => `${i ? 'L' : 'M'}${px(line.xs?.[i] ?? i / (line.values.length - 1))},${py(v)}`).join(' ')} fill="none" stroke={line.color} strokeWidth={2.7} />)}
    {onAddPoint && hoverX !== null && <line x1={px(hoverX)} x2={px(hoverX)} y1={24} y2={222} stroke="#e87932" strokeWidth={1.5} strokeDasharray="5 5" pointerEvents="none" />}
    {cell && <g pointerEvents="none"><path d={`M${px(cell.left)} 202V212 M${px(cell.left)} 207H${px(cell.right)} M${px(cell.right)} 202V212`} stroke="#ac561d" strokeWidth={1.6} fill="none" /><text x={Math.max(85, Math.min(610, px((cell.left + cell.right) / 2)))} y={195} textAnchor="middle" style={{ fill: '#934718', fontWeight: 600 }}>Δ{selectedCell} = {(cell.right - cell.left).toFixed(4)}</text></g>}
    {dots?.map((p, i) => <g key={i}>{p.weight !== undefined && <rect x={px(p.x - p.weight / 2)} y={216} width={p.weight * 624} height={6} fill={i % 2 ? '#acc4fa' : '#4676d6'} />}<circle cx={px(p.x)} cy={py(p.y)} r={3.5} fill="#e87932"><title>{`x=${p.x.toFixed(3)}, value=${p.y.toFixed(4)}`}</title></circle></g>)}
  </svg><div className="plot-legend">{lines.map(l => <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>)}{dots && <span><i style={{ background: '#e87932' }} />Measured samples</span>}</div>{cell && <div className="paper-source"><MathTex tex={String.raw`\Delta_{${selectedCell}}=b_{${selectedCell + 1}}-b_{${selectedCell}}=${cell.right.toFixed(5)}-${cell.left.toFixed(5)}=${(cell.right - cell.left).toFixed(5)}`} /><span>Shaded bands are quadrature cells. Hover to inspect a cell; the bracket spans its width. Boundaries are halfway between samples, with endpoints at 0 and 1. These widths are recalculated when you add points and are the weights used in the prediction.</span></div>}</figure>;
}
const displayX = Array.from({ length: 161 }, (_, i) => i / 160);
export function IntegralLab() {
  const [n, setN] = useState(12), [clustered, setClustered] = useState(false), [query, setQuery] = useState(0.4), [outputN, setOutputN] = useState(65);
  const xs = points(n, clustered), ds = cellWidths(xs), values = xs.map(x => probe(x));
  const ys = Array.from({ length: outputN }, (_, i) => i / (outputN - 1));
  const truth = reference(ys), weighted = applyIntegral(xs, values, ys), naive = applyIntegral(xs, values, ys, smoothKernel, false);
  const terms = xs.map((x, i) => smoothKernel(x, query) * values[i] * ds[i]);
  const selected = terms.reduce((best, v, i) => Math.abs(v) > Math.abs(terms[best]) ? i : best, 0);
  return <>
    <p>Keep the hot/cold field, but use one spatial coordinate so we can see each sample and its interval. This example maps a field to a spatially smoothed field on the unit interval. There is <strong>no time variable and no training in this step</strong>. This is a known operator we will learn in the next lesson.</p>
    <MathTex tex={String.raw`g(y)=(\mathcal G f)(y)=\int_0^1 K(x,y)f(x)\,dx,\qquad K(x,y)=\frac{e^{-((y-x)/0.16)^2}}{0.16\sqrt{\pi}}`} />
    <p>The kernel <MathTex inline tex="K(x,y)" /> tells us how much the measurement near input position <MathTex inline tex="x" /> contributes to output position <MathTex inline tex="y" />. Nearby positions get larger weights here. At the domain boundary the integral is truncated; we do not wrap or renormalize it. This choice is part of the operator’s definition.</p>
    <div className="paper-controls"><Control label="Input samples N" value={n} min={4} max={96} step={4} onChange={setN} /><Control label="Output queries M" value={outputN} min={9} max={129} step={8} onChange={setOutputN} /><Control label="Inspect output position y" value={query} min={0} max={1} step={0.01} onChange={setQuery} /></div>
    <button className="paper-button" onClick={() => setClustered(!clustered)}>{clustered ? 'Use uniform samples' : 'Cluster samples near x = 0'}</button>
    <div className="paper-two"><Plot label="Same continuous input, different measurement locations" lines={[{ values: displayX.map(x => probe(x)), color: '#245de5', name: 'Underlying f(x)' }]} dots={xs.map((x, i) => ({ x, y: values[i] }))} /><Plot label="The output field evaluated at M query positions" lines={[{ values: truth, color: '#1c9a7b', name: 'Reference integral', xs: ys }, { values: weighted, color: '#245de5', name: 'Physical cell weights', xs: ys }, { values: naive, color: '#e87932', name: 'Equal weights 1/N', xs: ys }]} /></div>
    <div className="paper-metrics"><div><b>{(error(weighted, truth) * 100).toFixed(2)}%</b>weighted relative error</div><div><b>{(error(naive, truth) * 100).toFixed(2)}%</b>equal-weight relative error</div><div><b>{ds.reduce((a, b) => a + b, 0).toFixed(3)}</b>sum of cell lengths (domain length)</div></div>
    <h3>Pixels → an integral approximation. No hidden reconstruction step.</h3>
    <MathTex tex={String.raw`G_j=\sum_{i=0}^{N-1}K(x_i,y_j)F_i\,\Delta_i\;\approx\;g(y_j),\qquad F_i=f(x_i)`} />
    <p>We only pass measured values and coordinates into that sum. Each <MathTex inline tex={String.raw`\Delta_i`} /> is the length of the sample’s cell: boundaries lie halfway to its neighbors, with the outer boundaries at 0 and 1. A densely sampled region has smaller cells, so measuring it more often does not give it more physical area. Equal weights work on this uniform grid because each cell has length 1/N; they describe the wrong integral on the clustered grid.</p>
    <div className="paper-callout"><b>Inspect one contribution at y = {query.toFixed(2)}</b><p>Sample {selected}: position {xs[selected].toFixed(3)}, value {values[selected].toFixed(4)}, cell length {ds[selected].toFixed(4)}.</p><MathTex tex={contributionTex(smoothKernel(xs[selected], query), values[selected], ds[selected])} /><p>Adding all {n} contributions gives <strong>{terms.reduce((a, b) => a + b, 0).toFixed(5)}</strong>. The dense reference gives <strong>{reference([query])[0].toFixed(5)}</strong>. Their difference is numerical integration error. Displayed factors are rounded; the sum uses full precision.</p></div>
    <pre><code>{`// F[i] = f(x[i]); y is ANY requested output coordinate.
const G = queries.map(y =>
  x.reduce((sum, xi, i) =>
    sum + kernel(xi, y) * F[i] * cellWidth[i], 0)
);
// Increase N: more observations, more terms, smaller cells.
// Increase M: more output evaluations, same observations.
// The kernel function is unchanged in both cases.`}</code></pre>
    <p className="paper-source">Further reading — Berner et al. (2026): equations (7), (9), (20) and Figure 5. The reference here is a 512-point quadrature, not an exact symbolic integral. Reported errors compare outputs at the displayed equally spaced queries.</p>
  </>;
}
export function RadiusLab() {
  const [n, setN] = useState(16);
  const xs = points(n), y = 0.5, radius = 0.2;
  const fixedPoints = xs.filter(x => Math.abs(x - y) <= 2 / n), physical = xs.filter(x => Math.abs(x - y) <= radius);
  return <>
    <p>A five-position convolution stencil is defined in array indices. If its offsets are −2, −1, 0, 1, 2, its physical half-width is 2/N on a unit domain. Refining the grid changes what “nearby” means. To preserve that physical meaning, define the neighborhood in physical coordinates and approximate the resulting integral.</p>
    <Control label="Grid resolution N" value={n} min={8} max={96} step={8} onChange={setN} />
    <div className="paper-two"><Plot label={`Fixed index radius: 2/N = ${(2 / n).toFixed(3)}`} region={[y - 2 / n, y + 2 / n]} lines={[{ values: displayX.map(x => probe(x)), color: '#245de5', name: 'f(x)' }]} dots={fixedPoints.map(x => ({ x, y: probe(x) }))} /><Plot label={`Fixed physical radius: ${radius} (${physical.length} input points)`} region={[y - radius, y + radius]} lines={[{ values: displayX.map(x => probe(x)), color: '#245de5', name: 'f(x)' }]} dots={physical.map(x => ({ x, y: probe(x) }))} /></div>
    <p>The query at 0.5 lies between samples on these midpoint grids; the diagram highlights contributing inputs inside each radius. Watch the orange window as you refine the grid: the index-defined neighborhood collapses; the physical one stays put.</p>
    <MathTex tex={String.raw`g(y)=\int_{|x-y|\le r}K_\theta(y-x)f(x)\,dx\;\approx\!\sum_{|x_i-y|\le r}K_\theta(y-x_i)F_i\Delta_i`} />
    <p><strong>Variable array size alone is not resolution independence.</strong> The neighborhoods, kernel and integration weights must represent the same continuous operation. This example concerns a fixed stencil; an architecture can deliberately compensate through coordinate-aware kernels and physical neighborhoods.</p>
    <p className="paper-source">Further reading — Berner et al. (2026): equations (11)–(12), Figure 3.</p>
  </>;
}
export function NeuralKernelLab() {
  const [architecture,setArchitecture]=useState<KernelArchitecture>('temperatures');
  const [widths,setWidths]=useState([12]),[targetMode,setTargetMode]=useState<TargetMode>('smoothing'),[withSource,setWithSource]=useState(false);
  const [horizon,setHorizon]=useState(.1);
  const [aggregation,setAggregation]=useState<Aggregation>("direct");
  const state=useRef(createTrainer("temperatures",false,12,[12],"direct"));
  const [running,setRunning]=useState(false),[step,setStep]=useState(0),[n,setN]=useState(24),[out,setOut]=useState(65),[seed,setSeed]=useState(0),[clustered,setClustered]=useState(false),[addedPoints,setAddedPoints]=useState<number[]>([]),[pairIndex,setPairIndex]=useState(0);
  const [trainingOptions,setTrainingOptions]=useState({count:8,inputPoints:24,outputPoints:24,sampling:'uniform' as 'uniform'|'random'});
  const [backendPreference,setBackendPreference]=useState<'auto'|'cpu'>('auto');
  const [backendStatus,setBackendStatus]=useState('Auto: WebGPU will be checked when training starts');
  const [trainingSpeed,setTrainingSpeed]=useState('');
  const [stopThreshold,setStopThreshold]=useState(1e-5),[autoStopped,setAutoStopped]=useState(false);
  const trainingTask=useRef<Promise<void>>(Promise.resolve());
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const pairs=useMemo(()=>trainingPairs(withSource,targetMode,horizon,trainingOptions),[withSource,targetMode,horizon,trainingOptions]);
  function configure(mode:KernelArchitecture, layers:number[], target:TargetMode, source:boolean, form:Aggregation=aggregation) {
    setRunning(false);state.current=createTrainer(mode,source,layers[0],layers,form);setStep(0);setStopThreshold(1e-5);setAutoStopped(false);
    setAggregation(form);setArchitecture(mode);setWidths(layers);setTargetMode(target);setWithSource(source);
  }
  function configureData(update: Partial<typeof trainingOptions>) {
    configure(architecture,widths,targetMode,withSource);
    setPairIndex(0);setTrainingSpeed('');
    setTrainingOptions(previous=>({...previous,...update}));
  }
  useEffect(()=> {
    if(!running)return;
    let cancelled=false;
    const previous=trainingTask.current;
    const work=(async()=>{
      await previous;
      if(cancelled)return;
      const trainingState=state.current;
      let gpu:import('@/features/neural-operators/labs/lib/tensor-trainer').TensorTrainer|undefined;
      try {
        if(backendPreference==='auto') {
          setBackendStatus('Initializing WebGPU…');
          try {
            const module=await import('@/features/neural-operators/labs/lib/tensor-trainer');
            await module.initializeWebGPU();
            if(cancelled)return;
            gpu=new module.TensorTrainer(trainingState,pairs);
            setBackendStatus('WebGPU · vectorized training');
          } catch(error) {
            setBackendStatus(`CPU fallback · ${error instanceof Error?error.message:'WebGPU unavailable'}`);
          }
        } else setBackendStatus('CPU · batched training');
        let lastDraw=performance.now();
        while(!cancelled&&state.current===trainingState) {
          const started=performance.now(),before=trainingState.step;
          if(gpu) {
            try {
              const checkpoint=await gpu.run(Math.min(Math.max(1,Math.floor(46080/(pairs.length*pairs[0].xs.length*pairs[0].ys.length))),10));
              if(state.current!==trainingState)break;
              Object.assign(trainingState,checkpoint);
            } catch(error) {
              gpu.dispose();gpu=undefined;
              setBackendStatus(`CPU fallback · ${error instanceof Error?error.message:'GPU execution failed'}`);
              continue;
            }
          } else {
            do { trainKernel(trainingState,pairs); }
            while(performance.now()-started<12&&trainingState.loss>=stopThreshold);
          }
          if(!cancelled&&trainingState.loss<stopThreshold) {
            setStep(trainingState.step);setAutoStopped(true);setRunning(false);
            break;
          }
          if(!cancelled&&(performance.now()-lastDraw>=100)) {
            setStep(trainingState.step);
            setTrainingSpeed(`${((performance.now()-started)/Math.max(1,trainingState.step-before)).toFixed(2)} ms/update`);
            lastDraw=performance.now();
          }
          await new Promise<void>(resolve=>setTimeout(resolve,0));
        }
        if(!cancelled&&state.current===trainingState){setStep(trainingState.step);setRunning(false);}
      } finally {gpu?.dispose();if(mounted.current&&state.current===trainingState)setStep(trainingState.step);}
    })();
    trainingTask.current=work.catch(error=>{
      if(!cancelled){setRunning(false);setBackendStatus(`Training stopped: ${error instanceof Error?error.message:String(error)}`);}
    });
    return ()=>{cancelled=true;};
  },[running,pairs,backendPreference,stopThreshold]);
  const xs=[...points(n,clustered),...addedPoints].sort((a,b)=>a-b).filter((x,i,all)=>i===0||x-all[i-1]>1e-8), values=xs.map(x=>probe(x,seed)), ys=Array.from({length:out},(_,i)=>i/(out-1)),theta=state.current.theta;
  const fieldAt=(x:number)=>sampleAt(xs,values,x);
  const kernel=(x:number,y:number)=>neuralKernel(theta,x,y,architecture,widths,fieldAt(x),fieldAt(y));
  const referenceKernel=(x:number,y:number)=>smoothKernel(x,y)*(targetMode==='nonlinear'?1+(fieldAt(x)-fieldAt(y))**2:1);
  const predicted=applyLearned(theta,architecture,widths,xs,values,ys,targetMode,horizon,aggregation);
  const target=targetReference(ys,seed,targetMode,horizon).map((v,i)=>v+(withSource?sourceValue(ys[i]):0));
  const solverInfo=targetMode==='nonlinear'?transportDiagnostics(ys,seed,horizon):null;
  const dense=points(256),densePrediction=applyLearned(theta,architecture,widths,dense,dense.map(x=>probe(x,seed)),ys,targetMode,horizon,aggregation);
  const plotRange:[number,number]=[-1,1.6];
  return <>
    <div className="paper-actions"><Dialog><DialogTrigger className="paper-button">⚙ Preferences</DialogTrigger><DialogContent className="kernel-preferences"><div className="kernel-preferences-header"><DialogTitle>Experiment settings</DialogTitle><DialogDescription>Configure the training data and learned kernel. Changes to data or architecture reset training.</DialogDescription></div><div className="kernel-preferences-body"><section className="kernel-preferences-section"><h3>Compute</h3>
      <label htmlFor="training-backend">Training backend</label><NativeSelect id="training-backend" value={backendPreference} onChange={e=>{setRunning(false);setBackendPreference(e.target.value as 'auto'|'cpu');setBackendStatus('Backend change applies on next training run');}}><NativeSelectOption value="auto">Auto — WebGPU with CPU fallback</NativeSelectOption><NativeSelectOption value="cpu">CPU</NativeSelectOption></NativeSelect><p>WebGPU batches forward passes, gradients and Adam updates on the GPU. Initial shader compilation can take a moment. Performance depends on your device and network size.</p>
      </section><section className="kernel-preferences-section"><h3>Training data</h3><div className="kernel-preferences-grid"><Control label="Training field pairs" value={trainingOptions.count} min={1} max={64} onChange={count=>configureData({count})}/>
      <Control label="Input points per training field" value={trainingOptions.inputPoints} min={2} max={96} onChange={inputPoints=>configureData({inputPoints})}/>
      <Control label="Output points per training field" value={trainingOptions.outputPoints} min={2} max={96} onChange={outputPoints=>configureData({outputPoints})}/>
      </div><label htmlFor="training-sampling">Training point locations</label><NativeSelect id="training-sampling" value={trainingOptions.sampling} onChange={e=>configureData({sampling:e.target.value as 'uniform'|'random'})}><NativeSelectOption value="uniform">Evenly spaced midpoint grids</NativeSelectOption><NativeSelectOption value="random">Random grids — independent for each pair</NativeSelectOption></NativeSelect>
      <p>Random mode draws sorted uniform random input and output locations independently for each field. These reproducible grids stay fixed during training. Input quadrature weights are the lengths of cells bounded by neighboring midpoints and the domain edges, so they sum to 1. Sparse random grids can leave gaps; randomness does not guarantee better accuracy. Output loss averages errors at the sampled query points.</p>
      <p>{trainingOptions.count} pairs × {trainingOptions.inputPoints} input points × {trainingOptions.outputPoints} output points = {(trainingOptions.count*trainingOptions.inputPoints*trainingOptions.outputPoints).toLocaleString()} kernel evaluations per update. Changing these settings regenerates the training data and resets weights. Evaluation controls are separate.</p>
      </section><section className="kernel-preferences-section"><h3>Prediction target</h3><label htmlFor="target-mode">Target mapping</label><NativeSelect id="target-mode" value={targetMode} onChange={e=>configure(architecture,widths,e.target.value as TargetMode,withSource)}><NativeSelectOption value="smoothing">Original linear smoothing</NativeSelectOption><NativeSelectOption value="nonlinear">Nonlinear transport → future temperature</NativeSelectOption></NativeSelect>
      {targetMode==='nonlinear'&&<div><label htmlFor="transport-time">Prediction horizon Δt (0.01–2)</label><input id="transport-time" type="number" min={.01} max={2} step={.01} value={horizon} className="kernel-number-input" onChange={e=>{const v=e.target.valueAsNumber;if(Number.isFinite(v)&&v>=.01&&v<=2){setHorizon(v);configure(architecture,widths,targetMode,withSource);}}}/><p>Adaptive internal time steps reach this horizon. Changing it regenerates T₀/T₁ pairs and resets training.</p></div>}
      </section><section className="kernel-preferences-section"><h3>Kernel network</h3><p>Layers below are hidden layers inside the kernel network, not physical time steps or stacked operator layers.</p><label htmlFor="kernel-form">Kernel form (integrated over x)</label><NativeSelect id="kernel-form" value={architecture} onChange={e=>{const mode=e.target.value as KernelArchitecture;configure(mode,widths,targetMode,withSource,mode==='coordinates'?'weighted':'direct');}}><NativeSelectOption value="coordinates">K(x, y) T₀(x)</NativeSelectOption><NativeSelectOption value="temperature_x">K(x, y, T₀(x))</NativeSelectOption><NativeSelectOption value="temperatures">K(x, y, T₀(x), T₀(y))</NativeSelectOption></NativeSelect><p>Only the first form multiplies by T₀(x) outside the kernel. All three multiply by quadrature cell widths when summed.</p>
      <label htmlFor="source-mode">Source</label><NativeSelect id="source-mode" value={withSource?'yes':'no'} onChange={e=>configure(architecture,widths,targetMode,e.target.value==='yes')}><NativeSelectOption value="no">No source</NativeSelectOption><NativeSelectOption value="yes">Source at 0.4 — fit using K only</NativeSelectOption></NativeSelect>
      <Control label="Hidden layers" value={widths.length} min={1} max={5} onChange={count=>configure(architecture,Array.from({length:count},(_,i)=>widths[i]??12),targetMode,withSource)}/>
      {widths.map((w,i)=><Control key={i} label={`Layer ${i+1} neurons`} value={w} min={1} max={12} onChange={v=>configure(architecture,widths.map((old,j)=>j===i?v:old),targetMode,withSource)}/>)}
      <p>{theta.length} parameters · {widths.join(' → ')} hidden neurons · tanh activations</p>
      </section></div><div className="kernel-preferences-footer"><span>Settings apply immediately</span><DialogClose className="paper-button primary">Done</DialogClose></div></DialogContent></Dialog><span>{targetMode==='nonlinear'?`Temperature at Δt = ${horizon}`:'Linear smoothing'} · {architecture} · {aggregation} · layers {widths.join(' → ')} · {theta.length} parameters{withSource?' · source at 0.4':''}</span></div>
    <p>Compare a shallow kernel with deeper networks on the same training fields. The coordinate-only options remain available as limited baselines; adding temperature inputs allows the interaction strength to depend on the field itself.</p>
    <h3>Learn the output temperature from paired fields</h3><MathTex tex={architecture==='temperatures'?String.raw`\widehat T_1(y)=\sum_iK_\theta(x_i,y,T_0(x_i),\widetilde T_0(y))\Delta_i`:architecture==='temperature_x'?String.raw`\widehat T_1(y)=\sum_iK_\theta(x_i,y,T_0(x_i))\Delta_i`:String.raw`\widehat T_1(y)=\sum_iK_\theta(x_i,y)T_0(x_i)\Delta_i`}/><p>{aggregation==='direct'?'The network learns the complete integrand; only the quadrature cell width multiplies its output.':'The network sees the selected inputs, then its output is additionally multiplied by T₀(xᵢ) and the cell width. The external temperature factor is an explicit architectural choice.'} No residual addition, temperature-difference factor, cubic law or Δt factor is built into any prediction. All three use a scalar kernel output with Ψ equal to the identity.</p><p>{architecture==='temperatures'?'The selected network receives all four values: x, y, T₀(x), and interpolated T₀(y).':architecture==='temperature_x'?'The selected network receives x, y and T₀(x), but no T₀(y).':'This coordinate-only input-weighted kernel represents a linear map of the field.'} The selected kernel form can be used with either target. Loss compares predicted and observed output temperatures only.</p>
    {targetMode==='nonlinear'?<details><summary>Data generator only: nonlinear physics and accurate solver</summary><MathTex tex={String.raw`\partial_tT(y,t)=\int_0^1K_0(x,y)(\delta+\delta^3)dx,\quad\delta=T(x,t)-T(y,t),\qquad T_1(y)=T(y,\Delta t)`}/><p>Adaptive RK4 with 512 quadrature points (absolute tolerance 10⁻¹⁰, relative tolerance 10⁻⁸) evolves the field to Δt = {horizon}. This equation is used only to generate temperature pairs. Neither prediction architecture receives the physics formula. Changing Δt retrains a new fixed-horizon map.</p></details>:<details><summary>Data generator only: original smoothing target</summary><MathTex tex={String.raw`T_1(y)=\int_0^1K_0(x,y)T_0(x)\,dx`}/><p>The original smoothing operator creates the output labels. Either aggregation can attempt to learn these same pairs.</p></details>}
    <p><strong>Where does f(y) come from?</strong> During both training and evaluation, we linearly interpolate the available input measurements at each output query, holding the nearest value outside their span. With matching uniform grids this returns the measured values exactly. The model never receives the hidden true curve between measurements. This interpolation error is part of sparse-input evaluation.</p>
    {withSource&&<div className="paper-callout"><b>Source experiment</b><p>Training labels include a localized output source at 0.4 (width 0.04, peak 1). No separate β or additive model branch is used. {aggregation==='direct'?'A direct integrand can represent a nonzero source even for zero input; its learned biases are integrated as part of K.':'The original input-weighted smoothing model still predicts zero for zero input and cannot represent an arbitrary fixed source.'}</p></div>}
    {solverInfo&&<p className="paper-source">Reference solver: {solverInfo.n} spatial points · {solverInfo.accepted} accepted time steps · {solverInfo.rejected} rejected attempts · final time {horizon}. Adaptive tolerances control temporal error; spatial convergence is checked separately.</p>}
    <NetworkDiagram theta={theta} mode={architecture} widths={widths} fieldAt={fieldAt}/>
    <MathTex tex={String.raw`h_0=\text{selected inputs},\quad h_{\ell+1}=\tanh(W_\ell h_\ell+b_\ell),\quad K_\theta=w_{\rm out}^{\mathsf T}h_L+b_{\rm out}`}/>
    <p>There are {widths.length} hidden layers with {widths.join(', ')} neurons, followed by one linear scalar output. Every layer's weights and biases are trained through the quadrature sum. One optimizer update uses all {pairs.length} field pairs; it is not a physical time step.</p>
    <div className="paper-actions"><button className="paper-button primary" onClick={()=>{if(running){setRunning(false);}else{if(autoStopped){setStopThreshold(t=>t/10);setAutoStopped(false);}setRunning(true);}}}>{running?'Pause training':step?'Continue training':'Train kernel'}</button><button className="paper-button" onClick={()=>configure(architecture,widths,targetMode,withSource)}>Reset weights</button><span>{step.toLocaleString()} updates · {step?`loss ${state.current.loss.toExponential(3)} (before latest update)`:'not trained'}</span></div>
    <p role="status">{autoStopped?`Automatically paused: training MSE < ${stopThreshold.toExponential(0)}. Continue to target ${(stopThreshold/10).toExponential(0)}.`:`Auto-pause when training MSE < ${stopThreshold.toExponential(0)}.`} This uses training loss, not held-out relative error. CPU checks each update; WebGPU checks each batch (up to 10 updates). Manual pause preserves the target; resetting weights restores 1e-5.</p>
    <p className="paper-source" role="status">{backendStatus}{trainingSpeed?` · ${trainingSpeed}`:''} · plots update up to 10 times per second.</p>
    <details><summary>Inspect the {pairs.length} training pairs</summary><Control label="Training pair" value={pairIndex+1} min={1} max={pairs.length} onChange={v=>setPairIndex(v-1)}/><div className="paper-two"><Plot label="Input measurements" lines={[{values:displayX.map(x=>probe(x,pairIndex+1)),color:'#245de5',name:'Input field'}]} dots={pairs[pairIndex].xs.map((x,i)=>({x,y:pairs[pairIndex].values[i]}))}/><Plot label={targetMode==='nonlinear'?`Target temperature T(y, ${horizon})`:'Target output'} range={plotRange} lines={[{values:pairs[pairIndex].target,xs:pairs[pairIndex].ys,color:'#1c9a7b',name:'Paired output'}]}/></div><p>{pairs.length} training fields, {trainingOptions.inputPoints} input and {trainingOptions.outputPoints} output samples each, on {trainingOptions.sampling === 'random' ? 'independent random grids (fixed across updates)' : 'uniform midpoint grids'}. Reference integration uses 512 points; nonlinear targets additionally use adaptive time integration. Seeds 0 and 100+ are held out. Loss is mean squared output error at the training query points; Adam uses learning rate 0.02.</p></details>
    <h3>Current kernel and output</h3><p>For temperature inputs, the heatmap is conditioned on the current held-out field's interpolated measurements; changing that field can change K. The color scale remains fixed at −4 to +4. A direct learned integrand has no supplied ground-truth kernel; compare its predicted temperatures with the solver labels.</p>
    <div className="paper-two"><KernelMap theta={theta} step={step} mode={architecture} kernel={kernel} caption="Learned kernel for the current input"/>{targetMode==='smoothing'&&aggregation==='weighted'&&<KernelMap kernel={referenceKernel} caption="Reference smoothing kernel"/>}</div>
    <div className="paper-two"><Plot label="Kernel slice at x = 0.5" range={[-4,8]} lines={[...(targetMode==='smoothing'&&aggregation==='weighted'?[{values:displayX.map(y=>referenceKernel(.5,y)),color:'#1c9a7b',name:'Reference'}]:[]),{values:displayX.map(y=>kernel(.5,y)),color:'#245de5',name:'Learned'}]}/><Plot label={`Held-out ${targetMode==='nonlinear'?`temperature T(y, ${horizon})`:'output'} · seed ${seed}`} range={plotRange} lines={[{values:target,xs:ys,color:'#1c9a7b',name:'Reference'},{values:predicted,xs:ys,color:'#245de5',name:'Prediction'}]}/></div>
    <Plot onAddPoint={x=>setAddedPoints(previous=>[...previous,x])} label={`Held-out input ${seed}: what the model receives at evaluation`} lines={[{values:displayX.map(x=>probe(x,seed)),color:'#245de5',name:'Underlying held-out field'}]} dots={xs.map((x,i)=>({x,y:values[i]}))}/>
    <div className="paper-actions"><span>Click to add measurements · {xs.length} samples. Quadrature cells and predictions update immediately.</span><button className="paper-button" disabled={!addedPoints.length} onClick={()=>setAddedPoints([])}>Clear added points</button><button className="paper-button" onClick={()=>setSeed(s=>s===0?100:s+1)}>Another held-out field</button></div>
    <div className="paper-controls"><Control label="Evaluation input samples N" value={n} min={2} max={96} onChange={v=>{setN(v);setAddedPoints([]);}}/><Control label="Evaluation output queries M" value={out} min={9} max={129} step={8} onChange={setOut}/></div>
    <button className="paper-button" onClick={()=>{setClustered(!clustered);setAddedPoints([]);}}>{clustered?'Use uniform grid':'Use clustered grid'}</button>
    <p>Changing input resolution or grid layout clears added points. These controls affect evaluation only. Pause training to compare architectures or grids at a fixed set of weights. More output queries do not add measurements.</p>
    <div className="paper-metrics"><div><b>{theta.length}</b>trainable parameters</div><div><b>{(100*error(predicted,target)).toFixed(2)}%</b>held-out relative error</div><div><b>{(100*error(densePrediction,target)).toFixed(2)}%</b>same model with 256 input samples</div></div>
    <details><summary>How the numerical layer runs</summary><pre><code>{`// At each requested y, use only measured input values:
const fy = linearInterpolate(samples, y);
let prediction = 0;
for (const { x, value: fx, cellWidth } of samples) {
  // Selected form supplies [x,y], [x,y,fx], or [x,y,fx,fy].
  // Each hidden layer: h = tanh(W*h + b); final layer linear.
  const k = kernelNetwork(x, y, fx, fy);
  prediction += k * (${aggregation === 'direct' ? '1' : 'fx'}) * cellWidth;
}
// Differentiate squared output error through every layer.
// Update shared network parameters with Adam; no pixel weights learned.`}</code></pre></details>
  </>;
}
