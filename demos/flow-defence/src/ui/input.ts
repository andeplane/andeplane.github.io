// Defender input: tool selection (dynamic — the level's unlocked towers get
// hotkeys 2..n after 1=wall, with erase last), drag-to-paint walls,
// click/drag-to-aim tower placement, and the jet — hold the RIGHT mouse
// button to blast water outward from the cursor.

import { CONFIG } from '../config'
import type { Engine } from '../engine/Engine'
import { TOWER_DEFS, type TowerId } from '../engine/towerDefs'
import type { TowerType } from '../engine/towers'
import type { GpuSim } from '../sim/gpu/GpuSim'
import { CELL } from '../sim/core/constants'
import { cellFromPointer } from './viewport'

export type Tool = 'wall' | 'erase' | TowerId

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
  /** Hotkey -> tool, in palette order (1 wall, 2.. towers, last erase). */
  readonly hotkeys: ReadonlyMap<string, Tool>
  /** Live tower placement being aimed (for the overlay preview). */
  pending: PendingPlacement | null = null
  /** Cursor cell while inside the domain (for the build ghost preview). */
  hover: { x: number; y: number } | null = null
  /** The jet verb: main.ts feeds this to the sim each frame. */
  readonly jet: JetState = { x: 0, y: 0, held: false }
  /** Palette sync: called whenever the tool changes (hotkey or click). */
  onToolChange: ((tool: Tool) => void) | null = null

  private painting = false
  private last: { x: number; y: number } | null = null
  /** Cells touched by the current stroke — never billed twice within one drag. */
  private readonly stroke = new Set<number>()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: GpuSim,
    private readonly engine: Engine,
    availableTowers: readonly TowerId[],
  ) {
    const keys = new Map<string, Tool>()
    keys.set('1', 'wall')
    availableTowers.forEach((id, i) => keys.set(String(i + 2), id))
    // Erase always lives on E — with 8 towers the numbers run out at 9.
    keys.set('e', 'erase')
    this.hotkeys = keys

    window.addEventListener('keydown', (e) => {
      const tool = keys.get(e.key.toLowerCase())
      if (tool) this.select(tool)
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('pointerdown', (e) => this.down(e))
    window.addEventListener('pointermove', (e) => this.move(e))
    window.addEventListener('pointerup', (e) => this.up(e))
  }

  select(tool: Tool): void {
    this.tool = tool
    this.onToolChange?.(tool)
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
    if (this.tool === 'wall' || this.tool === 'erase') {
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
    this.hover = cell
    if (cell) {
      this.jet.x = cell.x
      this.jet.y = cell.y
    }
    if (this.painting && cell) this.paint(cell)
    if (this.pending && cell && TOWER_DEFS[this.pending.type]?.aimable) {
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
    // Each cell acts at most once per stroke. Wall tool: new wall on open
    // water at full price, repainting a standing wall repairs it (fresh armor)
    // at half price. Erase tool: remove walls for a partial refund.
    const fresh = [...cells].filter((idx) => !this.stroke.has(idx))
    for (const idx of fresh) this.stroke.add(idx)
    const walls = fresh.filter((idx) => this.sim.map.cellType[idx] === CELL.WALL)
    if (this.tool === 'erase') {
      this.sim.eraseWall(this.engine.eraseWalls(walls))
      return
    }
    const buildable = fresh.filter((idx) => this.sim.map.cellType[idx] === CELL.OPEN)
    this.sim.paintWall(this.engine.tryBuildWalls(buildable))
    this.sim.paintWall(this.engine.tryRepairWalls(walls))
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
