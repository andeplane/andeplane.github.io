import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { ProbabilityCurve } from '../components/ProbabilityCurve'
import { GroverBars } from '../components/GroverBars'
import { useGrover } from '../hooks/useGrover'
import { M, MD } from '../components/M'

export function ManyWinners() {
  const g = useGrover({ n: 4, marked: [2, 5, 11, 14], multiMark: true })

  return (
    <Chapter no="§ 10" title="Advanced: several prizes">
      <Prose>
        <p>
          Suppose <M>k</M> boxes hold prizes and any one will do. Nothing about the
          machinery changes — the oracle flips <M>k</M> signs, diffusion still reflects
          about the mean. Only the starting angle moves: the marked directions now soak up
          more of the uniform state, so
        </p>
        <MD>{String.raw`\sin\theta = \sqrt{\frac{k}{N}}, \qquad t^{*} \approx \frac{\pi}{4}\sqrt{\frac{N}{k}}.`}</MD>
        <p>
          More winners, bigger climb per step, fewer steps — with a party trick hiding at{' '}
          <M>{String.raw`k = N/4`}</M>: then <M>{String.raw`\sin\theta = \tfrac12`}</M>,{' '}
          <M>{String.raw`\theta = 30°`}</M>, and a single iteration lands the arrow at
          exactly <M>{String.raw`90°`}</M>. One oracle call, guaranteed success. Try it
          below: sixteen boxes, four prizes, one step to certainty.
        </p>
      </Prose>
      <WidgetFrame
        id="multi-bars"
        title="N = 16, k = 4: one perfect step"
        caption="Click bars to add or remove prizes (the t* readout follows). With exactly four marked, one Step drains every unmarked bar to zero — perfectly destructive interference on all twelve losers at once."
      >
        <GroverBars g={g} height={300} />
      </WidgetFrame>
      <WidgetFrame
        id="multi-curve"
        title="The k-dial"
        caption="The same sine curve, compressed by √k. Watch t* fall as prizes are added."
      >
        <ProbabilityCurve initialN={256} showK />
      </WidgetFrame>
      <Prose>
        <p>
          The catch: <M>{String.raw`t^{*}`}</M> depends on <M>k</M>, and if you don't know
          how many needles are in the haystack you don't know when to stop stirring.
          There are standard fixes — run with randomized iteration counts, or spend a few
          extra rounds on quantum counting to estimate <M>k</M> first — at the price of a
          constant factor. The square root survives; the certainty doesn't.
        </p>
      </Prose>
    </Chapter>
  )
}
