export const MOVIE_SECONDS = 120
export const BIRTH_SECOND = 5
export const DEATH_SECOND = 90
export const NARRATOR_END_AGE = 85
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
export const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }

// Five seconds before birth, one second per year through 85, then thirty
// seconds to look beyond that life. The ending is a destination, not a loop.
export const FUTURE_ACCELERATION_SECOND=104 // year 92, after the life ends
function yearAtSeconds(seconds:number) {
  if(seconds<BIRTH_SECOND)return -2+seconds*2/BIRTH_SECOND
  if(seconds<=DEATH_SECOND)return seconds-BIRTH_SECOND
  if(seconds<=FUTURE_ACCELERATION_SECOND)return 85+(seconds-DEATH_SECOND)/2
  const t=seconds-FUTURE_ACCELERATION_SECOND
  // Ease from half a year/second to six. The next century passes in ~20s.
  return 92+.5*t+5.5*(t-4*(1-Math.exp(-t/4)))
}
export function storyAge(progress:number){return yearAtSeconds(clamp(progress)*MOVIE_SECONDS)}
export function progressAtAge(age:number) {
  if(age<=85)return clamp((age<0?(age+2)*BIRTH_SECOND/2:BIRTH_SECOND+age)/MOVIE_SECONDS)
  let low=DEATH_SECOND,high=MOVIE_SECONDS
  for(let i=0;i<48;i++){const mid=(low+high)/2;if(yearAtSeconds(mid)<age)low=mid;else high=mid}
  return (low+high)/2/MOVIE_SECONDS
}
export function playbackFrame(elapsed: number, duration = MOVIE_SECONDS) {
  return { progress: clamp(elapsed / duration), opacity: smooth(elapsed / 1.2) }
}

// Six brief beats, thirty words total. The personal dedication is separate.
export const TEXT_BUDGET = { cards: 6, words: 30 } as const
export const CAPTIONS = [
  { from: .6, to: 4.5, title: '', lines: ['Life is already moving.'] },
  { from: 5, to: 10, title: '', lines: ['Then you arrive.'] },
  { from: 31, to: 35, title: '', lines: ['Some paths become home.'] },
  { from: 35.75, to: 40.5, title: '', lines: ['And your world grows.'] },
  { from: 43, to: 49, title: '', lines: ['Sometimes people die young.'] },
  { from: 108, to: 117, title: 'Take care of the people around you.', lines: ['While you still can.'] },
]
export const DEDICATION_TEXT='And to my brother, Mikael: I miss you every day.'
export function storyMessage(progress: number, afterEnding=0) {
  const seconds = clamp(progress) * MOVIE_SECONDS + Math.max(0,afterEnding)
  if(seconds>=118)return {from:118,to:Infinity,title:'',lines:[DEDICATION_TEXT],kind:'dedication',opacity:smooth((seconds-118)/2)}
  const message = CAPTIONS.find(item => seconds >= item.from && seconds < item.to)
  if (!message) return null
  const opacity = smooth((seconds - message.from) / 1.2) * (Number.isFinite(message.to) ? 1 - smooth((seconds - message.to + 1.2) / 1.2) : 1)
  return { ...message, opacity }
}

// Animation time keeps advancing after the instrumental, with no camera follow
// and no replay of the viewer's life.
export function continuingYear(progress:number,afterEnding=0) {
  return yearAtSeconds(clamp(progress)*MOVIE_SECONDS+Math.max(0,afterEnding))
}
