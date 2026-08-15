import { useState } from 'react'
import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { AmplitudeBars } from '../components/AmplitudeBars'
import { M, MD } from '../components/M'

export function Amplitudes101() {
  const [amps, setAmps] = useState(() => Float64Array.of(0.5, 0.5, 0.5, 0.5))

  const drag = (i: number, v: number) => {
    setAmps((prev) => {
      const next = prev.slice()
      next[i] = v
      let restSq = 0
      for (let j = 0; j < next.length; j++) if (j !== i) restSq += next[j] * next[j]
      const targetRest = Math.sqrt(Math.max(0, 1 - v * v))
      if (restSq < 1e-12) {
        // everything else was zero: share the remainder evenly
        const each = targetRest / Math.sqrt(next.length - 1)
        for (let j = 0; j < next.length; j++) if (j !== i) next[j] = each
      } else {
        const f = targetRest / Math.sqrt(restSq)
        for (let j = 0; j < next.length; j++) if (j !== i) next[j] *= f
      }
      return next
    })
  }

  return (
    <Chapter no="§ 2" title="What a quantum computer actually gives you">
      <Prose>
        <p>
          Forget hardware; here is the abstraction. A classical search algorithm, at any
          moment, is <em>at</em> one box. A quantum computer instead keeps a number for{' '}
          <em>every</em> box at once — called an <strong>amplitude</strong> — and this is
          the whole data structure. Four boxes, four amplitudes. A million boxes, a million
          amplitudes.
        </p>
        <p>
          Two rules govern these numbers. First: when you <em>measure</em> — when you
          finally look — you get exactly one box, at random, and the probability of getting
          box <M>i</M> is its amplitude squared:
        </p>
        <MD>{String.raw`P(i) = a_i^2, \qquad \sum_i a_i^2 = 1.`}</MD>
        <p>
          Second, and this is the strange one: amplitudes are not probabilities. They can be{' '}
          <strong>negative</strong>. A box with amplitude <M>-0.5</M> is measured exactly as
          often as one with <M>+0.5</M> — squaring erases the sign. Hold that thought; the
          entire algorithm lives in it.
        </p>
      </Prose>
      <WidgetFrame
        id="sandbox"
        title="A state of four amplitudes"
        caption={
          <>
            Drag any bar up or down. The others rescale so the squares always sum to 100% —
            that is the one law a state must obey. Try dragging a bar below zero: its
            probability doesn't care.
          </>
        }
      >
        <AmplitudeBars
          amps={amps}
          draggable
          onDrag={drag}
          showProbs
          height={260}
          ariaLabel="Four draggable amplitude bars"
        />
      </WidgetFrame>
      <Prose>
        <p>
          The state drawn above with all bars equal is the <strong>uniform
          superposition</strong>: every box at amplitude <M>{String.raw`1/\sqrt N`}</M>,
          every box equally likely. It is the honest way to say "I know nothing yet," and
          it is where Grover's algorithm begins.
        </p>
      </Prose>
    </Chapter>
  )
}
