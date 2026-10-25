import { smooth, storyAge } from './clock.ts'
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
  { id: 'partner', name: 'Wife', color: COLORS[4], start: 26, end: 88, lane: .60, near: 'self', nameBefore: 'Girlfriend', renameAt: 31 },
  { id: 'self', name: 'Me', color: COLORS[5], start: 0, end: 85, lane: .56 },
  { id: 'brother', name: 'Brother', color: COLORS[13], start: -2, end: 38, lane: .46, near: 'self' },
  { id: 'sister', name: 'Sister', color: COLORS[14], start: 8, end: null, lane: .75, near: 'self' },
  { id: 'child', name: 'Son', color: COLORS[6], start: 32, end: null, lane: .66, near: 'self' },
  { id: 'daughter', name: 'Daughter', color: COLORS[15], start: 35, end: null, lane: .90, near: 'partner' },
  { id: 'child-partner', name: 'His wife', color: COLORS[7], start: 56, end: null, lane: .82, near: 'child' },
  { id: 'grandchild-1', name: 'Granddaughter', color: COLORS[10], start: 62, end: null, lane: .74, near: 'child' },
  { id: 'grandchild-2', name: 'Grandson', color: COLORS[11], start: 68, end: null, lane: .94, near: 'child-partner' },
  { id: 'childhood-friend', name: 'Childhood friend', color: COLORS[8], start: 5, end: 28, exit: 'fade', lane: .38, near: 'self' },
  { id: 'first-love', name: 'First love', color: COLORS[12], start: 15, end: 21, exit: 'fade', lane: .62, near: 'self' },
  { id: 'college-friends', name: 'College friend', color: COLORS[9], start: 18, end: 35, exit: 'fade', lane: .68, near: 'self' },
]

export function ageAxis(progress: number) {
  const age = storyAge(progress)
  const y = 505
  const ticks = Array.from({ length: 26 }, (_, i) => i * 5 - 5)
    .map(value => ({ age: value, y: y + (age - value) * YEAR_SPACING }))
    .filter(tick => tick.y > 30 && tick.y < 770)
  return { age, y, ticks, opacity: 1 }
}
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
  if (person.exit === 'fade' && person.end !== null) {
    const anchor = relationshipX('self', age) ?? 440
    x += ((x < anchor ? 30 : 810) - x) * smooth((age - person.end) / 3)
  }
  return x + Math.sin(age * .22 + index * 1.7) * 3
}
export function personName(person: Person, progress: number) {
  return person.nameBefore && person.renameAt !== undefined && storyAge(progress) < person.renameAt ? person.nameBefore : person.name
}
export function personOpacity(person: Person, progress: number) {
  const age = storyAge(progress)
  if (age < person.start) return 0
  const entering = person.start <= -2 ? 1 : smooth((age - person.start) / 1.2)
  return person.exit === 'fade' && person.end !== null ? entering * (1 - smooth((age - person.end) / 3)) : entering
}
export function personLabelOpacity(person: Person, progress: number) {
  const age=storyAge(progress),since=age-(person.end??Infinity)
  let opacity=personOpacity(person,progress)
  if(person.end!==null&&since>=0) {
    opacity*=person.exit==='fade'?1-smooth(since/.65):(1-smooth(since/.65))+smooth((since-3.4)/.6)
  }
  if(person.id!=='brother') opacity*=1-smooth((progress*120-94)/4)
  return opacity
}
function mixColor(from: string, to: string, amount: number) {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16)
  return '#' + [1, 3, 5].map(offset => Math.round(channel(from, offset) * (1 - amount) + channel(to, offset) * amount).toString(16).padStart(2, '0')).join('')
}
export function personAppearance(person: Person, progress: number) {
  const distance = person.end !== null && person.exit !== 'fade' ? smooth((storyAge(progress) - person.end) / 4) : 0
  const quietColor = person.color
  const birthAge=storyAge(progress)-person.start
  const birth=person.id==='self'&&birthAge>=0&&birthAge<1.8?Math.sin(Math.PI*birthAge/1.8):0
  return { distance, birth, color: mixColor(quietColor, '#8d99a9', distance), label: mixColor(mixColor(person.color,'#ffffff',.14), '#8d99a9', distance), core: mixColor(mixColor(person.color,'#ffffff',.75), '#a5b0bf', distance), radius: 3.3 - distance * 1.5 + birth * 2.5, glowRadius: 30 - distance * 16 + birth * 45, glowOpacity: .4 - distance * .32 + birth * .25 }
}
export interface StoryPoint { x: number; y: number; year: number }
export function starPosition(person: Person, index: number, count: number, progress: number, people?: Person[]) {
  const age = storyAge(progress)
  const year = Math.min(age, person.end ?? age)
  const settle = person.end !== null && person.exit !== 'fade' ? smooth((age - person.end) / 4) : 0
  const y = person.exit === 'fade' ? 505 + (age - year) * YEAR_SPACING : 505 - (225 + (85 - year) * 2) * settle
  return { x: pathX(person, index, count, year, people), y, year, visible: personOpacity(person, progress) > 0, opacity: personOpacity(person, progress) }
}
export function trailPoints(person: Person, index: number, count: number, progress: number, people?: Person[]) {
  if (personOpacity(person, progress) === 0) return []
  const head = starPosition(person, index, count, progress, people)
  const points: StoryPoint[] = []
  for (let year = Math.max(-2, person.start); year < head.year; year += .5) points.push({ x: pathX(person, index, count, year, people), y: head.y + (head.year - year) * YEAR_SPACING, year })
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
  if (current && ![PREVIOUS_SAMPLE, oldHusband, oldTwelve].some(expected => matches(current, expected))) return current
  const previous = readPeople(legacy)
  const names = ['Grandma','Grandpa','Mom','Dad','My love','Me','Our child']
  const ends = [19,28,66,54,null,null,null]
  const starts = [0,0,0,0,25,0,32]
  if (previous && !(previous.length === 7 && previous.every((p, i) => p.name === names[i] && p.start === starts[i] && p.end === ends[i]))) return previous
  const husband = random() >= .5
  return SAMPLE.map(p => p.id === 'partner' && husband ? { ...p, name: 'Husband', nameBefore: 'Boyfriend' } : { ...p })
}
