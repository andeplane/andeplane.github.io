import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAPTERS, DEFAULT_DURATION, MAX_PEOPLE, SAMPLE, chapterAt, personOpacity, readPeople, restorePeople, starPosition, storyAge, trailPath } from '../../src/features/constellation/story.ts'

const person = (id: string) => SAMPLE.find(p => p.id === id)!
const atAge = (age: number) => age / 100 * .9

test('the faster story has deterministic chapter boundaries and room for the ending', () => {
  assert.equal(DEFAULT_DURATION, 48)
  CHAPTERS.forEach((chapter, index) => assert.equal(chapterAt(chapter.at), index))
  assert.equal(chapterAt(.899), CHAPTERS.length - 2)
  assert.equal(chapterAt(1), CHAPTERS.length - 1)
  assert.equal(storyAge(.9), 100)
})

test('childhood friendship enters at five, accompanies youth, then disappears after 28', () => {
  const friend = person('childhood-friend')
  assert.equal(personOpacity(friend, atAge(4)), 0)
  assert.equal(personOpacity(friend, atAge(10)), 1)
  assert.equal(personOpacity(friend, atAge(27)), 1)
  assert.ok(personOpacity(friend, atAge(29)) > 0 && personOpacity(friend, atAge(29)) < 1)
  assert.equal(personOpacity(friend, atAge(32)), 0)
  assert.equal(trailPath(friend, 10, 12, 1, SAMPLE), '')
})

test('college friends enter later and drift away without becoming memorial stars', () => {
  const friend = person('college-friends')
  assert.equal(personOpacity(friend, atAge(17)), 0)
  assert.equal(personOpacity(friend, atAge(23)), 1)
  assert.equal(starPosition(friend, 11, 12, 1, SAMPLE).visible, false)
})

test('a departed family member remains visible while later generations enter', () => {
  assert.equal(personOpacity(person('grandma'), 1), 1)
  assert.equal(personOpacity(person('grandchild-1'), atAge(60)), 0)
  assert.equal(personOpacity(person('grandchild-1'), atAge(65)), 1)
  assert.equal(personOpacity(person('grandchild-2'), atAge(71)), 1)
})

test('the son, his wife and grandchildren keep their trails after the narrator ends', () => {
  assert.equal(person('self').end, 78)
  for (const id of ['child', 'child-partner', 'grandchild-1', 'grandchild-2']) {
    const p = person(id)
    const index = SAMPLE.indexOf(p)
    assert.equal(p.end, null)
    assert.equal(personOpacity(p, 1), 1)
    assert.ok(trailPath(p, index, SAMPLE.length, 1, SAMPLE).length > 100)
    assert.ok(starPosition(p, index, SAMPLE.length, 1, SAMPLE).x > 500)
  }
})

test('every visible trail meets its own star, including the final transition', () => {
  for (const progress of [0, .055, .18, .3, .55, .7, .9, .95, 1]) {
    SAMPLE.forEach((p, index) => {
      const star = starPosition(p, index, SAMPLE.length, progress, SAMPLE)
      const path = trailPath(p, index, SAMPLE.length, progress, SAMPLE)
      if (!star.visible) assert.equal(path, '')
      else {
        const [x, y] = path.split(/[ML]/).at(-1)!.trim().split(',').map(Number)
        assert.ok(Math.abs(x - star.x) < 1e-7)
        assert.ok(Math.abs(y - star.y) < 1e-7)
      }
    })
  }
})

test('saved data rejects duplicate IDs, invalid ages, ending types, colors and oversized skies', () => {
  assert.deepEqual(readPeople(SAMPLE), SAMPLE)
  for (const invalid of [null, [], [...SAMPLE, SAMPLE[0]], Array(MAX_PEOPLE + 1).fill(SAMPLE[0]), [{ ...SAMPLE[0], start: NaN }], [{ ...SAMPLE[0], end: 0 }], [{ ...SAMPLE[0], name: ' ' }], [{ ...SAMPLE[0], color: 'red' }], [{ ...SAMPLE[0], end: 101 }], [{ ...SAMPLE[0], exit: 'unknown' }], [{ ...SAMPLE[0], lane: 2 }]]) assert.equal(readPeople(invalid), null)
})

test('the exact previous sample upgrades, but customized names and ages survive', () => {
  const old = SAMPLE.slice(0, 7).map((p, i) => ({id:p.id,name:['Grandma','Grandpa','Mom','Dad','My love','Me','Our child'][i],color:p.color,start:[0,0,0,0,25,0,32][i],end:[19,28,66,54,null,null,null][i]}))
  assert.deepEqual(restorePeople(null, old), SAMPLE)
  const custom = old.map((p, i) => i === 0 ? { ...p, name: 'Nana', end: 21 } : p)
  assert.deepEqual(restorePeople(null, custom), custom)
  assert.deepEqual(restorePeople(custom, old), custom)
})

test('one-person and maximum-size skies remain finite through the reveal', () => {
  for (const count of [1, MAX_PEOPLE]) for (const progress of [0, .94, 1]) {
    for (let i = 0; i < count; i++) {
      const position = starPosition(person('self'), i, count, progress)
      assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y))
    }
  }
})
