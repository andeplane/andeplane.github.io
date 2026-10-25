import {test} from 'node:test'
import assert from 'node:assert/strict'
import {continuingYear,progressAtAge} from '../../src/features/constellation/clock.ts'
import {SAMPLE,starPosition} from '../../src/features/constellation/story.ts'
import {CAMERA_ANGLE_DEGREES,cameraAmount,futureLives,projectPoint} from '../../src/features/constellation/projection.ts'

test('living dots move onward in 2D before the camera lowers, then continue in 3D',()=>{
 assert.equal(cameraAmount(93/120),0)
 assert.equal(cameraAmount(116/120),1)
 const son=SAMPLE.find(p=>p.id==='child')!,i=SAMPLE.indexOf(son)
 const first=starPosition(son,i,SAMPLE.length,progressAtAge(85),SAMPLE)
 const second=starPosition(son,i,SAMPLE.length,progressAtAge(88),SAMPLE)
 assert.ok(second.y<first.y)
 const now=starPosition(son,i,SAMPLE.length,1,SAMPLE)
 const later=starPosition(son,i,SAMPLE.length,1,SAMPLE,20)
 assert.ok(later.year>now.year)
 assert.ok(projectPoint(later,1,800).y<projectPoint(now,1,800).y)
})
test('historic endpoints stay behind while the camera comes to rest',()=>{
 const p={x:440,y:505,year:60}
 assert.deepEqual(projectPoint(p,.5,800),{x:440,y:505,scale:1})
 const past=projectPoint({x:440,y:200,year:38},1,800),future=projectPoint({x:600,y:505,year:250},1,800)
 assert.ok(past.y>future.y&&past.scale>future.scale)
 assert.equal(cameraAmount(1),cameraAmount(10))
 const brother=SAMPLE.find(p=>p.id==='brother')!,i=SAMPLE.indexOf(brother)
 assert.equal(starPosition(brother,i,SAMPLE.length,1,SAMPLE,300).year,38)
})
test('time accelerates from year 92, showing roughly a century in twenty seconds',()=>{
 assert.equal(continuingYear(104/120),92)
 assert.ok(continuingYear(105/120)-92<2)
 assert.ok(continuingYear(1,4)>185&&continuingYear(1,4)<200)
 assert.ok(continuingYear(1,40)-continuingYear(1,39)>5.9)
 for(let t=1;t<1000;t++)assert.ok(continuingYear(1,t)>continuingYear(1,t-1))
})
test('new generations and twinkling continue indefinitely without a capped tree',()=>{
 assert.equal(futureLives(.7).length,0)
 assert.ok(futureLives(1,60).length>futureLives(1).length)
 for(const seconds of [0,30,120,600,3600,36000]) {
  const now=futureLives(1,seconds),later=futureLives(1,seconds+5)
  assert.ok(now.length>0&&now.length<=384)
  assert.notDeepEqual(now,later)
  assert.ok(now.every(l=>Number.isFinite(l.head.x)&&Number.isFinite(l.head.y)&&l.points.length<=44))
 }
 const a=futureLives(1,3600),b=futureLives(1,3660)
 assert.ok(Math.max(...b.map(l=>l.generation))>Math.max(...a.map(l=>l.generation)))
})
test('a future child starts exactly on its parent’s ongoing line',()=>{
 const lives=futureLives(1,0)
 const child=lives.find(l=>l.id==='future-1-0')!,parent=lives.find(l=>l.id===child.parent)!
 assert.ok(child&&parent)
 const point=parent.points.find(p=>p.year===child.born)!
 assert.ok(Math.abs(point.x-child.points[0].x)<1e-7)
 assert.equal(point.year,child.points[0].year)
 assert.ok(Math.abs((point.elevation??0)-(child.points[0].elevation??0))<1e-7)
})


test('the camera holds at the viewer’s life while generations travel into the distance',()=>{
 assert.equal(CAMERA_ANGLE_DEGREES,30)
 const fixed={x:400,y:505,year:85}
 assert.deepEqual(projectPoint(fixed,1,800,100),projectPoint(fixed,1,800,10000))
 const near=projectPoint({x:600,y:335,year:100},1,800)
 const far=projectPoint({x:600,y:335,year:250},1,800)
 assert.ok(far.y<near.y&&far.scale<near.scale)
 const early=futureLives(1),later=futureLives(1,120)
 assert.ok(later.some(l=>l.id==='future-0-0'))
 assert.ok(Math.max(...later.map(l=>l.generation))>Math.max(...early.map(l=>l.generation)))
})
