import { useMemo, useState } from 'react'
import { applyH, applyMCZ, applyX, zeroState } from '../sim/statevector'
import { AmplitudeBars } from './AmplitudeBars'
import { useAnimatedVector } from '../hooks/useAnimatedVector'

const N_QUBITS = 3
const DIM = 8

// One iteration after the prepare column: oracle (X-wrap, CCZ, X-wrap),
// then diffusion (H, X, CCZ, X, H). 8 columns per iteration.
type Column =
  | { kind: 'H' | 'X'; wires: number[]; group: 'prepare' | 'oracle' | 'diffusion' }
  | { kind: 'CCZ'; group: 'oracle' | 'diffusion' }

function buildColumns(m: number): Column[] {
  const zeros: number[] = []
  for (let q = 0; q < N_QUBITS; q++) if (!(m & (1 << q))) zeros.push(q)
  const all = [0, 1, 2]
  return [
    { kind: 'H', wires: all, group: 'prepare' },
    { kind: 'X', wires: zeros, group: 'oracle' },
    { kind: 'CCZ', group: 'oracle' },
    { kind: 'X', wires: zeros, group: 'oracle' },
    { kind: 'H', wires: all, group: 'diffusion' },
    { kind: 'X', wires: all, group: 'diffusion' },
    { kind: 'CCZ', group: 'diffusion' },
    { kind: 'X', wires: all, group: 'diffusion' },
    { kind: 'H', wires: all, group: 'diffusion' },
  ]
}

/** Replay: apply the first `steps` columns (iterating past the end wraps
 *  back through the oracle+diffusion block) and return the amplitudes. */
function replay(m: number, steps: number): { amps: Float64Array; norm: number } {
  const cols = buildColumns(m)
  const s = zeroState(N_QUBITS)
  for (let i = 0; i < steps; i++) {
    const col = cols[i === 0 ? 0 : ((i - 1) % 8) + 1]
    if (col.kind === 'CCZ') applyMCZ(s)
    else if (col.kind === 'H') for (const q of col.wires) applyH(s, q)
    else for (const q of col.wires) applyX(s, q)
  }
  let normSq = 0
  for (let i = 0; i < DIM; i++) normSq += s.re[i] * s.re[i] + s.im[i] * s.im[i]
  return { amps: s.re.slice(), norm: Math.sqrt(normSq) }
}

const W = 720
const CH = 190
const WIRE_Y = [48, 96, 144]
const COL_X0 = 108
const COL_DX = 64
const BOX = 32

export function CircuitView() {
  const [m, setM] = useState(5)
  const [step, setStep] = useState(0) // total columns applied
  const cols = useMemo(() => buildColumns(m), [m])

  const { amps, norm } = useMemo(() => replay(m, step), [m, step])
  const { values, animating } = useAnimatedVector(amps, 450)

  // Where the playhead sits among the 9 displayed columns: prepare shows
  // once, then steps 2..9, 10..17, … cycle through columns 2..9.
  const displayed = step <= 1 ? step : ((step - 2) % 8) + 2
  const iteration = step === 0 ? 0 : Math.floor((step - 1) / 8)
  const playX = displayed === 0 ? COL_X0 - COL_DX / 2 : COL_X0 + (displayed - 1) * COL_DX + BOX / 2 + 14

  const groupSpan = (g: Column['group']) => {
    const idx = cols.map((c, i) => (c.group === g ? i : -1)).filter((i) => i >= 0)
    return [COL_X0 + idx[0] * COL_DX - 22, COL_X0 + idx[idx.length - 1] * COL_DX + 22]
  }

  const bits = (x: number) => x.toString(2).padStart(3, '0')

  return (
    <div>
      <svg
        className="svg-frame"
        viewBox={`0 0 ${W} ${CH + 26}`}
        role="img"
        aria-label={`Grover circuit on three qubits, marked item ${m}, ${step} columns applied`}
      >
        {/* group labels */}
        {(['prepare', 'oracle', 'diffusion'] as const).map((gname) => {
          const [x0, x1] = groupSpan(gname)
          return (
            <g key={gname}>
              <line x1={x0} x2={x1} y1={16} y2={16} stroke="var(--border-strong)" strokeWidth={1} />
              <text className="axis-label" x={(x0 + x1) / 2} y={10} textAnchor="middle">
                {gname}
              </text>
            </g>
          )
        })}

        {/* wires */}
        {WIRE_Y.map((y, q) => (
          <g key={q}>
            <text className="axis-label" x={26} y={y + 4}>
              q{q} |0⟩
            </text>
            <line x1={70} x2={W - 24} y1={y} y2={y} stroke="var(--border-strong)" strokeWidth={1.2} />
          </g>
        ))}

        {/* gates */}
        {cols.map((col, ci) => {
          const x = COL_X0 + ci * COL_DX
          const applied = displayed >= ci + 1
          const opacity = applied ? 1 : 0.38
          if (col.kind === 'CCZ') {
            return (
              <g key={ci} opacity={opacity}>
                <line x1={x} x2={x} y1={WIRE_Y[0]} y2={WIRE_Y[2]} stroke="var(--amber)" strokeWidth={1.6} />
                {WIRE_Y.map((y, q) => (
                  <circle key={q} cx={x} cy={y} r={5} fill="var(--amber)" />
                ))}
                <text className="axis-label" x={x + 9} y={WIRE_Y[2] + 4} fill="var(--amber)">
                  Z
                </text>
              </g>
            )
          }
          return (
            <g key={ci} opacity={opacity}>
              {WIRE_Y.map((y, q) => {
                const active = col.wires.includes(q)
                if (!active && col.group === 'oracle' && col.kind === 'X') {
                  // the empty slot: this is where the answer is wired in
                  return (
                    <text key={q} className="axis-label" x={x} y={y + 4} textAnchor="middle" opacity={0.5}>
                      ·
                    </text>
                  )
                }
                if (!active) return null
                return (
                  <g key={q}>
                    <rect
                      x={x - BOX / 2}
                      y={y - BOX / 2}
                      width={BOX}
                      height={BOX}
                      rx={5}
                      fill="var(--surface-2)"
                      stroke={col.kind === 'H' ? 'var(--accent)' : 'var(--text-faint)'}
                      strokeWidth={1.4}
                    />
                    <text
                      x={x}
                      y={y + 5}
                      textAnchor="middle"
                      fill="var(--text)"
                      style={{ fontFamily: 'var(--mono)', fontSize: 15 }}
                    >
                      {col.kind}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* playhead */}
        <line
          x1={playX}
          x2={playX}
          y1={26}
          y2={CH - 14}
          stroke="var(--accent)"
          strokeWidth={1.6}
          strokeDasharray="4 4"
          style={{ transition: 'all 260ms ease' }}
        />
      </svg>

      <AmplitudeBars
        amps={values}
        marked={useMemo(() => new Set([m]), [m])}
        height={210}
        ariaLabel={`Amplitudes after ${step} circuit columns`}
      />

      <div className="controls">
        <button className="ctl" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={animating || step === 0}>
          ‹ Prev
        </button>
        <button className="ctl primary" onClick={() => setStep((s) => s + 1)} disabled={animating}>
          Next gate ›
        </button>
        <button
          className="ctl amber"
          onClick={() => setStep((s) => (s === 0 ? 9 : s + 8 - ((s - 1) % 8)))}
          disabled={animating}
        >
          Run iteration
        </button>
        <button className="ctl" onClick={() => setStep(0)} disabled={animating || step === 0}>
          Reset
        </button>
        <span className="ctl-label">marked</span>
        <select
          className="ctl-select"
          value={m}
          disabled={animating}
          onChange={(e) => {
            setM(Number(e.target.value))
            setStep(0)
          }}
        >
          {Array.from({ length: DIM }, (_, i) => (
            <option key={i} value={i}>
              {i} = |{bits(i)}⟩
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="readout">
          iter <b>{iteration}</b>
          {'  '}‖ψ‖ <b className="green">{norm.toFixed(12)}</b>
        </span>
      </div>
    </div>
  )
}
