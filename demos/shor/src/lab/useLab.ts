// The lab's state machine: configuration → circuit → backend → step results.
//
// The circuit is executed one top-level step at a time (prepare, each
// controlled multiplication, the inverse QFT). Between steps every scratch
// qubit is back to |0⟩, so the counting and work registers together hold the
// whole state, and that is what the pictures show.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CpuBackend, Simulator, WebGpuBackend, interpretMeasurement, opCount, requestGpu, sampleFrom, shorCircuit,
  webGpuMaxQubits, type Backend, type GpuContext, type ShorArithmetic, type ShorCircuit, type ShorReading,
} from '@andeplane/quantum'
import { bitLength } from '@andeplane/quantum'
import { bases, maxCounting, rejectN } from './numbers.ts'

export interface Config {
  readonly N: number
  readonly a: number
  readonly t: number
  readonly arithmetic: ShorArithmetic
}

export interface Snapshot {
  /** The circuit this was read from; stale once the configuration changes. */
  readonly shor: ShorCircuit
  /** Steps completed when this was read. */
  readonly step: number
  /** Joint amplitudes over [counting, work], or null when too large to draw. */
  readonly map: { re: Float64Array; im: Float64Array } | null
  /** Marginal distribution of the counting register. */
  readonly counting: Float64Array
}

export type Engine =
  | { kind: 'probing' }
  | { kind: 'webgpu'; gpu: GpuContext; maxQubits: number }
  | { kind: 'cpu'; maxQubits: number; reason: string }

/** Joint amplitude maps above this many basis states are not read back. */
const MAP_LIMIT_BITS = 22
/** The CPU fallback stays interactive up to about here. */
const CPU_MAX_QUBITS = 20
/** Even when a GPU could hold more, a tab should not try. */
const GPU_CAP_QUBITS = 28
/** Minimum time per step while running, so the pictures can be followed. */
const PACE_MS = 280

export function useLab() {
  const [engine, setEngine] = useState<Engine>({ kind: 'probing' })
  const [config, setConfig] = useState<Config>({ N: 15, a: 7, t: 8, arithmetic: 'gates' })
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState<{ step: number; progress: number } | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [shots, setShots] = useState<ShorReading[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // The circuit the step/busy/shots state belongs to. For one render after a
  // configuration change it still names the old circuit, and that state is hidden.
  const [owner, setOwner] = useState<ShorCircuit | null>(null)

  const backendRef = useRef<Backend | null>(null)
  const simRef = useRef<Simulator | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const epochRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    requestGpu()
      .then((gpu) => {
        if (cancelled) return
        if (gpu) {
          setEngine({ kind: 'webgpu', gpu, maxQubits: Math.min(GPU_CAP_QUBITS, webGpuMaxQubits(gpu.device)) })
          gpu.device.lost.then((info) => {
            if (info.reason !== 'destroyed') setError('The GPU device was lost. Reload the page to continue.')
          })
        } else {
          setEngine({ kind: 'cpu', maxQubits: CPU_MAX_QUBITS, reason: 'This browser has no WebGPU, so the simulator runs on the CPU and is limited to small circuits.' })
        }
      })
      .catch((e) => {
        if (!cancelled) setEngine({ kind: 'cpu', maxQubits: CPU_MAX_QUBITS, reason: `WebGPU failed to start (${e}); running on the CPU.` })
      })
    return () => { cancelled = true }
  }, [])

  const maxQubits = engine.kind === 'probing' ? 0 : engine.maxQubits
  const rejection = rejectN(config.N)
  const baseList = useMemo(() => (rejection ? [] : bases(config.N)), [config.N, rejection])
  const tMax = rejection ? 0 : maxCounting(config.N, config.arithmetic, maxQubits)

  const shor: ShorCircuit | null = useMemo(() => {
    if (rejection || engine.kind === 'probing' || config.t < 1 || config.t > tMax) return null
    if (!baseList.some((b) => b.a === config.a)) return null
    return shorCircuit({ N: config.N, a: config.a, countingQubits: config.t, arithmetic: config.arithmetic })
  }, [config, rejection, engine.kind, tMax, baseList])

  const totalOps = useMemo(() => (shor ? opCount(shor.circuit.root) : 0), [shor])

  const readSnapshot = useCallback(async (s: ShorCircuit, done: number): Promise<Snapshot> => {
    const be = backendRef.current!
    const counting = await be.probabilities(s.counting)
    const map = s.counting.length + s.work.length <= MAP_LIMIT_BITS ? await be.amplitudes([...s.counting, ...s.work], 0) : null
    return { shor: s, step: done, map, counting }
  }, [])

  // A new circuit: fresh backend if the qubit count changed, state back to |0⟩.
  useEffect(() => {
    abortRef.current?.abort()
    const epoch = ++epochRef.current
    setStep(0)
    setBusy(null)
    setShots([])
    setElapsed(0)
    setSnapshot(null)
    setOwner(shor)
    if (!shor || engine.kind === 'probing') return
    const n = shor.circuit.nQubits
    try {
      if (!backendRef.current || backendRef.current.nQubits !== n) {
        backendRef.current?.dispose()
        backendRef.current = engine.kind === 'webgpu' ? new WebGpuBackend(engine.gpu, n) : new CpuBackend(n)
      }
      simRef.current = new Simulator(backendRef.current)
      simRef.current.reset()
      setError(null)
    } catch (e) {
      backendRef.current = null
      setError(String(e instanceof Error ? e.message : e))
      return
    }
    readSnapshot(shor, 0).then((snap) => { if (epochRef.current === epoch) setSnapshot(snap) })
  }, [shor, engine, readSnapshot])

  useEffect(() => () => {
    backendRef.current?.dispose()
    backendRef.current = null
  }, [])

  /** Run steps [step, until) one at a time, publishing a snapshot after each. */
  const runTo = useCallback(async (until: number) => {
    const sim = simRef.current
    if (!shor || !sim || busy) return
    const epoch = epochRef.current
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let done = step
    try {
      while (done < Math.min(until, shor.steps.length)) {
        const started = performance.now()
        const node = shor.steps[done]
        setBusy({ step: done, progress: 0 })
        await sim.run(node, {
          signal: ctrl.signal,
          batch: 1024,
          onProgress: (d, total) => { if (epochRef.current === epoch) setBusy({ step: done, progress: d / total }) },
        })
        const snap = await readSnapshot(shor, done + 1)
        const spent = performance.now() - started
        if (epochRef.current !== epoch) return
        setElapsed((e) => e + spent)
        done++
        setStep(done)
        setSnapshot(snap)
        if (done < until && spent < PACE_MS) await new Promise((r) => setTimeout(r, PACE_MS - spent))
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e))
    } finally {
      if (epochRef.current === epoch) setBusy(null)
    }
  }, [shor, busy, step, readSnapshot])

  const restart = useCallback(() => {
    abortRef.current?.abort()
    epochRef.current++
    simRef.current?.reset()
    setStep(0)
    setBusy(null)
    setShots([])
    setElapsed(0)
    if (shor && backendRef.current) {
      const epoch = epochRef.current
      readSnapshot(shor, 0).then((snap) => { if (epochRef.current === epoch) setSnapshot(snap) })
    }
  }, [shor, readSnapshot])

  /** Each shot stands for a fresh run of the whole circuit ending in a measurement. */
  const measure = useCallback((count = 1) => {
    if (!shor || !snapshot || snapshot.step !== shor.steps.length) return
    const ys = sampleFrom(snapshot.counting, count)
    setShots((s) => [...ys.map((y) => interpretMeasurement(y, shor.counting.length, shor.N, shor.a)).reverse(), ...s].slice(0, 200))
  }, [shor, snapshot])

  const update = useCallback((patch: Partial<Config>) => {
    setConfig((c) => {
      const next = { ...c, ...patch }
      // Keep a and t valid as N and the arithmetic change.
      if (patch.N !== undefined || patch.arithmetic !== undefined) {
        if (!rejectN(next.N)) {
          const list = bases(next.N)
          if (!list.some((b) => b.a === next.a)) next.a = (list.find((b) => b.good) ?? list[0]).a
          const cap = maxCounting(next.N, next.arithmetic, maxQubits)
          next.t = Math.max(1, Math.min(2 * bitLength(next.N), cap))
        }
      }
      return next
    })
  }, [maxQubits])

  return {
    engine, config, update, rejection, baseList, tMax, shor, totalOps,
    step: owner === shor ? step : 0,
    busy: owner === shor ? busy : null,
    shots: owner === shor ? shots : [],
    snapshot: snapshot && snapshot.shor === shor ? snapshot : null,
    elapsed: owner === shor ? elapsed : 0,
    error,
    stepOnce: () => runTo(step + 1),
    runAll: () => runTo(Infinity),
    restart, measure,
    backendName: backendRef.current?.name ?? (engine.kind === 'cpu' ? 'CPU' : ''),
  }
}

export type Lab = ReturnType<typeof useLab>
