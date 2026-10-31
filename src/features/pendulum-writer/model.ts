export type Point = [number, number]
export interface StrokeTarget { strokes: Point[][] }
export type Target = Point[] | StrokeTarget
export type ModelKind = 'coupled' | 'fourier'
export interface Settings { count: number; duration: number; damping: number; kind: ModelKind }
export const GRAVITY = 9.81
export const FRAME_MASS = 2
export const BOB_MASS = 0.08
export const MAX_ANGLE = 10 * Math.PI / 180
const TAU = 2 * Math.PI

/** A single continuous, hand-authored centreline, rather than a font outline. */
export function andersPath(): Point[] {
  const curves = [
    [25,95,52,15,70,20], [83,25,59,103,41,100], [20,95,38,65,86,68], [98,68,84,100,100,100],
    [110,98,123,58,130,60], [133,61,116,98,124,100], [144,48,166,55,153,88], [145,115,178,99,187,83],
    [202,52,226,62,215,89], [202,116,179,102,191,79], [211,63,215,71,214,91],
    [231,47,263,-2,252,18], [239,36,211,109,240,100], [250,98,261,83,271,74],
    [298,41,307,73,271,78], [254,105,298,113,317,85],
    [330,72,332,63,328,61], [322,70,343,82,351,69], [333,108,338,102,359,96],
    [378,88,385,69,387,61], [358,83,402,81,396,96], [384,117,365,108,369,100], [389,101,411,104,425,90],
  ]
  const points: Point[] = [[0,100]]
  for (const c of curves) {
    const a = points[points.length - 1]
    for (let i=1;i<=32;i++) {
      const t=i/32, u=1-t
      points.push([u*u*u*a[0]+3*u*u*t*c[0]+3*u*t*t*c[2]+t*t*t*c[4], u*u*u*a[1]+3*u*u*t*c[1]+3*u*t*t*c[3]+t*t*t*c[5]])
    }
  }
  return points
}

export function loopPath(): Point[] {
  return Array.from({length:601}, (_,i) => {
    const t=i/600*TAU
    return [Math.cos(t)+.28*Math.cos(5*t), .65*Math.sin(2*t)+.16*Math.sin(7*t)] as Point
  })
}

/** Arc-length sampling gives every stroke detail a fair share of drawing time. */
export function targetSamples(path: Target, count=768): { points: Point[]; penFraction: number; penMask: boolean[] } {
  if(!Array.isArray(path))return sampleStrokes(path.strokes,count)
  if(path.length<2) throw new Error('A target needs at least two points.')
  const xs=path.map(p=>p[0]), ys=path.map(p=>p[1])
  const width=Math.max(...xs)-Math.min(...xs), height=Math.max(...ys)-Math.min(...ys)
  const span=Math.max(width,height,1e-8)
  const cx=(Math.max(...xs)+Math.min(...xs))/2, cy=(Math.max(...ys)+Math.min(...ys))/2
  const normalized: Point[]=path.map(p=>[(p[0]-cx)/span*.12,(p[1]-cy)/span*.12])
  const lengths=[0]
  for(let i=1;i<normalized.length;i++) lengths.push(lengths[i-1]+Math.hypot(normalized[i][0]-normalized[i-1][0],normalized[i][1]-normalized[i-1][1]))
  const total=lengths[lengths.length-1]
  if(total<1e-8) throw new Error('Draw a longer stroke before fitting.')
  const penFraction=.82, first=normalized[0], last=normalized[normalized.length-1]
  let segment=1
  const points: Point[]=Array.from({length:count}, (_,i)=>{
    const t=i/count
    if(t>penFraction) {
      const u=(t-penFraction)/(1-penFraction), smooth=u*u*(3-2*u)
      return [last[0]+(first[0]-last[0])*smooth,last[1]+(first[1]-last[1])*smooth]
    }
    const distance=t/penFraction*total
    while(segment<lengths.length-1 && lengths[segment]<distance) segment++
    const a=normalized[segment-1], b=normalized[segment]
    const f=(distance-lengths[segment-1])/Math.max(1e-12,lengths[segment]-lengths[segment-1])
    return [a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])]
  })
  return {points,penFraction,penMask:points.map((_,i)=>i/count<=penFraction)}
}

/** Travel between disconnected strokes is part of the trajectory, with the pencil lifted. */
function sampleStrokes(strokes:Point[][],count:number) {
  const valid=strokes.filter(stroke=>stroke.length>=2)
  if(!valid.length)throw new Error('Draw a longer stroke before fitting.')
  if(valid.length===1)return targetSamples(valid[0],count)
  const flat=valid.flat(),xs=flat.map(p=>p[0]),ys=flat.map(p=>p[1])
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2
  const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),1e-8)
  const normalized=valid.map(stroke=>stroke.map(p=>[(p[0]-cx)/span*.12,(p[1]-cy)/span*.12] as Point))
  const segments:{a:Point;b:Point;draw:boolean;length:number;end:number}[]=[]
  let total=0
  const add=(a:Point,b:Point,draw:boolean)=>{
    const length=Math.hypot(b[0]-a[0],b[1]-a[1])*(draw?1:.8)
    if(length<1e-10)return
    total+=length;segments.push({a,b,draw,length,end:total})
  }
  normalized.forEach((stroke,i)=>{
    if(i)add(normalized[i-1][normalized[i-1].length-1],stroke[0],false)
    for(let j=1;j<stroke.length;j++)add(stroke[j-1],stroke[j],true)
  })
  if(total<1e-8)throw new Error('Draw a longer stroke before fitting.')
  const penFraction=.82,first=normalized[0][0],last=normalized[normalized.length-1].at(-1)!
  const penMask:boolean[]=[],points:Point[]=[]
  let segment=0
  for(let i=0;i<count;i++) {
    const time=i/count
    if(time>penFraction) {
      const u=(time-penFraction)/(1-penFraction),s=u*u*(3-2*u)
      points.push([last[0]+s*(first[0]-last[0]),last[1]+s*(first[1]-last[1])]);penMask.push(false);continue
    }
    const distance=time/penFraction*total
    while(segment<segments.length-1 && segments[segment].end<distance)segment++
    const s=segments[segment],u=(distance-(s.end-s.length))/s.length,f=s.draw?u:u*u*(3-2*u)
    points.push([s.a[0]+f*(s.b[0]-s.a[0]),s.a[1]+f*(s.b[1]-s.a[1])]);penMask.push(s.draw)
  }
  return {points,penFraction,penMask}
}

/** Jacobi diagonalization of a small real symmetric matrix. Columns are eigenvectors. */
export function diagonalize(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n=matrix.length, a=matrix.map(r=>r.slice())
  const v=Array.from({length:n}, (_,i)=>Array.from({length:n}, (_,j)=>Number(i===j)))
  for(let sweep=0;sweep<80;sweep++) {
    let largest=0
    for(let p=0;p<n;p++) for(let q=p+1;q<n;q++) {
      const off=a[p][q]; largest=Math.max(largest,Math.abs(off))
      if(Math.abs(off)<1e-12*Math.sqrt(Math.abs(a[p][p]*a[q][q]))) continue
      const angle=.5*Math.atan2(2*off,a[q][q]-a[p][p]), c=Math.cos(angle), s=Math.sin(angle)
      const app=a[p][p], aqq=a[q][q]
      for(let k=0;k<n;k++) if(k!==p && k!==q) {
        const ap=a[k][p], aq=a[k][q]
        a[k][p]=a[p][k]=c*ap-s*aq; a[k][q]=a[q][k]=s*ap+c*aq
      }
      a[p][p]=c*c*app-2*s*c*off+s*s*aqq
      a[q][q]=s*s*app+2*s*c*off+c*c*aqq
      a[p][q]=a[q][p]=0
      for(let k=0;k<n;k++){const vp=v[k][p], vq=v[k][q];v[k][p]=c*vp-s*vq;v[k][q]=s*vp+c*vq}
    }
    if(largest<1e-10) break
  }
  const order=Array.from({length:n}, (_,i)=>i).sort((i,j)=>a[i][i]-a[j][j])
  return {values:order.map(i=>a[i][i]),vectors:v.map(row=>order.map(i=>row[i]))}
}

export interface System {
  lengths: number[]; masses: number[]; suspension: number; stiffness: number
  frequencies: number[]; ratios: number[][]; vectors: number[][]; matrix: number[][]
}

/**
 * Coordinates are frame X and absolute bob positions b_i. Kinetic energy is diagonal.
 * V = k X²/2 + Σ m_i g (b_i-X)²/(2 l_i).
 * The other pendulum bank contributes to the frame's mass along this axis.
 * Diagonalizing M^-1/2 K M^-1/2 gives the actual coupled normal modes.
 */
export function createSystem(count: number, duration: number): System {
  const base=TAU/duration, suspension=GRAVITY/(base*base)
  const lengths=Array.from({length:count}, (_,i)=>GRAVITY/((i+2)*base)**2)
  const masses=[FRAME_MASS+count*BOB_MASS,...lengths.map(()=>BOB_MASS)]
  const stiffness=(FRAME_MASS+2*count*BOB_MASS)*GRAVITY/suspension
  const n=count+1, matrix=Array.from({length:n}, ()=>Array(n).fill(0) as number[])
  matrix[0][0]=stiffness/masses[0]
  lengths.forEach((l,i)=>{
    const spring=BOB_MASS*GRAVITY/l, j=i+1
    matrix[0][0]+=spring/masses[0]
    matrix[j][j]=spring/BOB_MASS
    matrix[0][j]=matrix[j][0]=-spring/Math.sqrt(masses[0]*BOB_MASS)
  })
  const {values,vectors}=diagonalize(matrix)
  const frequencies=values.map(v=>Math.sqrt(v))
  // Convert each eigenmode to bob displacement relative to the frame, per metre of frame motion.
  const ratios=lengths.map((_,i)=>frequencies.map((_,j)=>vectors[i+1][j]/vectors[0][j]*Math.sqrt(masses[0]/BOB_MASS)-1))
  return {lengths,masses,suspension,stiffness,frequencies,ratios,vectors,matrix}
}

function leastSquares(rows: number[][], target: Point[]): Point[] {
  const n=rows[0].length, a=Array.from({length:n},()=>Array(n).fill(0) as number[])
  const rhs=Array.from({length:n},()=>[0,0] as Point)
  rows.forEach((row,r)=>{
    for(let i=0;i<n;i++) {
      rhs[i][0]+=row[i]*target[r][0];rhs[i][1]+=row[i]*target[r][1]
      for(let j=0;j<=i;j++) a[i][j]+=row[i]*row[j]
    }
  })
  // Tiny ridge suppresses numerical blow-up in nearly dependent finite-window bases.
  for(let i=0;i<n;i++) {a[i][i]+=rows.length*1e-8;for(let j=0;j<i;j++)a[j][i]=a[i][j]}
  const l=Array.from({length:n},()=>Array(n).fill(0) as number[])
  for(let i=0;i<n;i++) for(let j=0;j<=i;j++) {
    let sum=a[i][j];for(let k=0;k<j;k++)sum-=l[i][k]*l[j][k]
    l[i][j]=i===j?Math.sqrt(Math.max(sum,1e-14)):sum/l[j][j]
  }
  const y=rhs.map(p=>p.slice() as Point), x=rhs.map(()=>[0,0] as Point)
  for(let d=0;d<2;d++) {
    for(let i=0;i<n;i++){for(let k=0;k<i;k++)y[i][d]-=l[i][k]*y[k][d];y[i][d]/=l[i][i]}
    for(let i=n-1;i>=0;i--){let sum=y[i][d];for(let k=i+1;k<n;k++)sum-=l[k][i]*x[k][d];x[i][d]=sum/l[i][i]}
  }
  return x
}

export interface Motion { frame: Point; velocity: Point; relative: Point[]; relativeVelocity: Point[] }
export interface Solution {
  settings: Settings; system: System; coefficients: Point[]; origin: Point; scale: number
  target: Point[]; trace: Point[]; penFraction: number; penMask: boolean[]; errorPercent: number
  widthMm: number; angleBound: number; initial: Motion
  at: (time: number)=>Motion
}

/** Fit the initial modal positions AND velocities. No driving force is applied after release. */
export function fitPath(path: Target, settings: Settings): Solution {
  const system=createSystem(settings.count,settings.duration)
  const {points:target,penFraction,penMask}=targetSamples(path)
  const mean: Point=[0,0];target.forEach(p=>{mean[0]+=p[0]/target.length;mean[1]+=p[1]/target.length})
  // Paper positioning supplies the DC component, not an impossible static frame deflection.
  const centered: Point[]=target.map(p=>[p[0]-mean[0],p[1]-mean[1]])
  const frequencies=settings.kind==='coupled'?system.frequencies:system.frequencies.slice(0,settings.count).map((_,i)=>(i+1)*TAU/settings.duration)
  const damped=frequencies.map(f=>Math.sqrt(f*f-settings.damping**2))
  const basis=(time:number)=>damped.flatMap(f=>{
    const envelope=Math.exp(-settings.damping*time)
    return [envelope*Math.cos(f*time),envelope*Math.sin(f*time)]
  })
  const rows=target.map((_,i)=>basis(i/target.length*settings.duration))
  const coefficients=leastSquares(rows,centered)
  return rebuildSolution({settings,system,target,origin:mean,penFraction,penMask},coefficients)
}

type SolutionContext=Pick<Solution,'settings'|'system'|'target'|'origin'|'penFraction'|'penMask'>

/** Recompute the free response after a deliberate coefficient edit; never refit the target. */
export function rebuildSolution(context:SolutionContext, coefficients:Point[]): Solution {
  const {settings,system,target,origin:mean,penFraction,penMask}=context
  const frequencies=settings.kind==='coupled'?system.frequencies:system.frequencies.slice(0,settings.count).map((_,i)=>(i+1)*TAU/settings.duration)
  const damped=frequencies.map(f=>Math.sqrt(f*f-settings.damping**2))
  const centered: Point[]=target.map(p=>[p[0]-mean[0],p[1]-mean[1]])
  let angleBound=0
  if(settings.kind==='coupled') system.lengths.forEach((l,i)=>{
    for(let d=0;d<2;d++) {
      let bound=0
      frequencies.forEach((_,j)=>{bound+=Math.abs(system.ratios[i][j])*Math.hypot(coefficients[2*j][d],coefficients[2*j+1][d])/l})
      angleBound=Math.max(angleBound,bound)
    }
  })
  const scale=settings.kind==='coupled'?Math.min(1,MAX_ANGLE/Math.max(angleBound,1e-10)):1
  const at=(time:number): Motion=>{
    const frame: Point=[0,0], velocity: Point=[0,0]
    const relative=system.lengths.map(()=>[0,0] as Point), relativeVelocity=system.lengths.map(()=>[0,0] as Point)
    frequencies.forEach((_,j)=>{
      const f=damped[j],env=Math.exp(-settings.damping*time),c=Math.cos(f*time),s=Math.sin(f*time)
      for(let d=0;d<2;d++) {
        const a=coefficients[2*j][d],b=coefficients[2*j+1][d]
        const q=scale*env*(a*c+b*s),v=scale*env*(f*(-a*s+b*c)-settings.damping*(a*c+b*s))
        frame[d]+=q;velocity[d]+=v
        if(settings.kind==='coupled') system.ratios.forEach((r,i)=>{relative[i][d]+=r[j]*q;relativeVelocity[i][d]+=r[j]*v})
        else if(j<relative.length){relative[j][d]=q;relativeVelocity[j][d]=v}
      }
    })
    return {frame,velocity,relative,relativeVelocity}
  }
  const trace=target.map((_,i)=>at(i/target.length*settings.duration).frame)
  let error=0
  let drawCount=0
  for(let i=0;i<target.length;i++)if(penMask[i]){drawCount++;for(let d=0;d<2;d++)error+=(trace[i][d]/scale-centered[i][d])**2}
  const xs=trace.filter((_,i)=>penMask[i]).map(p=>p[0]/scale)
  const width=Math.max(...xs)-Math.min(...xs)
  return {settings,system,coefficients,origin:mean,scale,target,trace,penFraction,penMask,errorPercent:Math.sqrt(error/drawCount)/.12*100,
    widthMm:width*scale*1000,angleBound:angleBound*scale,initial:at(0),at}
}

export function modeParameters(solution:Solution,mode:number,axis:0|1) {
  const a=solution.coefficients[2*mode][axis],b=solution.coefficients[2*mode+1][axis]
  const amplitude=Math.hypot(a,b),phase=Math.atan2(-b,a)*180/Math.PI
  const natural=solution.settings.kind==='coupled'?solution.system.frequencies[mode]:(mode+1)*TAU/solution.settings.duration
  const frequency=Math.sqrt(natural*natural-solution.settings.damping**2)/TAU
  return {amplitude,amplitudePercent:amplitude/.12*100,frameAmplitudeMm:amplitude*solution.scale*1000,phase,frequency}
}

export function editMode(solution:Solution,mode:number,axis:0|1,amplitudePercent:number,phaseDegrees:number): Solution {
  if(mode<0||2*mode+1>=solution.coefficients.length||!Number.isFinite(amplitudePercent)||amplitudePercent<0||!Number.isFinite(phaseDegrees))throw new Error('Invalid mode edit.')
  const coefficients=solution.coefficients.map(p=>p.slice() as Point)
  const amplitude=amplitudePercent/100*.12,phase=phaseDegrees*Math.PI/180
  coefficients[2*mode][axis]=amplitude*Math.cos(phase);coefficients[2*mode+1][axis]=-amplitude*Math.sin(phase)
  return rebuildSolution(solution,coefficients)
}

/** Break a rendered path at every pen lift. Used by the drawing, exports and teaching example. */
export function maskedPath(points:Point[],mask:boolean[],draw=true):string {
  let active=false,result=''
  points.forEach((p,i)=>{
    if(mask[i]!==draw){active=false;return}
    result+=`${active?'L':'M'}${p[0].toFixed(3)},${p[1].toFixed(3)} `;active=true
  })
  return result.trim()
}

export function mechanicalEnergy(solution: Solution, time: number): number {
  const motion=solution.at(time),system=solution.system
  let energy=0
  for(let d=0;d<2;d++) {
    energy+=.5*system.masses[0]*motion.velocity[d]**2+.5*system.stiffness*motion.frame[d]**2
    system.lengths.forEach((l,i)=>{
      const v=motion.velocity[d]+motion.relativeVelocity[i][d]
      energy+=.5*BOB_MASS*v*v+.5*BOB_MASS*GRAVITY/l*motion.relative[i][d]**2
    })
  }
  return energy
}
