// Build/upgrade popup anchored to a cell. The game loop pauses while open
// (one UX rule: any overlay pauses the sim).

import { TowerType } from '../sim/constants'
import type { SimEvent } from '../sim/events'
import { CLAIMED, type GameState, type Tower } from '../sim/state'
import { placeCost, towerCost } from '../sim/towers'

export class Radial {
  private parent: HTMLElement
  private el: HTMLDivElement | null = null

  constructor(parent: HTMLElement) {
    this.parent = parent
  }

  get isOpen(): boolean {
    return this.el !== null
  }

  close(): void {
    if (this.el) {
      this.el.remove()
      this.el = null
    }
  }

  // Open a build menu for an empty claimed cell.
  openBuild(
    s: GameState,
    cell: number,
    screenX: number,
    screenY: number,
    emit: (e: SimEvent) => void,
  ): void {
    this.close()
    if (s.grid[cell] !== CLAIMED) return
    const el = this.make(screenX, screenY)
    const turretCost = placeCost(s, TowerType.Turret)
    const slowCost = placeCost(s, TowerType.Slow)
    this.button(el, `⬢ Turret ${turretCost}¢`, s.money >= turretCost, () => {
      emit({ kind: 'PlaceTower', cell, tower: TowerType.Turret })
      this.close()
    })
    this.button(el, `◎ Slow ${slowCost}¢`, s.money >= slowCost, () => {
      emit({ kind: 'PlaceTower', cell, tower: TowerType.Slow })
      this.close()
    })
    this.button(el, '✕', true, () => this.close())
  }

  // Open an upgrade/sell menu for an existing tower.
  openTower(
    s: GameState,
    tower: Tower,
    screenX: number,
    screenY: number,
    emit: (e: SimEvent) => void,
  ): void {
    this.close()
    const el = this.make(screenX, screenY)
    if (tower.tier < 2) {
      const cost = towerCost(tower.type, tower.tier + 1)
      this.button(el, `▲ Tier ${tower.tier + 2} ${cost}¢`, s.money >= cost, () => {
        emit({ kind: 'UpgradeTower', id: tower.id })
        this.close()
      })
    }
    const refund = Math.floor((tower.spent * 2) / 3)
    this.button(el, `Sell +${refund}¢`, true, () => {
      emit({ kind: 'SellTower', id: tower.id })
      this.close()
    })
    this.button(el, '✕', true, () => this.close())
  }

  private make(x: number, y: number): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'radial'
    el.style.left = `${x}px`
    el.style.top = `${y - 8}px`
    this.parent.appendChild(el)
    this.el = el
    // Keep it on screen.
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      if (r.left < 4) el.style.left = `${x + (4 - r.left)}px`
      if (r.right > window.innerWidth - 4) el.style.left = `${x - (r.right - window.innerWidth + 4)}px`
      if (r.top < 4) el.style.transform = 'translate(-50%, 12px)'
    })
    return el
  }

  private button(parent: HTMLElement, label: string, enabled: boolean, onClick: () => void): void {
    const b = document.createElement('button')
    b.className = 'btn'
    b.textContent = label
    b.disabled = !enabled
    b.addEventListener('click', (ev) => {
      ev.stopPropagation()
      onClick()
    })
    parent.appendChild(b)
  }
}
