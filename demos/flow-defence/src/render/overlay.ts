// Tower/UI overlay: canvas2d above the fluid — thin luminous strokes only.
// Also draws the crisp layer of the combat feedback: spore core dots,
// neutralizer beams to their targets, and the jet ring with its charge arc.

import { CONFIG } from '../config'
import type { DomainMap } from '../engine/map'
import type { Tower } from '../engine/towers'
import type { EnemyView } from '../sim/types'
import type { PendingPlacement } from '../ui/input'
import { domainRect } from '../ui/viewport'

export interface JetOverlay {
  x: number
  y: number
  held: boolean
  charge: number
}

export class Overlay {
  private readonly ctx: CanvasRenderingContext2D

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: DomainMap,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  draw(towers: Tower[], pending: PendingPlacement | null, enemies: EnemyView[], jet: JetOverlay | null): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    if (this.canvas.width !== cw * dpr || this.canvas.height !== ch * dpr) {
      this.canvas.width = cw * dpr
      this.canvas.height = ch * dpr
    }
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)

    const rect = domainRect(cw, ch, this.map.width / this.map.height)
    const cellPx = rect.w / this.map.width
    const toScreen = (x: number, y: number): [number, number] => [
      rect.x + ((x + 0.5) / this.map.width) * rect.w,
      rect.y + (1 - (y + 0.5) / this.map.height) * rect.h,
    ]

    this.drawBeams(ctx, towers, enemies, toScreen, cellPx)
    for (const t of towers) this.drawTower(ctx, t, toScreen, cellPx, 1)
    if (pending) {
      this.drawTower(ctx, { id: 0, ...pending }, toScreen, cellPx, 0.55)
    }
    this.drawEnemies(ctx, enemies, toScreen, cellPx)
    if (jet) this.drawJet(ctx, jet, toScreen, cellPx)
  }

  /** Crisp spore cores over the field glow — the enemy always reads as a THING. */
  private drawEnemies(
    ctx: CanvasRenderingContext2D,
    enemies: EnemyView[],
    toScreen: (x: number, y: number) => [number, number],
    cellPx: number,
  ): void {
    ctx.save()
    ctx.fillStyle = '#ffe4f1'
    ctx.shadowColor = '#fb7185'
    ctx.shadowBlur = 8
    const r = Math.max(1.6, cellPx * 0.9)
    for (const e of enemies) {
      const [sx, sy] = toScreen(e.x, e.y)
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  /** Neutralizer → target beams: the kill is visible, not inferred. */
  private drawBeams(
    ctx: CanvasRenderingContext2D,
    towers: Tower[],
    enemies: EnemyView[],
    toScreen: (x: number, y: number) => [number, number],
    cellPx: number,
  ): void {
    const radius = CONFIG.towers.neutralizer.radius
    ctx.save()
    ctx.strokeStyle = '#5eead4'
    ctx.shadowColor = '#5eead4'
    ctx.shadowBlur = 6
    ctx.lineWidth = 1
    for (const t of towers) {
      if (t.type !== 'neutralizer') continue
      // Beam the two nearest spores inside the ring.
      const inRange = enemies
        .map((e) => ({ e, d2: (e.x - t.x) ** 2 + (e.y - t.y) ** 2 }))
        .filter(({ d2 }) => d2 <= radius * radius)
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, 2)
      const [tx, ty] = toScreen(t.x, t.y)
      for (const { e, d2 } of inRange) {
        const [ex, ey] = toScreen(e.x, e.y)
        ctx.globalAlpha = 0.35 + 0.45 * (1 - d2 / (radius * radius))
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }
    }
    ctx.restore()
    void cellPx
  }

  private drawJet(
    ctx: CanvasRenderingContext2D,
    jet: JetOverlay,
    toScreen: (x: number, y: number) => [number, number],
    cellPx: number,
  ): void {
    if (!jet.held && jet.charge >= 1) return
    const [sx, sy] = toScreen(jet.x, jet.y)
    const r = CONFIG.jet.radius * cellPx
    ctx.save()
    if (jet.held && jet.charge > 0) {
      ctx.strokeStyle = '#7dd3fc'
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    // Charge arc (always visible while not full — you can see it come back).
    ctx.globalAlpha = 0.8
    ctx.strokeStyle = jet.charge > 0.25 ? '#7dd3fc' : '#fb923c'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(sx, sy, Math.max(8, cellPx * 3), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * jet.charge)
    ctx.stroke()
    ctx.restore()
  }

  private drawTower(
    ctx: CanvasRenderingContext2D,
    t: Tower,
    toScreen: (x: number, y: number) => [number, number],
    cellPx: number,
    alpha: number,
  ): void {
    const [sx, sy] = toScreen(t.x, t.y)
    const cfg = CONFIG.towers[t.type]
    const rangePx = cfg.radius * cellPx
    const color = t.type === 'neutralizer' ? '#5eead4' : '#93c5fd'

    ctx.save()
    ctx.globalAlpha = alpha

    // Range ring, barely-there.
    ctx.strokeStyle = color
    ctx.globalAlpha = alpha * 0.16
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(sx, sy, rangePx, 0, Math.PI * 2)
    ctx.stroke()

    // Core glyph.
    ctx.globalAlpha = alpha
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(sx, sy, Math.max(4, cellPx * 1.8), 0, Math.PI * 2)
    ctx.stroke()

    if (t.type === 'neutralizer') {
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(2, cellPx * 0.8), 0, Math.PI * 2)
      ctx.stroke()
    } else {
      // Impeller: thrust chevron (screen y is flipped vs domain y).
      const a = -t.angle
      const len = Math.max(8, cellPx * 3.2)
      ctx.translate(sx, sy)
      ctx.rotate(a)
      ctx.beginPath()
      ctx.moveTo(len * 0.2, -len * 0.35)
      ctx.lineTo(len * 0.75, 0)
      ctx.lineTo(len * 0.2, len * 0.35)
      ctx.stroke()
    }
    ctx.restore()
  }
}
