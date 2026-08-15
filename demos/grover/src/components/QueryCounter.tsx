import { useState } from 'react'
import { optimalIterations } from '../sim/analytic'

const W = 720

export interface QueryCounterProps {
  initialN?: number
  /** Compact variant for the opening. */
  hero?: boolean
}

/**
 * Classical vs quantum query counts, as proportional bars. The point is
 * not the numbers — it is watching one bar refuse to grow.
 */
export function QueryCounter({ initialN = 1024, hero = false }: QueryCounterProps) {
  const [n, setN] = useState(Math.log2(initialN))
  const N = 1 << n
  const classical = Math.round(N / 2)
  const quantum = optimalIterations(N)
  const speedup = classical / quantum

  const H = hero ? 130 : 150
  const barMaxW = W - 200
  const rowY = [40, 92]
  const wClassical = barMaxW
  const wQuantum = Math.max(3, (barMaxW * quantum) / classical)

  const fmt = (x: number) => x.toLocaleString('en-US')

  return (
    <div>
      <svg
        className="svg-frame"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`For ${fmt(N)} items: about ${fmt(classical)} classical checks versus ${fmt(quantum)} quantum iterations`}
      >
        <text className="axis-label" x={14} y={rowY[0] - 14}>
          classical · expected checks ≈ N/2
        </text>
        <rect
          x={14}
          y={rowY[0] - 6}
          width={wClassical}
          height={16}
          rx={3}
          fill="var(--text-faint)"
          opacity={0.5}
        />
        <text
          className="axis-label"
          x={14 + wClassical + 10}
          y={rowY[0] + 6}
          fill="var(--text)"
          style={{ fontSize: 13 }}
        >
          {fmt(classical)}
        </text>

        <text className="axis-label" x={14} y={rowY[1] - 14}>
          Grover · iterations ⌊(π/4)√N⌋
        </text>
        <rect
          x={14}
          y={rowY[1] - 6}
          width={wQuantum}
          height={16}
          rx={3}
          fill="var(--accent)"
          style={{ transition: 'width 300ms ease' }}
        />
        <text
          className="axis-label"
          x={14 + wQuantum + 10}
          y={rowY[1] + 6}
          fill="var(--accent)"
          style={{ fontSize: 13 }}
        >
          {fmt(quantum)} — {speedup.toFixed(0)}× fewer
        </text>
      </svg>
      <div className="controls">
        <span className="ctl-label">N</span>
        <input
          type="range"
          min={4}
          max={14}
          step={1}
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
          aria-label="number of items (powers of two)"
        />
        <span className="ctl-value">{fmt(N)} boxes</span>
      </div>
    </div>
  )
}
