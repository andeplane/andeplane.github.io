import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { GroverBars } from '../components/GroverBars'
import { RotationDisc } from '../components/RotationDisc'
import { useGrover } from '../hooks/useGrover'

export function SyncedViews() {
  const g = useGrover({ n: 4, marked: [11] })

  return (
    <Chapter no="§ 7" title="Both pictures, one machine">
      <Prose>
        <p>
          Don't take the correspondence on faith. Below, the bar chart and the arrow are
          driven by <em>the same state</em> and the same buttons. Every inversion about the
          mean on the left is, simultaneously, a fold across the{' '}
          <span style={{ whiteSpace: 'nowrap' }}>|s⟩ line</span> on the right; every
          whisker the wrong bars lose is the cosine shrinking as the arrow climbs.
        </p>
      </Prose>
      <WidgetFrame
        id="synced"
        title="Bars ↔ arrow, in lockstep"
        caption="Same engine, two projections. Step past t* = 3 and watch both pictures agree about the decline, too: the arrow rotates past vertical while the marked bar starts to shrink."
      >
        <div className="duo">
          <div>
            <GroverBars g={g} height={430} showOptimal />
          </div>
          <div style={{ maxWidth: 430, margin: '0 auto', width: '100%' }}>
            <RotationDisc g={g} />
          </div>
        </div>
      </WidgetFrame>
      <Prose>
        <p>
          One detail deserves a pause: the rotation per step is <em>always exactly</em>{' '}
          2θ — it does not slow down as the arrow nears the top. The algorithm has no
          brakes and no feedback; it cannot check how close it is without measuring and
          destroying the state. It is a blind, metronomic staircase. Which raises an
          obvious question: when do you stop climbing?
        </p>
      </Prose>
    </Chapter>
  )
}
