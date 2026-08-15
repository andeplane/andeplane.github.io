// Defender input: tool selection (1 wall, 2 neutralizer, 3 impeller),
// drag-to-paint walls, click/drag-to-aim tower placement, and the jet —
// hold the RIGHT mouse button to blast water outward from the cursor.

import { CONFIG } from '../config'
import type { Engine } from '../engine/Engine'
import type { TowerType } from '../engine/towers'
import type { GpuSim } from '../sim/gpu/GpuSim'
import { CELL } from '../sim/core/constants'
import { cellFromPointer } from './viewport'

export type Tool = 'wall' | 'neutralizer' | 'impeller'

export interface PendingPlacement {
  type: TowerType
  x: number
  y: number
  angle: number
}

export interface JetState {
  /** Cursor position in sim cells (last known). */
  x: number
  y: number
  /** Right mouse button currently held inside the domain. */
  held: boolean
}

export class BuildInput {
  tool: Tool = 'wall'
  /** Live tower placement being aimed (for the overlay preview). */
  pending: PendingPlacement | null = null
  /** The jet verb: main.ts feeds this to the sim each frame. */
  readonly jet: JetState = { x: 0, y: 0, held: false }

  private painting = false
  private last: { x: number; y: number } | null = null
  /** Cells touched by the current stroke — never billed twice within one drag. */
  private readonly stroke = new Set<number>()

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
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('pointerdown', (e) => this.down(e))
    window.addEventListener('pointermove', (e) => this.move(e))
    window.addEventListener('pointerup', (e) => this.up(e))
  }

  private cellAt(e: PointerEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    return cellFromPointer(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, this.sim.map)
  }

  private down(e: PointerEvent): void {
    const cell = this.cellAt(e)
    if (!cell) return
    if (e.button === 2) {
      this.jet.held = true
      this.jet.x = cell.x
      this.jet.y = cell.y
      return
    }
    if (this.tool === 'wall') {
      this.painting = true
      this.last = null
      this.stroke.clear()
      this.paint(cell)
    } else {
      this.pending = { type: this.tool, x: cell.x, y: cell.y, angle: 0 }
    }
  }

  private move(e: PointerEvent): void {
    const cell = this.cellAt(e)
    if (cell) {
      this.jet.x = cell.x
      this.jet.y = cell.y
    }
    if (this.painting && cell) this.paint(cell)
    if (this.pending && cell) {
      const dx = cell.x - this.pending.x
      const dy = cell.y - this.pending.y
      if (dx * dx + dy * dy > 9) this.pending.angle = Math.atan2(dy, dx)
    }
  }

  private up(e: PointerEvent): void {
    if (e.button === 2) {
      this.jet.held = false
      return
    }
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
    // New wall on open water at full price; repainting a standing wall repairs
    // it (fresh armor) at half price. Each cell bills at most once per stroke.
    const fresh = [...cells].filter((idx) => !this.stroke.has(idx))
    for (const idx of fresh) this.stroke.add(idx)
    const buildable = fresh.filter((idx) => this.sim.map.cellType[idx] === CELL.OPEN)
    const repairable = fresh.filter((idx) => this.sim.map.cellType[idx] === CELL.WALL)
    this.sim.paintWall(this.engine.tryBuildWalls(buildable))
    this.sim.paintWall(this.engine.tryRepairWalls(repairable))
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
