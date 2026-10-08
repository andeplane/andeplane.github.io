import { useMemo, useState } from 'react'
import { opCount, qubitsOf, type Block, type ShorCircuit } from '@andeplane/quantum'
import { layout, rowsFor, LEFT, type Layout, type Placed } from '../lab/layout.ts'
import { explainBlock } from '../lab/explain.ts'

const ROW = 26
const TOP = 18

interface Props {
  shor: ShorCircuit
  /** Top-level steps completed. */
  step: number
  busy: { step: number; progress: number } | null
}

/**
 * The circuit, one level of the tree at a time. At the top, each step is a
 * box; click one to open it, and keep going down to single phase gates.
 */
export function CircuitView({ shor, step, busy }: Props) {
  const [path, setPath] = useState<Block[]>([])
  const [hover, setHover] = useState<Block | null>(null)
  const view = path.length ? path[path.length - 1] : shor.circuit.root
  const atRoot = path.length === 0

  const lay = useMemo<Layout>(() => {
    const rows = rowsFor(shor.circuit.registers, atRoot ? undefined : qubitsOf(view))
    return layout(view, rows, (b) => atRoot && b.name === 'Prepare')
  }, [shor, view, atRoot])

  // Opening a block only makes sense for the circuit it came from.
  const [owner, setOwner] = useState(shor)
  if (owner !== shor) {
    setOwner(shor)
    setPath([])
    setHover(null)
  }

  const height = TOP * 2 + lay.rows.length * ROW
  const y = (r: number) => TOP + r * ROW + ROW / 2
  const focus = hover ?? (atRoot ? null : view)

  const stateOf = (p: Placed): 'done' | 'running' | 'todo' | 'plain' => {
    if (!atRoot) return 'plain'
    if (busy && busy.step === p.child) return 'running'
    return p.child < step ? 'done' : 'todo'
  }

  return (
    <div className="circuit">
      <nav className="crumbs" aria-label="Circuit level">
        <button type="button" className={atRoot ? 'here' : ''} onClick={() => setPath([])}>
          Shor({shor.N}, a = {shor.a})
        </button>
        {path.map((b, i) => (
          <span key={i}>
            <span className="sep">›</span>
            <button type="button" className={i === path.length - 1 ? 'here' : ''} onClick={() => setPath(path.slice(0, i + 1))}>
              {b.name}
            </button>
          </span>
        ))}
        <span className="count">{opCount(view).toLocaleString()} gates inside</span>
      </nav>

      <div className="circuit-scroll">
        <svg width={lay.width} height={height} role="img" aria-label={`Circuit diagram of ${view.name}`}>
          {registerBands(lay, y)}
          {lay.rows.map((r, i) => (
            <g key={r.qubit}>
              <text x={LEFT - 8} y={y(i) + 4} className="wire-label" textAnchor="end">{r.label}</text>
              <line x1={LEFT} x2={lay.width - 4} y1={y(i)} y2={y(i)} className="wire" />
            </g>
          ))}
          {lay.items.map((p, i) => (
            <GlyphView
              key={i}
              p={p}
              y={y}
              state={stateOf(p)}
              progress={busy && busy.step === p.child ? busy.progress : 0}
              onOpen={(b) => { setPath([...path, b]); setHover(null) }}
              onHover={setHover}
            />
          ))}
        </svg>
      </div>

      <p className="explain">
        {focus ? (
          <><strong>{focus.name}.</strong> {explainBlock(focus, shor.N)}</>
        ) : (
          <>Each box is a step of the algorithm; the dot marks the counting qubit that controls it. Click a box to open it, and keep opening until you reach single gates.</>
        )}
      </p>
    </div>
  )
}

function registerBands(lay: Layout, y: (r: number) => number) {
  const bands: { name: string; lo: number; hi: number }[] = []
  lay.rows.forEach((r, i) => {
    const last = bands[bands.length - 1]
    if (last && last.name === r.register) last.hi = i
    else bands.push({ name: r.register, lo: i, hi: i })
  })
  return bands.map((b) => (
    <rect
      key={b.name}
      x={4}
      width={lay.width - 8}
      y={y(b.lo) - ROW / 2 + 2}
      height={(b.hi - b.lo + 1) * ROW - 4}
      rx={6}
      className={`band band-${b.name}`}
    />
  ))
}

interface GlyphProps {
  p: Placed
  y: (r: number) => number
  state: 'done' | 'running' | 'todo' | 'plain'
  progress: number
  onOpen: (b: Block) => void
  onHover: (b: Block | null) => void
}

function GlyphView({ p, y, state, progress, onOpen, onHover }: GlyphProps) {
  const g = p.glyph
  const cls = `glyph glyph-${state}`
  const x = p.x
  const controlLine = (rows: number[], from: number[]) => {
    if (!rows.length) return null
    const all = [...rows, ...from]
    return <line x1={x} x2={x} y1={y(Math.min(...all))} y2={y(Math.max(...all))} className="ctl-line" />
  }
  const dots = (rows: number[]) => rows.map((r) => <circle key={r} cx={x} cy={y(r)} r={4} className="ctl-dot" />)

  switch (g.type) {
    case 'gate': {
      if (g.cnot) {
        return (
          <g className={cls}>
            {controlLine(g.controls, [g.target])}
            {dots(g.controls)}
            <circle cx={x} cy={y(g.target)} r={9} className="oplus" />
            <line x1={x - 9} x2={x + 9} y1={y(g.target)} y2={y(g.target)} className="oplus-mark" />
            <line x1={x} x2={x} y1={y(g.target) - 9} y2={y(g.target) + 9} className="oplus-mark" />
          </g>
        )
      }
      const w = p.w
      return (
        <g className={`${cls} gate-${g.label === 'P' ? 'phase' : g.label === 'H' ? 'h' : 'x'}`}>
          {controlLine(g.controls, [g.target])}
          {dots(g.controls)}
          <rect x={x - w / 2} y={y(g.target) - 10} width={w} height={20} rx={4} className="gate-box" />
          <text x={x} y={y(g.target) + (g.sub ? 0 : 4)} textAnchor="middle" className="gate-label">{g.label}</text>
          {g.sub && <text x={x} y={y(g.target) + 8} textAnchor="middle" className="gate-sub">{g.sub}</text>}
          <title>{g.sub ? `${g.label}(${g.sub})` : g.label}</title>
        </g>
      )
    }
    case 'swap': {
      const s = 5
      const cross = (r: number) => (
        <g key={r}>
          <line x1={x - s} x2={x + s} y1={y(r) - s} y2={y(r) + s} className="swap-mark" />
          <line x1={x - s} x2={x + s} y1={y(r) + s} y2={y(r) - s} className="swap-mark" />
        </g>
      )
      return (
        <g className={cls}>
          <line x1={x} x2={x} y1={y(Math.min(g.a, g.b, ...g.controls))} y2={y(Math.max(g.a, g.b, ...g.controls))} className="ctl-line" />
          {dots(g.controls)}
          {cross(g.a)}
          {cross(g.b)}
        </g>
      )
    }
    case 'box': {
      const top = y(g.lo) - 11
      const bottom = y(g.hi) + 11
      const w = p.w
      const block = g.block
      const openable = block && block.children.length > 0
      return (
        <g
          className={`${cls} box ${openable ? 'openable' : ''}`}
          onClick={openable ? () => onOpen(block) : undefined}
          onMouseEnter={block ? () => onHover(block) : undefined}
          onMouseLeave={block ? () => onHover(null) : undefined}
          role={openable ? 'button' : undefined}
          tabIndex={openable ? 0 : undefined}
          onKeyDown={openable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(block) } } : undefined}
        >
          {controlLine(g.controls, [g.lo, g.hi])}
          {dots(g.controls)}
          <rect x={x - w / 2} y={top} width={w} height={bottom - top} rx={6} className="box-rect" />
          {state === 'running' && (
            <rect x={x - w / 2} y={bottom - 3} width={w * progress} height={3} className="box-progress" />
          )}
          <text
            x={x}
            y={(top + bottom) / 2 + 4}
            textAnchor="middle"
            className="box-label"
            transform={bottom - top > w * 1.6 && g.label.length > 6 ? `rotate(-90 ${x} ${(top + bottom) / 2})` : undefined}
          >
            {g.label}
          </text>
        </g>
      )
    }
    case 'measure':
      return (
        <g className={cls}>
          <rect x={x - 11} y={y(g.row) - 10} width={22} height={20} rx={4} className="gate-box" />
          <path d={`M ${x - 7} ${y(g.row) + 5} A 7 7 0 0 1 ${x + 7} ${y(g.row) + 5}`} className="meter" />
          <line x1={x} x2={x + 5} y1={y(g.row) + 5} y2={y(g.row) - 5} className="meter" />
        </g>
      )
  }
}
