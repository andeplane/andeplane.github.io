import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameraAmount, futureBranches, projectPoint } from '../../src/features/constellation/projection.ts'
test('the camera lowers after the narrator dies and then comes to rest', () => {
  assert.equal(cameraAmount(90 / 120), 0)
  assert.equal(cameraAmount(108 / 120), 1)
  assert.equal(cameraAmount(1), cameraAmount(10))
  const point = { x: 440, y: 505, year: 60 }
  assert.deepEqual(projectPoint(point, .5, 800), { x: 440, y: 505, scale: 1 })
})
test('future lives recede toward the horizon while historic endpoints stay nearer', () => {
  const past = projectPoint({x:440,y:200,year:38},1,800)
  const narrator = projectPoint({x:440,y:280,year:85},1,800)
  const future = projectPoint({x:600,y:505,year:250},1,800)
  assert.ok(past.y > narrator.y && narrator.y > future.y)
  assert.ok(future.scale < narrator.scale && narrator.scale < past.scale)
  assert.ok(Math.abs(future.x - 480) < 25)
})
test('the future branches from existing paths and grows beyond the two-minute ending', () => {
  assert.equal(futureBranches(.7).length, 0)
  assert.ok(futureBranches(1).length > futureBranches(100 / 120).length)
  assert.ok(futureBranches(1,120).length >= futureBranches(1).length)
  const branches = futureBranches(1,300)
  assert.ok(branches.length > 100 && branches.length < 200)
  branches.filter(b => b.parent).forEach(branch => {
    const parent = branches.find(b => b.id === branch.parent)!
    assert.equal(branch.from.x, parent.to.x)
    assert.equal(branch.from.year, parent.to.year)
  })
})
test('projection remains finite across all story years and tested aspect ratios', () => {
  for (const height of [350,800,1800]) for (let year=-2;year<=300;year++) for (const progress of [.7,.8,.85,.9,1]) {
    const p=projectPoint({x:200+year,y:505,year},progress,height)
    assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.scale>0)
  }
})
