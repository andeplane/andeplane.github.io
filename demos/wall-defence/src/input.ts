// Pointer input (docs/DESIGN.md §5). Desktop: hover ghost, click commits,
// Space/right-click toggles orientation. Touch: tap places an adjustable
// ghost, drag moves it, FABs toggle/commit — no blind commits.

import { GRID_H, GRID_W } from './sim/constants'
import type { SimEvent } from './sim/events'
import { cellOf, clamp } from './sim/fixed'
import { CLAIMED, type GameState, type Tower } from './sim/state'
import { canvasToBoard, type GhostCut, type View } from './render/draw'
import type { Radial } from './ui/radial'

export interface InputCallbacks {
  emit: (e: SimEvent) => void
  radial: Radial
  isInteractive: () => boolean // false while menu/end/picker overlays are up
  onFirstCut: () => void
}

export class Input {
  orient: 0 | 1 = 0
  ghost: GhostCut | null = null
  isTouch = false
  private canvas: HTMLCanvasElement
  private view: () => View
  private state: () => GameState
  private cb: InputCallbacks
  private toggleFab: HTMLButtonElement
  private confirmFab: HTMLButtonElement
  private fabWrap: HTMLDivElement
  private dragging = false

  constructor(
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    view: () => View,
    state: () => GameState,
    cb: InputCallbacks,
  ) {
    this.canvas = canvas
    this.view = view
    this.state = state
    this.cb = cb

    this.fabWrap = document.createElement('div')
    this.fabWrap.className = 'touch-controls'
    this.toggleFab = document.createElement('button')
    this.toggleFab.className = 'fab'
    this.toggleFab.textContent = '↕'
    this.confirmFab = document.createElement('button')
    this.confirmFab.className = 'fab confirm'
    this.confirmFab.textContent = '✓'
    this.fabWrap.append(this.toggleFab, this.confirmFab)
    uiRoot.appendChild(this.fabWrap)

    this.toggleFab.addEventListener('click', () => this.toggleOrient())
    this.confirmFab.addEventListener('click', () => this.commitGhost())

    canvas.addEventListener('pointermove', (e) => this.onMove(e))
    canvas.addEventListener('pointerdown', (e) => this.onDown(e))
    canvas.addEventListener('pointerup', (e) => this.onUp(e))
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      this.toggleOrient()
    })
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        this.toggleOrient()
      }
    })
  }

  reset(): void {
    this.ghost = null
    this.dragging = false
  }

  private toggleOrient(): void {
    this.orient = this.orient === 0 ? 1 : 0
    this.toggleFab.textContent = this.orient === 0 ? '↕' : '↔'
    if (this.ghost) {
      this.ghost.orient = this.orient
      this.ghost.valid = this.ghostValid(this.ghost.cx, this.ghost.cy)
    }
  }

  private cellAt(e: PointerEvent): [number, number] | null {
    const rect = this.canvas.getBoundingClientRect()
    const [qx, qy] = canvasToBoard(this.view(), e.clientX - rect.left, e.clientY - rect.top)
    const cx = cellOf(qx)
    const cy = cellOf(qy)
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return null
    return [clamp(cx, 0, GRID_W - 1), clamp(cy, 0, GRID_H - 1)]
  }

  private ghostValid(cx: number, cy: number): boolean {
    const s = this.state()
    const v = s.grid[cy * GRID_W + cx]
    const solid = v === 1 || v === 2
    return !solid && s.tick >= s.cutCooldownUntil
  }

  private towerAt(s: GameState, cell: number): Tower | undefined {
    return s.towers.find((t) => t.cell === cell)
  }

  private onMove(e: PointerEvent): void {
    if (!this.cb.isInteractive()) return
    const cell = this.cellAt(e)
    if (!cell) return
    if (e.pointerType === 'mouse' && !this.isTouch) {
      const [cx, cy] = cell
      const s = this.state()
      const v = s.grid[cy * GRID_W + cx]
      if (v === 1 || v === 2) {
        this.ghost = null
      } else {
        this.ghost = { cx, cy, orient: this.orient, valid: this.ghostValid(cx, cy), committed: false }
      }
    } else if (this.dragging && this.ghost) {
      const [cx, cy] = cell
      this.ghost.cx = cx
      this.ghost.cy = cy
      this.ghost.valid = this.ghostValid(cx, cy)
    }
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') {
      this.isTouch = true
      this.fabWrap.classList.add('visible')
    }
    if (!this.cb.isInteractive()) return
    if (this.isTouch && this.ghost) {
      const cell = this.cellAt(e)
      if (cell && Math.abs(cell[0] - this.ghost.cx) <= 2 && Math.abs(cell[1] - this.ghost.cy) <= 2) {
        this.dragging = true
      }
    }
  }

  private onUp(e: PointerEvent): void {
    const wasDragging = this.dragging
    this.dragging = false
    if (!this.cb.isInteractive()) return
    if (this.cb.radial.isOpen) {
      this.cb.radial.close()
      return
    }
    const cell = this.cellAt(e)
    if (!cell) return
    const [cx, cy] = cell
    const s = this.state()
    const idx = cy * GRID_W + cx
    const tower = this.towerAt(s, idx)

    if (tower) {
      this.cb.radial.openTower(s, tower, e.clientX, e.clientY, this.cb.emit)
      this.ghost = null
      return
    }
    if (s.grid[idx] === CLAIMED) {
      this.cb.radial.openBuild(s, idx, e.clientX, e.clientY, this.cb.emit)
      this.ghost = null
      return
    }

    // Open (or draining) space → the cut flow.
    if (this.isTouch) {
      if (wasDragging) return
      if (this.ghost && cx === this.ghost.cx && cy === this.ghost.cy) {
        this.commitGhost()
      } else {
        this.ghost = { cx, cy, orient: this.orient, valid: this.ghostValid(cx, cy), committed: true }
      }
    } else {
      if (e.button !== 0) return
      if (this.ghostValid(cx, cy)) {
        this.cb.emit({ kind: 'StartCut', cx, cy, orient: this.orient })
        this.cb.onFirstCut()
      }
    }
  }

  private commitGhost(): void {
    if (!this.ghost) return
    if (this.ghostValid(this.ghost.cx, this.ghost.cy)) {
      this.cb.emit({ kind: 'StartCut', cx: this.ghost.cx, cy: this.ghost.cy, orient: this.ghost.orient })
      this.cb.onFirstCut()
      this.ghost = null
    }
  }

  // Ghost for rendering; keep validity fresh (cooldown ticks down).
  currentGhost(): GhostCut | null {
    if (this.ghost) {
      this.ghost.valid = this.ghostValid(this.ghost.cx, this.ghost.cy)
    }
    return this.ghost
  }
}
