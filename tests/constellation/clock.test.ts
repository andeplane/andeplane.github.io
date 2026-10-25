import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIRTH_SECOND, CAPTIONS, DEATH_SECOND, MOVIE_SECONDS, TEXT_BUDGET, playbackFrame, progressAtAge, storyAge, storyMessage } from '../../src/features/constellation/clock.ts'

test('two minutes includes one second per year and thirty seconds after death', () => {
  assert.equal(MOVIE_SECONDS, 120)
  assert.equal(storyAge(0), -2)
  assert.equal(storyAge(BIRTH_SECOND / 120), 0)
  assert.equal(storyAge(DEATH_SECOND / 120), 85)
  assert.equal(MOVIE_SECONDS - DEATH_SECOND, 30)
  for (let age = 0; age <= 85; age++) assert.ok(Math.abs(progressAtAge(age) * 120 - (age + 5)) < 1e-10)
  for (let age = -2; age <= 100; age++) assert.ok(Math.abs(storyAge(progressAtAge(age)) - age) < 1e-10)
})

test('the story never resets or fades to black after its ending', () => {
  for (const elapsed of [120, 180, 300, 3600]) assert.deepEqual(playbackFrame(elapsed), { progress: 1, opacity: 1 })
  assert.equal(storyAge(playbackFrame(1000).progress), 100)
})

test('the generic text is constrained to three cards and twenty words', () => {
  const words = CAPTIONS.flatMap(c => [c.title, ...c.lines]).join(' ').trim().split(/\s+/)
  assert.equal(CAPTIONS.length, TEXT_BUDGET.cards)
  assert.ok(words.length <= TEXT_BUDGET.words)
  assert.equal(words.length, 18)
  assert.equal(CAPTIONS[0].lines[0], 'Sometimes people die young.')
  assert.doesNotMatch(words.join(' '), /Mikael|my brother|dedicat/i)
  assert.equal(storyMessage(30 / 120), null)
  assert.equal(storyMessage(70 / 120), null)
  assert.equal(storyMessage(100 / 120), null)
  assert.equal(storyMessage(1)!.opacity, 1)
  assert.ok(CAPTIONS[1].from - CAPTIONS[0].to >= 30)
})
