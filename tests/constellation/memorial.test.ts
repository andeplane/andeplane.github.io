import {test} from 'node:test'
import assert from 'node:assert/strict'
import {SAMPLE,progressAtAge,starPosition,trailPoints,lifeEndpoint} from '../../src/features/constellation/story.ts'
import {constellationSegments,memorialState} from '../../src/features/constellation/memorial.ts'
const person=(id:string)=>SAMPLE.find(p=>p.id===id)!
test('a completed life stops drawing while its detached light rises into the sky',()=>{
 for(const id of ['grandma','grandpa','brother','mom','dad','partner','self']) {
  const p=person(id),i=SAMPLE.indexOf(p),death=progressAtAge(p.end!),later=death+6/120
  const atDeath=trailPoints(p,i,SAMPLE.length,death,SAMPLE),after=trailPoints(p,i,SAMPLE.length,later,SAMPLE)
  assert.equal(atDeath.length,after.length)
  assert.deepEqual(atDeath.map(v=>[v.x,v.year]),after.map(v=>[v.x,v.year]))
  const star=starPosition(p,i,SAMPLE.length,later,SAMPLE),endpoint=lifeEndpoint(p,i,SAMPLE.length,later,SAMPLE)
  assert.ok(star.y<endpoint.y-30)
  assert.equal(star.year,p.end)
  assert.ok(memorialState(p,later).cross>.99)
 }
})
test('arrival gives one circle pulse, then a lasting cross without a repeating flash',()=>{
 const p=person('mom'),death=progressAtAge(p.end!)
 assert.equal(memorialState(p,death+2/120).ringOpacity,0)
 assert.ok(memorialState(p,death+3.1/120).ringOpacity>.6)
 assert.equal(memorialState(p,death+5/120).ringOpacity,0)
 assert.equal(memorialState(p,1,1000).ringOpacity,0)
 assert.equal(memorialState(p,1,1000).cross,1)
 assert.equal(memorialState(person('first-love'),1).cross,0)
})
test('the closing constellation draws through only remembered lives, including Brother',()=>{
 assert.equal(constellationSegments(SAMPLE,89/120).length,0)
 const start=constellationSegments(SAMPLE,93.1/120)
 assert.equal(start[0].from,'self');assert.equal(start[0].to,'partner')
 assert.ok(start[0].draw>0&&start[0].draw<1)
 const full=constellationSegments(SAMPLE,98/120)
 assert.deepEqual(full.map(s=>s.from),['self','partner','mom','grandma','grandpa','dad','brother'])
 assert.equal(full.at(-1)!.to,'self')
 assert.ok(full.every(s=>s.draw===1))
 assert.ok(!full.some(s=>['child','childhood-friend','first-love'].includes(s.from)))
})
