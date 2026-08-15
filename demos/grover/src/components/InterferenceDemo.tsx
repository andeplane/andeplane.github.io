import { useMemo, useState } from 'react'
import { useAnimatedVector } from '../hooks/useAnimatedVector'

const W = 720
const H = 230
const PAD_T = 16
const PAD_B = 44
const y0 = PAD_T + (H - PAD_T - PAD_B) / 2
const scale = (H - PAD_T - PAD_B) / 2

/**
 * Two ways to reach the same box, and their sum. One toggle flips the
 * second path's sign: constructive interference becomes destructive.
 * This — not "trying everything at once" — is the resource Grover spends.
 */
export function InterferenceDemo() {
  const [flipped, setFlipped] = useState(false)
  const a = 0.5
  const b = flipped ? -0.5 : 0.5
  const target = useMemo(() => Float64Array.of(a, b, a + b), [a, b])
  const { values, animating } = useAnimatedVector(target, 550)

  const cols = [
    { x: 120, v: values[0], label: 'path one', color: 'var(--text-faint)' },
    { x: 320, v: values[1], label: 'path two', color: 'var(--text-faint)' },
    { x: 560, v: values[2], label: 'sum — what actually happens', color: 'var(--accent)' },
  ]
  const barW = 52
  const pSum = values[2] ** 2

  return (
    <div>
      <svg
        className="svg-frame"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Two amplitudes and their sum, showing constructive or destructive interference"
      >
        <line x1={30} x2={W - 20} y1={y0} y2={y0} stroke="var(--border)" strokeWidth={1.4} />
        {cols.map((c) => {
          const yTop = Math.min(y0, y0 - c.v * scale)
          const h = Math.max(Math.abs(c.v * scale), 1.5)
          return (
            <g key={c.label}>
              <rect
                x={c.x - barW / 2}
                y={yTop}
                width={barW}
                height={h}
                rx={2}
                fill={c.color}
                opacity={c.color === 'var(--accent)' ? 0.95 : 0.55}
              />
              <text className="axis-label" x={c.x} y={H - 22} textAnchor="middle">
                {c.label}
              </text>
              <text className="axis-label" x={c.x} y={H - 6} textAnchor="middle" fill="var(--text-dim)">
                {c.v >= 0 ? '+' : '−'}
                {Math.abs(c.v).toFixed(2)}
              </text>
            </g>
          )
        })}
        <text className="axis-label" x={432} y={y0 + 4}>
          =
        </text>
        <text className="axis-label" x={218} y={y0 + 4}>
          +
        </text>
      </svg>
      <div className="controls">
        <button className="ctl amber" onClick={() => setFlipped((f) => !f)} disabled={animating}>
          {flipped ? 'unflip the sign' : 'flip one sign'}
        </button>
        <span className="spacer" />
        <span className="readout">
          P(this box) = (sum)² <b className="green">{(pSum * 100).toFixed(0)}%</b>
          {'  '}
          <span className={flipped ? 'amber' : ''}>
            {flipped ? 'destructive' : 'constructive'}
          </span>
        </span>
      </div>
    </div>
  )
}
