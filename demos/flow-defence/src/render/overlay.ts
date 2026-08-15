// Tower/UI overlay: canvas2d above the fluid — generated sprites with thin
// luminous accents. Also draws the crisp layer of the combat feedback: spore
// core dots (typed: size/color per spore), neutralizer beams, zap effects
// (arc lightning, mortar blasts, harpoon tracers, sonar ripples), and the
// jet ring with its charge arc. Phantoms render only inside sonar coverage.

import type { DomainMap } from '../engine/map'
import { SPORES_BY_INDEX } from '../engine/sporeDefs'
import { TOWER_DEFS } from '../engine/towerDefs'
import type { Tower } from '../engine/towers'
import type { ZapEvent } from '../engine/zap'
import type { EnemyView } from '../sim/types'
import type { PendingPlacement } from '../ui/input'
import { domainRect } from '../ui/viewport'
import { drawFx, drawSonarRipple, spawnFx, type FxInstance } from './zapFx'

export interface JetOverlay {
  x: number
  y: number
  held: boolean
  charge: number
}

interface Popup {
  x: number
  y: number
  text: string
  color: string
  born: number
}

const SPRITE_BASE = `${import.meta.env.BASE_URL}sprites/`

export class Overlay {
  private readonly ctx: CanvasRenderingContext2D
  /** Last seen enemies by slot — a vanished slot becomes a kill/escape popup. */
  private readonly lastSeen = new Map<number, EnemyView>()
  private readonly popups: Popup[] = []
  private readonly sprites = new Map<string, HTMLImageElement>()
  private fx: FxInstance[] = []
  private frame = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly map: DomainMap,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  /** Queue zap effects (called by main.ts when zap towers fire). */
  addZaps(events: readonly ZapEvent[]): void {
    this.fx.push(...spawnFx(events))
  }

  private sprite(name: string): HTMLImageElement {
    let img = this.sprites.get(name)
    if (!img) {
      img = new Image()
      img.src = `${SPRITE_BASE}${name}.png`
      this.sprites.set(name, img)
    }
    return img
  }

  /** Phantoms are only visible (and targetable) inside sonar coverage. */
  private visible(e: EnemyView, towers: readonly Tower[]): boolean {
    const def = SPORES_BY_INDEX[Math.round(e.type)]
    if (!def?.invisible) return true
    return towers.some((t) => {
      const d = TOWER_DEFS[t.type]
      return d.sonar && (t.x - e.x) ** 2 + (t.y - e.y) ** 2 <= d.radius * d.radius
    })
  }

  /** Diff enemy slots between frames: gone near the outlet = a lost life,
   *  gone anywhere else = a paid kill. Makes every event self-explanatory. */
  private notePopups(enemies: EnemyView[]): void {
    const now = performance.now()
    const seen = new Set(enemies.map((e) => e.slot))
    for (const [slot, last] of this.lastSeen) {
      if (seen.has(slot)) continue
      this.lastSeen.delete(slot)
      const escaped = last.x >= this.map.width - 26
      const bounty = SPORES_BY_INDEX[Math.round(last.type)]?.bounty ?? 3
      this.popups.push({
        x: last.x,
        y: last.y,
        text: escaped ? '−1 life' : `+${bounty}g`,
        color: escaped ? '#fb7185' : '#fbbf24',
        born: now,
      })
    }
    for (const e of enemies) this.lastSeen.set(e.slot, e)
  }

  draw(towers: Tower[], pending: PendingPlacement | null, enemies: EnemyView[], jet: JetOverlay | null): void {
    this.frame++
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
    const sx = (x: number) => toScreen(x, 0)[0]
    const sy = (y: number) => toScreen(0, y)[1]

    const shown = enemies.filter((e) => this.visible(e, towers))
    this.drawBeams(ctx, towers, shown, toScreen)
    for (const t of towers) this.drawTower(ctx, t, toScreen, cellPx, 1)
    if (pending) this.drawTower(ctx, { id: 0, ...pending }, toScreen, cellPx, 0.55)
    // Zap effects live between towers and spores — lightning over rings.
    this.fx = this.fx.filter((f) => drawFx(ctx, f, sx, sy, cellPx))
    this.drawEnemies(ctx, shown, toScreen, cellPx)
    this.notePopups(shown)
    this.drawPopups(ctx, toScreen)
    if (jet) this.drawJet(ctx, jet, toScreen, cellPx)
  }

  private drawPopups(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number]): void {
    const now = performance.now()
    const LIFE = 1100
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]
      const age = (now - p.born) / LIFE
      if (age >= 1) {
        this.popups.splice(i, 1)
        continue
      }
      const [sx, sy] = toScreen(p.x, p.y)
      ctx.save()
      ctx.globalAlpha = 1 - age * age
      ctx.fillStyle = p.color
      ctx.shadowColor = p.color
      ctx.shadowBlur = 8
      ctx.font = '600 13px "SF Mono", ui-monospace, Menlo, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(p.text, sx, sy - 10 - age * 22)
      ctx.restore()
    }
  }

  /** Crisp spore cores over the field glow — the enemy always reads as a THING. */
  private drawEnemies(
    ctx: CanvasRenderingContext2D,
    enemies: EnemyView[],
    toScreen: (x: number, y: number) => [number, number],
    cellPx: number,
  ): void {
    ctx.save()
    for (const e of enemies) {
      const def = SPORES_BY_INDEX[Math.round(e.type)]
      const r = Math.max(1.6, cellPx * 0.9) * (def?.sizeMul ?? 1)
      // Barnacles read deep red and heavy; phantoms (in sonar) ghost grey.
      ctx.fillStyle = def?.invisible ? '#cbd5e1' : def?.sizeMul && def.sizeMul > 1.4 ? '#fecdd3' : '#ffe4f1'
      ctx.shadowColor = def?.invisible ? '#94a3b8' : '#fb7185'
      ctx.shadowBlur = 8
      const [sx, sy] = toScreen(e.x, e.y)
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  /** Damage-field tower → target beams: the kill is visible, not inferred. */
  private drawBeams(
    ctx: CanvasRenderingContext2D,
    towers: Tower[],
    enemies: EnemyView[],
    toScreen: (x: number, y: number) => [number, number],
  ): void {
    ctx.save()
    ctx.lineWidth = 1
    for (const t of towers) {
      const def = TOWER_DEFS[t.type]
      if (!def.damageRate) continue
      const radius = def.radius
      ctx.strokeStyle = def.color
      ctx.shadowColor = def.color
      ctx.shadowBlur = 6
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
  }

  private drawJet(
    ctx: CanvasRenderingContext2D,
    jet: JetOverlay,
    toScreen: (x: number, y: number) => [number, number],
    cellPx: number,
  ): void {
    if (!jet.held && jet.charge >= 1) return
    const [sx, sy] = toScreen(jet.x, jet.y)
    const r = 18 * cellPx
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
    const def = TOWER_DEFS[t.type]
    ctx.save()

    // Range ring, barely-there (skip unlimited-range towers).
    if (def.radius < 200) {
      ctx.strokeStyle = def.color
      ctx.globalAlpha = alpha * 0.16
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(sx, sy, def.radius * cellPx, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (def.sonar) drawSonarRipple(ctx, sx, sy, def.radius * cellPx, this.frame, def.color)

    // The generated sprite, glowing; aimable towers rotate with their thrust.
    // No canvas shadow here: the sprites are opaque glow-on-black, so a
    // shadow would be cast from their square bounds. The art glows itself.
    const img = this.sprite(def.sprite)
    const size = Math.max(26, cellPx * 14)
    ctx.globalAlpha = alpha
    if (img.complete && img.naturalWidth > 0) {
      // Sprites are glow-on-black; 'screen' makes the black vanish into the
      // water so only the luminous device remains.
      ctx.globalCompositeOperation = 'screen'
      ctx.translate(sx, sy)
      if (def.aimable) ctx.rotate(-t.angle)
      ctx.drawImage(img, -size / 2, -size / 2, size, size)
      ctx.globalCompositeOperation = 'source-over'
    } else {
      // Sprite still loading: a ring placeholder.
      ctx.strokeStyle = def.color
      ctx.shadowColor = def.color
      ctx.shadowBlur = 10
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(4, cellPx * 1.8), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }
}
