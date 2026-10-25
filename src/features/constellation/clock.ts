export const MOVIE_SECONDS = 120
export const BIRTH_SECOND = 5
export const DEATH_SECOND = 90
export const NARRATOR_END_AGE = 85
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
export const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }

// Five seconds before birth, one second per year through 85, then thirty
// seconds to look beyond that life. The ending is a destination, not a loop.
export function storyAge(progress: number) {
  const seconds = clamp(progress) * MOVIE_SECONDS
  if (seconds < BIRTH_SECOND) return -2 + seconds * 2 / BIRTH_SECOND
  if (seconds <= DEATH_SECOND) return seconds - BIRTH_SECOND
  return NARRATOR_END_AGE + (seconds - DEATH_SECOND) / 2
}
export function progressAtAge(age: number) {
  return clamp((age < 0 ? (age + 2) * BIRTH_SECOND / 2 : age <= 85 ? BIRTH_SECOND + age : DEATH_SECOND + (age - 85) * 2) / MOVIE_SECONDS)
}
export function playbackFrame(elapsed: number, duration = MOVIE_SECONDS) {
  return { progress: clamp(elapsed / duration), opacity: smooth(elapsed / 1.2) }
}

// Strict editorial budget: three appearances, at most twenty words total. Names,
// numbers on the age axis, and the temporary sound hint are functional labels.
export const TEXT_BUDGET = { cards: 3, words: 20 } as const
export const CAPTIONS = [
  { from: 5, to: 11, title: '', lines: ['Life was moving. You arrived.'] },
  { from: 43, to: 49, title: '', lines: ['Sometimes people die young.'] },
  { from: 112, to: 128, title: 'Take care of the people around you.', lines: ['While you still can.'] },
]
export const DEDICATION_TEXT='And to my brother, Mikael: I miss you every day.'
export function storyMessage(progress: number, afterEnding=0) {
  const seconds = clamp(progress) * MOVIE_SECONDS + Math.max(0,afterEnding)
  if(seconds>=129)return {from:129,to:Infinity,title:'',lines:[DEDICATION_TEXT],kind:'dedication',opacity:smooth((seconds-129)/2)}
  const message = CAPTIONS.find(item => seconds >= item.from && seconds < item.to)
  if (!message) return null
  const opacity = smooth((seconds - message.from) / 1.2) * (Number.isFinite(message.to) ? 1 - smooth((seconds - message.to + 1.2) / 1.2) : 1)
  return { ...message, opacity }
}
