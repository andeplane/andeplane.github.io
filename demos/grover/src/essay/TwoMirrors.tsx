import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { RotationDisc } from '../components/RotationDisc'
import { useGrover } from '../hooks/useGrover'
import { M, MD } from '../components/M'

export function TwoMirrors() {
  const g = useGrover({ n: 4, marked: [11] })

  return (
    <Chapter no="§ 6" title="Two mirrors make a rotation">
      <Prose>
        <p>
          Time to climb to the second altitude. Sixteen bars are really only{' '}
          <em>two</em> numbers in disguise: the amplitude of the marked box, and the
          amplitude shared by all the identical unmarked ones. So the entire state lives in
          a flat plane. Put the marked direction <M>{String.raw`|\alpha\rangle`}</M> on the
          vertical axis and the everything-else direction{' '}
          <M>{String.raw`|\beta\rangle`}</M> on the horizontal, and the state is a single
          arrow of length one.
        </p>
        <p>
          The uniform superposition <M>{String.raw`|s\rangle`}</M> starts almost
          horizontal — mostly wrong answers — tilted up by a small angle{' '}
          <M>{String.raw`\theta`}</M>, where
        </p>
        <MD>{String.raw`\sin\theta = \frac{1}{\sqrt N}.`}</MD>
        <p>
          Now re-read the two moves with plane-geometry eyes. The oracle negates the marked
          amplitude: that is a <strong>reflection across the horizontal axis</strong>.
          Diffusion reflects about the mean, and the state of uniform mean is{' '}
          <M>{String.raw`|s\rangle`}</M> itself: a <strong>reflection across the{' '}
          <M>{String.raw`|s\rangle`}</M> line</strong>. And a reflection followed by a
          reflection is — try it — a <strong>rotation</strong>, by twice the angle between
          the mirrors: <M>{String.raw`2\theta`}</M> per iteration, always toward the
          marked axis.
        </p>
      </Prose>
      <WidgetFrame
        id="rotation-disc"
        title="The state as one arrow"
        caption={
          <>
            Apply the mirrors one at a time: Oracle folds the arrow below the axis,
            Diffuse folds it back up past <span className="math"><M>{String.raw`|s\rangle`}</M></span>.
            Net effect per round: a fixed 2θ climb.
          </>
        }
      >
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <RotationDisc g={g} />
        </div>
        <div className="controls">
          <button className="ctl amber" onClick={g.oracle} disabled={!g.canOracle}>
            Oracle ↓
          </button>
          <button className="ctl amber" onClick={g.diffuse} disabled={!g.canDiffuse}>
            Diffuse ↑
          </button>
          <button
            className="ctl"
            onClick={g.reset}
            disabled={g.t === 0 && g.phase === 'initial'}
          >
            Reset
          </button>
          <span className="spacer" />
          <span className="readout">
            N <b>16</b> θ <b className="amber">14.5°</b> t <b>{g.t}</b>
          </span>
        </div>
      </WidgetFrame>
      <Prose>
        <p>
          This is the whole algorithm. <em>Grover's algorithm is two mirrors,</em> angled{' '}
          <M>{String.raw`\theta`}</M> apart, bouncing a state arrow upward in fixed{' '}
          <M>{String.raw`2\theta`}</M> steps until it points at the answer. Everything
          else — the query counts, the overshoot, the multiple-winners rule — now falls
          out of one triangle.
        </p>
      </Prose>
    </Chapter>
  )
}
