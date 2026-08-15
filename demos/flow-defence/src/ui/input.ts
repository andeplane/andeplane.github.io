// Defender input: tool selection (1 wall, 2 neutralizer, 3 impeller),
// drag-to-paint walls, click/drag-to-aim tower placement.

import { CONFIG } from '../config'
import type { Engine } from '../engine/Engine'
import type { TowerType } from '../engine/towers'
import type { GpuSim } from '../sim/gpu/GpuSim'
import { cellFromPointer } from './viewport'

export type Tool = 'wall' | 'neutralizer' | 'impeller'

export interface PendingPlacement {
  type: TowerType
  x: number
  y: number
  angle: number
}

export class BuildInput {
  tool: Tool = 'wall'
  /** Live tower placement being aimed (for the overlay preview). */
  pending: PendingPlacement | null = null

  private painting = false
  private last: { x: number; y: number } | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: GpuSim,
    private readonly engine: Engine,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.key === '1') this.tool = 'wall'
      else if (e.key === '2') this.tool = 'neutralizer'
      else if (e.key === '3') this.tool = 'impeller'
    })
    canvas.addEventListener('pointerdown', (e) => this.down(e))
    window.addEventListener('pointermove', (e) => this.move(e))
    window.addEventListener('pointerup', () => this.up())
  }

  private cellAt(e: PointerEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    return cellFromPointer(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, this.sim.map)
  }

  private down(e: PointerEvent): void {
    const cell = this.cellAt(e)
    if (!cell) return
    if (this.tool === 'wall') {
      this.painting = true
      this.last = null
      this.paint(cell)
    } else {
      this.pending = { type: this.tool, x: cell.x, y: cell.y, angle: 0 }
    }
  }

  private move(e: PointerEvent): void {
    const cell = this.cellAt(e)
    if (this.painting && cell) this.paint(cell)
    if (this.pending && cell) {
      const dx = cell.x - this.pending.x
      const dy = cell.y - this.pending.y
      if (dx * dx + dy * dy > 9) this.pending.angle = Math.atan2(dy, dx)
    }
  }

  private up(): void {
    this.painting = false
    this.last = null
    if (this.pending) {
      const { type, x, y, angle } = this.pending
      this.engine.tryBuildTower(type, x, y, angle)
      this.pending = null
    }
  }

  private paint(cell: { x: number; y: number }): void {
    // Interpolate the stroke: stamp every ~1 cell along the segment from the
    // previous pointer sample, or fast drags leave dotted (leaky!) walls.
    const from = this.last ?? cell
    const steps = Math.max(1, Math.ceil(Math.hypot(cell.x - from.x, cell.y - from.y)))
    const cells = new Set<number>()
    for (let s = 0; s <= steps; s++) {
      this.stamp(from.x + ((cell.x - from.x) * s) / steps, from.y + ((cell.y - from.y) * s) / steps, cells)
    }
    this.last = cell
    // Only pay for cells that are actually buildable (open water).
    const buildable = [...cells].filter((idx) => this.sim.map.cellType[idx] === 0)
    this.sim.paintWall(this.engine.tryBuildWalls(buildable))
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
