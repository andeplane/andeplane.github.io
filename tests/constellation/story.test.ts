import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAPTERS, DEFAULT_DURATION, MAX_PEOPLE, SAMPLE, YEAR_SPACING, ageAxis, chapterAt, personAppearance, personName, personOpacity, playbackFrame, readPeople, restorePeople, starPosition, storyAge, storyMessage, trailPath } from '../../src/features/constellation/story.ts'

const person = (id: string) => SAMPLE.find(p => p.id === id)!
const atAge = (age: number) => age / 100 * .9

test('the two-minute story leaves time to follow the family after the narrator dies', () => {
  assert.equal(DEFAULT_DURATION, 114)
  const deathAt = atAge(person('self').end!) * DEFAULT_DURATION
  assert.ok(DEFAULT_DURATION - deathAt >= 30, 'at least thirty seconds follow the narrator’s death')
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

test('remembered people recede to the same subdued silver while living people retain a little warmth', () => {
  const before = personAppearance(person('mom'), atAge(60))
  const after = personAppearance(person('mom'), atAge(75))
  assert.equal(after.color, '#8d99a9')
  assert.equal(after.label, '#8d99a9')
  assert.ok(after.radius < before.radius && after.glowRadius < before.glowRadius)
  assert.ok(after.glowOpacity < before.glowOpacity)
  assert.equal(personAppearance(person('grandma'), 1).color, after.color)
  assert.equal(personAppearance(person('childhood-friend'), 1).distance, 0)
  assert.equal(personAppearance(person('child'), 1).distance, 0)
})

test('the younger generation overtakes the remembered sky and moves through the upper frame', () => {
  for (const id of ['child', 'child-partner', 'grandchild-1', 'grandchild-2']) {
    const p = person(id)
    const index = SAMPLE.indexOf(p)
    const early = starPosition(p, index, SAMPLE.length, .72, SAMPLE)
    const later = starPosition(p, index, SAMPLE.length, .9, SAMPLE)
    const end = starPosition(p, index, SAMPLE.length, 1, SAMPLE)
    assert.ok(early.y - later.y > 350)
    assert.ok(later.y > end.y)
    assert.ok(end.y < 0)
    assert.equal(end.visible, true)
    assert.equal(end.opacity, 1)
    const oldest = trailPath(p, index, SAMPLE.length, 1, SAMPLE).split(/[ML]/)[1].split(',').map(Number)
    assert.ok(oldest[1] >= 850, 'their ongoing trail must still span the sky after its head leaves')
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
  assert.deepEqual(restorePeople(null, old, () => .25), SAMPLE)
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


test('the age y-axis stays present throughout the story and ending, with a local five-year window', () => {
  for (const progress of [0, .1, .3, .6, .8, .9, .95, 1]) {
    const axis = ageAxis(progress)
    assert.equal(axis.opacity, 1)
    assert.equal(axis.age, storyAge(progress))
    assert.ok(axis.ticks.length >= 2 && axis.ticks.length <= 5)
    assert.ok(axis.ticks.every(tick => tick.age % 5 === 0))
    assert.ok(Math.max(...axis.ticks.map(tick => tick.age)) - Math.min(...axis.ticks.map(tick => tick.age)) <= 20)
  }
})

test('every moving family light is aligned with the current age on the y-axis', () => {
  for (const progress of [.05, .3, .6, .73, .8, .9, 1]) {
    const axis = ageAxis(progress)
    SAMPLE.forEach((p, index) => {
      if (p.exit !== 'fade' && storyAge(progress) >= p.start && (p.end === null || storyAge(progress) < p.end)) {
        assert.ok(Math.abs(starPosition(p, index, SAMPLE.length, progress, SAMPLE).y - axis.y) < 1e-7)
      }
    })
    axis.ticks.forEach(tick => assert.ok(Math.abs(tick.y - (axis.y + (axis.age - tick.age) * YEAR_SPACING)) < 1e-7))
  }
})

test('the short explanation returns inside the animation, including the closing reminder', () => {
  assert.equal(storyMessage(.1), null)
  assert.match(storyMessage(.20)!.lines[0], /stars/)
  assert.match(storyMessage(.30)!.lines[0], /while/)
  assert.equal(storyMessage(.95)!.title, 'Take care of each other.')
  assert.deepEqual(storyMessage(1)!.lines, ['While you still can.'])
  assert.equal(storyMessage(.95)!.opacity, 1)
})


test('friends accompany Me rather than the grandparents throughout their shared years', () => {
  for (const id of ['childhood-friend', 'college-friends']) {
    const friend = person(id)
    const index = SAMPLE.indexOf(friend)
    for (let age = friend.start + 1; age <= friend.end!; age += .5) {
      const progress = atAge(age)
      const position = starPosition(friend, index, SAMPLE.length, progress, SAMPLE)
      const self = starPosition(person('self'), SAMPLE.indexOf(person('self')), SAMPLE.length, progress, SAMPLE)
      assert.ok(Math.abs(position.x - self.x) < 95, `${id} should travel beside Me at age ${age}`)
      assert.ok(Math.abs(position.y - self.y) < 1e-7)
    }
  }
})


test('a first love parts ways, while the enduring partner becomes a spouse beside Me', () => {
  const first = person('first-love')
  assert.equal(personOpacity(first, atAge(18)), 1)
  assert.equal(personOpacity(first, atAge(25)), 0)
  for (const random of [() => .25, () => .75]) {
    const family = restorePeople(null, null, random)
    const partner = family.find(p => p.id === 'partner')!
    assert.equal(personName(partner, atAge(28)), random() < .5 ? 'Girlfriend' : 'Boyfriend')
    assert.equal(personName(partner, atAge(40)), random() < .5 ? 'Wife' : 'Husband')
    for (const age of [28, 35, 55, 75]) {
      const p = starPosition(partner, family.indexOf(partner), family.length, atAge(age), family)
      const me = starPosition(family.find(p => p.id === 'self')!, family.findIndex(p => p.id === 'self'), family.length, atAge(age), family)
      assert.ok(Math.abs(p.x - me.x) < 60)
    }
  }
})


test('the soundtrack clock holds the final reminder and loops without accumulating drift', () => {
  const duration = 119.96
  assert.equal(playbackFrame(0, duration).opacity, 0)
  assert.equal(playbackFrame(118, duration).progress, 1)
  assert.equal(playbackFrame(116, duration).opacity, 1)
  assert.deepEqual(playbackFrame(20 + duration, duration), playbackFrame(20, duration))
  const deathAt = 1.2 + atAge(person('self').end!) * (duration - 6.4)
  assert.ok(duration - deathAt > 35)
  assert.equal(storyAge(playbackFrame(deathAt, duration).progress), 78)
})
