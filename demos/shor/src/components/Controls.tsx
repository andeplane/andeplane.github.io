import { useEffect, useState } from 'react'
import type { Lab } from '../lab/useLab.ts'
import { formatBytes, plan } from '../lab/numbers.ts'

const PRESETS = [15, 21, 33, 35, 39, 51, 55, 57, 65, 77, 91, 143, 221]
const MAX_CHIPS = 28

export function Controls({ lab }: { lab: Lab }) {
  const { config, update, rejection, baseList, tMax, shor, totalOps, engine } = lab
  const [nText, setNText] = useState(String(config.N))
  useEffect(() => setNText(String(config.N)), [config.N])
  const p = plan(config.N, config.t, config.arithmetic)
  const maxQubits = engine.kind === 'probing' ? 0 : engine.maxQubits
  const tooBig = !rejection && tMax < 1

  return (
    <section className="panel controls" aria-label="Configuration">
      <div className="field">
        <label htmlFor="n-input">Number to factor, N</label>
        <div className="chips">
          {PRESETS.map((N) => (
            <button key={N} type="button" className={N === config.N ? 'chip on' : 'chip'} onClick={() => update({ N })}>{N}</button>
          ))}
          <input
            id="n-input"
            className="num"
            inputMode="numeric"
            value={nText}
            onChange={(e) => setNText(e.target.value)}
            onBlur={() => { const N = parseInt(nText, 10); if (N) update({ N }) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { const N = parseInt(nText, 10); if (N) update({ N }) } }}
            aria-label="Custom N"
          />
        </div>
        {rejection && <p className="warn">{rejection}</p>}
        {tooBig && <p className="warn">{config.N} needs more qubits than this device can hold with gate-level arithmetic. Try the black-box arithmetic, or a smaller N.</p>}
      </div>

      {!rejection && baseList.length > 0 && (
        <div className="field">
          <label htmlFor="a-input">Random base, a</label>
          {baseList.length <= MAX_CHIPS ? (
            <div className="chips">
              {baseList.map((b) => (
                <button key={b.a} type="button" className={b.a === config.a ? 'chip on' : 'chip'} onClick={() => update({ a: b.a })}>{b.a}</button>
              ))}
            </div>
          ) : (
            <div className="chips">
              <input
                id="a-input"
                className="num"
                type="number"
                min={2}
                max={config.N - 1}
                value={config.a}
                onChange={(e) => { const a = parseInt(e.target.value, 10); if (baseList.some((b) => b.a === a)) update({ a }) }}
              />
              <button type="button" className="chip" onClick={() => update({ a: baseList[Math.floor(Math.random() * baseList.length)].a })}>random</button>
            </div>
          )}
          <p className="hint">Only bases sharing no factor with N are listed. Any other a would hand you a factor through gcd(a, N) without a quantum computer.</p>
        </div>
      )}

      {!rejection && !tooBig && (
        <div className="field">
          <label htmlFor="t-input">Counting qubits, t = {config.t}</label>
          <input id="t-input" type="range" min={1} max={tMax} value={Math.min(config.t, tMax)} onChange={(e) => update({ t: +e.target.value })} />
          <p className="hint">More counting qubits give sharper peaks. The textbook choice is 2n = {2 * p.n}.</p>
        </div>
      )}

      <div className="field">
        <span className="label">Arithmetic</span>
        <div className="seg" role="radiogroup" aria-label="Arithmetic">
          <button type="button" role="radio" aria-checked={config.arithmetic === 'gates'} className={config.arithmetic === 'gates' ? 'on' : ''} onClick={() => update({ arithmetic: 'gates' })}>
            Gates
          </button>
          <button type="button" role="radio" aria-checked={config.arithmetic === 'oracle'} className={config.arithmetic === 'oracle' ? 'on' : ''} onClick={() => update({ arithmetic: 'oracle' })}>
            Black box
          </button>
        </div>
        <p className="hint">
          {config.arithmetic === 'gates'
            ? 'Every modular multiplication is built from phase rotations, as on real hardware (Beauregard’s 2n+3-qubit circuit, here with a full counting register).'
            : 'Each modular multiplication is a single permutation of the work register. That needs far fewer qubits and gates, so larger N fit.'}
        </p>
      </div>

      {shor && (
        <dl className="stats">
          <div><dt>qubits</dt><dd>{p.qubits}{maxQubits ? <span className="of"> / {maxQubits}</span> : null}</dd></div>
          <div><dt>amplitudes</dt><dd>{(2 ** p.qubits).toLocaleString()}</dd></div>
          <div><dt>state memory</dt><dd>{formatBytes(p.bytes)}</dd></div>
          <div><dt>gates</dt><dd>{totalOps.toLocaleString()}</dd></div>
        </dl>
      )}
    </section>
  )
}
