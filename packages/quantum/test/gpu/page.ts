// GPU-vs-CPU agreement tests, run in a real browser by run.mjs.
// Results land on window.__results for the runner to collect.

import {
  Circuit, CpuBackend, Simulator, WebGpuBackend, flatten, requestGpu, ry, rz, shorCircuit, type GpuContext,
} from '../../src/index.ts'

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = []
const log = (s: string) => { document.getElementById('log')!.textContent += s + '\n' }

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

function randomCircuit(n: number, gates: number, seed: number): Circuit {
  const r = rng(seed)
  const c = new Circuit()
  const q = c.addRegister('q', n)
  const pick = () => q[Math.floor(r() * n)]
  for (let g = 0; g < gates; g++) {
    const t = pick()
    const others = q.filter((x) => x !== t)
    const ctl = others.filter(() => r() < 0.2)
    const u = r()
    if (u < 0.3) c.gate('RY', ry(r() * 6), t, ctl)
    else if (u < 0.55) c.gate('RZ', rz(r() * 6), t, ctl)
    else if (u < 0.7) c.h(t)
    else if (u < 0.8) c.p(r() * 6, t, ctl)
    else if (u < 0.9) {
      const partner = others[Math.floor(r() * others.length)]
      c.swap(t, partner, ctl.filter((x) => x !== partner))
    }
    else {
      const reg = [t, others[0], others[1]]
      const table = new Uint32Array([3, 0, 7, 5, 1, 2, 6, 4])
      c.permute('perm', reg, table, others.slice(2).filter(() => r() < 0.3))
    }
  }
  return c
}

async function compare(name: string, gpu: GpuContext, c: Circuit, tol = 2e-5) {
  const n = c.nQubits
  const cpu = new CpuBackend(n)
  const wg = new WebGpuBackend(gpu, n)
  const ops = flatten(c.root) as never
  cpu.apply(ops)
  wg.apply(ops)
  const all = Array.from({ length: n }, (_, i) => i)
  const a = await wg.amplitudes(all)
  let err = 0
  for (let i = 0; i < cpu.re.length; i++) err = Math.max(err, Math.abs(a.re[i] - cpu.re[i]), Math.abs(a.im[i] - cpu.im[i]))
  const sub = [n - 1, 0, Math.floor(n / 2)]
  const pc = await cpu.probabilities(sub)
  const pg = await wg.probabilities(sub)
  let perr = 0
  for (let i = 0; i < pc.length; i++) perr = Math.max(perr, Math.abs(pc[i] - pg[i]))
  wg.dispose()
  results.push({ name, pass: err < tol && perr < tol, detail: `max amp error ${err.toExponential(2)}, marginal error ${perr.toExponential(2)}` })
}

async function main() {
  const gpu = await requestGpu()
  if (!gpu) {
    results.push({ name: 'WebGPU available', pass: false, detail: 'no adapter' })
    return
  }
  results.push({ name: 'WebGPU available', pass: true, detail: gpu.adapterName })

  for (const [n, gates, seed] of [[3, 50, 1], [7, 200, 2], [12, 400, 3], [17, 300, 4]]) {
    await compare(`random circuit, ${n} qubits, ${gates} ops`, gpu, randomCircuit(n, gates, seed))
  }

  // Measurement on the GPU: a GHZ state collapses to all-equal bits.
  {
    const c = new Circuit()
    const q = c.addRegister('q', 5)
    c.addClbits(5)
    c.h(q[0])
    for (let k = 1; k < 5; k++) c.cx(q[0], q[k])
    q.forEach((x, k) => c.measure(x, k))
    let ok = true
    for (const u of [0.2, 0.8]) {
      const sim = new Simulator(new WebGpuBackend(gpu, 5), () => u)
      await sim.run(c.root)
      ok &&= sim.clbits.every((b) => b === sim.clbits[0])
      const p = await sim.backend.probabilities(q)
      ok &&= Math.abs(p[sim.clbits[0] ? 31 : 0] - 1) < 1e-5
      sim.backend.dispose()
    }
    results.push({ name: 'GHZ measurement collapses consistently', pass: ok, detail: '' })
  }

  // The real thing: gate-level Shor for 15 with the textbook 8 counting qubits.
  {
    const s = shorCircuit({ N: 15, a: 7, arithmetic: 'gates' })
    const sim = new Simulator(new WebGpuBackend(gpu, s.circuit.nQubits))
    const t0 = performance.now()
    await sim.run(s.circuit.root)
    const ms = performance.now() - t0
    const p = await sim.backend.probabilities(s.counting)
    const scratch = await sim.backend.probabilities(s.scratch)
    let err = Math.abs(scratch[0] - 1)
    for (let y = 0; y < 256; y++) err = Math.max(err, Math.abs(p[y] - (y % 64 === 0 ? 0.25 : 0)))
    sim.backend.dispose()
    results.push({ name: `Shor N=15 a=7, ${s.circuit.nQubits} qubits, gate level`, pass: err < 5e-4, detail: `max error ${err.toExponential(2)}, ${ms.toFixed(0)} ms` })
  }
}

main()
  .catch((e) => results.push({ name: 'uncaught', pass: false, detail: String(e?.stack ?? e) }))
  .finally(() => {
    for (const r of results) log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`)
    ;(window as unknown as { __results: Result[] }).__results = results
  })
