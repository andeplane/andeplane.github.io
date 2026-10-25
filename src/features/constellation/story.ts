import { continuingYear, smooth, storyAge } from './clock.ts'
import { relationshipX } from './relationships.ts'
export { clamp, smooth, storyAge, playbackFrame, storyMessage, progressAtAge } from './clock.ts'
export const DEFAULT_DURATION = 120
export const YEAR_SPACING = 40
export const MAX_PEOPLE = 16
export interface Person {
  id: string
  name: string
  color: string
  start: number
  end: number | null
  exit?: 'star' | 'fade'
  lane?: number
  near?: string
  nameBefore?: string
  renameAt?: number
}
export const COLORS = ['#c9b9f6', '#bedddd', '#ff9c8e', '#90baff', '#f3b4d1', '#f7ce85', '#81e0e8', '#c1dea3', '#aabace', '#c4c3a4', '#a6d5bf', '#d8b9ed', '#f0bf9f', '#9dcad9', '#c4d5a5', '#d6b4bf']
export const SAMPLE: Person[] = [
  { id: 'grandma', name: 'Grandma', color: COLORS[0], start: -58, end: 17, lane: .12 },
  { id: 'grandpa', name: 'Grandpa', color: COLORS[1], start: -60, end: 27, lane: .32 },
  { id: 'mom', name: 'Mom', color: COLORS[2], start: -30, end: 66, lane: .22 },
  { id: 'dad', name: 'Dad', color: COLORS[3], start: -32, end: 55, lane: .78 },
  { id: 'partner', name: 'Wife', color: COLORS[4], start: 26, end: 88, lane: .60, near: 'self', nameBefore: 'Girlfriend', renameAt: 29 },
  { id: 'self', name: 'Me', color: COLORS[5], start: 0, end: 85, lane: .56 },
  { id: 'brother', name: 'Brother', color: COLORS[13], start: -2, end: 38, lane: .46, near: 'self' },
  { id: 'sister', name: 'Sister', color: COLORS[14], start: 8, end: null, lane: .75, near: 'self' },
  { id: 'child', name: 'Son', color: COLORS[6], start: 30, end: null, lane: .66, near: 'self' },
  { id: 'daughter', name: 'Daughter', color: COLORS[15], start: 32, end: null, lane: .90, near: 'partner' },
  { id: 'child-partner', name: 'His wife', color: COLORS[7], start: 56, end: null, lane: .82, near: 'child' },
  { id: 'grandchild-1', name: 'Granddaughter', color: COLORS[10], start: 62, end: null, lane: .74, near: 'child' },
  { id: 'grandchild-2', name: 'Grandson', color: COLORS[11], start: 68, end: null, lane: .94, near: 'child-partner' },
  { id: 'childhood-friend', name: 'Childhood friend', color: COLORS[8], start: 5, end: 28, exit: 'fade', lane: .38, near: 'self' },
  { id: 'first-love', name: 'First love', color: COLORS[12], start: 15, end: 21, exit: 'fade', lane: .62, near: 'self' },
  { id: 'college-friends', name: 'College friend', color: COLORS[9], start: 18, end: 34, exit: 'fade', lane: .68, near: 'self' },
]

export const presentY=(age:number)=>505-170*smooth((age-85)/7)
export function ageAxis(progress: number, afterEnding=0) {
  const age = continuingYear(progress,afterEnding)
  const y = presentY(age)
  const ticks = Array.from({ length: 7 }, (_, i) => Math.floor(age/5)*5+(i-3)*5)
    .map(value => ({ age: value, y: y + (age - value) * YEAR_SPACING }))
    .filter(tick => tick.y > 30 && tick.y < 770)
  return { age, y, ticks, opacity: 1 }
}
// Encounter dates are when lives meet, not when those people are born.
// Their existing paths enter from beyond the frame and continue after parting.
const ENCOUNTERS:Record<string,{lead:number;edge:number}>={
  'childhood-friend':{lead:4,edge:880},'first-love':{lead:4,edge:-80},
  'college-friends':{lead:4,edge:-80},partner:{lead:6,edge:880},
  'child-partner':{lead:5,edge:880},
}
const approachStart=(person:Person)=>person.start-(ENCOUNTERS[person.id]?.lead??0)
const trailStart=(person:Person)=>ENCOUNTERS[person.id]?approachStart(person)-8:person.start
const laneX = (p: Person, i: number, count: number) => 110 + (p.lane ?? i / Math.max(1, count - 1)) * 620
export function pathX(person: Person, index: number, count: number, age: number, people?: Person[]) {
  const known = people?.some(p => p.id === 'self') && SAMPLE.some(p => p.id === person.id)
  let x = known ? relationshipX(person.id, age)! : laneX(person, index, count)
  if (!known && person.near && people) {
    const anchorIndex = people.findIndex(p => p.id === person.near)
    if (anchorIndex >= 0) {
      const anchor = laneX(people[anchorIndex], anchorIndex, count)
      const lane = laneX(person, index, count)
      x = anchor + (lane - anchor) * smooth((age - person.start) / 7)
    }
  }
  const encounter=ENCOUNTERS[person.id]
  if(encounter&&age<person.start)x=encounter.edge+(x-encounter.edge)*smooth((age-approachStart(person))/encounter.lead)
  if(person.exit==='fade'&&person.end!==null) {
    const edge=encounter?.edge??(x<(relationshipX('self',age)??440)?-80:880)
    x+=(edge-x)*smooth((age-person.end)/3.5)
  }
  return x + Math.sin(age * .22 + index * 1.7) * 3
}
export function personName(person: Person, progress: number) {
  return person.nameBefore && person.renameAt !== undefined && storyAge(progress) < person.renameAt ? person.nameBefore : person.name
}
export function personOpacity(person: Person, progress: number) {
  const age = storyAge(progress)
  const from=approachStart(person)
  if (age < from) return 0
  const entering = from <= -2 ? 1 : smooth((age - from) / .8)
  return person.exit === 'fade' && person.end !== null ? entering * (1 - smooth((age - person.end - 2.6) / 1)) : entering
}
export function personLabelOpacity(person: Person, progress: number) {
  const age=storyAge(progress),since=age-(person.end??Infinity)
  let opacity=personOpacity(person,progress)
  if(ENCOUNTERS[person.id])opacity*=smooth((age-person.start+.4)/1.2)
  if(person.end!==null&&since>=0) {
    opacity*=person.exit==='fade'?1-smooth(since/.65):person.id==='brother'?(1-smooth((since-1.2)/.6))+smooth((since-5.8)/.6):(1-smooth(since/.65))+smooth((since-3.4)/.6)
  }
  if(person.id!=='brother') opacity*=1-smooth((progress*120-94)/4)
  return opacity
}
function mixColor(from: string, to: string, amount: number) {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16)
  return '#' + [1, 3, 5].map(offset => Math.round(channel(from, offset) * (1 - amount) + channel(to, offset) * amount).toString(16).padStart(2, '0')).join('')
}
export function brotherMoment(progress:number) {
  const age=storyAge(progress)
  return smooth((age-37.6)/.4)*(1-smooth((age-40.5)/1.5))
}
export const attentionOpacity=(person:Person,progress:number)=>person.id==='brother'?1:1-.72*brotherMoment(progress)
export function personAppearance(person: Person, progress: number) {
  const distance = person.end !== null && person.exit !== 'fade' ? smooth((storyAge(progress) - person.end) / 4) : 0
  const quietColor = person.color
  const focus=person.id==='brother'?brotherMoment(progress):0
  const birthAge=storyAge(progress)-person.start
  const birth=person.id==='self'&&birthAge>=0&&birthAge<1.8?Math.sin(Math.PI*birthAge/1.8):0
  return { distance, birth, color: mixColor(quietColor, '#8d99a9', distance), label: mixColor(mixColor(person.color,'#ffffff',.14), '#8d99a9', distance), core: mixColor(mixColor(person.color,'#ffffff',.75), '#a5b0bf', distance), radius: 3.3 - distance * 1.5 + birth * 2.5, glowRadius: 30 - distance * 16 + birth * 45 + focus*12, glowOpacity: .4 - distance * .32 + birth * .25 + focus*.15 }
}
export interface StoryPoint { x: number; y: number; year: number; elevation?: number }
export function starPosition(person: Person, index: number, count: number, progress: number, people?: Person[], afterEnding=0) {
  const age = continuingYear(progress,afterEnding)
  const year = person.exit==='fade'?age:Math.min(age, person.end ?? age)
  const settle = person.end !== null && person.exit !== 'fade' ? smooth((age - person.end - (person.id==='brother'?1.8:0)) / 4) : 0
  const y = person.exit === 'fade' ? presentY(age) + (age - year) * YEAR_SPACING : person.end!==null&&age>=person.end ? person.end>=85?presentY(person.end):505-(225+(85-year)*2)*settle : presentY(age)
  const opacity=personOpacity(person,progress)*(person.end===null?1-smooth((age-person.start-90)/30):1)
  return { x: pathX(person, index, count, year, people), y, year, visible: opacity > 0, opacity }
}
export function trailPoints(person: Person, index: number, count: number, progress: number, people?: Person[], afterEnding=0) {
  if (personOpacity(person, progress) === 0) return []
  const head = starPosition(person, index, count, progress, people,afterEnding)
  const points: StoryPoint[] = []
  for (let year = Math.max(trailStart(person),head.year-110); year < head.year; year += .5) points.push({ x: pathX(person, index, count, year, people), y: head.y + (head.year - year) * YEAR_SPACING, year })
  points.push(head)
  return points
}
export function trailPath(person: Person, index: number, count: number, progress: number, people?: Person[], verticalScale = 1) {
  const points = trailPoints(person, index, count, progress, people)
  return points.length ? 'M' + points.map(p => `${p.x},${p.y * verticalScale}`).join(' L') : ''
}

export function readPeople(value: unknown): Person[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PEOPLE) return null
  const ids = new Set<string>()
  for (const p of value) {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 24 || !COLORS.includes(p.color) || !Number.isFinite(p.start) || p.start < -100 || p.start > 99 || (p.end !== null && (!Number.isFinite(p.end) || p.end <= p.start || p.end > 100)) || (p.exit !== undefined && p.exit !== 'star' && p.exit !== 'fade') || (p.lane !== undefined && (!Number.isFinite(p.lane) || p.lane < 0 || p.lane > 1)) || (p.near !== undefined && typeof p.near !== 'string') || (p.nameBefore !== undefined && (typeof p.nameBefore !== 'string' || !p.nameBefore.trim() || p.nameBefore.length > 24 || !Number.isFinite(p.renameAt) || p.renameAt < p.start || p.renameAt > (p.end ?? 100))) || (p.renameAt !== undefined && p.nameBefore === undefined)) return null
    ids.add(p.id)
  }
  return value as Person[]
}

const LAST_SAMPLE=SAMPLE.map(p=>p.id==='partner'?{...p,renameAt:31}:p.id==='child'?{...p,start:32}:p.id==='daughter'?{...p,start:35}:p.id==='college-friends'?{...p,end:35}:p)
const LAST_HUSBAND_SAMPLE=LAST_SAMPLE.map(p=>p.id==='partner'?{...p,name:'Husband',nameBefore:'Boyfriend'}:p)

const PREVIOUS_SAMPLE: Person[] = [
  { id: 'grandma', name: 'Grandma', color: COLORS[0], start: 0, end: 17, lane: .12 },
  { id: 'grandpa', name: 'Grandpa', color: COLORS[1], start: 0, end: 27, lane: .32 },
  { id: 'mom', name: 'Mom', color: COLORS[2], start: 0, end: 66, lane: .22 },
  { id: 'dad', name: 'Dad', color: COLORS[3], start: 0, end: 55, lane: .78 },
  { id: 'partner', name: 'Wife', color: COLORS[4], start: 26, end: 82, lane: .50, near: 'self', nameBefore: 'Girlfriend', renameAt: 32 },
  { id: 'self', name: 'Me', color: COLORS[5], start: 0, end: 78, lane: .56 },
  { id: 'child', name: 'Son', color: COLORS[6], start: 32, end: null, lane: .66, near: 'self' },
  { id: 'child-partner', name: 'His wife', color: COLORS[7], start: 56, end: null, lane: .82, near: 'child' },
  { id: 'grandchild-1', name: 'Granddaughter', color: COLORS[10], start: 62, end: null, lane: .74, near: 'child' },
  { id: 'grandchild-2', name: 'Grandson', color: COLORS[11], start: 68, end: null, lane: .94, near: 'child-partner' },
  { id: 'childhood-friend', name: 'Childhood friend', color: COLORS[8], start: 5, end: 28, exit: 'fade', lane: .38, near: 'self' },
  { id: 'first-love', name: 'First love', color: COLORS[12], start: 15, end: 21, exit: 'fade', lane: .62, near: 'self' },
  { id: 'college-friends', name: 'College friend', color: COLORS[9], start: 18, end: 35, exit: 'fade', lane: .68, near: 'self' },
]

function matches(value: Person[], expected: Person[]) {
  return value.length === expected.length && value.every((p, i) => Object.keys(p).length === Object.keys(expected[i]).length && Object.entries(expected[i]).every(([key, item]) => p[key as keyof Person] === item))
}
export function restorePeople(saved: unknown, legacy: unknown, random = Math.random): Person[] {
  const current = readPeople(saved)
  const oldTwelve = PREVIOUS_SAMPLE.filter(p => p.id !== 'first-love').map(p => {
    const { nameBefore: _before, renameAt: _at, ...old } = p
    return p.id === 'partner' ? { ...old, lane: .43 } : p.id === 'college-friends' ? { ...old, name: 'College friends' } : old
  })
  const oldHusband = PREVIOUS_SAMPLE.map(p => p.id === 'partner' ? { ...p, name: 'Husband', nameBefore: 'Boyfriend' } : p)
  if (current && ![PREVIOUS_SAMPLE, oldHusband, oldTwelve, LAST_SAMPLE, LAST_HUSBAND_SAMPLE].some(expected => matches(current, expected))) return current
  const previous = readPeople(legacy)
  const names = ['Grandma','Grandpa','Mom','Dad','My love','Me','Our child']
  const ends = [19,28,66,54,null,null,null]
  const starts = [0,0,0,0,25,0,32]
  if (previous && !(previous.length === 7 && previous.every((p, i) => p.name === names[i] && p.start === starts[i] && p.end === ends[i]))) return previous
  const husband = random() >= .5
  return SAMPLE.map(p => p.id === 'partner' && husband ? { ...p, name: 'Husband', nameBefore: 'Boyfriend' } : { ...p })
}
