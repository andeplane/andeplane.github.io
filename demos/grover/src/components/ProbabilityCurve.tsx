import { useState } from 'react'
import { optimalIterations, successProb, theta } from '../sim/analytic'

const W = 720
const H = 300
const PAD_L = 46
const PAD_R = 16
const PAD_T = 18
const PAD_B = 40

export interface ProbabilityCurveProps {
  initialN?: number
  showK?: boolean
  showClassical?: boolean
}

/**
 * Success probability vs iteration count — a pure plot of sin²((2t+1)θ),
 * no simulation involved. The slider lets the reader overshoot t* and
 * watch the probability fall and come back around.
 */
export function ProbabilityCurve({
  initialN = 64,
  showK = false,
  showClassical = true,
}: ProbabilityCurveProps) {
  const [n, setN] = useState(Math.log2(initialN))
  const [k, setK] = useState(1)
  const N = 1 << n
  const kk = Math.min(k, N / 4)
  const th = theta(N, kk)
  const tStar = optimalIterations(N, kk)
  const period = Math.PI / th
  const tMax = Math.max(6, Math.ceil(period * 1.25))
  const [tSel, setTSel] = useState<number | null>(null)
  const t = tSel === null ? tStar : Math.min(tSel, tMax)

  const xOf = (tt: number) => PAD_L + ((W - PAD_L - PAD_R) * tt) / tMax
  const yOf = (p: number) => H - PAD_B - (H - PAD_T - PAD_B) * p

  const samples = 260
  let path = ''
  for (let i = 0; i <= samples; i++) {
    const tt = (tMax * i) / samples
    path += `${i === 0 ? 'M' : 'L'} ${xOf(tt).toFixed(2)} ${yOf(successProb(tt, N, kk)).toFixed(2)} `
  }

  const xTickStep = tMax <= 12 ? 2 : tMax <= 40 ? 5 : tMax <= 120 ? 20 : 50
  const xTicks: number[] = []
  for (let tt = 0; tt <= tMax; tt += xTickStep) xTicks.push(tt)

  const pSel = successProb(t, N, kk)

  return (
    <div>
      <svg
        className="svg-frame"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Success probability versus iterations for N=${N}${showK ? `, k=${kk}` : ''}; optimum at ${tStar} iterations`}
      >
        {/* y grid */}
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yOf(p)}
              y2={yOf(p)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={p === 0 ? undefined : '2 5'}
            />
            <text className="axis-label" x={PAD_L - 8} y={yOf(p) + 4} textAnchor="end">
              {p * 100}%
            </text>
          </g>
        ))}
        {/* x ticks */}
        {xTicks.map((tt) => (
          <text key={tt} className="axis-label" x={xOf(tt)} y={H - PAD_B + 18} textAnchor="middle">
            {tt}
          </text>
        ))}
        <text className="axis-label" x={W - PAD_R} y={H - PAD_B + 34} textAnchor="end">
          iterations t
        </text>

        {/* classical comparison: probability found after t peeks */}
        {showClassical && (
          <>
            <path
              d={`M ${xOf(0)} ${yOf(0)} L ${xOf(Math.min(tMax, N / kk))} ${yOf(Math.min(1, (tMax * kk) / N))}`}
              stroke="var(--text-faint)"
              strokeWidth={1.2}
              strokeDasharray="3 5"
              fill="none"
            />
            <text
              className="axis-label"
              x={xOf(tMax * 0.97)}
              y={yOf(Math.min(1, (tMax * 0.92 * kk) / N)) - 8}
              textAnchor="end"
            >
              classical (t/N)
            </text>
          </>
        )}

        {/* t* marker */}
        <line
          x1={xOf(tStar)}
          x2={xOf(tStar)}
          y1={PAD_T}
          y2={H - PAD_B}
          stroke="var(--amber)"
          strokeWidth={1.2}
          strokeDasharray="6 5"
          opacity={0.7}
        />
        <text
          className="axis-label"
          x={xOf(tStar) + 6}
          y={PAD_T + 12}
          fill="var(--amber)"
        >
          t* = {tStar}
        </text>

        {/* the sine-squared curve */}
        <path d={path} fill="none" stroke="var(--green)" strokeWidth={2} opacity={0.85} />

        {/* integer dots — the only physical points */}
        {Array.from({ length: tMax + 1 }, (_, tt) =>
          tMax <= 60 || tt % 2 === 0 ? (
            <circle
              key={tt}
              cx={xOf(tt)}
              cy={yOf(successProb(tt, N, kk))}
              r={tMax <= 40 ? 3 : 2}
              fill="var(--green)"
              opacity={0.9}
            />
          ) : null,
        )}

        {/* selected t */}
        <circle
          cx={xOf(t)}
          cy={yOf(pSel)}
          r={6.5}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
        />
      </svg>

      <div className="controls">
        <span className="ctl-label">t</span>
        <input
          type="range"
          min={0}
          max={tMax}
          step={1}
          value={t}
          onChange={(e) => setTSel(Number(e.target.value))}
          aria-label="iterations"
        />
        <span className="ctl-value">{t}</span>
        <span className="ctl-label" style={{ marginLeft: 12 }}>
          N
        </span>
        <select
          className="ctl-select"
          value={N}
          onChange={(e) => {
            setN(Math.log2(Number(e.target.value)))
            setTSel(null)
          }}
        >
          {[8, 16, 64, 256, 1024, 4096, 16384].map((s) => (
            <option key={s} value={s}>
              {s.toLocaleString('en-US')}
            </option>
          ))}
        </select>
        {showK && (
          <>
            <span className="ctl-label">k marked</span>
            <select
              className="ctl-select"
              value={kk}
              onChange={(e) => {
                setK(Number(e.target.value))
                setTSel(null)
              }}
            >
              {[1, 2, 4, 8, 16]
                .filter((v) => v <= N / 4)
                .map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
            </select>
          </>
        )}
        <span className="spacer" />
        <span className="readout">
          P(success) <b className="green">{(pSel * 100).toFixed(1)}%</b>
        </span>
      </div>
    </div>
  )
}
