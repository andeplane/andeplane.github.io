import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relationshipX } from '../../src/features/constellation/relationships.ts'
import { SAMPLE, pathX } from '../../src/features/constellation/story.ts'
const distance = (a: string, b: string, age: number) => Math.abs(relationshipX(a, age)! - relationshipX(b, age)!)
test('parents remain a close pair through childhood, teenage distance and reunion', () => {
  for (let year = 0; year <= 55; year++) assert.ok(distance('mom', 'dad', year) <= 45)
  assert.ok(distance('self', 'mom', 6) < 25)
  assert.ok(distance('self', 'dad', 6) < 55)
  assert.ok(distance('self', 'mom', 23) > 150)
  assert.ok(distance('self', 'mom', 43) < distance('self', 'mom', 33))
  assert.ok(distance('self', 'dad', 45) < 100)
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
  assert.ok(distance('child', 'self', 30) < 25)
  assert.ok(distance('child', 'partner', 30) < 45)
  assert.ok(distance('daughter', 'self', 32) < 75)
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
    assert.ok(friend-brother>95)
  }
})

test('the narrator leaves and returns; the parents do not move away from their child',()=>{
 const shift=(id:string,a:number,b:number)=>relationshipX(id,b)!-relationshipX(id,a)!
 assert.ok(shift('self',8,23)>135)
 assert.ok(Math.abs(shift('mom',8,23))<4&&Math.abs(shift('dad',8,23))<4)
 assert.ok(shift('self',30,45)<-75)
 assert.ok(Math.abs(shift('mom',30,45))<4)
 assert.ok(distance('child','self',53)-distance('child','self',44)>80)
 assert.ok(Math.abs(shift('self',44,53))<25)
})
test('first love is closest to Me, across from childhood friend, while college friendship grows',()=>{
 for(let age=15;age<=21;age+=.1) {
  assert.ok(relationshipX('first-love',age)!<relationshipX('self',age)!)
  assert.ok(relationshipX('childhood-friend',age)!>relationshipX('self',age)!)
  for(const friend of ['childhood-friend','college-friends'])assert.ok(distance('first-love','self',age)<distance('first-love',friend,age))
 }
 assert.ok(distance('childhood-friend','self',12)<50)
 assert.ok(distance('college-friends','self',23)<45)
 assert.ok(distance('college-friends','self',23)<distance('childhood-friend','self',23))
 assert.ok(distance('college-friends','self',23)<distance('college-friends','self',18))
 assert.ok(distance('childhood-friend','self',23)>distance('childhood-friend','self',18))
})

test('the son makes a later outward bend while the parents stay on their course',()=>{
  assert.ok(relationshipX('child',77)!-relationshipX('child',68)!>120)
  assert.ok(Math.abs(relationshipX('self',77)!-relationshipX('self',68)!)<4)
  assert.ok(Math.abs(relationshipX('partner',77)!-relationshipX('partner',68)!)<4)
  assert.ok(distance('child','self',77)>195)
  assert.ok(distance('child','child-partner',77)<80)
})

test('family companions keep distinct tracks instead of merging for whole years',()=>{
 const x=(id:string,age:number)=>{const p=SAMPLE.find(p=>p.id===id)!;return pathX(p,SAMPLE.indexOf(p),SAMPLE.length,age,SAMPLE)}
 for(let age=0;age<38;age+=.1)assert.ok(x('mom',age)-x('brother',age)>20)
 for(let age=0;age<49;age+=.1)assert.ok(x('self',age)-x('dad',age)>40)
 for(let age=64;age<100;age+=.1)assert.ok(x('child',age)-x('grandchild-1',age)>17)
 for(let age=70;age<100;age+=.1)assert.ok(x('grandchild-2',age)-x('child-partner',age)>17)
 // All four household lines have room once both children have arrived.
 for(let age=34;age<40;age+=.1) {
  const positions=['self','child','daughter','partner'].map(id=>x(id,age)).sort((a,b)=>a-b)
  for(let i=1;i<positions.length;i++)assert.ok(positions[i]-positions[i-1]>17)
 }
})
