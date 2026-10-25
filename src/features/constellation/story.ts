export interface Person {
  id: string
  name: string
  color: string
  start: number
  end: number | null
}

export const COLORS = ['#c9b9f6', '#bedddd', '#ff9c8e', '#90baff', '#f3b4d1', '#f7ce85', '#81e0e8', '#c1dea3']
export const SAMPLE: Person[] = [
  { id: 'grandma', name: 'Grandma', color: COLORS[0], start: 0, end: 19 },
  { id: 'grandpa', name: 'Grandpa', color: COLORS[1], start: 0, end: 28 },
  { id: 'mom', name: 'Mom', color: COLORS[2], start: 0, end: 66 },
  { id: 'dad', name: 'Dad', color: COLORS[3], start: 0, end: 54 },
  { id: 'partner', name: 'My love', color: COLORS[4], start: 25, end: null },
  { id: 'self', name: 'Me', color: COLORS[5], start: 0, end: null },
  { id: 'child', name: 'Our child', color: COLORS[6], start: 32, end: null },
]

export const CHAPTERS = [
  { at: 0, label: 'Before us', title: 'We begin in someone else’s light.', text: 'Before we have a story of our own, there are people who make a place for us in theirs.' },
  { at: 0.14, label: 'A small world', title: 'At first, they are our whole sky.', text: 'The hands we hold. The voices we know. The ordinary days that quietly become everything.' },
  { at: 0.30, label: 'Paths meet', title: 'Then a stranger becomes home.', text: 'One path finds another. Two lives bend toward the same small corner of the universe.' },
  { at: 0.42, label: 'A new light', title: 'And the sky makes room for someone new.', text: 'A new light arrives. For a while, we get to be the centre of someone else’s world.' },
  { at: 0.65, label: 'The changing sky', title: 'Some trails become stars.', text: 'We cannot keep every hand in ours. But what they gave us keeps travelling through our lives.' },
  { at: 0.90, label: 'Always here', title: 'Look at all the light we leave.', text: 'A life is more than a line through time. It is the people who become part of our sky.' },
]

export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
export const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }
export const storyAge = (progress: number) => clamp(progress / 0.9) * 80
export const chapterAt = (progress: number) => CHAPTERS.reduce((index, chapter, i) => progress >= chapter.at ? i : index, 0)

// Coordinates are shared by the animated SVG and the downloadable keepsake.
export function starPosition(person: Person, index: number, count: number, progress: number) {
  const age = storyAge(progress)
  const end = Math.min(age, person.end ?? 80)
  const lane = 90 + index * (620 / Math.max(1, count - 1))
  const x = lane + Math.sin(end * 0.13 + index * 2) * 9
  const y = 510 - Math.max(0, age - end) * 4.6
  const finalX = 400 + Math.cos(-Math.PI / 2 + index / count * Math.PI * 2) * (index % 2 ? 235 : 265)
  const finalY = 330 + Math.sin(-Math.PI / 2 + index / count * Math.PI * 2) * 220
  const blend = smooth((progress - 0.90) / 0.10)
  return { x: x + (finalX - x) * blend, y: y + (finalY - y) * blend, visible: age >= person.start }
}

export function trailPath(person: Person, index: number, count: number, progress: number) {
  const age = storyAge(progress)
  if (age < person.start) return ''
  const end = Math.min(age, person.end ?? 80)
  const lane = 90 + index * (620 / Math.max(1, count - 1))
  const points = []
  for (let t = person.start; t < end; t += 0.4) {
    points.push(`${lane + Math.sin(t * 0.13 + index * 2) * 9},${510 - (age - end) * 4.6 + (end - t) * 7}`)
  }
  points.push(`${lane + Math.sin(end * 0.13 + index * 2) * 9},${510 - (age - end) * 4.6}`)
  // Ended trails climb into the sky while the present remains at y=510.
  return `M${points.join(' L')}`
}

export function readPeople(value: unknown): Person[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null
  const ids = new Set<string>()
  for (const p of value) {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 24 || !COLORS.includes(p.color) || !Number.isFinite(p.start) || p.start < 0 || p.start > 79 || (p.end !== null && (!Number.isFinite(p.end) || p.end <= p.start || p.end > 80))) return null
    ids.add(p.id)
  }
  return value as Person[]
}
