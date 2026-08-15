// Domain construction: bedrock border, inlet/outlet segments, map features.
// Pure module (no DOM/Babylon) — used by the GPU sim, the CPU sim, and tests.

import { CELL } from '../sim/core/constants'
import { CONFIG } from '../config'

export interface InletSegment {
  /** Segment index (stable id for AI/economy). */
  index: number
  /** Inclusive row range on the left edge. */
  y0: number
  y1: number
}

export interface DomainMap {
  width: number
  height: number
  cellType: Uint32Array
  solidity: Float32Array
  inletSegments: InletSegment[]
  /** Outlet rows (right edge). */
  outletY0: number
  outletY1: number
}

export function buildMap(width: number, height: number): DomainMap {
  const cellType = new Uint32Array(width * height)
  const solidity = new Float32Array(width * height)
  const idx = (x: number, y: number) => y * width + x

  const { margin, segments, gap } = CONFIG.inlet

  // Bedrock frame: top/bottom margins, plus corners of left/right edges.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y < margin || y >= height - margin) cellType[idx(x, y)] = CELL.BEDROCK
    }
  }

  // Inlet segments (left edge) separated by bedrock gaps.
  const usable = height - 2 * margin
  const segH = Math.floor((usable - gap * (segments - 1)) / segments)
  const inletSegments: InletSegment[] = []
  for (let s = 0; s < segments; s++) {
    const y0 = margin + s * (segH + gap)
    const y1 = y0 + segH - 1
    inletSegments.push({ index: s, y0, y1 })
    for (let y = y0; y <= y1; y++) cellType[idx(0, y)] = CELL.INLET
  }
  // Left-edge rows not part of an inlet are bedrock.
  for (let y = margin; y < height - margin; y++) {
    if (cellType[idx(0, y)] === CELL.OPEN) cellType[idx(0, y)] = CELL.BEDROCK
  }

  // Outlet: right edge, full open span.
  const outletY0 = margin
  const outletY1 = height - margin - 1
  for (let y = outletY0; y <= outletY1; y++) cellType[idx(width - 1, y)] = CELL.OUTLET

  // Map features: a few bedrock pillars mid-domain. At game Reynolds numbers
  // they shed Kármán vortex streets — the flow reads as alive even pre-build.
  const pillars: Array<[number, number, number]> = [
    [Math.floor(width * 0.32), Math.floor(height * 0.34), 13],
    [Math.floor(width * 0.46), Math.floor(height * 0.68), 16],
    [Math.floor(width * 0.62), Math.floor(height * 0.3), 11],
  ]
  for (const [cx, cy, r] of pillars) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) continue
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= r * r) cellType[idx(x, y)] = CELL.BEDROCK
      }
    }
  }

  return { width, height, cellType, solidity, inletSegments, outletY0, outletY1 }
}

/** Build the per-row inlet profile (rho, ux interleaved) for the current segment openness (0..1 each). */
export function inletProfile(map: DomainMap, openness: number[]): Float32Array {
  const profile = new Float32Array(map.height * 2)
  for (let y = 0; y < map.height; y++) {
    profile[y * 2] = 1
    profile[y * 2 + 1] = 0
  }
  for (const seg of map.inletSegments) {
    const o = Math.max(0, Math.min(1, openness[seg.index] ?? 0))
    for (let y = seg.y0; y <= seg.y1; y++) {
      // Soft parabolic profile across the segment mouth: prettier and more stable
      // than a top-hat jet.
      const t = (y - seg.y0) / Math.max(1, seg.y1 - seg.y0)
      const shape = 4 * t * (1 - t)
      profile[y * 2] = 1 + (CONFIG.inlet.rho - 1) * o
      profile[y * 2 + 1] = CONFIG.inlet.u * o * (0.35 + 0.65 * shape)
    }
  }
  return profile
}
