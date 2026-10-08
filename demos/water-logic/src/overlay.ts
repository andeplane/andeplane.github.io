// The schematic layer drawn over the fluid: pipes that carry each gate's
// answer to the next gate, lamps for the sum bits, and engraved labels.
// Everything is in board (lattice cell) coordinates, scaled to the canvas.

import { BITS, type Board, gateAt } from './sim/board.ts'
import { TILE_H as TH } from './sim/geometry.ts'
import type { Adder } from './sim/logic.ts'

type Pt = [number, number]

export interface Pipe {
  path: Pt[]
  colour: string
  on: () => boolean
  /** Draw only the casing (supply that is always on, etc.). */
  kind?: 'signal' | 'supply' | 'stub'
}

export interface Lamp {
  x: number
  y: number
  label: string
  sub: string
  on: () => boolean
  pending: () => boolean
}

export interface Label {
  x: number
  y: number
  text: string
  size: number
  colour: string
  align?: CanvasTextAlign
}

const C0 = '#38dbff'
const C1 = '#ffa838'
const C2 = '#a899ff'
const C3 = '#ff5c9e'
const GOLD = '#ffe2a0'

export function buildSchematic(board: Board, adder: Adder) {
  const pipes: Pipe[] = []
  const lamps: Lamp[] = []
  const labels: Label[] = []
  const noz = (role: 'ha1' | 'ha2' | 'or', bit: number, k: number) => board.nozzles[gateAt(board, role, bit).nozzleBase + k]
  for (let i = 0; i < BITS; i++) {
    const h1 = gateAt(board, 'ha1', i)
    const h2 = gateAt(board, 'ha2', i)
    const or = gateAt(board, 'or', i)
    const X = h1.ox
    const o = h1.spec.outX
    const yb1 = h1.oy + TH - 2
    const yb2 = h2.oy + TH - 2
    const yb3 = or.oy + TH - 2
    const L2 = noz('ha2', i, 0)
    const R2 = noz('ha2', i, 1)
    const P = noz('or', i, 0)
    const K1 = noz('or', i, 1)
    const K2 = noz('or', i, 2)
    const run = (role: 'ha1' | 'ha2' | 'or') => () => adder.out(role, i)

    // partial sum s1: both side channels merge (a passive OR) and feed HA2's left nozzle
    const s1 = () => run('ha1')().s
    pipes.push({ path: [[X + o.left, yb1], [X + o.left, yb1 + 9], [X + o.right, yb1 + 9], [X + o.right, yb1]], colour: C0, on: s1 })
    pipes.push({ path: [[L2.ax, yb1 + 9], [L2.ax, L2.ay]], colour: C0, on: s1 })
    // first carry c1 → OR control 1, down the right-hand gutter
    pipes.push({
      path: [[X + o.centre, yb1], [X + o.centre, yb1 + 21], [X + 104, yb1 + 21], [X + 104, yb2 + 21], [K1.ax, yb2 + 21], [K1.ax, K1.ay]],
      colour: C3,
      on: () => run('ha1')().c,
    })
    // second carry c2 → OR control 2
    pipes.push({
      path: [[X + o.centre, yb2], [X + o.centre, yb2 + 12], [K2.ax, yb2 + 12], [K2.ax, K2.ay]],
      colour: C3,
      on: () => run('ha2')().c,
    })
    // sum bit: both side channels of HA2 → down the left gutter → lamp
    const sum = () => run('ha2')().s
    const lampY = board.h - 17
    pipes.push({ path: [[X + o.left, yb2], [X + o.left, yb2 + 6], [X + o.right, yb2 + 6], [X + o.right, yb2]], colour: GOLD, on: sum })
    pipes.push({ path: [[X + o.left, yb2 + 6], [X - 7, yb2 + 6], [X - 7, lampY], [X + o.centre - 9, lampY]], colour: GOLD, on: sum })
    lamps.push({
      x: X + o.centre,
      y: lampY,
      label: `S${i}`,
      sub: `${1 << i}`,
      on: sum,
      pending: () => adder.run('ha2', i).phase !== 'valid',
    })
    // carry out: OR channel (left + centre outputs merged) → next bit's HA2 right nozzle
    const cout = () => run('or')().s
    const bus: Pt[] = [[X + o.centre, yb3], [X + o.centre, yb3 + 8], [X + o.left, yb3 + 8]]
    pipes.push({ path: [[X + o.left, yb3], ...bus.slice(2)], colour: C1, on: cout })
    if (i < BITS - 1) {
      const R2n = noz('ha2', i + 1, 1)
      pipes.push({
        path: [...bus, [X - 16, yb3 + 8], [X - 16, h2.oy - 13], [R2n.ax, h2.oy - 13], [R2n.ax, R2n.ay]],
        colour: C1,
        on: cout,
      })
    } else {
      pipes.push({ path: [...bus, [X - 16, yb3 + 8], [X - 16, lampY]], colour: GOLD, on: cout })
      lamps.push({
        x: X - 16,
        y: lampY,
        label: 'C4',
        sub: '16',
        on: cout,
        pending: () => adder.run('or', i).phase !== 'valid',
      })
    }
    if (i === 0) {
      pipes.push({ path: [[board.w - 4, h2.oy - 13], [R2.ax, h2.oy - 13], [R2.ax, R2.ay]], colour: C1, on: () => adder.carryIn, kind: 'stub' })
      labels.push({ x: board.w - 6, y: h2.oy - 17, text: 'carry in 0', size: 6, colour: '#7c8aa0', align: 'right' })
    }
    // power supply to the OR element's wall-hugging jet
    pipes.push({ path: [[P.ax, or.oy - 6], [P.ax, P.ay]], colour: C2, on: () => true, kind: 'supply' })
    // input feeds from the valves
    const A = noz('ha1', i, 0)
    const B = noz('ha1', i, 1)
    pipes.push({ path: [[A.ax, h1.oy - 20], [A.ax, A.ay]], colour: C0, on: () => ((adder.a >> i) & 1) === 1 })
    pipes.push({ path: [[B.ax, h1.oy - 20], [B.ax, B.ay]], colour: C1, on: () => ((adder.b >> i) & 1) === 1 })

    const tag = (g: typeof h1, a: string, b: string) => {
      labels.push({ x: g.ox + 4, y: g.oy + 17, text: a, size: 5, colour: '#8fa0b8' })
      labels.push({ x: g.ox + 4, y: g.oy + 24, text: b, size: 4.2, colour: '#5d6a7c' })
    }
    tag(h1, 'HALF', 'ADDER')
    tag(h2, 'HALF', 'ADDER')
    tag(or, 'OR', 'COANDĂ')
    labels.push({ x: X + o.centre, y: 8, text: `bit ${i} · ${1 << i}`, size: 6, colour: '#d6b26e', align: 'center' })
  }
  return { pipes, lamps, labels }
}

export class Overlay {
  private readonly ctx: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement
  private readonly board: Board
  private readonly adder: Adder
  private readonly sch: ReturnType<typeof buildSchematic>
  constructor(canvas: HTMLCanvasElement, board: Board, adder: Adder, sch: ReturnType<typeof buildSchematic>) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.board = board
    this.adder = adder
    this.sch = sch
  }

  draw(time: number): void {
    const { ctx, canvas, board } = this
    const s = canvas.width / board.w
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(s, 0, 0, s, 0, 0)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (const p of this.sch.pipes) this.pipe(p, time)
    for (const l of this.sch.lamps) this.lamp(l, time)
    for (const t of this.sch.labels) {
      ctx.font = `500 ${t.size}px "IBM Plex Mono", monospace`
      ctx.textAlign = t.align ?? 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = t.colour
      ctx.fillText(t.text, t.x, t.y)
    }
    this.gateBadges(time)
  }

  private trace(path: Pt[]): void {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(path[0][0], path[0][1])
    for (let k = 1; k < path.length; k++) ctx.lineTo(path[k][0], path[k][1])
  }

  private pipe(p: Pipe, time: number): void {
    const ctx = this.ctx
    const on = p.on()
    // casing: dark tube that also visually "bridges" pipes drawn earlier
    this.trace(p.path)
    ctx.strokeStyle = '#03060b'
    ctx.lineWidth = 5.2
    ctx.setLineDash([])
    ctx.stroke()
    this.trace(p.path)
    ctx.strokeStyle = 'rgba(150,175,205,0.30)'
    ctx.lineWidth = 3.4
    ctx.stroke()
    this.trace(p.path)
    ctx.strokeStyle = '#0a1018'
    ctx.lineWidth = 2.2
    ctx.stroke()
    if (!on) return
    ctx.save()
    ctx.shadowColor = p.colour
    ctx.shadowBlur = 8 * (this.canvas.width / this.board.w)
    this.trace(p.path)
    ctx.strokeStyle = p.colour
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
    // water moving along the pipe
    this.trace(p.path)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 0.9
    ctx.setLineDash([2.5, 7])
    ctx.lineDashOffset = -time * 0.03
    ctx.stroke()
    ctx.setLineDash([])
  }

  private lamp(l: Lamp, time: number): void {
    const ctx = this.ctx
    const on = l.on()
    const pending = l.pending()
    ctx.beginPath()
    ctx.arc(l.x, l.y, 9, 0, Math.PI * 2)
    ctx.fillStyle = '#05080e'
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = pending ? `rgba(214,178,110,${0.4 + 0.4 * Math.sin(time * 0.006)})` : 'rgba(170,190,215,0.45)'
    ctx.stroke()
    if (on) {
      ctx.save()
      ctx.shadowColor = GOLD
      ctx.shadowBlur = 14 * (this.canvas.width / this.board.w)
      ctx.beginPath()
      ctx.arc(l.x, l.y, 6.5, 0, Math.PI * 2)
      const g = ctx.createRadialGradient(l.x, l.y - 2, 0, l.x, l.y, 7)
      g.addColorStop(0, '#fffaf0')
      g.addColorStop(1, '#ffc95c')
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
    }
    ctx.font = `600 6.5px "IBM Plex Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = on ? '#1a1204' : '#8fa0b8'
    ctx.fillText(on ? '1' : '0', l.x, l.y + 0.3)
    ctx.font = `500 5px "IBM Plex Mono", monospace`
    ctx.fillStyle = '#8fa0b8'
    ctx.textAlign = 'left'
    ctx.fillText(l.label, l.x + 11, l.y - 3)
    ctx.fillStyle = '#5d6a7c'
    ctx.fillText(l.sub, l.x + 11, l.y + 4)
  }

  /** Small status tag in each tile's top-right corner: purging / settling. */
  private gateBadges(time: number): void {
    const ctx = this.ctx
    this.board.gates.forEach((g, gi) => {
      const run = this.adder.runs[gi]
      if (run.phase === 'valid') return
      const x = g.ox + g.spec.w - 3
      const y = g.oy + 36
      const text = run.phase === 'flush' ? 'PURGE' : 'SETTLING'
      ctx.font = `600 5px "IBM Plex Mono", monospace`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      const a = 0.55 + 0.45 * Math.sin(time * 0.008)
      ctx.fillStyle = run.phase === 'flush' ? `rgba(168,153,255,${a})` : `rgba(214,178,110,${a})`
      ctx.fillText(text, x, y)
    })
  }
}
