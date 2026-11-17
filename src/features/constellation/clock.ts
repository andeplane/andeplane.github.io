export const MOVIE_SECONDS = 120
export const BIRTH_SECOND = 5
export const DEATH_SECOND = 90
export const NARRATOR_END_AGE = 85
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
export const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }

// Five seconds before birth, one second per year through 85, then thirty
// seconds to look beyond that life. The ending is a destination, not a loop.
export const FUTURE_ACCELERATION_SECOND=DEATH_SECOND
export const FUTURE_RAMP_SECONDS=5
export const FUTURE_YEARS_PER_SECOND=4.5
function yearAtSeconds(seconds:number) {
  if(seconds<BIRTH_SECOND)return -2+seconds*2/BIRTH_SECOND
  if(seconds<=DEATH_SECOND)return seconds-BIRTH_SECOND
  const t=seconds-DEATH_SECOND,u=Math.min(1,t/FUTURE_RAMP_SECONDS)
  // Integrating a smooth speed curve avoids a sudden change of pace at death.
  const rampDistance=FUTURE_RAMP_SECONDS*(u+(FUTURE_YEARS_PER_SECOND-1)*(u**3-u**4/2))
  return 85+rampDistance+Math.max(0,t-FUTURE_RAMP_SECONDS)*FUTURE_YEARS_PER_SECOND
}
export function storyAge(progress:number){return yearAtSeconds(clamp(progress)*MOVIE_SECONDS)}
export function elapsedAtYear(age:number) {
  if(age<=85)return Math.max(0,age<0?(age+2)*BIRTH_SECOND/2:BIRTH_SECOND+age)
  let low=DEATH_SECOND,high=Math.max(MOVIE_SECONDS,MOVIE_SECONDS+(age-100)/.5)
  for(let i=0;i<48;i++){const mid=(low+high)/2;if(yearAtSeconds(mid)<age)low=mid;else high=mid}
  return (low+high)/2
}
export function frameAtYear(age:number) {
  const seconds=elapsedAtYear(age)
  return {progress:clamp(seconds/MOVIE_SECONDS),afterEnding:Math.max(0,seconds-MOVIE_SECONDS)}
}
export function progressAtAge(age:number) {
  return clamp(elapsedAtYear(age)/MOVIE_SECONDS)
}
export function playbackFrame(elapsed: number, duration = MOVIE_SECONDS) {
  return { progress: clamp(elapsed / duration), opacity: smooth(elapsed / 1.2) }
}

// Seven brief beats, thirty-seven words total. The personal dedication is separate.
export const TEXT_BUDGET = { cards: 7, words: 37 } as const
export const CAPTIONS = [
  { from: .6, to: 5, title: '', lines: ['Life is already moving.'] },
  { from: 5, to: 12, title: '', lines: ['Then you arrive.'] },
  { from: 31, to: 36, title: '', lines: ['Some paths become home.'] },
  { from: 36, to: 42.5, title: '', lines: ['And your world grows.'] },
  { from: 43, to: 51, title: '', lines: ['Sometimes people die young.'] },
  { from: 67, to: 76, title: '', lines: ['Make time for your children, and theirs.'] },
  { from: 108, to: 117, title: 'Take care of the people around you.', lines: ['While you still can.'] },
]
export const DEDICATION_LINES=['To my brother, Mikael.','I miss you every day.']
export const DEDICATION_TEXT=DEDICATION_LINES.join(' ')
export function storyMessage(progress: number, afterEnding=0) {
  const seconds = clamp(progress) * MOVIE_SECONDS + Math.max(0,afterEnding)
  if(seconds>=118)return {from:118,to:Infinity,title:'',lines:DEDICATION_LINES,kind:'dedication',opacity:smooth((seconds-118)/2)}
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
