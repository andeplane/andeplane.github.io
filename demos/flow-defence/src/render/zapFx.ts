// Zap effects on the canvas overlay: arc lightning that crawls spore to
// spore, depth-charge splash rings, harpoon tracers, and ambient sonar
// ripples. The effect IS the readability — you should know what a tower does
// by watching it fire. Pure canvas draw code; overlay.ts owns the ctx and
// the cell->pixel mapping.

import type { ZapEvent } from '../engine/zap'

export interface FxInstance {
  event: ZapEvent
  /** Frames left to live (effects are short and hot). */
  ttl: number
  ttl0: number
  /** Per-instance jitter seed so bolts differ. */
  seed: number
}

export function spawnFx(events: readonly ZapEvent[]): FxInstance[] {
  return events.map((event) => {
    const ttl = event.kind === 'mortar' ? 26 : event.kind === 'chain' ? 14 : 12
    return { event, ttl, ttl0: ttl, seed: Math.random() * 1000 }
  })
}

/** Draw + age one effect. Returns false when spent. cx/cy map cells to px. */
export function drawFx(
  ctx: CanvasRenderingContext2D,
  fx: FxInstance,
  cx: (x: number) => number,
  cy: (y: number) => number,
  scale: number,
): boolean {
  const { event } = fx
  const life = fx.ttl / fx.ttl0
  ctx.save()
  if (event.kind === 'chain') drawChain(ctx, fx, cx, cy, life)
  else if (event.kind === 'snipe') drawSnipe(ctx, fx, cx, cy, life)
  else drawMortar(ctx, fx, cx, cy, scale, life)
  ctx.restore()
  fx.ttl--
  return fx.ttl > 0
}

function jitter(seed: number, i: number): number {
  const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
  return (s - Math.floor(s)) - 0.5
}

function drawChain(
  ctx: CanvasRenderingContext2D,
  fx: FxInstance,
  cx: (x: number) => number,
  cy: (y: number) => number,
  life: number,
): void {
  const { event } = fx
  const pts = [
    { x: cx(event.tower.x), y: cy(event.tower.y) },
    ...event.targets.map((t) => ({ x: cx(t.x), y: cy(t.y) })),
  ]
  ctx.globalAlpha = life
  ctx.lineCap = 'round'
  for (const [width, color] of [
    [3.5, 'rgba(233, 213, 255, 0.35)'],
    [1.4, '#f5f0ff'],
  ] as const) {
    ctx.lineWidth = width
    ctx.strokeStyle = color
    ctx.shadowColor = event.color
    ctx.shadowBlur = 12
    ctx.beginPath()
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s]
      const b = pts[s + 1]
      ctx.moveTo(a.x, a.y)
      // Jagged bolt: 4 midpoints displaced perpendicular to the segment.
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      for (let i = 1; i <= 4; i++) {
        const t = i / 5
        const amp = len * 0.14 * jitter(fx.seed + fx.ttl * 3, s * 5 + i)
        ctx.lineTo(a.x + dx * t - (dy / len) * amp, a.y + dy * t + (dx / len) * amp)
      }
      ctx.lineTo(b.x, b.y)
    }
    ctx.stroke()
  }
  // Hit sparks on each target.
  ctx.shadowBlur = 0
  ctx.fillStyle = '#f5f0ff'
  for (const t of event.targets) {
    ctx.beginPath()
    ctx.arc(cx(t.x), cy(t.y), 2.5 * life + 1, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawSnipe(
  ctx: CanvasRenderingContext2D,
  fx: FxInstance,
  cx: (x: number) => number,
  cy: (y: number) => number,
  life: number,
): void {
  const { event } = fx
  const t = event.targets[0]
  ctx.globalAlpha = life
  ctx.lineWidth = 1.6
  ctx.strokeStyle = event.color
  ctx.shadowColor = event.color
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.moveTo(cx(event.tower.x), cy(event.tower.y))
  ctx.lineTo(cx(t.x), cy(t.y))
  ctx.stroke()
  ctx.fillStyle = '#fff1f2'
  ctx.beginPath()
  ctx.arc(cx(t.x), cy(t.y), 3 * life + 0.5, 0, Math.PI * 2)
  ctx.fill()
}

function drawMortar(
  ctx: CanvasRenderingContext2D,
  fx: FxInstance,
  cx: (x: number) => number,
  cy: (y: number) => number,
  scale: number,
  life: number,
): void {
  const { event } = fx
  const t = event.targets[0]
  const r = event.blast * scale
  // Expanding blast ring + hot core that cools.
  const grow = 1 - life
  ctx.globalAlpha = life * 0.9
  ctx.lineWidth = 2.5 * life + 0.5
  ctx.strokeStyle = event.color
  ctx.shadowColor = event.color
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.arc(cx(t.x), cy(t.y), r * (0.35 + 0.75 * grow), 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = life * 0.5
  ctx.fillStyle = '#fff7ed'
  ctx.beginPath()
  ctx.arc(cx(t.x), cy(t.y), r * 0.3 * life, 0, Math.PI * 2)
  ctx.fill()
}

/** Ambient sonar ripple: rings pulsing outward from a sonar tower. */
export function drawSonarRipple(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusPx: number,
  tick: number,
  color: string,
): void {
  ctx.save()
  const phase = (tick % 120) / 120
  for (const p of [phase, (phase + 0.5) % 1]) {
    ctx.globalAlpha = 0.28 * (1 - p)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(x, y, radiusPx * p, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}
