type Operation = { id: string; name: string; where: string; text: string; formula: string; labels: [string, string]; initial: [number, number]; ranges: [[number, number], [number, number]]; result(a: number, b: number): number[]; names: string[]; source?: string };
const OPS: Operation[] = [
  { id: 'add', name: 'Add & bias', where: 'Residual paths, bias and sums', text: 'Pour matching sign buckets together. Keep the + and − totals separate. Bias is just another signed dose.', formula: 'y = a + b', labels: ['a', 'b'], initial: [3, -2], ranges: [[-4,4],[-4,4]], result: (a,b) => [a+b], names: ['sum'], source: 'add' },
  { id: 'signed', name: 'Signed values', where: 'Weights, activations and subtraction', text: 'A value is positive litres minus negative litres. Swap the labels to negate it. A threshold bucket cannot preserve a negative result.', formula: 'x = V+ − V−', labels: ['positive litres', 'negative litres'], initial: [2,3], ranges: [[0,4],[0,4]], result: (a,b) => [a-b], names: ['difference'] },
  { id: 'multiply', name: 'Multiply & sum', where: 'Ax + b, attention Q·K and weighted values', text: 'A float-and-lever meter copies |x| with gain |w|; the signs choose the collector. Sum doses for a dot product. Two changing values can use a quarter-square multiplier, with explicit volume↔height conversion. For fixed A, the main lab instead uses normalized split fractions and calibrated output rulers—every drop passes through the visible buckets.', formula: 'wx = ¼[(w+x)² − (w−x)²]', labels: ['w', 'x'], initial: [1.5,2], ranges: [[-3,3],[-4,4]], result: (a,b) => [a*b], names: ['product'], source: 'multiply' },
  { id: 'shape', name: 'Shape & readout', where: 'Nonlinear function generators', text: 'In a wedge with V = h², pouring x litres gives height √x. Pouring it out gives x litres again! A float-linked meter must supply √x litres to the next bucket. Height units and litres are different.', formula: 'V = h² → h = √V', labels: ['input litres', 'meter gain'], initial: [3,1], ranges: [[0,4],[0.5,2]], result: (a,b) => [Math.sqrt(a)*b], names: ['metered litres'], source: 'square' },
  { id: 'relu', name: 'Threshold / ReLU', where: 'Calc-GPT’s MLP activation', text: 'A lower chamber catches t litres first. Only the excess reaches the output. This computes max(0, x−t): 3 L minus a 2 L threshold leaves 1 L. For signed ReLU, cancel equal +/− volumes and retain only the positive remainder.', formula: 'y = max(0, x − t)', labels: ['input litres', 'threshold litres'], initial: [3,2], ranges: [[0,4],[0,4]], result: (a,b) => [Math.max(0,a-b)], names: ['overflow'] },
  { id: 'softmax', name: 'Exp & divide', where: 'Attention softmax and output probabilities', text: 'Convert shifted scores to exp(s−max), collect their total, then divide each by that total. A shaped generator plus metered readout can approximate exp over a bounded range; division needs an ideal ratio mechanism here. Two scores are shown. Future positions are masked by keeping their valves closed.', formula: 'pᵢ = exp(sᵢ−m) / Σ exp(sⱼ−m)', labels: ['score 1', 'score 2'], initial: [1,2], ranges: [[-4,4],[-4,4]], result: (a,b) => { const p=1/(1+Math.exp(b-a)); return [p,1-p]; }, names: ['probability 1', 'probability 2'] },
  { id: 'norm', name: 'Normalize', where: 'LayerNorm before attention and MLP', text: 'Average the signed values, subtract that mean, square the differences and average again. Divide by √(variance + ε), then apply a learned gain and bias. This preview uses gain 1, bias 0 and ε = 0.00001. It is a composite ideal module, not one magic vessel.', formula: 'yᵢ = (xᵢ−mean) / √(variance + ε)', labels: ['x₁', 'x₂'], initial: [1,3], ranges: [[-4,4],[-4,4]], result: (a,b) => { const d=(a-b)/2; const y=d/Math.sqrt(d*d+1e-5); return [y,-y]; }, names: ['normalized 1', 'normalized 2'] },
  { id: 'copy', name: 'Copy & store', where: 'Fan-out, intermediate values and KV cache', text: 'A sealed bucket holds a value. A float controls fresh water from a supply to make each copy. Splitting 3 litres in half gives 1.5 + 1.5, not two copies of 3. The source stays full; each copy costs additional water.', formula: 'stored x → n separate copies of x', labels: ['stored litres', 'copies (rounded)'], initial: [3,2], ranges: [[0,4],[1,3]], result: (a,b) => Array.from({length:Math.round(b)},()=>a), names: ['copy 1','copy 2','copy 3'] },
  { id: 'lookup', name: 'Select & route', where: 'Token/position embeddings and causal masking', text: 'A selector opens the pre-calibrated reservoir for a token and adds its position embedding. A causal mask keeps future-token paths shut. Shown here: select one of two stored scalar values; a real embedding is a whole row of buckets.', formula: 'embedding = selected row + position row', labels: ['row selector (rounded)', 'stored row 2 value'], initial: [1,3], ranges: [[0,1],[-4,4]], result: (a,b) => [Math.round(a) === 0 ? 1 : b], names: ['selected value'] },
  { id: 'sample', name: 'Choose a token', where: 'Autoregressive output', text: 'Partition a unit measuring bucket according to the probabilities. A random level selects an interval; the selected token is fed back into the next step. Greedy decoding instead compares levels and chooses the largest. This preview lets you choose the random level.', formula: 'token = interval containing u', labels: ['P(token 1)', 'random level u'], initial: [0.6,0.4], ranges: [[0,1],[0,1]], result: (a,b) => [Math.min(b,1-Number.EPSILON)<a ? 1:0,Math.min(b,1-Number.EPSILON)<a ? 0:1], names: ['token 1','token 2'] },
];
const fmt=(n:number)=>String(Number(n.toFixed(3)));
export function setupWelcome() {
  const dialog=document.getElementById('welcome') as HTMLDialogElement;
  const nav=document.getElementById('operations')!;
  const detail=document.getElementById('operation-detail')!;
  let active=OPS[0]; let inputs=[...active.initial]; let animation=0;
  let opener: HTMLElement | null = null;
  const close=()=>dialog.close();
  for (const id of ['close-welcome','start']) document.getElementById(id)!.addEventListener('click',close);
  for (const id of ['about','assumptions']) document.getElementById(id)?.addEventListener('click',()=>{ opener=document.getElementById(id); dialog.showModal(); });
  dialog.addEventListener('close',()=>{ sessionStorage.setItem('bucket-intro-seen','1'); cancelAnimationFrame(animation); opener?.focus(); });
  dialog.addEventListener('click', e=>{ if(e.target===dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) close(); } });
  function draw(fraction=1) {
    const result=active.result(inputs[0],inputs[1]);
    const capacities: Record<string, number> = { add:8, signed:4, multiply:12, shape:4, relu:4, softmax:1, norm:2, copy:4, lookup:4, sample:1 };
    const max=capacities[active.id];
    const svg=result.map((value,i)=>{
      const x=15+i*96; const h=64*Math.abs(value)/max*fraction;
      return `<g><path d="M${x} 10v76h58V10" fill="#142532" stroke="#aac9d6" stroke-width="1.5"/><rect x="${x+2}" y="${84-h}" width="54" height="${h}" fill="${value<0?'#d2b1f4':'#6fd3ff'}" opacity=".7"/><text x="${x+29}" y="107" text-anchor="middle" fill="#f3eee3" font-size="12">${fmt(value*fraction)}${value<0?' (−)':''}</text><text x="${x+29}" y="126" text-anchor="middle" fill="#b6c4ce" font-size="9">${active.names[i]}</text></g>`;
    }).join('');
    document.getElementById('mini-tanks')!.innerHTML=`<svg viewBox="0 0 ${result.length*96} 136" role="img" aria-label="${result.map((v,i)=>`${active.names[i]}: ${fmt(v*fraction)}`).join(', ')}">${svg}</svg>`;
  }
  function select(op:Operation) {
    cancelAnimationFrame(animation); active=op; inputs=[...op.initial];
    nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===op.id)));
    detail.innerHTML=`<span class="eyebrow">${op.where}</span><h4>${op.name}</h4><p>${op.text}</p><code>${op.formula}</code><div class="mini-controls"></div><div class="mini-demo"><div id="mini-tanks"></div><button id="mini-run">Replay preview</button></div><small>Concept preview · ideal algebra, not a hydraulic validation${op.source?` · <a href="https://andeplane.github.io/demos/water-tanks/#${op.source}" target="_blank" rel="noreferrer">Tank experiment ↗</a>`:''}</small>`;
    const controls=detail.querySelector('.mini-controls')!;
    op.labels.forEach((label,i)=>{
      const el=document.createElement('label');el.textContent=label+' ';
      const out=document.createElement('output');out.textContent=fmt(inputs[i]);el.append(out);
      const slider=document.createElement('input');slider.type='range';slider.min=String(op.ranges[i][0]);slider.max=String(op.ranges[i][1]);slider.step='0.05';slider.value=String(inputs[i]);slider.setAttribute('aria-label',label);
      slider.addEventListener('input',()=>{cancelAnimationFrame(animation);inputs[i]=Number(slider.value);out.textContent=fmt(inputs[i]);draw();});el.append(slider);controls.append(el);
    });
    document.getElementById('mini-run')!.addEventListener('click',()=>{
      cancelAnimationFrame(animation);const start=performance.now();
      function frame(t:number) { const f=Math.min(1,(t-start)/1100);draw(f);if(f<1)animation=requestAnimationFrame(frame); }
      animation=requestAnimationFrame(frame);
    });
    draw();
  }
  OPS.forEach(op=>{const b=document.createElement('button');b.textContent=op.name;b.dataset.id=op.id;b.addEventListener('click',()=>select(op));nav.append(b);});
  select(OPS[0]);
  // Show on each visit, so assumptions remain easy to find while we iterate.
  if (!sessionStorage.getItem('bucket-intro-seen')) dialog.showModal();
}
