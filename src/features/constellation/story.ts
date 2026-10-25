export interface Person {
  id: string
  name: string
  color: string
  start: number
  end: number | null
  exit?: 'star' | 'fade'
  lane?: number
  near?: string
}

export const DEFAULT_DURATION = 48
export const MAX_PEOPLE = 16
export const COLORS = ['#c9b9f6', '#bedddd', '#ff9c8e', '#90baff', '#f3b4d1', '#f7ce85', '#81e0e8', '#c1dea3', '#aabace', '#c4c3a4', '#a6d5bf', '#d8b9ed', '#f0bf9f', '#9dcad9', '#c4d5a5', '#d6b4bf']
export const SAMPLE: Person[] = [
  { id: 'grandma', name: 'Grandma', color: COLORS[0], start: 0, end: 17, lane: .12 },
  { id: 'grandpa', name: 'Grandpa', color: COLORS[1], start: 0, end: 27, lane: .32 },
  { id: 'mom', name: 'Mom', color: COLORS[2], start: 0, end: 66, lane: .22 },
  { id: 'dad', name: 'Dad', color: COLORS[3], start: 0, end: 55, lane: .78 },
  { id: 'partner', name: 'Wife', color: COLORS[4], start: 26, end: 82, lane: .43, near: 'self' },
  { id: 'self', name: 'Me', color: COLORS[5], start: 0, end: 78, lane: .56 },
  { id: 'child', name: 'Son', color: COLORS[6], start: 32, end: null, lane: .66, near: 'self' },
  { id: 'child-partner', name: 'His wife', color: COLORS[7], start: 56, end: null, lane: .82, near: 'child' },
  { id: 'grandchild-1', name: 'Granddaughter', color: COLORS[10], start: 62, end: null, lane: .74, near: 'child' },
  { id: 'grandchild-2', name: 'Grandson', color: COLORS[11], start: 68, end: null, lane: .94, near: 'child-partner' },
  { id: 'childhood-friend', name: 'Childhood friend', color: COLORS[8], start: 5, end: 28, exit: 'fade', lane: .38, near: 'self' },
  { id: 'college-friends', name: 'College friends', color: COLORS[9], start: 18, end: 35, exit: 'fade', lane: .68, near: 'self' },
]

export const CHAPTERS = [
  { at: 0, label: 'Before us', title: 'We begin in someone else’s light.', text: 'A small world. Familiar voices. The people who are there before our story begins.' },
  { at: .055, label: 'Childhood', title: 'Then the world gets a little bigger.', text: 'A childhood friend finds our path. For years, it feels as though we will always walk together.' },
  { at: .17, label: 'A wider world', title: 'Some people belong to a chapter.', text: 'College friends. Shared rooms. Entire little worlds. Some paths stay close; some gently drift away.' },
  { at: .24, label: 'Love', title: 'And one person becomes home.', text: 'Among all the paths we cross, one begins to run beside our own.' },
  { at: .30, label: 'A new life', title: 'Suddenly, we are someone’s whole sky.', text: 'A son arrives. Our story makes room for a life that will become its own.' },
  { at: .55, label: 'New branches', title: 'Their world begins to grow, too.', text: 'He finds his person. Then come the grandchildren. More hands to hold. More stories beginning.' },
  { at: .70, label: 'Our stars', title: 'One day, we become their stars.', text: 'Our own trails grow quiet. The love we passed along keeps moving.' },
  { at: .90, label: 'Life goes on', title: 'And their story goes on.', text: 'Children. Their partners. Their children. We are part of their sky, while they keep finding their way.' },
]

export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
export const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }
export const storyAge = (progress: number) => clamp(progress / .9) * 100
export const chapterAt = (progress: number) => CHAPTERS.reduce((index, chapter, i) => progress >= chapter.at ? i : index, 0)
const laneX = (person: Person, index: number, count: number) => 45 + (person.lane ?? (.06 + index * .88 / Math.max(1, count - 1))) * 710

function pathX(person: Person, index: number, count: number, age: number, people?: Person[]) {
  const lane = laneX(person, index, count)
  const anchorIndex = people?.findIndex(p => p.id === person.near) ?? -1
  const anchor = anchorIndex >= 0 && people ? laneX(people[anchorIndex], anchorIndex, count) : lane
  const entry = person.exit === 'fade' ? (index % 2 ? 810 : -10) : person.near ? anchor : lane
  let x = entry + (lane - entry) * smooth((age - person.start) / 7)
  if (person.exit === 'fade' && person.end !== null) {
    x += ((index % 2 ? 810 : -10) - x) * smooth((age - person.end + 5) / 7)
  }
  return x + Math.sin(age * .2 + index * 2) * 8
}

export function personOpacity(person: Person, progress: number) {
  const age = storyAge(progress)
  const entering = smooth((age - person.start) / 1.5)
  if (age < person.start) return 0
  if (person.exit === 'fade' && person.end !== null) return entering * (1 - smooth((age - person.end) / 3))
  return person.start === 0 ? 1 : entering
}

function mixColor(from: string, to: string, amount: number) {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16)
  return '#' + [1, 3, 5].map(offset => Math.round(channel(from, offset) * (1 - amount) + channel(to, offset) * amount).toString(16).padStart(2, '0')).join('')
}

export function personAppearance(person: Person, progress: number) {
  const distance = person.end !== null && person.exit !== 'fade' ? smooth((storyAge(progress) - person.end) / 4) : 0
  const quietColor = mixColor(person.color, '#b4c0cc', .48)
  return {
    distance,
    color: mixColor(quietColor, '#8d99a9', distance),
    label: mixColor(mixColor('#bac3cd', quietColor, .08), '#8d99a9', distance),
    core: mixColor('#e7edf1', '#a5b0bf', distance),
    radius: 3.3 - distance * 1.5,
    glowRadius: 32 - distance * 16,
    glowOpacity: .28 - distance * .20,
  }
}

export function starPosition(person: Person, index: number, count: number, progress: number, people?: Person[]) {
  const age = storyAge(progress)
  const end = Math.min(age, person.end ?? 100)
  let x = pathX(person, index, count, end, people)
  let y = 505
  const blend = smooth((progress - .9) / .1)
  const remembered = people?.filter(p => p.exit !== 'fade' && p.end !== null) ?? []
  const rank = remembered.findIndex(p => p.id === person.id)
  const memorialPoints = [[105, 180], [405, 130], [90, 355], [430, 340], [205, 470], [350, 560]]
  const angle = -Math.PI / 2 + (rank >= 0 ? rank : index) / Math.max(1, remembered.length || count) * Math.PI * 2
  const final = remembered.length === 6 ? memorialPoints[Math.max(0, rank)] : [260 + Math.cos(angle) * 185, 335 + Math.sin(angle) * 210]
  const continuing = person.end === null
  const living = people?.filter(p => p.end === null) ?? []
  const livingRank = Math.max(0, living.findIndex(p => p.id === person.id))
  const finalX = continuing ? (remembered.length ? 545 : 90) + livingRank * ((remembered.length ? 195 : 620) / Math.max(1, living.length - 1)) : final[0]
  // Younger lives travel well beyond the remembered generation, through the
  // upper edge of the frame, instead of stopping as another set of stars.
  const finalY = continuing ? -85 - (livingRank % 4) * 55 : final[1]
  if (person.end !== null && person.exit !== 'fade') {
    const settle = smooth((age - person.end) / 5)
    x += (finalX - x) * settle
    y += (finalY - y) * settle
  }
  const morph = person.exit === 'fade' ? 0 : continuing ? smooth((progress - .72) / .28) : blend
  return { x: x + (finalX - x) * morph, y: y + (finalY - y) * morph, visible: personOpacity(person, progress) > 0, opacity: personOpacity(person, progress) }
}

export function trailPath(person: Person, index: number, count: number, progress: number, people?: Person[], verticalScale = 1) {
  const age = storyAge(progress)
  if (personOpacity(person, progress) === 0) return ''
  const end = Math.min(age, person.end ?? 100)
  const head = starPosition(person, index, count, progress, people)
  const headX = pathX(person, index, count, end, people)
  const continuing = person.end === null
  const perspective = continuing ? smooth((progress - .72) / .28) : 0
  const pitch = 10 + (Math.max(10, (900 - head.y) / Math.max(1, end - person.start)) - 10) * perspective
  const points = []
  for (let t = Math.max(person.start, end - (continuing ? 100 : 48)); t < end; t += .5) {
    points.push(`${pathX(person, index, count, t, people) + head.x - headX},${(head.y + (end - t) * pitch) * verticalScale}`)
  }
  points.push(`${head.x},${head.y * verticalScale}`)
  return `M${points.join(' L')}`
}

export function readPeople(value: unknown): Person[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PEOPLE) return null
  const ids = new Set<string>()
  for (const p of value) {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 24 || !COLORS.includes(p.color) || !Number.isFinite(p.start) || p.start < 0 || p.start > 99 || (p.end !== null && (!Number.isFinite(p.end) || p.end <= p.start || p.end > 100)) || (p.exit !== undefined && p.exit !== 'star' && p.exit !== 'fade') || (p.lane !== undefined && (!Number.isFinite(p.lane) || p.lane < 0 || p.lane > 1)) || (p.near !== undefined && typeof p.near !== 'string')) return null
    ids.add(p.id)
  }
  return value as Person[]
}

export function restorePeople(saved: unknown, legacy: unknown): Person[] {
  const current = readPeople(saved)
  if (current) return current
  const previous = readPeople(legacy)
  // Upgrade only the exact old fictional sample; preserve actual user edits.
  const legacyNames = ['Grandma', 'Grandpa', 'Mom', 'Dad', 'My love', 'Me', 'Our child']
  const legacyEnds = [19, 28, 66, 54, null, null, null]
  const legacyStarts = [0, 0, 0, 0, 25, 0, 32]
  if (previous && !(previous.length === 7 && previous.every((p, i) => p.name === legacyNames[i] && p.start === legacyStarts[i] && p.end === legacyEnds[i]))) return previous
  return SAMPLE.map(p => ({ ...p }))
}
