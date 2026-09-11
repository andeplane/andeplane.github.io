import { useMemo, useState } from 'react'
import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { AmplitudeBars } from '../components/AmplitudeBars'
import { useAnimatedVector } from '../hooks/useAnimatedVector'
import { M } from '../components/M'

const N = 8
const UNIFORM = 1 / Math.sqrt(N)

export function TheOracle() {
  const [marked, setMarked] = useState(5)
  const [flipped, setFlipped] = useState(false)

  const target = useMemo(() => {
    const a = new Float64Array(N).fill(UNIFORM)
    if (flipped) a[marked] = -UNIFORM
    return a
  }, [marked, flipped])
  const { values, animating } = useAnimatedVector(target, 600)
  const markedSet = useMemo(() => new Set([marked]), [marked])

  return (
    <Chapter no="§ 4" title="Mirror one: the oracle">
      <Prose>
        <p>
          First, what does "checking a box" even mean in superposition? The yes/no check
          is given to us as a circuit — the <strong>oracle</strong>. Fed a single box, it
          can reversibly write its answer into an extra qubit. Preparing that qubit in
          the minus state converts the answer into a phase change, called phase kickback.
          The resulting phase oracle{' '}
          <strong>flips the sign of the marked box's amplitude</strong> and leaves every
          other box alone.
        </p>
        <p>
          Click a bar below to choose where the prize hides, then apply the oracle.
          We wire in the answer here to demonstrate the transformation. In a search
          problem, the circuit instead tests a property — such as whether a candidate
          satisfies some constraints — without needing the successful candidate in advance.
        </p>
      </Prose>
      <WidgetFrame
        id="oracle"
        title="The oracle is a phase flip"
        caption={
          <>
            The marked amplitude goes from <span className="math"><M>{String.raw`+1/\sqrt 8`}</M></span> to{' '}
            <span className="math"><M>{String.raw`-1/\sqrt 8`}</M></span>. Apply it twice and you're back —
            the oracle is its own mirror image.
          </>
        }
      >
        <AmplitudeBars
          amps={values}
          marked={markedSet}
          onBarClick={
            animating
              ? undefined
              : (i) => {
                  setMarked(i)
                  setFlipped(false)
                }
          }
          height={250}
          ariaLabel={`Eight amplitudes, box ${marked} marked${flipped ? ', sign flipped' : ''}`}
        />
        <div className="controls">
          <button className="ctl amber" onClick={() => setFlipped((f) => !f)} disabled={animating}>
            {flipped ? 'Oracle (again)' : 'Oracle'}
          </button>
          <span className="spacer" />
          <span className="readout">
            P(each box) <b>12.5%</b> — unchanged
          </span>
        </div>
      </WidgetFrame>
      <Prose>
        <p>
          Now the disappointment, which is really the plot. Look at the probabilities:{' '}
          <strong>nothing happened.</strong> Every box still measures at{' '}
          <M>1/8</M>, because squaring erases the sign. The oracle has secretly branded the
          winner — its amplitude now points the other way — but measuring the box label
          in this basis cannot reveal that relative sign. Other measurement bases can;
          diffusion makes the difference visible in the box probabilities.
        </p>
        <p>
          Invisible, that is, until something <em>compares amplitudes to each other</em>.
          That is the second mirror's job.
        </p>
      </Prose>
    </Chapter>
  )
}
