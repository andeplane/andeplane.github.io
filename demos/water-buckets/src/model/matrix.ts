/** A finite, conservative bucket network. No supply taps, target answer fills or copying. */
export type MatrixInputs = { A: number[][]; x: number[]; b: number[] };
export const DEFAULT: MatrixInputs = { A: [[1.5, -1], [0.5, 2]], x: [3, 2], b: [1, -2] };
export const MAX_SIZE = 4;
export const fmt = (n: number) => Math.abs(n) < 0.000005 ? '0' : String(Number(n.toFixed(3)));
export function validate(v: MatrixInputs): void {
  const m=v.A.length,n=v.x.length;
  if(m<1||m>MAX_SIZE||n<1||n>MAX_SIZE||v.b.length!==m||v.A.some(row=>row.length!==n)) throw new Error('Use 1–4 rows and columns with matching vectors.');
  if(v.A.flat().some(a=>!Number.isFinite(a)||Math.abs(a)>3)||[...v.x,...v.b].some(x=>!Number.isFinite(x)||Math.abs(x)>4)) throw new Error('Weights must be between −3 and 3; inputs and biases between −4 and 4.');
}
export function resized(v: MatrixInputs,rows: number,cols: number): MatrixInputs {
  const next={A:Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>v.A[r]?.[c]??(r===c?1:0))),x:Array.from({length:cols},(_,c)=>v.x[c]??1),b:Array.from({length:rows},(_,r)=>v.b[r]??0)};
  validate(next);return next;
}
export function evaluate(v: MatrixInputs): number[] { return v.A.map((row,r)=>row.reduce((sum,a,c)=>sum+a*v.x[c],v.b[r])); }
export function rails(v: MatrixInputs): number[][] { return v.A.map((row,r)=>[...row.map((a,c)=>a*v.x[c]),v.b[r]].reduce((out,a)=>{out[a<0?1:0]+=Math.abs(a);return out;},[0,0])); }
export type Kind='input'|'product'|'bias'|'output'|'recycle';
export type Point=[number,number];
export interface Bucket { id:string; kind:Kind; label:string; row?:number; col?:number; sign:number; V:number; initial:number; capacity:number; unitsPerLitre:number; x:number; y:number; width:number; height:number }
export interface Edge { id:string; from:string; to:string; fraction:number; phase:1|2; points:Point[]; length:number; transferred:number; label:string; color:string }
export interface Packet { edge:string; V:number; progress:number; }
const PALETTE=['#72d5f5','#8de1b1','#e7c689','#baabff'];
const roundCapacity=(n:number,min:number)=>Math.max(min,2**Math.ceil(Math.log2(Math.max(n,0.01))));
export class BucketCircuit {
  readonly values:MatrixInputs;
  readonly buckets=new Map<string,Bucket>();
  readonly edges:Edge[]=[];
  packets:Packet[]=[];
  readonly scale:number;
  readonly initialWater:number;
  readonly width:number;
  readonly height:number;
  readonly banks:{x:number;y:number;width:number}[];
  phase:0|1|2|3=0;
  time=0;
  private dwell=0;
  constructor(v:MatrixInputs) {
    validate(v);this.values=structuredClone(v);
    const {A,x,b}=this.values,m=A.length,n=x.length;
    // The SAME calibration applies to every output, so rows can be combined later.
    this.scale=Math.max(1,...x.map((_,c)=>A.reduce((s,row)=>s+Math.abs(row[c]),0)));
    const bankColumns=Math.min(2,m),group=Math.max(412,(n+1)*88+24);
    this.width=Math.max(920,bankColumns*group+96);
    const bankWidth=(this.width-96)/bankColumns;
    this.height=644+Math.floor((m-1)/bankColumns)*490;
    this.banks=Array.from({length:m},(_,r)=>({x:48+(r%bankColumns)*bankWidth,y:Math.floor(r/bankColumns)*490,width:bankWidth}));
    const productCap=roundCapacity(Math.max(...A.flatMap(row=>row.map((a,c)=>Math.abs(a*x[c])))),4)/this.scale;
    const outputCap=roundCapacity(Math.max(...rails(v).flat()),8)/this.scale;
    const add=(bucket:Bucket)=>this.buckets.set(bucket.id,bucket);
    for(let c=0;c<n;c++) add({id:`x${c}`,kind:'input',col:c,label:`x${c+1}`,sign:Math.sign(x[c]),V:Math.abs(x[c]),initial:Math.abs(x[c]),capacity:4,unitsPerLitre:1,x:80+(this.width-250)*(c+0.5)/n,y:58,width:62,height:92});
    for(let r=0;r<m;r++) {
      const {x:start,y:offset,width:group}=this.banks[r], spacing=group/(n+1);
      for(let c=0;c<n;c++) add({id:`p${r}_${c}`,kind:'product',row:r,col:c,label:`a${r+1}${c+1} × x${c+1}`,sign:Math.sign(A[r][c]*x[c]),V:0,initial:0,capacity:productCap,unitsPerLitre:this.scale,x:start+spacing*(c+.5),y:280+offset,width:58,height:80});
      add({id:`b${r}`,kind:'bias',row:r,label:`b${r+1}`,sign:Math.sign(b[r]),V:Math.abs(b[r])/this.scale,initial:Math.abs(b[r])/this.scale,capacity:4/this.scale,unitsPerLitre:this.scale,x:start+spacing*(n+.5),y:280+offset,width:48,height:80});
      for(let s=0;s<2;s++) add({id:`y${r}${s?'n':'p'}`,kind:'output',row:r,label:`y${r+1} ${s?'−':'+'}`,sign:s?-1:1,V:0,initial:0,capacity:outputCap,unitsPerLitre:this.scale,x:start+group/2+(s?49:-49),y:473+offset,width:70,height:94});
    }
    // Every unused splitter fraction is delivered to a real, visible catch bucket.
    add({id:'recycle',kind:'recycle',label:'unused water',sign:0,V:0,initial:0,capacity:Math.max(1,x.reduce((s,a)=>s+Math.abs(a),0)),unitsPerLitre:1,x:this.width-65,y:58,width:52,height:92});
    const edge=(from:string,to:string,fraction:number,phase:1|2,points:Point[],label:string,color:string)=>{
      const length=points.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
      this.edges.push({id:`${from}-${to}`,from,to,fraction,phase,points,length,transferred:0,label,color});
    };
    for(let c=0;c<n;c++) {
      const source=this.get(`x${c}`), lane=181+c*17;
      for(let r=0;r<m;r++) {
        const target=this.get(`p${r}_${c}`),fraction=Math.abs(A[r][c])/this.scale;
        const offset=this.banks[r].y;
        const points:Point[]=offset?[[source.x,source.y+source.height],[source.x,lane],[8+c*7,lane],[8+c*7,lane+offset],[target.x,lane+offset],[target.x,target.y-7]]:[[source.x,source.y+source.height],[source.x,lane],[target.x,lane],[target.x,target.y-7]];
        edge(source.id,target.id,fraction,1,points,`${fmt(Math.abs(A[r][c]))} / ${fmt(this.scale)} = ${fmt(fraction*100)}% of x${c+1}`,PALETTE[c]);
      }
      const unused=Math.max(0,1-A.reduce((s,row)=>s+Math.abs(row[c])/this.scale,0));
      // Recycle is drawn at the far right below its collection pipe, never uphill.
      const waste=this.get('recycle');
      waste.y=280;waste.height=80;
      edge(source.id,'recycle',unused,1,[[source.x,source.y+source.height],[source.x,lane],[this.width-18-c*5,lane],[this.width-18-c*5,260],[waste.x,260],[waste.x,waste.y-7]],`${fmt(unused*100)}% unused → catch bucket`,'#83909f');
    }
    for(let r=0;r<m;r++) for(const source of [...Array.from({length:n},(_,c)=>this.get(`p${r}_${c}`)),this.get(`b${r}`)]) {
      const target=this.get(`y${r}${source.sign<0?'n':'p'}`);
      const lane=(source.sign<0?424:397)+this.banks[r].y;
      edge(source.id,target.id,1,2,[[source.x,source.y+source.height],[source.x,lane],[target.x,lane],[target.x,target.y-7]],`${source.label} → ${target.label}`,source.sign<0?'#d4a9f5':'#72d5f5');
    }
    // Put the unused-water collector in a dedicated margin; no arithmetic path enters it.
    this.get('recycle').x=this.width-30;
    this.get('recycle').width=30;
    for(const e of this.edges.filter(e=>e.to==='recycle')) {e.points[e.points.length-2][0]=this.width-30;e.points[e.points.length-1][0]=this.width-30;}
    for(const e of this.edges)e.length=e.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-e.points[i][0],p[1]-e.points[i][1]),0);
    this.initialWater=[...this.buckets.values()].reduce((sum,bucket)=>sum+bucket.V,0);
  }
  get(id:string):Bucket { const b=this.buckets.get(id);if(!b)throw new Error(`Unknown bucket ${id}`);return b; }
  start() { if(this.phase===0)this.phase=1; }
  reset() { for(const b of this.buckets.values())b.V=b.initial;for(const e of this.edges)e.transferred=0;this.packets=[];this.phase=0;this.time=0;this.dwell=0; }
  advance(dt:number) {
    if(this.phase===0||this.phase===3)return;
    let remaining=dt;
    while(remaining>1e-9) {const h=Math.min(remaining,1/120);this.step(h);remaining-=h;if(Number(this.phase)===3)break;}
  }
  private step(dt:number) {
    this.time+=dt;
    // Arrivals precede departures. Water has to traverse the pipe before it can be used.
    const pending:Packet[]=[];
    for(const p of this.packets) {
      const e=this.edges.find(e=>e.id===p.edge)!;
      p.progress+=dt*440/Math.max(e.length,100);
      if(p.progress>=1)this.get(e.to).V+=p.V;else pending.push(p);
    }
    this.packets=pending;
    const groups=new Map<string,Edge[]>();
    for(const edge of this.edges.filter(e=>e.phase===this.phase))groups.set(edge.from,[...(groups.get(edge.from)??[]),edge]);
    for(const [id,edges] of groups) {
      const source=this.get(id);
      if(source.V<=0)continue;
      // Torricelli-like finite-time emptying; the split ratios, not the speed, do arithmetic.
      const amount=Math.min(source.V,dt*.8*Math.sqrt(source.V));source.V-=amount;
      for(const edge of edges) {
        const volume=amount*edge.fraction;if(volume<=0)continue;
        edge.transferred+=volume;
        let last:Packet|undefined;
        for(let i=this.packets.length-1;i>=0;i--)if(this.packets[i].edge===edge.id&&this.packets[i].progress<.025){last=this.packets[i];break;}
        if(last)last.V+=volume;else this.packets.push({edge:edge.id,V:volume,progress:0});
      }
    }
    const empty=[...groups.keys()].every(id=>this.get(id).V<1e-12);
    if(empty&&this.packets.length===0) {this.dwell+=dt;if(this.dwell>=.8){this.phase=this.phase===1?2:3;this.dwell=0;}}
    else this.dwell=0;
  }
  readings():number[][] { return this.values.A.map((_,r)=>['p','n'].map(sign=>this.get(`y${r}${sign}`).V*this.scale)); }
  water():number { return [...this.buckets.values()].reduce((s,b)=>s+b.V,0)+this.packets.reduce((s,p)=>s+p.V,0); }
}
