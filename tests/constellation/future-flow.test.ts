import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frameAtYear, continuingYear } from '../../src/features/constellation/clock.ts'
import { futureAbstraction, futureFlow, descendantCanopy } from '../../src/features/constellation/futureFlow.ts'
import { MEMORIAL_SKY, projectMemorial, CONSTELLATION_ORDER } from '../../src/features/constellation/memorial.ts'
import { SAMPLE, ageAxis, starPosition, personLabelOpacity } from '../../src/features/constellation/story.ts'
import { projectPerson } from '../../src/features/constellation/projection.ts'
import { flowingPath } from '../../src/features/constellation/curves.ts'

test('the counter fades only after 200 and individual tracing gives way to the collective future',()=>{
  for(const year of [100,120,150,200,215,230,500]) {
    const frame=frameAtYear(year)
    assert.ok(Math.abs(continuingYear(frame.progress,frame.afterEnding)-year)<1e-8)
    const axis=ageAxis(frame.progress,frame.afterEnding)
    if(year<=200)assert.equal(axis.opacity,1)
    if(year===215)assert.ok(Math.abs(axis.opacity-.5)<1e-7)
    if(year>=230)assert.equal(axis.opacity,0)
  }
  assert.equal(futureAbstraction(120),0)
  assert.ok(futureAbstraction(160)>.4&&futureAbstraction(160)<.6)
  assert.equal(futureAbstraction(200),1)
})

test('the collective canopy grows from this couple and every fork has an ancestor',()=>{
  const branches=descendantCanopy(300,800)
  const ids=new Set(['self','partner','descendants',...branches.map(b=>b.to)])
  assert.ok(branches.length>64&&branches.length<=448)
  assert.ok(branches.every(b=>ids.has(b.from)))
  for(const id of ['self','partner']) {
    const start=projectMemorial({...MEMORIAL_SKY[id],year:85},1,800)
    assert.ok(branches.find(b=>b.id===id)!.path.startsWith(`M${start.x},${start.y} `))
  }
  assert.ok(descendantCanopy(150,800).filter(b=>b.opacity>0).length<branches.length)
})

test('the distant mass keeps moving calmly, without a growing particle budget or pulsing heads',()=>{
  for(const seconds of [150,300,600,3600,86400]) {
    const year=continuingYear(1,seconds-120)
    const now=futureFlow(year,seconds,800),next=futureFlow(year,seconds+1/60,800)
    assert.equal(now.length,44)
    assert.notDeepEqual(now,next)
    assert.ok(now.every(r=>!r.path.includes('NaN')&&!r.path.includes('Infinity')))
    assert.ok(now.every((r,i)=>Math.abs(r.opacity-next[i].opacity)<.005))
    assert.ok(now.every(r=>!('head' in r)&&!('pulse' in r)))
  }
})

test('all seven memorials and You remain in the foreground at every future age and aspect ratio',()=>{
  for(const year of [100,200,500,10000])for(const height of [312,800,2000]) {
    const frame=frameAtYear(year)
    for(const id of Object.keys(MEMORIAL_SKY)) {
      const p=SAMPLE.find(p=>p.id===id)!,point=starPosition(p,SAMPLE.indexOf(p),SAMPLE.length,frame.progress,SAMPLE,frame.afterEnding)
      const projected=projectPerson(point,p,frame.progress,height,frame.afterEnding)
      assert.ok(projected.x>104&&projected.x<788&&projected.y>15&&projected.y<height*.73,id)
      if(id==='self')assert.equal(personLabelOpacity(p,frame.progress),1)
    }
  }
  const cross=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
  const points=CONSTELLATION_ORDER.map(id=>MEMORIAL_SKY[id])
  for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++) {
    if(i===0&&j===points.length-2)continue
    const a=points[i],b=points[i+1],c=points[j],d=points[j+1]
    assert.ok(!(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0),'the constellation must not cross itself')
  }
})

test('rendered trails use rounded cubic joins with matching tangents',()=>{
  const points=[{x:120,y:800},{x:400,y:600},{x:420,y:400},{x:440,y:200}]
  const path=flowingPath(points)
  assert.ok(!path.includes(' L')&&path.endsWith('440,200'))
  const segments=path.split(' C').slice(1).map(s=>s.match(/-?\d+(?:\.\d+)?/g)!.map(Number))
  for(let i=0;i<segments.length-1;i++) {
    const a=segments[i],b=segments[i+1]
    assert.ok(Math.abs((a[4]-a[2])-(b[0]-a[4]))<1e-8)
    assert.ok(Math.abs((a[5]-a[3])-(b[1]-a[5]))<1e-8)
  }
})

test('new forks keep growing after the score, with a bounded visible history',()=>{
 for(const seconds of [130,180,300,600,3600,86400]) {
  const year=continuingYear(1,seconds-120)
  const now=descendantCanopy(year,800,['self','partner'],1,seconds)
  const later=descendantCanopy(year+4.5,800,['self','partner'],1,seconds+1)
  const growth=now.filter(p=>p.id.startsWith('generation-')&&p.opacity>.01)
  assert.ok(growth.length>0&&now.length<=448)
  assert.ok(growth.some(p=>{const next=later.find(q=>q.id===p.id);return next&&next.path!==p.path}),'branches themselves must grow, not only moving highlights')
  assert.ok(now.every(p=>!p.path.includes('NaN')&&!p.path.includes('Infinity')))
  const ids=new Set(['self','partner','descendants',...now.map(p=>p.to)])
  assert.ok(now.every(p=>ids.has(p.from)),'all new generations stay attached to this family')
 }
})
