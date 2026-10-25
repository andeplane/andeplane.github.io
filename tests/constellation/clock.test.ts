import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIRTH_SECOND, CAPTIONS, DEDICATION_TEXT, DEATH_SECOND, MOVIE_SECONDS, TEXT_BUDGET, playbackFrame, progressAtAge, storyAge, storyMessage } from '../../src/features/constellation/clock.ts'

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
  assert.equal(storyAge(playbackFrame(1000).progress),211.25)
})

test('the generic text is constrained to six brief cards and thirty words', () => {
  const words = CAPTIONS.flatMap(c => [c.title, ...c.lines]).join(' ').trim().split(/\s+/)
  assert.equal(CAPTIONS.length, TEXT_BUDGET.cards)
  assert.ok(words.length <= TEXT_BUDGET.words)
  assert.equal(words.length, 30)
  assert.equal(CAPTIONS[4].lines[0], 'Sometimes people die young.')
  assert.equal(storyMessage(7/120)!.lines[0], 'Then you arrive.')
  assert.doesNotMatch(words.join(' '), /Mikael|my brother|dedicat/i)
  assert.equal(storyMessage(30 / 120), null)
  assert.equal(storyMessage(70 / 120), null)
  assert.equal(storyMessage(100 / 120), null)
  assert.equal(storyMessage(1)!.opacity, 1)
  assert.ok(CAPTIONS[2].from - CAPTIONS[1].to >= 19)
})


test('the requested dedication is the final message while the future keeps moving',()=>{
  assert.equal(DEDICATION_TEXT,'To my brother, Mikael. I miss you every day.')
  assert.deepEqual(storyMessage(1,12)!.lines,['To my brother, Mikael.','I miss you every day.'])
  assert.equal(storyMessage(1,300)!.opacity,1)
})

test('opening fades in after loading; love and parenthood get distinct short beats',()=>{
 assert.equal(storyMessage(0),null)
 assert.equal(storyMessage(.6/120)!.opacity,0)
 assert.ok(storyMessage(1.2/120)!.opacity>0&&storyMessage(1.2/120)!.opacity<1)
 assert.equal(storyMessage(2/120)!.lines[0],'Life is already moving.')
 assert.equal(storyMessage(32/120)!.lines[0],'Some paths become home.')
 assert.equal(storyMessage(38/120)!.lines[0],'And your world grows.')
 assert.equal(storyMessage(42.75/120),null)
})
