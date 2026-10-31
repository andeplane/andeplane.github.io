import {BucketCircuit,DEFAULT,evaluate,fmt,resized,type Bucket,type MatrixInputs} from './model/matrix.ts';
import {Diagram} from './diagram.ts';
import {setupWelcome} from './welcome.ts';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
let values:MatrixInputs=structuredClone(DEFAULT), circuit=new BucketCircuit(values),diagram:Diagram;
let paused=false,speed=1,zoom=1;
const host=$('circuit'),stage=$('stage');
let hoveredCell:HTMLInputElement|null=null;
function syncEditorHighlight(){
  if(hoveredCell&&!hoveredCell.isConnected)hoveredCell=null;
  const focused=document.activeElement;
  const cell=hoveredCell??(focused instanceof HTMLInputElement&&focused.closest('.matrix')?focused:null);
  const id=cell?.dataset.bucket;
  diagram.highlight(id&&circuit.buckets.has(id)?circuit.get(id):null);
}
function inspect(bucket:Bucket|null){
  document.querySelectorAll('.matrix input').forEach(e=>e.classList.remove('selected-cell'));
  if(bucket?.kind==='input')$(`cell-x-${bucket.col!}-0`).classList.add('selected-cell');
  if(bucket?.kind==='bias')$(`cell-b-${bucket.row!}-0`).classList.add('selected-cell');
  if(!bucket){$('inspect').textContent='Select a bucket to trace its connections. Zoom in to inspect larger circuits.';return;}
  if(bucket.kind==='product'){
    const r=bucket.row!,c=bucket.col!,a=values.A[r][c];
    $<HTMLInputElement>(`cell-A-${r}-${c}`).classList.add('selected-cell');
    $('inspect').textContent=`a${r+1}${c+1} = ${fmt(a)}: take ${fmt(Math.abs(a)/circuit.scale*100)}% of x${c+1}’s water, then pour into y${r+1} ${bucket.sign<0?'−':'+'}. The output ruler multiplies litres by ${fmt(circuit.scale)}.`;
  }else if(bucket.kind==='input')$('inspect').textContent=`x${bucket.col!+1} = ${fmt(values.x[bucket.col!])}: starts with ${fmt(bucket.initial)} L. Its water is divided among the visible branches, never copied.`;
  else if(bucket.kind==='bias')$('inspect').textContent=`b${bucket.row!+1} = ${fmt(values.b[bucket.row!])}: ${fmt(bucket.initial)} L, already calibrated for the output scale. Pours into y${bucket.row!+1} ${bucket.sign<0?'−':'+'}.`;
  else $('inspect').textContent=`${bucket.label}: collects water from the connected product and bias buckets. Read the height on its calibrated ruler; subtract the − reading from the + reading.`;
}
function fit(){
  const rect=stage.getBoundingClientRect();const ratio=Math.min(rect.width/circuit.width,rect.height/circuit.height);
  const width=circuit.width*ratio*zoom,height=circuit.height*ratio*zoom;
  host.style.width=`${width}px`;host.style.height=`${height}px`;
  host.style.marginLeft=width<rect.width?`${(rect.width-width)/2}px`:'0';
  host.style.marginTop=height<rect.height?`${(rect.height-height)/2}px`:'0';
  $('zoom').textContent=`${Math.round(zoom*100)}%`;
}
function reset(){
  circuit=new BucketCircuit(values);diagram=new Diagram(host,circuit,inspect);paused=false;
  $('pause').textContent='Pause';$('scale').textContent=`Output rulers: 1 L = ${fmt(circuit.scale)} units`;
  $('dimensions').textContent=`${values.A.length} × ${values.x.length}`;
  $('arithmetic').innerHTML=values.A.map((row,r)=>`<p>y${r+1} = ${row.map((a,c)=>`(${fmt(a)} × ${fmt(values.x[c])})`).join(' + ')} + (${fmt(values.b[r])}) = ${fmt(evaluate(values)[r])}</p>`).join('');
  $('results').replaceChildren();
  values.A.forEach((_,r)=>{const el=document.createElement('span');el.id=`result-${r}`;el.className='result-chip';$('results').append(el);});
  syncEditorHighlight();fit();update();
}
function buildEditor(){
  for(const group of ['A','x','b'] as const){
    const node=$(group);node.replaceChildren();
    node.style.gridTemplateColumns=`repeat(${group==='A'?values.x.length:1},44px)`;
    const rows=group==='A'?values.A:values[group].map(v=>[v]);
    rows.forEach((row,r)=>row.forEach((v,c)=>{
      const input=document.createElement('input');input.type='number';input.inputMode='decimal';input.step='any';input.min=String(group==='A'?-3:-4);input.max=String(group==='A'?3:4);input.value=String(v);input.id=`cell-${group}-${r}-${c}`;
      input.dataset.bucket=group==='A'?`p${r}_${c}`:group==='x'?`x${r}`:`b${r}`;
      input.setAttribute('aria-label',group==='A'?`A row ${r+1} column ${c+1}`:`${group} ${r+1}`);
      input.addEventListener('input',()=>{
        const value=input.valueAsNumber,max=group==='A'?3:4;
        const valid=input.value!==''&&Number.isFinite(value)&&Math.abs(value)<=max;input.setAttribute('aria-invalid',String(!valid));
        $('validation').textContent=valid?'':`Enter a number between −${max} and ${max}.`;
        if(!valid)return;if(group==='A')values.A[r][c]=value;else values[group][r]=value;reset();
      });
      input.addEventListener('blur',()=>{if(input.getAttribute('aria-invalid')==='true'){input.value=String(group==='A'?values.A[r][c]:values[group][r]);input.setAttribute('aria-invalid','false');$('validation').textContent='';}queueMicrotask(syncEditorHighlight);});
      input.addEventListener('pointerenter',()=>{hoveredCell=input;syncEditorHighlight();});
      input.addEventListener('pointerleave',()=>{if(hoveredCell===input)hoveredCell=null;syncEditorHighlight();});
      input.addEventListener('focus',syncEditorHighlight);
      node.append(input);
    }));
  }
  $<HTMLSelectElement>('rows').value=String(values.A.length);$<HTMLSelectElement>('cols').value=String(values.x.length);
}
for(const id of ['rows','cols'])$(id).addEventListener('change',()=>{values=resized(values,Number($<HTMLSelectElement>('rows').value),Number($<HTMLSelectElement>('cols').value));zoom=1;buildEditor();reset();});
$('run').addEventListener('click',()=>{if(circuit.phase===3)circuit.reset();circuit.start();paused=false;$('pause').textContent='Pause';update();});
$('reset').addEventListener('click',reset);
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';update();});
$('speed').addEventListener('click',()=>{speed=speed===1?3:1;$('speed').textContent=`${speed}× speed`;});
$('fit').addEventListener('click',()=>{zoom=1;fit();stage.scrollTo(0,0);});
$('zoom-in').addEventListener('click',()=>{zoom=Math.min(4,zoom*1.5);fit();});
$('zoom-out').addEventListener('click',()=>{zoom=Math.max(1,zoom/1.5);fit();});
$('example').addEventListener('click',()=>{values=structuredClone(DEFAULT);zoom=1;buildEditor();reset();});
const status=['Ready. Inspect the full system, then pour.','1 / 2 · Inputs drain through the weight splitters.','2 / 2 · Product and bias buckets pour into y.','Settled. Read each y as positive height minus negative height.'];
let previousStatus='';
function update(){
  const text=paused?'Paused. Inspect the water anywhere in the circuit.':status[circuit.phase];
  if(previousStatus!==text){$('status').textContent=text;previousStatus=text;}
  const running=circuit.phase===1||circuit.phase===2;
  $<HTMLButtonElement>('run').disabled=running;$('run').textContent=circuit.phase===3?'Pour again':'Pour';$<HTMLButtonElement>('pause').disabled=!running;
  const measured=circuit.readings();measured.forEach(([p,n],r)=>{$(`result-${r}`).textContent=`y${r+1} = ${fmt(p-n)}`;});
  $('mass').textContent=`${fmt(circuit.water())} L accounted for · ${fmt(circuit.initialWater)} L loaded`;
  $('stage').setAttribute('aria-label',`Connected ${values.A.length} by ${values.x.length} matrix bucket network. ${text}`);
}
let last=performance.now(),frames=0;
function frame(now:number){const dt=Math.min(.05,(now-last)/1000);last=now;
  const active=circuit.phase===1||circuit.phase===2;
  if(active&&!paused&&!$<HTMLDialogElement>('welcome').open){circuit.advance(dt*speed);diagram.update();}
  // Rendering uses the actual volumes and in-transit packets, never the reference answer.
  if(++frames%4===0)update();requestAnimationFrame(frame);
}
buildEditor();reset();new ResizeObserver(fit).observe(stage);setupWelcome();requestAnimationFrame(frame);
Object.assign(window,{bucketLab:{
  set(v:MatrixInputs){new BucketCircuit(v);values=structuredClone(v);buildEditor();reset();},
  run(){circuit.start();},advance(seconds:number){circuit.advance(seconds);diagram.update();update();},
  state:()=>({phase:circuit.phase,values,readings:circuit.readings(),water:circuit.water(),initialWater:circuit.initialWater,scale:circuit.scale,buckets:[...circuit.buckets.values()].map(b=>({id:b.id,kind:b.kind,V:b.V})),expected:evaluate(values)})
}});
