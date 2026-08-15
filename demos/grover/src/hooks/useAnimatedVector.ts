import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) * (-2 * u + 2) / 2
}

export interface AnimatedVector {
  /** Currently displayed values — interpolates toward the target. */
  values: Float64Array
  animating: boolean
}

/**
 * Animate a Float64Array toward `target` whenever it changes, with
 * ease-in-out over `duration` ms. All widget motion goes through here so
 * that `prefers-reduced-motion` (snap instantly) and the animating flag
 * (used to disable controls) behave uniformly. Linear interpolation is a
 * feature, not a shortcut: reflecting a bar about the mean linearly moves
 * it exactly through the mean line.
 *
 * `onSettle` fires once per completed transition (including instant ones),
 * letting callers chain moves — e.g. Step = oracle, settle, diffuse.
 */
export function useAnimatedVector(
  target: Float64Array,
  duration = 700,
  onSettle?: () => void,
): AnimatedVector {
  const reduced = useReducedMotion()
  const [values, setValues] = useState(() => target.slice())
  const [animating, setAnimating] = useState(false)
  const current = useRef(target.slice())
  const raf = useRef(0)
  const settleRef = useRef(onSettle)
  settleRef.current = onSettle

  const finish = useCallback((t: Float64Array) => {
    current.current = t.slice()
    setValues(t.slice())
    setAnimating(false)
    // Defer so React has applied the final frame before the next move.
    queueMicrotask(() => settleRef.current?.())
  }, [])

  const lastTarget = useRef<Float64Array | null>(null)
  useEffect(() => {
    // Key on target identity, not value: an unchanged-value target (e.g. a
    // no-op oracle) must still fire onSettle so chained moves proceed.
    if (lastTarget.current === target) return
    lastTarget.current = target
    cancelAnimationFrame(raf.current)

    const from = current.current
    const to = target
    const changed =
      from.length !== to.length || from.some((v, i) => Math.abs(v - to[i]) > 1e-12)

    if (!changed || reduced || duration <= 0 || from.length !== to.length) {
      finish(to)
      return
    }

    setAnimating(true)
    const start = performance.now()
    const frame = (now: number) => {
      const u = Math.min(1, (now - start) / duration)
      const e = easeInOut(u)
      const mix = new Float64Array(to.length)
      for (let i = 0; i < to.length; i++) mix[i] = from[i] + (to[i] - from[i]) * e
      if (u < 1) {
        current.current = mix
        setValues(mix)
        raf.current = requestAnimationFrame(frame)
      } else {
        finish(to)
      }
    }
    raf.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration, reduced, finish])

  return { values, animating }
}
