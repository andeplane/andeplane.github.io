// Tower/UI overlay: canvas2d above the fluid — thin luminous strokes only.

import { CONFIG } from '../config'
import type { DomainMap } from '../engine/map'
import type { Tower } from '../engine/towers'
import type { PendingPlacement } from '../ui/input'
import { domainRect } from '../ui/viewport'

export class Overlay {
  private readonly ctx: CanvasRenderingContext2D

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: DomainMap,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  draw(towers: Tower[], pending: PendingPlacement | null): void {
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

    for (const t of towers) this.drawTower(ctx, t, toScreen, cellPx, 1)
    if (pending) {
      this.drawTower(ctx, { id: 0, ...pending }, toScreen, cellPx, 0.55)
    }
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
