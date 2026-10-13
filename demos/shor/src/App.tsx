import { useLab } from './lab/useLab.ts'
import { Controls } from './components/Controls.tsx'
import { CircuitView } from './components/CircuitView.tsx'
import { AmplitudeMap } from './components/AmplitudeMap.tsx'
import { Histogram } from './components/Histogram.tsx'
import { MeasurePanel } from './components/MeasurePanel.tsx'

export function App() {
  const lab = useLab()
  const { shor, step, busy, snapshot, engine, elapsed, error } = lab
  const total = shor?.steps.length ?? 0
  const finished = shor !== null && step === total

  const status = !shor
    ? ''
    : busy
      ? `Running step ${busy.step + 1} of ${total}: ${shor.steps[busy.step].name} · ${Math.round(busy.progress * 100)}%`
      : step === 0
        ? `Ready: ${total} steps`
        : finished
          ? `Done: all ${total} steps`
          : `Step ${step} of ${total} done: ${shor.steps[step - 1].name}`

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Shor’s algorithm, gate by gate</h1>
          <p className="lede">
            Factor a number on a quantum computer simulated on your GPU. Every gate runs for real, and you can
            open any box in the circuit down to its single phase rotations.
          </p>
        </div>
        <span className={`engine engine-${engine.kind}`}>
          {engine.kind === 'probing' ? 'starting…' : engine.kind === 'webgpu' ? `WebGPU${engine.gpu.adapterName ? ` · ${engine.gpu.adapterName}` : ''}` : 'CPU fallback'}
        </span>
      </header>
      {engine.kind === 'cpu' && <p className="banner">{engine.reason}</p>}
      {error && <p className="banner error">{error}</p>}

      <div className="layout">
        <aside className="side">
          <Controls lab={lab} />
          <MeasurePanel lab={lab} />
        </aside>

        <main className="main">
          {shor && (
            <>
              <section className="panel">
                <div className="transport">
                  <button type="button" className="primary" disabled={!!busy || finished} onClick={lab.runAll}>Run</button>
                  <button type="button" disabled={!!busy || finished} onClick={lab.stepOnce}>Step</button>
                  <button type="button" disabled={step === 0 && !busy} onClick={lab.restart}>Reset</button>
                  <span className="status" aria-live="polite">{status}</span>
                  {elapsed > 0 && <span className="elapsed">{elapsed < 1000 ? `${elapsed.toFixed(0)} ms` : `${(elapsed / 1000).toFixed(2)} s`} simulated</span>}
                </div>
                <CircuitView shor={shor} step={step} busy={busy} />
              </section>

              <section className="panel state">
                <div className="state-head">
                  <h2>The state {step === 0 ? 'before the first step' : `after step ${step}`}</h2>
                  <span className="legend"><span className="wheel" aria-hidden="true" /> colour = phase, brightness = amplitude</span>
                </div>
                <AmplitudeMap shor={shor} snapshot={snapshot} />
                <Histogram shor={shor} snapshot={snapshot} shots={lab.shots} />
                <p className="explain">{stateCaption(step, total)}</p>
              </section>
            </>
          )}
        </main>
      </div>
      <footer className="foot">
        Simulator: <code>packages/quantum</code>, a statevector engine with one WGSL compute dispatch per gate.{' '}
        <a href="https://github.com/andeplane/andeplane.github.io/tree/main/demos/shor">Source</a>
      </footer>
    </div>
  )
}

function stateCaption(step: number, total: number): string {
  if (step === 0) return 'Everything starts in |0⟩: a single bright pixel in the corner.'
  if (step === 1) return 'The counting register is in an equal superposition of every j, and the work register holds 1: one bright row.'
  if (step < total) {
    return 'Each controlled multiplication moves part of every column to the row a^j mod N. The pattern repeats along j with the period r we are looking for.'
  }
  return 'The inverse QFT turns the repeating pattern into peaks at multiples of 2^t / r. Measuring now gives one of those peaks, and continued fractions read r off it.'
}
