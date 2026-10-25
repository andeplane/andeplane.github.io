import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAPTERS, SAMPLE, chapterAt, readPeople, starPosition, storyAge, trailPath } from '../../src/features/constellation/story.ts'

test('chapters have deterministic boundaries and the last chapter leaves time for the reveal', () => {
  CHAPTERS.forEach((chapter, index) => assert.equal(chapterAt(chapter.at), index))
  assert.equal(chapterAt(0.899), 4)
  assert.equal(chapterAt(1), 5)
  assert.equal(storyAge(0.9), 80)
})

test('a child appears only on entering the story and an ended star climbs above the present', () => {
  assert.equal(starPosition(SAMPLE[6], 6, 7, 0.3).visible, false)
  assert.equal(starPosition(SAMPLE[6], 6, 7, 0.42).visible, true)
  assert.ok(starPosition(SAMPLE[0], 0, 7, 0.7).y < starPosition(SAMPLE[5], 5, 7, 0.7).y)
})

test('every trail meets its own star until the constellation transition', () => {
  for (const progress of [0, 0.15, 0.42, 0.7, 0.9]) {
    SAMPLE.forEach((person, index) => {
      const star = starPosition(person, index, SAMPLE.length, progress)
      const path = trailPath(person, index, SAMPLE.length, progress)
      if (!star.visible) assert.equal(path, '')
      else {
        const [x, y] = path.split(/[ML]/).at(-1)!.trim().split(',').map(Number)
        assert.ok(Math.abs(x - star.x) < 1e-7)
        assert.ok(Math.abs(y - star.y) < 1e-7)
      }
    })
  }
})

test('saved data rejects duplicate identifiers, invalid ages, names, colors and oversized skies', () => {
  assert.deepEqual(readPeople(SAMPLE), SAMPLE)
  for (const invalid of [null, [], [...SAMPLE, SAMPLE[0]], Array(9).fill(SAMPLE[0]), [{ ...SAMPLE[0], start: NaN }], [{ ...SAMPLE[0], end: 0 }], [{ ...SAMPLE[0], name: ' ' }], [{ ...SAMPLE[0], color: 'red' }], [{ ...SAMPLE[0], end: 81 }]]) assert.equal(readPeople(invalid), null)
})

test('one-person and eight-person skies stay finite through the reveal', () => {
  for (const count of [1, 8]) for (const progress of [0, 0.94, 1]) {
    for (let i = 0; i < count; i++) {
      const position = starPosition(SAMPLE[5], i, count, progress)
      assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y))
      assert.ok(position.x > 30 && position.x < 770)
    }
  }
})
