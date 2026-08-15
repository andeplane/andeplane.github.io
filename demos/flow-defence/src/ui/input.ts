// Wall painting: pointer drag stamps a disc brush of wall cells.
// (M5 adds economy/validation on top; this is the raw build verb.)

import { CONFIG } from '../config'
import type { GpuSim } from '../sim/gpu/GpuSim'
import { cellFromPointer } from './viewport'

export class BuildInput {
  private painting = false
  private last: { x: number; y: number } | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: GpuSim,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      this.painting = true
      this.last = null
      this.paint(e)
    })
    window.addEventListener('pointermove', (e) => {
      if (this.painting) this.paint(e)
    })
    window.addEventListener('pointerup', () => {
      this.painting = false
      this.last = null
    })
  }

  private paint(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const cell = cellFromPointer(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      this.sim.map,
    )
    if (!cell) {
      this.last = null
      return
    }
    // Interpolate the stroke: stamp every ~1 cell along the segment from the
    // previous pointer sample, or fast drags leave dotted (leaky!) walls.
    const from = this.last ?? cell
    const steps = Math.max(1, Math.ceil(Math.hypot(cell.x - from.x, cell.y - from.y)))
    const cells = new Set<number>()
    for (let s = 0; s <= steps; s++) {
      this.stamp(from.x + ((cell.x - from.x) * s) / steps, from.y + ((cell.y - from.y) * s) / steps, cells)
    }
    this.last = cell
    this.sim.paintWall([...cells])
  }

  private stamp(cx: number, cy: number, out: Set<number>): void {
    const r = CONFIG.build.brushRadius
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || x >= this.sim.map.width || y < 0 || y >= this.sim.map.height) continue
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= r * r) out.add(y * this.sim.map.width + x)
      }
    }
  }
}
