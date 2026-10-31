import test from 'node:test'
import assert from 'node:assert/strict'
import { andersPath, createSystem, fitPath, GRAVITY, BOB_MASS, MAX_ANGLE, mechanicalEnergy, targetSamples } from '../../src/features/pendulum-writer/model.ts'

test('normal modes solve the coupled mass/stiffness eigenproblem',()=>{
  const s=createSystem(24,6)
  for(let mode=0;mode<s.frequencies.length;mode++) {
    const lambda=s.frequencies[mode]**2
    for(let row=0;row<s.matrix.length;row++) {
      const applied=s.matrix[row].reduce((sum,v,col)=>sum+v*s.vectors[col][mode],0)
      assert.ok(Math.abs(applied-lambda*s.vectors[row][mode])<1e-8,'Eigenvector must satisfy Dv = λv')
    }
  }
})

test('Anders emerges from free motion with less than 1% shape RMS',()=>{
  const s=fitPath(andersPath(),{count:24,duration:6,damping:0,kind:'coupled'})
  assert.ok(s.errorPercent<1)
  assert.ok(s.widthMm>1&&s.widthMm<20,'Report the small physical footprint instead of claiming page-sized writing')
  assert.ok(s.angleBound<=MAX_ANGLE+1e-12)
  for(let j=0;j<=100;j++) {
    const motion=s.at(j/100*6)
    motion.relative.forEach((r,i)=>r.forEach(value=>assert.ok(Math.abs(value/s.system.lengths[i])<=MAX_ANGLE+1e-10)))
  }
})

test('undamped motion conserves mechanical energy without a driving force',()=>{
  const s=fitPath(andersPath(),{count:16,duration:6,damping:0,kind:'coupled'})
  const initial=mechanicalEnergy(s,0)
  for(let j=0;j<=40;j++)assert.ok(Math.abs(mechanicalEnergy(s,j*.2)/initial-1)<1e-9)
})

test('trajectory satisfies the frame reaction-force equation',()=>{
  const s=fitPath(andersPath(),{count:12,duration:6,damping:0,kind:'coupled'}),h=1e-5
  for(const t of [.12,1.3,3.1,5.7]) {
    const a=s.at(t-h),b=s.at(t),c=s.at(t+h)
    for(let d=0;d<2;d++) {
      const acceleration=(c.frame[d]-2*b.frame[d]+a.frame[d])/(h*h)
      const force=-s.system.stiffness*b.frame[d]+b.relative.reduce((sum,r,i)=>sum+BOB_MASS*GRAVITY/s.system.lengths[i]*r[d],0)
      assert.ok(Math.abs(acceleration-force/s.system.masses[0])<2e-6)
    }
  }
})

test('viscous damping removes energy monotonically',()=>{
  const s=fitPath(andersPath(),{count:12,duration:6,damping:.06,kind:'coupled'})
  let previous=mechanicalEnergy(s,0)
  for(let j=1;j<=60;j++) {const energy=mechanicalEnergy(s,j*.1);assert.ok(energy<=previous*(1+1e-10));previous=energy}
})

test('adding pendulums resolves more letter detail and changing cycle time preserves the shape',()=>{
  const settings={count:12,duration:6,damping:0,kind:'coupled' as const}
  const low=fitPath(andersPath(),settings),high=fitPath(andersPath(),{...settings,count:24}),slow=fitPath(andersPath(),{...settings,duration:12})
  assert.ok(high.errorPercent<low.errorPercent/2)
  assert.ok(Math.abs(low.errorPercent-slow.errorPercent)<1e-8)
  assert.ok(Math.abs(slow.system.lengths[0]/low.system.lengths[0]-4)<1e-12)
})

test('ideal Fourier model has the selected number of independent harmonics',()=>{
  const s=fitPath(andersPath(),{count:24,duration:6,damping:0,kind:'fourier'})
  assert.equal(s.coefficients.length,48)
  assert.ok(s.errorPercent<1)
  const a=s.at(0).frame,b=s.at(6).frame
  assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-12)
})

test('targets are invariant to drawing location and scale; degenerate strokes are rejected',()=>{
  const a=targetSamples(andersPath()).points,b=targetSamples(andersPath().map(p=>[p[0]*3+100,p[1]*3-200])).points
  a.forEach((p,i)=>assert.ok(Math.hypot(p[0]-b[i][0],p[1]-b[i][1])<1e-12))
  assert.throws(()=>targetSamples([[1,1],[1,1]]),/longer stroke/)
})
