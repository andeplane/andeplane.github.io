import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLORS, MAX_PEOPLE, SAMPLE, YEAR_SPACING, ageAxis, attentionOpacity, brotherMoment, personAppearance, personLabelOpacity, personName, personOpacity, progressAtAge, readPeople, restorePeople, starPosition, storyAge, trailPoints } from '../../src/features/constellation/story.ts'
const person = (id: string) => SAMPLE.find(p => p.id === id)!
const pos = (id: string, age: number) => { const p = person(id); return starPosition(p, SAMPLE.indexOf(p), SAMPLE.length, progressAtAge(age), SAMPLE) }

test('generic family has a brother two years older and a sister born at eight', () => {
  assert.equal(SAMPLE.length, 17)
  assert.equal(person('brother').start, -2)
  assert.equal(person('brother').end! - person('brother').start, 40)
  assert.equal(person('sister').start, 8)
  assert.equal(personOpacity(person('sister'), progressAtAge(7)), 0)
  assert.equal(personOpacity(person('sister'), progressAtAge(10)), 1)
  assert.equal(person('self').end, 85)
  assert.equal(person('self').name, 'You')
  assert.doesNotMatch(SAMPLE.map(p => p.name).join(' '), /Mikael/)
})
test('the kindergarten encounter crosses near You once and continues offscreen without parking or dying',()=>{
  const friend=person('kindergarten-friend')
  assert.ok(pos(friend.id,1).x<104)
  assert.ok(pos(friend.id,6).x>794)
  assert.ok(Math.abs(pos(friend.id,3).x-pos('self',3).x)<1)
  let closeYears=0
  for(let age=1;age<7;age+=.05) {
    const current=pos(friend.id,age),next=pos(friend.id,age+.05)
    assert.ok(next.x-current.x>9,`the fly-by must keep moving at age ${age}`)
    assert.ok(Math.abs(current.year-age)<1e-7)
    assert.equal(current.y,pos('self',age).y)
    assert.equal(personAppearance(friend,progressAtAge(age)).distance,0)
    if(Math.abs(current.x-pos('self',age).x)<50)closeYears+=.05
  }
  assert.ok(closeYears>0&&closeYears<.6,'a passing encounter must not settle next to You')
  const trail=trailPoints(friend,SAMPLE.indexOf(friend),SAMPLE.length,progressAtAge(3),SAMPLE)
  assert.ok(trail[0].year<0&&trail[0].x<104,'this person had a life before paths crossed')
  assert.equal(personLabelOpacity(friend,progressAtAge(1)),0)
  assert.equal(personLabelOpacity(friend,progressAtAge(6)),0)
  assert.equal(pos(friend.id,10).visible,false)
  assert.ok(Math.abs(pos('childhood-friend',10).x-pos('self',10).x)<50,'the lasting childhood friendship still stays close')
})
test('friendships and first love fade without becoming memorials', () => {
  for (const id of ['childhood-friend','first-love','college-friends']) {
    const p = person(id)
    assert.equal(p.exit, 'fade')
    assert.equal(personOpacity(p, progressAtAge(p.start - 5)), 0)
    assert.equal(personOpacity(p, progressAtAge(p.start + 2)), 1)
    assert.equal(personOpacity(p, progressAtAge(p.end! + 4)), 0)
    assert.equal(pos(id, 100).visible, false)
  }
})
test('friends approach from another life, share the present, and leave without falling behind', () => {
  for(const id of ['childhood-friend','first-love','college-friends']) {
    const p=person(id),meeting=pos(id,p.start),before=pos(id,p.start-3),leaving=pos(id,p.end!+2)
    assert.ok(Math.abs(before.x-pos('self',p.start-3).x)>Math.abs(meeting.x-pos('self',p.start).x)+120)
    assert.equal(meeting.y,pos('self',p.start).y)
    assert.equal(leaving.year,p.end!+2)
    assert.equal(leaving.y,pos('self',p.end!+2).y)
    assert.ok(Math.abs(leaving.x-pos('self',p.end!+2).x)>Math.abs(pos(id,p.end!).x-pos('self',p.end!).x)+100)
    const trail=trailPoints(p,SAMPLE.indexOf(p),SAMPLE.length,progressAtAge(p.start),SAMPLE)
    assert.ok(trail[0].year<p.start-5)
    assert.ok(trail[0].x<104||trail[0].x>794)
    assert.equal(personAppearance(p,progressAtAge(p.end!+2)).distance,0)
  }
})
test('a brother remains as a small neutral star while living people continue', () => {
  const appearance = personAppearance(person('brother'), progressAtAge(46))
  assert.equal(appearance.color, '#8d99a9')
  assert.equal(appearance.label, '#8d99a9')
  assert.ok(appearance.radius < personAppearance(person('brother'), progressAtAge(35)).radius)
  assert.equal(pos('brother', 100).visible, true)
  assert.ok(Math.abs(pos('brother', 50).x - pos('brother', 100).x) < 1e-8)
  assert.equal(pos('brother', 50).year, 38)
  assert.equal(pos('child', 100).year, 100)
})
test('wife or husband is the same continuous dating partner', () => {
  for (const gender of [.25,.75]) {
    const family = restorePeople(null, null, () => gender)
    const p = family.find(p => p.id === 'partner')!
    assert.equal(personName(p, progressAtAge(28)), gender < .5 ? 'Girlfriend' : 'Boyfriend')
    assert.equal(personName(p, progressAtAge(40)), gender < .5 ? 'Wife' : 'Husband')
  }
})
test('every trail ends exactly on its own star across every narrative year', () => {
  for (let age = -2; age <= 100; age++) SAMPLE.forEach((p, i) => {
    const progress = progressAtAge(age)
    const head = starPosition(p, i, SAMPLE.length, progress, SAMPLE)
    const points = trailPoints(p, i, SAMPLE.length, progress, SAMPLE)
    if (!head.visible) assert.equal(points.length, 0)
    else {
      assert.deepEqual(points.at(-1), head)
      assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
      assert.ok(Math.abs(head.year - (p.exit==='fade'?age:Math.min(age, p.end ?? age))) < 1e-7)
    }
  })
})
test('the age scale keeps five-year ticks and the living heads aligned', () => {
  for (let age = 0; age <= 100; age++) {
    const p = progressAtAge(age)
    const axis = ageAxis(p)
    assert.ok(Math.abs(axis.age - age) < 1e-7)
    assert.ok(axis.ticks.length >= 3 && axis.ticks.length <= 4)
    axis.ticks.forEach(t => assert.ok(Math.abs(t.y - (axis.y + (storyAge(p) - t.age) * YEAR_SPACING)) < 1e-7))
    SAMPLE.filter(person => age >= person.start && (person.end === null || age < person.end)).forEach(person => assert.equal(pos(person.id, age).y, axis.y))
  }
})
test('saved custom families survive and invalid ages or duplicate identities are rejected', () => {
  assert.deepEqual(readPeople(SAMPLE), SAMPLE)
  const custom = [{ id: 'nana', name: 'Nana', color: COLORS[0], start: -50, end: 21 }]
  assert.deepEqual(restorePeople(custom, null), custom)
  for (const bad of [[],null,[...SAMPLE,SAMPLE[0]],Array(MAX_PEOPLE + 1).fill(SAMPLE[0]),[{...SAMPLE[0],start:-101}],[{...SAMPLE[0],start:NaN}],[{...SAMPLE[0],color:'red'}],[{...SAMPLE[0],name:''}],[{...SAMPLE[0],end:101}]]) assert.equal(readPeople(bad), null)
})

test('previous fictional casts upgrade, while edits to those same casts are preserved', async () => {
  const {readFileSync}=await import('node:fs')
  const fixtures=JSON.parse(readFileSync(new URL('./previous-samples.json',import.meta.url),'utf8'))
  for(const fixture of fixtures) {
    assert.deepEqual(restorePeople(fixture,null,()=>.25),SAMPLE)
    const custom=fixture.map((p:typeof SAMPLE[number],i:number)=>i===0?{...p,name:'Nana'}:p)
    assert.deepEqual(restorePeople(custom,null,()=>.25),custom)
  }
})


test('living colors stay distinct and the narrator gets one gentle birth bloom',()=>{
  const mother=personAppearance(person('mom'),progressAtAge(20))
  const father=personAppearance(person('dad'),progressAtAge(20))
  assert.equal(mother.color,person('mom').color)
  assert.equal(father.color,person('dad').color)
  assert.notEqual(mother.label,father.label)
  const birth=personAppearance(person('self'),progressAtAge(.9))
  const later=personAppearance(person('self'),progressAtAge(4))
  assert.ok(birth.birth>.9&&birth.radius>later.radius&&birth.glowRadius>later.glowRadius)
  assert.equal(later.birth,0)
})


test('the family already has ongoing life trails before Me is born',()=>{
 const progress=progressAtAge(-1)
 assert.equal(personOpacity(person('self'),progress),0)
 for(const id of ['mom','dad','grandma','grandpa']) {
  const p=person(id),points=trailPoints(p,SAMPLE.indexOf(p),SAMPLE.length,progress,SAMPLE)
  assert.ok(points.length>20&&points[0].year< -2)
 }
})

test('parenthood has a quiet interval before the brother’s death',()=>{
 assert.equal(person('child').start,30)
 assert.equal(person('daughter').start,32)
 const loss=person('brother').end!
 assert.ok(SAMPLE.filter(p=>p.id!=='brother').every(p=>Math.abs(p.start-loss)>=5))
})

test('the brother’s loss has a quiet held moment and temporary visual focus',()=>{
 const before=pos('brother',38),held=pos('brother',39)
 assert.equal(before.y,held.y)
 assert.equal(brotherMoment(progressAtAge(39)),1)
 assert.equal(attentionOpacity(person('brother'),progressAtAge(39)),1)
 assert.ok(attentionOpacity(person('child'),progressAtAge(39))<.3)
 assert.equal(attentionOpacity(person('child'),progressAtAge(44)),1)
 assert.ok(pos('brother',44).y<held.y)
})
