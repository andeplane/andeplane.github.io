// Screen ↔ domain mapping for the letterboxed ortho view (must match
// Renderer.fitOrtho: the domain quad is contained and centered).

import type { DomainMap } from '../engine/map'

export interface DomainRect {
  x: number
  y: number
  w: number
  h: number
}

export function domainRect(canvasW: number, canvasH: number, aspect: number): DomainRect {
  const ca = canvasW / Math.max(1, canvasH)
  if (ca > aspect) {
    const h = canvasH
    const w = canvasH * aspect
    return { x: (canvasW - w) / 2, y: 0, w, h }
  }
  const w = canvasW
  const h = canvasW / aspect
  return { x: 0, y: (canvasH - h) / 2, w, h }
}

/** Pointer position (canvas-relative px) → sim cell {x, y}, or null outside the domain. */
export function cellFromPointer(
  px: number,
  py: number,
  canvasW: number,
  canvasH: number,
  map: DomainMap,
): { x: number; y: number } | null {
  const rect = domainRect(canvasW, canvasH, map.width / map.height)
  const u = (px - rect.x) / rect.w
  const v = (py - rect.y) / rect.h
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null
  // Screen y grows downward; domain row 0 renders at the bottom.
  return { x: Math.floor(u * map.width), y: Math.floor((1 - v) * map.height) }
}
