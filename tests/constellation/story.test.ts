import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLORS, MAX_PEOPLE, SAMPLE, YEAR_SPACING, ageAxis, personAppearance, personName, personOpacity, progressAtAge, readPeople, restorePeople, starPosition, storyAge, trailPoints } from '../../src/features/constellation/story.ts'
const person = (id: string) => SAMPLE.find(p => p.id === id)!
const pos = (id: string, age: number) => { const p = person(id); return starPosition(p, SAMPLE.indexOf(p), SAMPLE.length, progressAtAge(age), SAMPLE) }

test('generic family has a brother two years older and a sister born at eight', () => {
  assert.equal(SAMPLE.length, 16)
  assert.equal(person('brother').start, -2)
  assert.equal(person('brother').end! - person('brother').start, 40)
  assert.equal(person('sister').start, 8)
  assert.equal(personOpacity(person('sister'), progressAtAge(7)), 0)
  assert.equal(personOpacity(person('sister'), progressAtAge(10)), 1)
  assert.equal(person('self').end, 85)
  assert.doesNotMatch(SAMPLE.map(p => p.name).join(' '), /Mikael/)
})
test('friendships and first love fade without becoming memorials', () => {
  for (const id of ['childhood-friend','first-love','college-friends']) {
    const p = person(id)
    assert.equal(p.exit, 'fade')
    assert.equal(personOpacity(p, progressAtAge(p.start - 1)), 0)
    assert.equal(personOpacity(p, progressAtAge(p.start + 2)), 1)
    assert.equal(personOpacity(p, progressAtAge(p.end! + 4)), 0)
    assert.equal(pos(id, 100).visible, false)
  }
})
test('friends travel near Me during their shared years', () => {
  for (const id of ['childhood-friend','first-love','college-friends']) for (let age = person(id).start + 1; age < person(id).end!; age++) {
    assert.ok(Math.abs(pos(id, age).x - pos('self', age).x) < (id === 'college-friends' ? 200 : 120))
    assert.equal(pos(id, age).y, pos('self', age).y)
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
      assert.ok(Math.abs(head.year - Math.min(age, p.end ?? age)) < 1e-7)
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
