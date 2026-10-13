// Build-time self test (no browser). Run by `npm run build`.
//
//  1. Wiring: the adder controller, driven by an idealised "oracle" fluid,
//     decodes all 256 sums correctly (tests the plumbing, not the physics).
//  2. Physics: the CPU reference LBM (same math as the GPU kernel) runs each
//     gate on its own tile through a sequence of inputs, with the same purge /
//     settle / latch protocol the page uses, and the WATER must produce the
//     right truth-table rows — including switching between rows, which is
//     where a laminar eddy left in the chamber can steer the next jet wrong.
//
// The two fluid sequences run in parallel worker threads (~20 s total).

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { buildBoard } from '../src/sim/board.ts'
import { CpuLbm } from '../src/sim/cpuLbm.ts'
import { type GateKind, emptyRaster, impactGate, nozzleDir, rasterizeGate, wallGate } from '../src/sim/geometry.ts'
import { Adder, Q_JET, gateUpdate, gateValves, newGateRun } from '../src/sim/logic.ts'

type Row = { want: [boolean, boolean]; expect: { s: boolean; c: boolean } }

function fluidSequence(kind: GateKind, rows: Row[]): string[] {
  const spec = kind === 'wall' ? wallGate() : impactGate()
  const r = emptyRaster(spec.w, spec.h)
  rasterizeGate(r, spec, 0, 0, 0)
  const sim = new CpuLbm(r)
  sim.valves = spec.nozzles.map((n) => {
    const [dx, dy] = nozzleDir(n)
    return { dx, dy, open: 0 }
  })
  const run = newGateRun()
  const tick = 25
  const log: string[] = []
  const flux = [0, 0, 0]
  for (const row of rows) {
    let steps = 0
    // one tick to register the new inputs, then run until the gate latches
    for (;;) {
      for (let k = 0; k < 3; k++) {
        const p = spec.probes[k]
        flux[k] = sim.fluxDown(p.x0, p.x1, p.y) / Q_JET
      }
      gateUpdate(run, kind, row.want, tick, flux)
      if (run.phase === 'valid' && steps > 0) break
      const targets = gateValves(run, kind)
      for (let s = 0; s < tick; s++) {
        sim.valves.forEach((v, k) => {
          const d = targets[k] - v.open
          v.open += Math.sign(d) * Math.min(Math.abs(d), 1 / 240)
        })
        sim.step()
      }
      steps += tick
      if (steps > 12000) throw new Error(`${kind} ${fmt(row.want)}: never settled (flux ${run.flux.map((f) => f.toFixed(2))})`)
    }
    const ok = run.out.s === row.expect.s && run.out.c === row.expect.c
    const line = `${kind.padEnd(6)} in=${fmt(row.want)} → s=${+run.out.s} c=${+run.out.c} after ${steps} steps  flux L/C/R=${run.flux.map((f) => f.toFixed(2)).join('/')}  ${ok ? 'ok' : 'WRONG'}`
    log.push(line)
    if (!ok) throw new Error(line)
  }
  return log
}

const fmt = (w: boolean[]) => w.map((b) => +b).join('')
const B = (s: string): [boolean, boolean] => [s[0] === '1', s[1] === '1']

const SEQS: Record<GateKind, Row[]> = {
  // half adder: SUM = A xor B, CARRY = A and B. 10 → 11 → 01 exercises the
  // purge (both jets swapped sides) and the collision.
  impact: [
    { want: B('10'), expect: { s: true, c: false } },
    { want: B('11'), expect: { s: false, c: true } },
    { want: B('01'), expect: { s: true, c: false } },
  ],
  // OR/NOR: power jet always on, controls C1, C2.
  wall: [
    { want: B('00'), expect: { s: false, c: false } },
    { want: B('10'), expect: { s: true, c: false } },
    { want: B('11'), expect: { s: true, c: false } },
    { want: B('00'), expect: { s: false, c: false } },
  ],
}

function oracleTest(): void {
  const board = buildBoard()
  const flux = new Float32Array(board.probes.length)
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 16; b++) {
      const adder = new Adder(board)
      adder.setInputs(a, b)
      let steps = 0
      while (!(adder.settled && steps > 0)) {
        // idealised fluid: each gate's water goes exactly where the truth table says
        board.gates.forEach((g) => {
          const v = (k: number) => adder.valves[g.nozzleBase + k] > 0.99
          const f = [0, 0, 0]
          if (g.spec.kind === 'impact') {
            if (v(0) && v(1)) f[1] = 1.7
            else if (v(0)) f[2] = 1
            else if (v(1)) f[0] = 1
          } else if (v(0)) {
            if (v(1) || v(2)) f[1] = 1.8
            else f[2] = 1
          }
          for (let k = 0; k < 3; k++) flux[g.probeBase + k] = f[k] * Q_JET
        })
        adder.advance(100, flux)
        steps += 100
        if (steps > 400000) throw new Error(`oracle ${a}+${b} never settled`)
      }
      if (adder.result !== a + b) throw new Error(`oracle ${a}+${b} decoded ${adder.result}`)
    }
  }
  console.log('wiring: all 256 sums decode correctly with an ideal fluid')
}

if (isMainThread) {
  const t0 = Date.now()
  oracleTest()
  const kinds: GateKind[] = ['impact', 'wall']
  const results = await Promise.all(
    kinds.map(
      (kind) =>
        new Promise<string[]>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: kind })
          w.on('message', (m: { log?: string[]; error?: string }) => (m.error ? reject(new Error(m.error)) : resolve(m.log!)))
          w.on('error', reject)
        }),
    ),
  )
  for (const log of results) for (const l of log) console.log(l)
  console.log(`water-logic self test passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
} else {
  const kind = workerData as GateKind
  try {
    parentPort!.postMessage({ log: fluidSequence(kind, SEQS[kind]) })
  } catch (e) {
    parentPort!.postMessage({ error: String(e instanceof Error ? e.message : e) })
  }
}
