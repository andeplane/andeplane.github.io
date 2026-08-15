// Canvas renderer. Board space is Q8 sim units; the view transform maps it
// to the letterboxed canvas. All animation here is cosmetic.

import {
  BALL_HALF,
  BALL_HP,
  BallType,
  BOARD_H,
  BOARD_W,
  FRESH_PAINT_TICKS,
  GRID_H,
  GRID_W,
  Q,
  SLOW_RANGE,
  TowerType,
  Upgrade,
} from '../sim/constants'
import {
  CLAIMED,
  DRAINING,
  OPEN,
  WALL,
  cellX,
  cellY,
  hasUpgrade,
  type GameState,
} from '../sim/state'
import { drainProgress, type Juice } from './juice'
import { ballColor, theme } from './theme'

export interface View {
  scale: number
  ox: number
  oy: number
}

export interface GhostCut {
  cx: number
  cy: number
  orient: 0 | 1
  valid: boolean
  committed: boolean // touch ghost awaiting confirm
}

export interface PrevPos {
  x: number
  y: number
}

export function computeView(canvas: HTMLCanvasElement): View {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  const scale = Math.min(w / (BOARD_W / Q), h / (BOARD_H / Q))
  const ox = (w - (BOARD_W / Q) * scale) / 2
  const oy = (h - (BOARD_H / Q) * scale) / 2
  return { scale, ox, oy }
}

function px(view: View, q: number): number {
  return (q / Q) * view.scale
}

export function boardToCanvas(view: View, qx: number, qy: number): [number, number] {
  return [view.ox + px(view, qx), view.oy + px(view, qy)]
}

export function canvasToBoard(view: View, x: number, y: number): [number, number] {
  return [((x - view.ox) / view.scale) * Q, ((y - view.oy) / view.scale) * Q]
}

export function draw(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  view: View,
  juice: Juice,
  prev: Map<number, PrevPos>,
  alpha: number,
  ghost: GhostCut | null,
  now: number,
): void {
  const dpr = window.devicePixelRatio || 1
  ctx.save()
  ctx.scale(dpr, dpr)

  // Letterbox background.
  ctx.fillStyle = '#04060a'
  ctx.fillRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr)

  // Screen shake.
  if (juice.shake > 0) {
    ctx.translate((Math.random() - 0.5) * juice.shake, (Math.random() - 0.5) * juice.shake)
  }

  const cs = view.scale // pixels per cell

  // --- Board base: the void ---
  ctx.fillStyle = theme.void0
  ctx.fillRect(view.ox, view.oy, px(view, BOARD_W), px(view, BOARD_H))
  // Subtle grid scanlines.
  ctx.strokeStyle = theme.gridLine
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= GRID_W; x += 4) {
    ctx.moveTo(view.ox + x * cs, view.oy)
    ctx.lineTo(view.ox + x * cs, view.oy + GRID_H * cs)
  }
  for (let y = 0; y <= GRID_H; y += 4) {
    ctx.moveTo(view.ox, view.oy + y * cs)
    ctx.lineTo(view.ox + GRID_W * cs, view.oy + y * cs)
  }
  ctx.stroke()

  // --- Cells ---
  const floodDelay = new Map<number, number>()
  for (const f of juice.floods) {
    for (const cell of f.cells) {
      const dx = (cellX(cell) + 0.5) * Q - f.originX
      const dy = (cellY(cell) + 0.5) * Q - f.originY
      const dist = Math.sqrt(dx * dx + dy * dy) / Q
      const t = (now - f.start) / 1000 - dist * 0.03
      floodDelay.set(cell, t)
    }
  }

  for (let c = 0; c < GRID_W * GRID_H; c++) {
    const v = s.grid[c]
    if (v === OPEN) continue
    const x = view.ox + cellX(c) * cs
    const y = view.oy + cellY(c) * cs
    if (v === CLAIMED) {
      const t = floodDelay.get(c)
      let grow = 1
      if (t !== undefined) grow = Math.max(0, Math.min(1, t * 4))
      if (grow <= 0) continue
      const cxm = x + cs / 2
      const cym = y + cs / 2
      const half = (cs / 2) * grow
      // Terraformed land: two-tone parity + soft glow on fresh flood.
      const parity = (cellX(c) + cellY(c)) & 1
      ctx.fillStyle = parity ? theme.claimMain : theme.claimDeep
      ctx.fillRect(cxm - half, cym - half, half * 2, half * 2)
      if (grow < 1) {
        ctx.fillStyle = theme.claimEdge
        ctx.fillRect(cxm - half, cym - half, half * 2, half * 2)
      }
    } else if (v === DRAINING) {
      const p = drainProgress(s, c)
      const pulse = 0.5 + 0.5 * Math.sin(now / 90)
      ctx.fillStyle = theme.drainBase
      ctx.fillRect(x, y, cs, cs)
      // Paint visibly draining: remaining level as a shrinking inner square.
      const level = 1 - p
      ctx.fillStyle = theme.claimMain
      ctx.fillRect(x + (cs * (1 - level)) / 2, y + (cs * (1 - level)) / 2, cs * level, cs * level)
      ctx.strokeStyle = theme.drainWarn
      ctx.globalAlpha = 0.35 + 0.45 * pulse
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2)
      ctx.globalAlpha = 1
    } else if (v === WALL) {
      ctx.fillStyle = theme.wall
      ctx.fillRect(x, y, cs, cs)
      ctx.fillStyle = theme.wallCore
      ctx.fillRect(x + cs * 0.2, y + cs * 0.2, cs * 0.6, cs * 0.25)
      ctx.fillStyle = theme.wallShadow
      ctx.fillRect(x, y + cs * 0.82, cs, cs * 0.18)
      if (hasUpgrade(s, Upgrade.FreshPaint)) {
        const born = s.wallCreatedAt[c]
        if (born >= 0 && s.tick - born < FRESH_PAINT_TICKS) {
          ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now / 150)
          ctx.fillStyle = theme.wallFresh
          ctx.fillRect(x, y, cs, cs)
          ctx.globalAlpha = 1
        }
      }
    }
  }

  // Claimed-edge shoreline glow.
  ctx.strokeStyle = theme.claimEdge
  ctx.lineWidth = Math.max(1, cs * 0.09)
  ctx.beginPath()
  for (let c = 0; c < GRID_W * GRID_H; c++) {
    if (s.grid[c] !== CLAIMED && s.grid[c] !== DRAINING) continue
    const cx0 = cellX(c)
    const cy0 = cellY(c)
    const x = view.ox + cx0 * cs
    const y = view.oy + cy0 * cs
    const openAt = (nx: number, ny: number) =>
      nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && s.grid[ny * GRID_W + nx] === OPEN
    if (openAt(cx0, cy0 - 1)) {
      ctx.moveTo(x, y)
      ctx.lineTo(x + cs, y)
    }
    if (openAt(cx0, cy0 + 1)) {
      ctx.moveTo(x, y + cs)
      ctx.lineTo(x + cs, y + cs)
    }
    if (openAt(cx0 - 1, cy0)) {
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + cs)
    }
    if (openAt(cx0 + 1, cy0)) {
      ctx.moveTo(x + cs, y)
      ctx.lineTo(x + cs, y + cs)
    }
  }
  ctx.stroke()

  // --- Portals (telegraph) ---
  if (s.portals.length > 0 && s.telegraphedWave >= 0) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 130)
    for (const p of s.portals) {
      const x = view.ox + cellX(p) * cs
      const y = view.oy + cellY(p) * cs
      ctx.strokeStyle = theme.portal
      ctx.globalAlpha = 0.4 + 0.6 * pulse
      ctx.lineWidth = 2
      ctx.strokeRect(x - 2, y - 2, cs + 4, cs + 4)
      ctx.globalAlpha = 0.25 * pulse
      ctx.fillStyle = theme.portal
      ctx.fillRect(x, y, cs, cs)
      ctx.globalAlpha = 1
    }
  }

  // --- Towers ---
  for (const t of s.towers) {
    const x = view.ox + (cellX(t.cell) + 0.5) * cs
    const y = view.oy + (cellY(t.cell) + 0.5) * cs
    const powered = s.grid[t.cell] === CLAIMED
    const r = cs * 0.38
    if (t.type === TowerType.Turret) {
      ctx.fillStyle = powered ? theme.turret : theme.towerDead
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6
        const vx2 = x + Math.cos(a) * r
        const vy2 = y + Math.sin(a) * r
        if (i === 0) ctx.moveTo(vx2, vy2)
        else ctx.lineTo(vx2, vy2)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = powered ? theme.wallCore : '#333a44'
      ctx.beginPath()
      ctx.arc(x, y, r * 0.35, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.strokeStyle = powered ? theme.slowTower : theme.towerDead
      ctx.lineWidth = 2
      for (let i = 1; i <= 2 + t.tier; i++) {
        ctx.globalAlpha = powered ? 0.9 - i * 0.2 : 0.4
        ctx.beginPath()
        ctx.arc(x, y, r * (0.4 + i * 0.28), 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      if (powered) {
        ctx.globalAlpha = 0.06 + 0.02 * Math.sin(now / 300)
        ctx.fillStyle = theme.slowTower
        ctx.beginPath()
        ctx.arc(x, y, (SLOW_RANGE[t.tier] / Q) * cs, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
    // Tier pips.
    if (t.tier > 0) {
      ctx.fillStyle = theme.portal
      for (let i = 0; i < t.tier; i++) {
        ctx.fillRect(x - r + i * 5, y + r * 0.85, 3, 3)
      }
    }
  }

  // --- Cuts ---
  for (const c of s.cuts) {
    const lineX = view.ox + (c.cx + 0.5) * cs
    const lineY = view.oy + (c.cy + 0.5) * cs
    ctx.lineWidth = Math.max(2, cs * 0.28)
    ctx.lineCap = 'round'
    for (const which of [0, 1] as const) {
      const half = which === 0 ? c.a : c.b
      if (half.shattered) continue
      const headPx =
        c.orient === 0
          ? ([lineX, view.oy + px(view, half.head)] as const)
          : ([view.ox + px(view, half.head), lineY] as const)
      const anchorPx =
        c.orient === 0
          ? ([lineX, view.oy + (c.cy + 0.5) * cs] as const)
          : ([view.ox + (c.cx + 0.5) * cs, lineY] as const)
      ctx.strokeStyle = half.done ? theme.wall : theme.cutLine
      ctx.globalAlpha = half.done ? 0.0 : 0.9
      if (!half.done) {
        ctx.beginPath()
        ctx.moveTo(anchorPx[0], anchorPx[1])
        ctx.lineTo(headPx[0], headPx[1])
        ctx.stroke()
        // Glowing head.
        ctx.globalAlpha = 1
        ctx.fillStyle = theme.cutHead
        ctx.beginPath()
        ctx.arc(headPx[0], headPx[1], Math.max(3, cs * 0.3), 0, Math.PI * 2)
        ctx.fill()
        // Armor shimmer.
        if (half.armorLeft > 0) {
          ctx.strokeStyle = theme.portal
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(headPx[0], headPx[1], Math.max(5, cs * 0.45), 0, Math.PI * 2)
          ctx.stroke()
          ctx.lineWidth = Math.max(2, cs * 0.28)
        }
      }
      ctx.globalAlpha = 1
    }
  }

  // --- Ghost preview ---
  if (ghost) {
    drawGhost(ctx, s, view, ghost, now)
  }

  // --- Beams ---
  for (const b of juice.beams) {
    const [x1, y1] = boardToCanvas(view, b.x1, b.y1)
    const [x2, y2] = boardToCanvas(view, b.x2, b.y2)
    ctx.strokeStyle = b.kind === 0 ? theme.beam : theme.sparkBeam
    ctx.globalAlpha = Math.max(0, b.life)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // --- Balls (interpolated) ---
  for (const b of s.balls) {
    const p = prev.get(b.id)
    const bx = p ? p.x + (b.x - p.x) * alpha : b.x
    const by = p ? p.y + (b.y - p.y) * alpha : b.y
    const [x, y] = boardToCanvas(view, bx, by)
    const r = ((BALL_HALF / Q) * cs) * (b.type === BallType.Fragment ? 0.6 : 1)
    const col = ballColor[b.type] ?? theme.bouncer
    ctx.fillStyle = col
    if (b.type === BallType.Breaker) {
      // Rotated square, jaw-like.
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 4 + (b.gnawCell >= 0 ? Math.sin(now / 50) * 0.25 : 0))
      ctx.fillRect(-r, -r, r * 2, r * 2)
      ctx.restore()
    } else if (b.type === BallType.Chaser) {
      const a = Math.atan2(b.vy, b.vx)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a)
      ctx.beginPath()
      ctx.moveTo(r * 1.3, 0)
      ctx.lineTo(-r * 0.9, r * 0.9)
      ctx.lineTo(-r * 0.9, -r * 0.9)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      if (b.type === BallType.Splitter) {
        ctx.strokeStyle = '#ffffff55'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x, y, r * 0.55, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    // HP arc for damaged balls.
    const maxHp = BALL_HP[b.type]
    if (b.hp < maxHp) {
      ctx.strokeStyle = '#ffffffaa'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + (b.hp / maxHp) * Math.PI * 2)
      ctx.stroke()
    }
  }

  // --- Particles ---
  for (const p of juice.particles) {
    const [x, y] = boardToCanvas(view, p.x, p.y)
    ctx.globalAlpha = Math.max(0, p.life)
    ctx.fillStyle = p.color
    ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1

  // --- Floaters ---
  for (const f of juice.floaters) {
    const [x, y] = boardToCanvas(view, f.x, f.y)
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6))
    ctx.fillStyle = f.color
    ctx.font = `700 ${Math.max(13, cs * 0.85)}px "Chakra Petch", monospace`
    ctx.textAlign = 'center'
    ctx.fillText(f.text, x, y)
  }
  ctx.globalAlpha = 1

  // --- Wave flash ---
  if (now < juice.waveFlashUntil) {
    const t = (juice.waveFlashUntil - now) / 1600
    ctx.globalAlpha = Math.min(1, t * 2.4)
    ctx.fillStyle = theme.portal
    ctx.font = `700 ${cs * 2.4}px "Chakra Petch", monospace`
    ctx.textAlign = 'center'
    ctx.fillText(juice.waveFlash, view.ox + (GRID_W * cs) / 2, view.oy + GRID_H * cs * 0.24)
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  view: View,
  ghost: GhostCut,
  now: number,
): void {
  const cs = view.scale
  // Compute open span like the sim will.
  const solid = (v: number) => v === WALL || v === CLAIMED
  let lo = ghost.orient === 0 ? ghost.cy : ghost.cx
  let hi = lo
  const max = ghost.orient === 0 ? GRID_H - 1 : GRID_W - 1
  while (lo > 0) {
    const c = ghost.orient === 0 ? (lo - 1) * GRID_W + ghost.cx : ghost.cy * GRID_W + (lo - 1)
    if (solid(s.grid[c])) break
    lo--
  }
  while (hi < max) {
    const c = ghost.orient === 0 ? (hi + 1) * GRID_W + ghost.cx : ghost.cy * GRID_W + (hi + 1)
    if (solid(s.grid[c])) break
    hi++
  }
  ctx.setLineDash([6, 5])
  ctx.lineDashOffset = -(now / 40) % 11
  ctx.strokeStyle = ghost.valid ? theme.ghost : theme.ghostBad
  ctx.lineWidth = Math.max(2, cs * 0.2)
  ctx.beginPath()
  if (ghost.orient === 0) {
    const x = view.ox + (ghost.cx + 0.5) * cs
    ctx.moveTo(x, view.oy + lo * cs)
    ctx.lineTo(x, view.oy + (hi + 1) * cs)
  } else {
    const y = view.oy + (ghost.cy + 0.5) * cs
    ctx.moveTo(view.ox + lo * cs, y)
    ctx.lineTo(view.ox + (hi + 1) * cs, y)
  }
  ctx.stroke()
  ctx.setLineDash([])
  // Anchor diamond.
  const ax = view.ox + (ghost.cx + 0.5) * cs
  const ay = view.oy + (ghost.cy + 0.5) * cs
  ctx.save()
  ctx.translate(ax, ay)
  ctx.rotate(Math.PI / 4)
  const r = ghost.committed ? cs * 0.5 : cs * 0.35
  ctx.fillStyle = ghost.valid ? theme.cutHead : theme.ghostBad
  ctx.fillRect(-r / 2, -r / 2, r, r)
  ctx.restore()

  // Cooldown ring on the ghost anchor (where the player is looking).
  if (s.tick < s.cutCooldownUntil) {
    const total = 150
    const left = s.cutCooldownUntil - s.tick
    const frac = Math.min(1, left / total)
    ctx.strokeStyle = theme.drainWarn
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(ax, ay, cs * 0.8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
    ctx.stroke()
  }
}
