import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relationshipX } from '../../src/features/constellation/relationships.ts'
const distance = (a: string, b: string, age: number) => Math.abs(relationshipX(a, age)! - relationshipX(b, age)!)
test('parents remain a close pair through childhood, teenage distance and reunion', () => {
  for (let year = 0; year <= 55; year++) assert.ok(distance('mom', 'dad', year) <= 33)
  assert.ok(distance('self', 'mom', 6) < 25)
  assert.ok(distance('self', 'dad', 6) < 25)
  assert.ok(distance('self', 'mom', 23) > 220)
  assert.ok(distance('self', 'mom', 43) < distance('self', 'mom', 33))
  assert.ok(distance('self', 'dad', 45) < 70)
})
test('dating, early parenting and rediscovery form a continuous relationship arc', () => {
  assert.ok(distance('self', 'partner', 28) < 30)
  assert.ok(distance('self', 'partner', 40) > 75)
  assert.ok(distance('self', 'partner', 56) < 30)
  for (let year = 26; year <= 85; year++) {
    assert.ok(distance('self', 'partner', year) < 115)
    assert.ok(Math.abs(relationshipX('partner', year + .01)! - relationshipX('partner', year)!) < 1)
  }
})
test('children begin close to both parents, then gain their own space', () => {
  assert.ok(distance('child', 'self', 32) < 25)
  assert.ok(distance('child', 'partner', 32) < 25)
  assert.ok(distance('daughter', 'self', 35) < 75)
  assert.ok(distance('child', 'self', 53) > 100)
  assert.ok(distance('daughter', 'self', 55) > 220)
})
test('all named relationship trajectories remain finite and continuous every year', () => {
  for (const id of ['self','mom','dad','brother','sister','partner','child','daughter','child-partner','grandchild-1','grandchild-2','childhood-friend','first-love','college-friends']) {
    for (let year = -2; year <= 100; year++) {
      const x = relationshipX(id, year)!
      assert.ok(Number.isFinite(x) && x >= 120 && x <= 755)
      assert.ok(Math.abs(relationshipX(id, year + .001)! - x) < 1)
    }
  }
})


test('siblings stay with the narrator’s family, away from the children’s cluster', () => {
  for(let age=32;age<=85;age++) {
    const sister=relationshipX('sister',age)!, me=relationshipX('self',age)!, son=relationshipX('child',age)!
    assert.ok(sister<me && me<son)
    assert.ok(Math.abs(sister-me)<Math.abs(sister-son))
  }
})
test('Brother and Childhood friend never occupy the same side or lane', () => {
  for(let age=5;age<=28;age+=.1) {
    const brother=relationshipX('brother',age)!, me=relationshipX('self',age)!, friend=relationshipX('childhood-friend',age)!
    assert.ok(brother<me && friend>me)
    assert.ok(friend-brother>150)
  }
})
