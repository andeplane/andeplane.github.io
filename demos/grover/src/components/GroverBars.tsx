import { useCallback, useRef } from 'react'
import { AmplitudeBars } from './AmplitudeBars'
import { useAnimatedVector } from '../hooks/useAnimatedVector'
import type { GroverControls } from '../hooks/useGrover'
import { optimalIterations } from '../sim/analytic'

export interface GroverBarsProps {
  g: GroverControls
  /** Show the N picker (8/16/32). */
  sizes?: number[]
  /** Show the oracle-behavior selector (the break-it chapter). */
  behaviors?: boolean
  showOptimal?: boolean
  height?: number
}

/**
 * The bar-chart stepper: Oracle / Diffuse / Step / Reset over an animated
 * signed bar chart with the mean line. Step chains oracle → diffuse via
 * the animation's onSettle, so the two reflections stay distinct moves.
 */
export function GroverBars({
  g,
  sizes,
  behaviors = false,
  showOptimal = true,
  height,
}: GroverBarsProps) {
  const queue = useRef<Array<() => void>>([])
  const onSettle = useCallback(() => {
    const next = queue.current.shift()
    next?.()
  }, [])

  const { values, animating } = useAnimatedVector(g.snapshot.amps, 650, onSettle)

  const step = () => {
    if (animating) return
    if (g.canOracle) {
      queue.current.push(g.diffuse)
      g.oracle()
    } else {
      g.diffuse()
    }
  }

  const busy = animating
  const tStar = optimalIterations(g.N, g.marked.size)
  const wrongIndex =
    g.behavior === 'wrong-item'
      ? Array.from({ length: g.N }, (_, i) => i).find((i) => !g.marked.has(i))
      : undefined

  return (
    <div>
      <AmplitudeBars
        amps={values}
        marked={g.marked}
        wrongIndex={wrongIndex}
        onBarClick={busy ? undefined : g.toggleMarked}
        showMean
        meanEmphasis={g.lastMove === 'diffuse' && animating}
        height={height}
        ariaLabel={`Amplitudes of ${g.N} states, item ${[...g.marked].join(', ')} marked, after ${g.t} iterations`}
      />
      <div className="controls">
        <button className="ctl amber" onClick={g.oracle} disabled={busy || !g.canOracle}>
          Oracle
        </button>
        <button className="ctl amber" onClick={g.diffuse} disabled={busy || !g.canDiffuse}>
          Diffuse
        </button>
        <button className="ctl primary" onClick={step} disabled={busy}>
          Step ⟳
        </button>
        <button className="ctl" onClick={g.reset} disabled={busy || (g.t === 0 && g.phase === 'initial')}>
          Reset
        </button>
        {sizes && (
          <>
            <span className="ctl-label">N</span>
            <select
              className="ctl-select"
              value={g.N}
              disabled={busy}
              onChange={(e) => g.setN(Math.log2(Number(e.target.value)))}
            >
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        )}
        {behaviors && (
          <>
            <span className="ctl-label">oracle</span>
            <select
              className="ctl-select"
              value={g.behavior}
              disabled={busy}
              onChange={(e) => g.setBehavior(e.target.value as typeof g.behavior)}
            >
              <option value="correct">honest</option>
              <option value="wrong-item">marks the wrong box</option>
              <option value="no-op">marks nothing</option>
            </select>
          </>
        )}
        <span className="spacer" />
        <span className="readout">
          t <b>{g.t}</b>
          {showOptimal && (
            <>
              {' / '}t* <b className="amber">{tStar}</b>
            </>
          )}
          {'  '}P(marked) <b className="green">{(g.successP * 100).toFixed(1)}%</b>
        </span>
      </div>
    </div>
  )
}
