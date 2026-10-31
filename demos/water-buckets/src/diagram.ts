import {BucketCircuit,fmt,type Bucket,type Edge,type Point} from './model/matrix.ts';
const NS='http://www.w3.org/2000/svg';
const path=(points:Point[])=>points.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' ');
function at(edge:Edge,progress:number):Point {
  let length=edge.length*progress;
  for(let i=1;i<edge.points.length;i++){
    const a=edge.points[i-1],b=edge.points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<=d){const f=d?length/d:0;return[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];}length-=d;
  }return edge.points[edge.points.length-1];
}
export class Diagram {
  private fills=new Map<string,SVGRectElement>();
  private levels=new Map<string,SVGTextElement>();
  private values=new Map<string,SVGTextElement>();
  private edgeEls=new Map<string,SVGGElement>();
  private drops:SVGGElement;
  readonly svg:SVGSVGElement;
  constructor(readonly host:HTMLElement,readonly circuit:BucketCircuit,readonly inspect:(bucket:Bucket|null)=>void){
    const c=circuit,m=c.values.A.length,n=c.values.x.length;
    host.innerHTML=`<svg xmlns="${NS}" viewBox="0 0 ${c.width} ${c.height}" aria-label="Complete connected Ax plus b bucket machine" role="group">
    <defs><linearGradient id="glass-fill" x2="1" y2="1"><stop stop-color="#325169" stop-opacity=".25"/><stop offset="1" stop-color="#8fc9e3" stop-opacity=".06"/></linearGradient><linearGradient id="positive-water" x2="0" y2="1"><stop stop-color="#8de5ff" stop-opacity=".9"/><stop offset="1" stop-color="#1b789e" stop-opacity=".85"/></linearGradient><linearGradient id="negative-water" x2="0" y2="1"><stop stop-color="#e2bdff" stop-opacity=".9"/><stop offset="1" stop-color="#74529b" stop-opacity=".85"/></linearGradient><linearGradient id="neutral-water" x2="0" y2="1"><stop stop-color="#a5b8c4"/><stop offset="1" stop-color="#4b6472"/></linearGradient></defs>
    <rect width="${c.width}" height="${c.height}" fill="#0c1620"/>
    <text class="circuit-heading" x="24" y="24">INPUTS · loaded, valves closed</text>
    ${Array.from({length:m},(_,r)=>`<rect x="${c.banks[r].x-15}" y="${235+c.banks[r].y}" width="${c.banks[r].width-10}" height="397" rx="16" fill="#172737" fill-opacity=".45" stroke="#2c4354"/><text class="row-heading" x="${c.banks[r].x}" y="${225+c.banks[r].y}">ROW ${r+1}</text>`).join('')}
    <g id="pipes"></g><g id="droplets"></g><g id="buckets"></g><g id="readings"></g></svg>`;
    this.svg=host.querySelector('svg')!;this.drops=this.svg.querySelector('#droplets')!;
    const pipes=this.svg.querySelector('#pipes')!;
    for(const e of c.edges){
      const g=document.createElementNS(NS,'g');g.setAttribute('class','circuit-edge');g.dataset.edge=e.id;
      g.innerHTML=`<title>${e.label}</title><path d="${path(e.points)}" class="pipe-shadow"/><path d="${path(e.points)}" class="pipe" stroke="${e.color}" ${e.fraction===0?'stroke-dasharray="4 6"':''}/><path d="${path(e.points)}" class="pipe-hit"/>`;
      g.addEventListener('pointerenter',()=>this.highlight(e.from.startsWith('x')?c.get(e.to):c.get(e.from)));
      g.addEventListener('pointerleave',()=>this.highlight(null));pipes.append(g);this.edgeEls.set(e.id,g);
    }
    for(const b of c.buckets.values()){
      const g=document.createElementNS(NS,'g');g.dataset.bucket=b.id;g.setAttribute('class','circuit-bucket');
      const color=b.kind==='recycle'?'neutral':b.sign<0?'negative':'positive';
      const x=b.x-b.width/2,bottom=b.y+b.height;
      let caption=b.kind==='product'?`a${b.row!+1}${b.col!+1} = ${fmt(c.values.A[b.row!][b.col!])}`:b.kind==='input'?`x${b.col!+1} = ${fmt(c.values.x[b.col!])}`:b.kind==='bias'?`b${b.row!+1} = ${fmt(c.values.b[b.row!])}`:b.kind==='output'?b.label:'spare';
      const labelY=b.kind==='product'||b.kind==='bias'?b.y-10:b.y-13;
      g.innerHTML=`<title>${b.label}. ${b.kind==='product'?`${fmt(Math.abs(c.values.A[b.row!][b.col!])/c.scale*100)}% of input volume; sign ${b.sign<0?'negative':'positive'}.`:''}</title>
      <path d="M${x} ${b.y}V${bottom}H${x+b.width}V${b.y}" fill="url(#glass-fill)" stroke="#8ba4b5" stroke-width="1.5"/>
      <rect class="water-fill" x="${x+2}" y="${bottom-2}" width="${b.width-4}" height="0" fill="url(#${color}-water)"/>
      <line class="water-surface" x1="${x+3}" x2="${x+b.width-3}" y1="${bottom-2}" y2="${bottom-2}" stroke="${b.sign<0?'#e8caff':'#b1efff'}" stroke-width="1.5"/>
      <text class="bucket-caption" x="${b.x}" y="${labelY}" text-anchor="middle">${caption}</text>
      <text class="bucket-number" x="${b.x}" y="${bottom+20}" text-anchor="middle"></text>
      ${b.kind==='product'?`<text class="split-caption" x="${b.x}" y="${b.y-29}" text-anchor="middle">${fmt(Math.abs(c.values.A[b.row!][b.col!])/c.scale*100)}% of x${b.col!+1}</text>`:''}
      ${b.kind==='output'?Array.from({length:5},(_,i)=>{const h=b.y+b.height-i*b.height/4;return`<line x1="${x+2}" x2="${x+11}" y1="${h}" y2="${h}" stroke="#bfd0d9"/><text class="ruler-label" x="${x+14}" y="${h+3}">${fmt(i*b.capacity*b.unitsPerLitre/4)}</text>`;}).join(''):''}
      ${b.kind==='input'||b.kind==='product'||b.kind==='bias'?`<circle class="gate" cx="${b.x}" cy="${bottom+4}" r="5"/><path class="gate-bar" d="M${b.x-4},${bottom+4}h8" stroke="#e4c487" stroke-width="1.5"/>`:''}`;
      if(b.kind!=='recycle'){
        g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label',`Inspect ${b.label}`);
        g.addEventListener('pointerenter',()=>this.highlight(b));g.addEventListener('pointerleave',()=>this.highlight(null));
        g.addEventListener('focus',()=>this.highlight(b));g.addEventListener('blur',()=>this.highlight(null));
        g.addEventListener('click',()=>this.highlight(b));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.highlight(b);}});
      }
      this.svg.querySelector('#buckets')!.append(g);
      this.fills.set(b.id,g.querySelector('.water-fill')!);this.levels.set(b.id,g.querySelector('.bucket-number')!);
    }
    for(let r=0;r<m;r++){
      const text=document.createElementNS(NS,'text');text.setAttribute('class','output-answer');text.setAttribute('x',String(c.banks[r].x+c.banks[r].width/2));text.setAttribute('y',String(613+c.banks[r].y));text.setAttribute('text-anchor','middle');
      this.svg.querySelector('#readings')!.append(text);this.values.set(`y${r}`,text);
    }
    // Explicit direction, rather than an unrelated supply rail across the top.
    this.svg.querySelector('.circuit-heading')!.textContent=`${n} INPUT${n===1?'':'S'} → ${m*n} WEIGHTED BUCKETS → ${m} OUTPUT PAIRS`;
    this.update();
  }
  highlight(bucket:Bucket|null){
    const linked=new Set<string>();
    if(bucket)for(const e of this.circuit.edges){
      if(e.from===bucket.id||e.to===bucket.id||(bucket.kind==='output'&&this.circuit.get(e.to).row===bucket.row)||(bucket.kind==='input'&&this.circuit.get(e.from).col===bucket.col))linked.add(e.id);
    }
    for(const [id,el] of this.edgeEls){el.classList.toggle('highlight',linked.has(id));el.classList.toggle('muted',!!bucket&&!linked.has(id));}
    const related=new Set<string>(bucket?[bucket.id]:[]);
    for(const e of this.circuit.edges)if(linked.has(e.id)){related.add(e.from);related.add(e.to);}
    for(const el of this.svg.querySelectorAll<SVGGElement>('.circuit-bucket')){
      el.classList.toggle('highlight',related.has(el.dataset.bucket!));
      el.classList.toggle('selected',el.dataset.bucket===bucket?.id);
      el.classList.toggle('muted',!!bucket&&!related.has(el.dataset.bucket!));
    }
    this.inspect(bucket);
  }
  update(){
    const c=this.circuit;
    for(const b of c.buckets.values()){
      const h=Math.max(0,Math.min(b.height-4,(b.height-4)*b.V/b.capacity));const rect=this.fills.get(b.id)!;
      rect.setAttribute('y',String(b.y+b.height-2-h));rect.setAttribute('height',String(h));
      const surface=rect.nextElementSibling!;surface.setAttribute('y1',String(b.y+b.height-2-h));surface.setAttribute('y2',String(b.y+b.height-2-h));surface.setAttribute('opacity',h>0?'1':'0');
      this.levels.get(b.id)!.textContent=b.kind==='output'?`${fmt(b.V*c.scale)} units`: `${fmt(b.V)} L`;
      const gate=rect.parentElement!.querySelector('.gate');gate?.classList.toggle('open',c.phase===(b.kind==='input'?1:2));
    }
    c.readings().forEach(([p,n],r)=>this.values.get(`y${r}`)!.textContent=`y${r+1} = ${fmt(p)} − ${fmt(n)} = ${fmt(p-n)}`);
    // Packet dots follow the same path and progress as the conserved transported water.
    const fragment=document.createDocumentFragment();
    for(const packet of c.packets){const edge=c.edges.find(e=>e.id===packet.edge)!;const p=at(edge,packet.progress);const dot=document.createElementNS(NS,'circle');dot.setAttribute('cx',String(p[0]));dot.setAttribute('cy',String(p[1]));dot.setAttribute('r',String(Math.min(4,1.7+Math.sqrt(packet.V)*5)));dot.setAttribute('fill',edge.color);fragment.append(dot);}
    this.drops.replaceChildren(fragment);
    for(const e of c.edges)this.edgeEls.get(e.id)!.classList.toggle('flowing',c.phase===e.phase&&c.get(e.from).V>0);
  }
}
