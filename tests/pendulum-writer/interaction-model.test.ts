import test from 'node:test'
import assert from 'node:assert/strict'
import { nameTarget, letterA } from '../../src/features/pendulum-writer/handwriting.ts'
import { editMode, fitPath, MAX_ANGLE, mechanicalEnergy, maskedPath, modeParameters } from '../../src/features/pendulum-writer/model.ts'
import { integrateNewton } from './newton-reference.ts'

const settings={count:24,duration:6,damping:0,kind:'coupled' as const}

test('typed Latin names and accents produce different fitted coefficients and distinct pen strokes',()=>{
  const names=['Sophie','Øyvind','José','Zoë','Anna-Maria','O’Connor']
  const solutions=names.map(name=>fitPath(nameTarget(name),settings))
  solutions.forEach(s=>{
    assert.ok(s.errorPercent<2)
    assert.ok(s.penMask.slice(0,Math.floor(s.penFraction*s.penMask.length)).includes(false),'Lift the pen between separate glyph strokes')
    assert.ok(s.target.every(p=>p.every(Number.isFinite)))
  })
  assert.notDeepEqual(solutions[0].coefficients,solutions[1].coefficients)
  assert.throws(()=>nameTarget('   '),/Type a name/)
  assert.throws(()=>nameTarget('你好'),/Latin script font/)
})

test('multi-stroke targets and exports do not connect separated strokes with ink',()=>{
  const s=fitPath({strokes:[[[0,0],[20,0]],[[40,10],[40,30]]]},settings)
  const ink=maskedPath(s.trace,s.penMask)
  assert.equal((ink.match(/M/g)??[]).length,2)
  assert.ok((maskedPath(s.trace,s.penMask,false).match(/M/g)??[]).length>=2)
})

test('editing one mode changes the free response without mutating the fitted coefficients',()=>{
  const baseline=fitPath(nameTarget('Sophie'),settings),before=JSON.stringify(baseline.coefficients)
  const edited=editMode(baseline,2,1,8,35),parameters=modeParameters(edited,2,1)
  assert.equal(JSON.stringify(baseline.coefficients),before)
  assert.ok(Math.abs(parameters.amplitudePercent-8)<1e-12)
  assert.ok(Math.abs(parameters.phase-35)<1e-12)
  assert.notDeepEqual(edited.trace,baseline.trace)
  assert.ok(edited.angleBound<=MAX_ANGLE+1e-12)
  assert.ok(Math.abs(mechanicalEnergy(edited,3)/mechanicalEnergy(edited,0)-1)<1e-9)
  baseline.coefficients.forEach((point,i)=>point.forEach((value,d)=>{if(d!==1||(i!==4&&i!==5))assert.equal(edited.coefficients[i][d],value)}))
})

test('the teaching A uses the physical frame model with only a few pendulums',()=>{
  const few=fitPath(letterA,{...settings,duration:3,count:3}),more=fitPath(letterA,{...settings,duration:3,count:6})
  assert.ok(few.errorPercent<5)
  assert.ok(more.errorPercent<2)
  assert.equal(few.system.lengths.length,3)
  assert.ok(few.widthMm>5&&few.widthMm<20)
  assert.ok(Math.abs(mechanicalEnergy(few,1)/mechanicalEnergy(few,0)-1)<1e-9)
})

test('an independent nonlinear Newton integration reproduces the default writing closely',()=>{
  const s=fitPath(nameTarget('Anders'),settings),reference=integrateNewton(s)
  let error=0,difference=0,count=0
  reference.forEach((p,i)=>{
    if(!s.penMask[i])return
    count++
    for(let d=0;d<2;d++){error+=(p[d]/s.scale-(s.target[i][d]-s.origin[d]))**2;difference+=(p[d]-s.trace[i][d])**2}
  })
  const targetRms=Math.sqrt(error/count)/.12*100,modelDifference=Math.sqrt(difference/count)/(.12*s.scale)*100
  assert.ok(targetRms<1,`Nonlinear shape RMS ${targetRms}`)
  assert.ok(modelDifference<.2,`Linear/nonlinear RMS ${modelDifference}`)
})
