import type { TownGeometry } from "./landfallTown";

type Point = [number, number, number];
const TAU = Math.PI*2;

export function loftGallery(batch: TownGeometry, front: number, accent: string) {
  const floor=2.34, rail=floor+.84, outer=front-.97;
  const oak="#9b754e", darkOak="#614937";
  // The upstairs door opens at deck height and clears the handrail and the eaves.
  batch.box("#493e35",0,floor+.91,front-.045,1.02,1.88,.13);
  batch.box(accent,0,floor+.90,front-.125,.84,1.76,.08);
  batch.box("#6d5140",0,floor+.38,front-.178,.65,.50,.035);
  batch.box("#e8c58d",0,floor+1.18,front-.176,.59,.75,.04,"glass");
  batch.box(oak,0,floor+1.18,front-.203,.048,.78,.04);
  batch.box(oak,0,floor+1.18,front-.203,.62,.048,.04);
  batch.box("#dac08c",.29,floor+.80,front-.213,.09,.055,.045,"plain");
  batch.box(oak,0,floor+.02,front-.14,1.05,.065,.26);
  // Two knees transfer the joists back to the wall. The plank deck sits on top.
  for (const side of [-1, 1]) {
    const joistX = side * .79, ledgerX = side * .52;
    batch.box(darkOak,ledgerX,floor-.39,front-.063,.13,.62,.13);
    batch.box(oak,joistX,floor-.11,front-.52,.14,.15,1.08);
    const rotate = batch.transform;
    const dy = .48, dz = -.67, length = Math.hypot(dy,dz);
    const rise = dy/length, run = dz/length;
    // The wall end sits between the doorway and the shutter swing.
    batch.transform = ([u,v,w]) => rotate([
      (joistX+ledgerX)/2+u+(joistX-ledgerX)*v/length,
      floor-.39+rise*v-run*w,
      front-.40+run*v+rise*w,
    ]);
    batch.box(oak,0,0,0,.115,length,.12);
    batch.transform = rotate;
  }
  for(let i=0;i<8;i++) batch.box(i%3===0 ? "#ac8964" : "#9e7853",(i-3.5)*.245,floor-.032,front-.51,.238,.065,1.0);
  batch.box(darkOak,0,floor-.08,outer,1.99,.145,.085);
  for(const x of [-.93,.93]) {
    for(const z of [outer,front-.075]) {
      batch.box(oak,x,floor+.405,z,.103,.88,.103);
      batch.turned("#b89a68",x,rail+.008,z,.084,.056,.054,8);
    }
    batch.box(oak,x,rail,front-.52,.105,.092,.93);
    batch.box(darkOak,x,floor+.16,front-.53,.072,.065,.91);
    for(let i=1;i<=3;i++) batch.box(accent,x,floor+.48,outer+.22*i,.047,.64,.047);
  }
  batch.box(oak,0,rail,outer,1.98,.095,.108);
  batch.box(darkOak,0,floor+.16,outer,1.88,.07,.074);
  for(let i=1;i<9;i++) batch.box(accent,-.93+i*1.86/9,floor+.48,outer,.048,.65,.048);
}

/** A battered plinth with clipped corners and a bevel where the plaster meets it. */
export function housePlinth(batch: TownGeometry, hw: number, hd: number) {
  const ring=(margin:number,y:number): Point[] => {
    const w=hw+margin,d=hd+margin,k=.12;
    return [[-w+k,y,-d],[-w,y,-d+k],[-w,y,d-k],[-w+k,y,d],[w-k,y,d],[w,y,d-k],[w,y,-d+k],[w-k,y,-d]];
  };
  const footer=ring(.06,-.43), course=ring(.065,.265), cap=ring(-.012,.32);
  for(let i=0;i<8;i++) {
    const j=(i+1)%8;
    batch.surface("stone","#bbaa92",footer[i]!,footer[j]!,course[j]!,course[i]!);
    batch.surface("stone","#c0ae92",course[i]!,course[j]!,cap[j]!,cap[i]!);
  }
}

/** A thrown ceramic profile, including its rolled lip, inner neck and open dark mouth. */
export function crock(batch: TownGeometry,x:number,z:number,scale:number,glaze:string) {
  const profile=[
    [.0,.117],[.035,.12],[.085,.166],[.18,.216],[.28,.235],[.36,.229],[.44,.204],
    [.505,.160],[.548,.118],[.58,.105],[.609,.112],[.62,.133],[.638,.139],
    [.65,.131],[.653,.111],[.637,.099],[.573,.089],[.53,.086],
  ];
  const sides=28;
  const vertex=(j:number,k:number):Point=>{
    const [y,r]=profile[j]!, a=k*TAU/sides;
    return [x+r!*scale*Math.cos(a),.018+y!*scale,z+r!*scale*Math.sin(a)];
  };
  const normal=(j:number,k:number):Point=>{
    const [y0,r0]=profile[Math.max(0,j-1)]!,[y1,r1]=profile[Math.min(profile.length-1,j+1)]!;
    const dy=y1!-y0!,dr=r1!-r0!,len=Math.hypot(dy,dr),angle=k*TAU/sides;
    return [dy*Math.cos(angle)/len,-dr/len,dy*Math.sin(angle)/len];
  };
  for(let j=0;j<profile.length-1;j++) for(let k=0;k<sides;k++) {
    const coords=[[j,k],[j+1,k],[j+1,k+1],[j,k+1]] as const;
    const tint=j>=15 ? "#5d493e" : j===8 || j===11 ? "#c2a17b" : glaze;
    batch.smoothQuad(tint,coords.map(([r,s])=>vertex(r,s)),coords.map(([r,s])=>normal(r,s)));
  }
  batch.face("#423b36",...Array.from({length:sides},(_,k)=>vertex(profile.length-1,k)).reverse());
}

function leaf(batch:TownGeometry,x:number,y:number,z:number,angle:number,len:number,width:number,rise:number,color:string) {
  const dx=Math.cos(angle),dz=Math.sin(angle);
  const tip:Point=[x+dx*len,y+rise,z+dz*len];
  const mid:Point=[x+dx*len*.55,y+rise*.60+.011,z+dz*len*.55];
  for(const side of [-1,1]) {
    const edge:Point=[mid[0]-dz*width*side,mid[1]-.025,mid[2]+dx*width*side];
    const poly:Point[]=[[x,y,z],edge,tip,mid];
    batch.face(color,...poly);batch.face(color,...poly.reverse());
  }
}

export function blossom(batch:TownGeometry,x:number,y:number,z:number,r:number,shade:string,phase:number) {
  // Petals face slightly upwards and towards the lane.
  for(let i=0;i<5;i++) {
    const angle=i*TAU/5+phase,dx=Math.cos(angle),dy=Math.sin(angle);
    const at=(rad:number,width:number,cupping:number):Point=>[
      x+r*(dx*rad-dy*width),y+r*(dy*rad+dx*width)*.80,z+r*((dy*rad+dx*width)*.57-cupping),
    ];
    const petal=[at(.13,0,0),at(.59,-.29,.06),at(.96,-.25,.19),at(1,0,.22),at(.95,.25,.17),at(.59,.29,.06)];
    batch.face(shade,...petal);batch.face(shade,...petal.reverse());
  }
  const pollen:Point[]=[];
  for(let j=0;j<7;j++) {
    const a=-j*TAU/7;pollen.push([x+r*.21*Math.cos(a),y+r*.18*Math.sin(a),z-r*.095+r*.11*Math.sin(a)]);
  }
  batch.face("#efbe59",...pollen);
}

export function windowGarden(batch:TownGeometry,x:number,z:number,winter:boolean,color:number) {
  const greens=["#416746","#507e48","#668c4d"];
  const colors=["#cf5969","#dda354","#eac1b5","#cb6488","#ba8dbe"];
  batch.box("#8e6247",x,.83,z,1.05,.18,.31);
  batch.box("#aa7958",x,.923,z,1.10,.05,.34);
  batch.box("#544b37",x,.952,z,1.00,.02,.24,"plain");
  for(let i=0;i<8;i++) {
    const cx=x+(i-3.5)*.125, angle=i*2.399+color*.67;
    const cz=z+Math.sin(angle)*.072, top=1.06+.12*(.5+.5*Math.sin(angle*1.78));
    batch.turned(greens[i%3]!,cx,.953,cz,.008,.005,top-.953,5);
    for(let j=0;j<3;j++) leaf(batch,cx,1+j*.023,cz,angle+j*2.094,.08+.045*(j%2),.026,.052-(j%2)*.10,greens[(i+j)%3]!);
    if(winter) {
      for(let j=0;j<4;j++) leaf(batch,cx,top-j*.018,cz,angle+j*1.57,.07,.014,-.023,j%2?"#729083":"#577767");
    } else blossom(batch,cx,top,cz-.015,.052+.012*(i%3),colors[(color+(i%3===0?1:0))%5]!,angle);
  }
}
