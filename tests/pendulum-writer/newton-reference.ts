import type { Point, Solution } from '../../src/features/pendulum-writer/model.ts'

/** Independent nonlinear Newton reference; no normal modes or target path enter the forces. */
export function integrateNewton(solution:Solution): Point[] {
  if(solution.settings.kind!=='coupled'||solution.settings.damping!==0)throw new Error('Reference requires an undamped physical solution.')
  const lengths=solution.system.lengths,n=lengths.length,m=.08,g=9.81
  const total=solution.system.masses[0]+n*m,stiffness=solution.system.stiffness
  const initial=(axis:0|1)=>[solution.initial.frame[axis],solution.initial.velocity[axis],...lengths.flatMap((l,i)=>{
    const theta=Math.asin(solution.initial.relative[i][axis]/l)
    return [theta,solution.initial.relativeVelocity[i][axis]/(l*Math.cos(theta))]
  })]
  const derivative=(q:number[])=>{
    let inertia=total,force=-stiffness*q[0]
    for(let i=0;i<n;i++) {
      const theta=q[2+2*i],speed=q[3+2*i],c=Math.cos(theta),s=Math.sin(theta)
      inertia-=m*c*c
      force+=m*g*c*s+m*lengths[i]*s*speed*speed
    }
    const acceleration=force/inertia,out=[q[1],acceleration]
    for(let i=0;i<n;i++)out.push(q[3+2*i],-Math.cos(q[2+2*i])/lengths[i]*acceleration-g/lengths[i]*Math.sin(q[2+2*i]))
    return out
  }
  const rk4=(q:number[],h:number)=>{
    const a=derivative(q),b=derivative(q.map((v,i)=>v+h*a[i]/2)),c=derivative(q.map((v,i)=>v+h*b[i]/2)),d=derivative(q.map((v,i)=>v+h*c[i]))
    return q.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6)
  }
  let states=[initial(0),initial(1)]
  const frames:Point[]=[],substeps=10,h=solution.settings.duration/(solution.target.length*substeps)
  for(let i=0;i<solution.target.length;i++) {
    frames.push([states[0][0],states[1][0]])
    for(let j=0;j<substeps;j++)states=states.map(q=>rk4(q,h))
  }
  return frames
}
