import { clamp, smooth } from './clock.ts'
import type { StoryPoint } from './story.ts'
export const cameraAmount = (progress: number) => smooth((progress * 120 - 92) / 16)

// A pinhole view of the time plane. Historic endpoints keep their world-year;
// the camera changes our view of them, rather than rearranging the deceased.
export function projectPoint(point: StoryPoint, progress: number, viewHeight: number) {
  const tilt = cameraAmount(progress)
  const depth = Math.max(.05, (point.year - 10) / 18)
  const scale = clamp(1 / (.6 + depth * .55), .025, 1.5)
  const targetX = 480 + (point.x - 480) * scale
  const targetY = viewHeight * (.1 + .42 * scale)
  return { x: point.x + (targetX - point.x) * tilt, y: point.y / 800 * viewHeight + (targetY - point.y / 800 * viewHeight) * tilt, scale: 1 + (scale - 1) * tilt }
}
export interface FutureBranch { id: string; parent: string | null; from: StoryPoint; to: StoryPoint; opacity: number }
export function futureBranches(progress: number, afterEnding = 0): FutureBranch[] {
  if (progress * 120 < 94) return []
  const elapsed = Math.max(0, progress * 120 - 94)
  const cursor = 95 + 185 * Math.pow(clamp(elapsed / 26), 1.6) + Math.sqrt(Math.max(0, afterEnding)) * 18
  const branches: FutureBranch[] = []
  const roots = [560, 650, 710]
  function grow(from: StoryPoint, depth: number, seed: number, parent: string | null) {
    if (depth > 5 || from.year > cursor) return
    const id = `future-${seed}`
    const year = from.year + 22 + seed % 7
    const endX = clamp(from.x + Math.sin(seed * 12.37) * (100 + depth * 22), 120, 850)
    const fraction = clamp((cursor - from.year) / (year - from.year))
    const to = { x: from.x + (endX - from.x) * smooth(fraction), y: 505, year: from.year + (year - from.year) * fraction }
    branches.push({ id, parent, from, to, opacity: cameraAmount(progress) * (.5 - depth * .045) })
    if (fraction === 1) {
      grow({ x: endX, y: 505, year }, depth + 1, seed * 2 + 1, id)
      grow({ x: endX, y: 505, year }, depth + 1, seed * 2 + 2, id)
    }
  }
  roots.forEach((x, i) => grow({ x, y: 505, year: 95 + i * 3 }, 0, i + 10, null))
  return branches
}
