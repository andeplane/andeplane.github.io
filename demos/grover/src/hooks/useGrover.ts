import { useCallback, useMemo, useState } from 'react'
import {
  runSchedule,
  snapshotIndex,
  successProbability,
  type GroverSnapshot,
  type OracleBehavior,
  type Phase,
} from '../sim/engine'

export interface GroverControls {
  n: number
  N: number
  marked: ReadonlySet<number>
  t: number
  phase: Phase
  behavior: OracleBehavior
  snapshot: GroverSnapshot
  successP: number
  /** Which half-move produced the current snapshot (drives animations). */
  lastMove: 'oracle' | 'diffuse' | 'none'
  canOracle: boolean
  canDiffuse: boolean
  oracle: () => void
  diffuse: () => void
  reset: () => void
  setN: (n: number) => void
  setMarked: (m: ReadonlySet<number>) => void
  toggleMarked: (i: number) => void
  setBehavior: (b: OracleBehavior) => void
}

export interface GroverInit {
  n?: number
  marked?: Iterable<number>
  behavior?: OracleBehavior
  /** Allow more than one marked item via toggling. */
  multiMark?: boolean
}

/**
 * One widget's worth of Grover state. The whole run is replayed from |0…0⟩
 * on every change — at the widget sizes here (n ≤ 5) that is microseconds —
 * so the UI state is just (n, marked, t, phase).
 */
export function useGrover(init: GroverInit = {}): GroverControls {
  const [n, setNRaw] = useState(init.n ?? 3)
  const [marked, setMarkedRaw] = useState<ReadonlySet<number>>(
    () => new Set(init.marked ?? [5 % (1 << (init.n ?? 3))]),
  )
  const [behavior, setBehaviorRaw] = useState<OracleBehavior>(init.behavior ?? 'correct')
  // t/phase/lastMove live in one state object updated by pure functional
  // updaters, so oracle/diffuse are stable callbacks — widgets queue them
  // across animation boundaries and a stale closure must not see old phase.
  const [run, setRun] = useState<{
    t: number
    phase: Phase
    lastMove: 'oracle' | 'diffuse' | 'none'
  }>({ t: 0, phase: 'initial', lastMove: 'none' })
  const { t, phase, lastMove } = run
  const multiMark = init.multiMark ?? false

  const schedule = useMemo(
    () => runSchedule(n, marked, Math.max(t, 1), { behavior }),
    [n, marked, t, behavior],
  )

  const snapshot = schedule[snapshotIndex(t, phase)]
  const successP = successProbability(snapshot, marked)

  const canOracle = phase !== 'post-oracle'
  const canDiffuse = phase === 'post-oracle'

  const oracle = useCallback(() => {
    setRun((s) =>
      s.phase === 'post-oracle' ? s : { t: s.t + 1, phase: 'post-oracle', lastMove: 'oracle' },
    )
  }, [])

  const diffuse = useCallback(() => {
    setRun((s) =>
      s.phase !== 'post-oracle' ? s : { ...s, phase: 'post-diffusion', lastMove: 'diffuse' },
    )
  }, [])

  const reset = useCallback(() => {
    setRun({ t: 0, phase: 'initial', lastMove: 'none' })
  }, [])

  const setN = useCallback(
    (next: number) => {
      setNRaw(next)
      setMarkedRaw((prev) => {
        const dim = 1 << next
        const kept = new Set([...prev].filter((m) => m < dim))
        if (kept.size === 0) kept.add(dim - 3 >= 0 ? dim - 3 : 0)
        return kept
      })
      reset()
    },
    [reset],
  )

  const setMarked = useCallback(
    (m: ReadonlySet<number>) => {
      setMarkedRaw(new Set(m))
      reset()
    },
    [reset],
  )

  const toggleMarked = useCallback(
    (i: number) => {
      setMarkedRaw((prev) => {
        if (multiMark) {
          const next = new Set(prev)
          if (next.has(i)) {
            if (next.size > 1) next.delete(i)
          } else {
            next.add(i)
          }
          return next
        }
        return new Set([i])
      })
      reset()
    },
    [multiMark, reset],
  )

  const setBehavior = useCallback(
    (b: OracleBehavior) => {
      setBehaviorRaw(b)
      reset()
    },
    [reset],
  )

  return {
    n,
    N: 1 << n,
    marked,
    t,
    phase,
    behavior,
    snapshot,
    successP,
    lastMove,
    canOracle,
    canDiffuse,
    oracle,
    diffuse,
    reset,
    setN,
    setMarked,
    toggleMarked,
    setBehavior,
  }
}
