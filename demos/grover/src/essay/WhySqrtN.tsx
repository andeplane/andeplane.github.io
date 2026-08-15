import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { ProbabilityCurve } from '../components/ProbabilityCurve'
import { QueryCounter } from '../components/QueryCounter'
import { M, MD } from '../components/M'

export function WhySqrtN() {
  return (
    <Chapter no="§ 8" title="Why √N — and why more is less">
      <Prose>
        <p>
          After <M>t</M> iterations the arrow sits at angle{' '}
          <M>{String.raw`(2t+1)\theta`}</M>, so the chance of measuring the winner is
        </p>
        <MD>{String.raw`P(t) = \sin^2\!\big((2t+1)\,\theta\big), \qquad \sin\theta = \tfrac{1}{\sqrt N}.`}</MD>
        <p>
          You want the arrow vertical: <M>{String.raw`(2t+1)\theta \approx \pi/2`}</M>. For
          large <M>N</M>, <M>{String.raw`\theta \approx 1/\sqrt N`}</M>, which gives
        </p>
        <MD>{String.raw`t^{*} \approx \frac{\pi}{4}\sqrt{N}.`}</MD>
        <p>
          That is the entire origin of the square root: each iteration costs one oracle
          call and buys a fixed <M>{String.raw`2\theta \approx 2/\sqrt N`}</M> of climb,
          and there is only a quarter-turn of sky to climb through.
        </p>
        <p>
          And the same picture explains the trap. The staircase does not stop at vertical —
          iteration <M>{String.raw`t^{*}+1`}</M> rotates straight past the target, and the
          success probability comes back <em>down</em>. Run it long enough and it sweeps
          all the way around: a sine wave in <M>t</M>, forever. Overshooting is not a
          rounding error; it is the geometry.
        </p>
      </Prose>
      <WidgetFrame
        id="prob-curve"
        title="Success probability vs iterations"
        caption="Drag t past the optimum and watch the algorithm talk itself out of the right answer — then, absurdly, back into it. Dots are the physical (integer) iteration counts; the dashed gray line is a classical searcher's t/N crawl."
      >
        <ProbabilityCurve initialN={64} />
      </WidgetFrame>
      <Prose>
        <p>
          So a Grover run is not "iterate until found." It is: compute{' '}
          <M>{String.raw`t^{*} = \lfloor \tfrac{\pi}{4}\sqrt N \rfloor`}</M> ahead of time,
          take exactly that many steps, then measure once and check the answer classically
          (one more oracle call; if you were unlucky, rerun). The payoff compounds
          brutally with scale:
        </p>
      </Prose>
      <WidgetFrame
        id="query-full"
        title="The bill, itemized"
        caption="At N = 16,384: about 8,192 classical checks against exactly 100 Grover iterations."
      >
        <QueryCounter initialN={16384} />
      </WidgetFrame>
    </Chapter>
  )
}
