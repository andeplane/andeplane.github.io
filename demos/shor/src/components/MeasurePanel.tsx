import type { ShorReading } from '@andeplane/quantum'
import type { Lab } from '../lab/useLab.ts'

export function MeasurePanel({ lab }: { lab: Lab }) {
  const { shor, step, shots, measure, busy } = lab
  if (!shor) return null
  const t = shor.counting.length
  const ready = step === shor.steps.length && !busy
  const win = shots.find((s) => s.factors)

  return (
    <section className="panel measure" aria-label="Measurement">
      <div className="measure-head">
        <h2>Measure</h2>
        <div className="buttons">
          <button type="button" className="primary" disabled={!ready} onClick={() => measure(1)}>Measure</button>
          <button type="button" disabled={!ready} onClick={() => measure(10)}>×10</button>
        </div>
      </div>
      {!ready && <p className="hint">Run the circuit to the end, then measure the counting register.</p>}
      {ready && shots.length === 0 && (
        <p className="hint">Each measurement stands for a fresh run of the circuit. The simulator draws from the final distribution instead of rerunning it.</p>
      )}
      {win && (
        <p className="win">
          {shor.N} = {win.factors![0]} × {win.factors![1]}
        </p>
      )}
      {shots.length > 0 && <Reading r={shots[0]} t={t} N={shor.N} a={shor.a} />}
      {shots.length > 1 && (
        <ol className="shots" aria-label="Earlier measurements">
          {shots.slice(1, 40).map((s, i) => (
            <li key={i} className={s.factors ? 'good' : ''}>
              <span>y = {s.y}</span>
              <span>{s.r !== null ? `r = ${s.r}` : 'no r'}</span>
              <span>{s.factors ? `${s.factors[0]} × ${s.factors[1]}` : '—'}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Reading({ r, t, N, a }: { r: ShorReading; t: number; N: number; a: number }) {
  const best = r.convergents[r.convergents.length - 1]
  return (
    <div className="reading">
      <div className="row"><span className="k">measured y</span><span className="v">{r.y}</span></div>
      <div className="row"><span className="k">y / 2^{t}</span><span className="v">{r.y} / {2 ** t} = {r.phase.toFixed(6)}</span></div>
      <div className="row">
        <span className="k">continued fraction</span>
        <span className="v">{r.convergents.length ? r.convergents.map((c) => `${c.s}/${c.r}`).join(' → ') : '0'}</span>
      </div>
      <div className="row">
        <span className="k">period r</span>
        <span className="v">
          {r.r !== null ? <>{r.r} <span className="dim">({a}^{r.r} mod {N} = 1 ✓)</span></> : best ? <span className="dim">{best.r} fails: {a}^{best.r} mod {N} ≠ 1</span> : '—'}
        </span>
      </div>
      {r.r !== null && r.r % 2 === 0 && (
        <div className="row">
          <span className="k">gcd(a^(r/2) ± 1, N)</span>
          <span className="v">{r.factors ? `${r.factors[0]}, ${r.factors[1]}` : 'trivial'}</span>
        </div>
      )}
      <p className={r.factors ? 'note good' : 'note'}>{r.note}</p>
    </div>
  )
}
