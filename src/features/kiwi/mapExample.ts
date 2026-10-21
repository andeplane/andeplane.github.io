// Authored example geometry, never telemetry or the output of a SLAM algorithm.
export type Point = readonly [number, number]
export const rooms = [
  { id: 'living', name: 'Living room', bounds: [0, 0, 4.5, 4], color: '#2a504a', objects: ['Sofa', 'Coffee table'], reason: 'A sofa and coffee table suggest a living room.' },
  { id: 'kitchen', name: 'Kitchen', bounds: [4.5, 0, 3.5, 4], color: '#494b2e', objects: ['Sink', 'Stove'], reason: 'A sink and stove suggest a kitchen. A sink alone could also belong to a bathroom.' },
  { id: 'hall', name: 'Hall', bounds: [0, 4, 8, 2], color: '#293b45', objects: ['Charging dock'], reason: 'This connecting space contains the saved charging-dock location.' },
  { id: 'study', name: 'Study', bounds: [0, 6, 4.5, 3], color: '#3e3551', objects: ['Desk', 'Chair'], reason: 'A desk and chair suggest a study; the room name needs confirmation.' },
  { id: 'bedroom', name: 'Bedroom', bounds: [4.5, 6, 3.5, 3], color: '#453c36', objects: ['Bed'], reason: 'A bed suggests a bedroom. Store a room region separately from its name.' },
] as const

export const walls: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 8, 0], [8, 0, 8, 9], [8, 9, 0, 9], [0, 9, 0, 0],
  [4.5, 0, 4.5, 4], [4.5, 6, 4.5, 9],
  [0, 4, 2, 4], [3, 4, 5.8, 4], [6.8, 4, 8, 4],
  [0, 6, 2, 6], [3, 6, 5.8, 6], [6.8, 6, 8, 6],
]

export const objects = [
  { name: 'Sofa', room: 'living', x: .4, y: .4, w: .85, d: 2.1, h: .8 },
  { name: 'Coffee table', room: 'living', x: 1.8, y: 2, w: .8, d: .6, h: .45 },
  { name: 'Sink', room: 'kitchen', x: 5.6, y: .12, w: .7, d: .65, h: .9 },
  { name: 'Stove', room: 'kitchen', x: 6.5, y: .12, w: .65, d: .65, h: .9 },
  { name: 'Desk', room: 'study', x: .3, y: 8.1, w: 1.4, d: .65, h: .75 },
  { name: 'Chair', room: 'study', x: .8, y: 7.4, w: .5, d: .5, h: .85 },
  { name: 'Bed', room: 'bedroom', x: 6.5, y: 6.8, w: 1.3, d: 2, h: .55 },
  { name: 'Charging dock', room: 'hall', x: .15, y: 4.65, w: .3, d: .7, h: .25 },
] as const

// A continuous route through the door openings. Playback is distance based.
export const route: readonly Point[] = [
  [.6, 5], [2.5, 5], [2.5, 3.4], [3.3, 3.4], [3.3, 1.4], [1.6, 1.4], [3.3, 1.4], [3.3, 3.4],
  [2.5, 3.4], [2.5, 5], [6.3, 5], [6.3, 3.4], [5.3, 2.7], [5.3, 1],
  [7.1, 1.5], [7.1, 3.2], [6.3, 3.4], [6.3, 5], [6.3, 6.4], [6, 8],
  [6.3, 6.4], [6.3, 5], [2.5, 5], [2.5, 6.5], [1.8, 7.5], [2.5, 6.5],
  [2.5, 5], [.6, 5],
]
const lengths = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1]))
export const routeLength = lengths.reduce((a, b) => a + b, 0)

export function examplePose(progress: number) {
  let remaining = Math.max(0, Math.min(1, progress)) * routeLength
  const trail: Point[] = [route[0]]
  for (let i = 0; i < lengths.length; i++) {
    const a = route[i], b = route[i + 1]
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const fraction = Math.min(1, remaining / lengths[i])
      const point: Point = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]
      return { point, heading: Math.atan2(b[1] - a[1], b[0] - a[0]), trail: [...trail, point] }
    }
    remaining -= lengths[i]; trail.push(b)
  }
  throw new Error('Example route is empty')
}

export function roomAt([x, y]: Point) {
  return rooms.find(({ bounds: [rx, ry, w, h] }) => x >= rx && x <= rx + w && y >= ry && y <= ry + h)
}

export const exampleCloud = walls.flatMap(([ax, ay, bx, by]) => {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / .12)
  return Array.from({ length: steps + 1 }, (_, i) =>
    [0, .4, .8, 1.2, 1.6].map(z => [ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps, z] as const),
  ).flat()
})
