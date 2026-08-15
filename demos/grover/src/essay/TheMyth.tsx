import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { InterferenceDemo } from '../components/InterferenceDemo'
import { M } from '../components/M'

export function TheMyth() {
  return (
    <Chapter no="§ 3" title="The myth, and the actual resource">
      <Prose>
        <p>
          You have heard the folklore: <em>a quantum computer tries every answer at
          once.</em> Looking at the uniform superposition, you can see where the story
          comes from — all <M>N</M> boxes really are "in there" simultaneously. You can
          also now see why the story is useless. Measure that state and you get one box,{' '}
          <em>uniformly at random</em>. One check, success probability <M>1/N</M>. A
          classical guesser does exactly as well. Superposition alone buys nothing.
        </p>
        <p>
          The actual resource is the thing squaring hides: the <strong>sign</strong>. When
          there are two ways to reach the same outcome, their amplitudes don't pile up like
          probabilities — they <em>add like signed numbers first</em>, and only then get
          squared. Same sign: the outcome is boosted. Opposite signs: the two paths eat
          each other, and an outcome that was reachable two ways can become impossible.
          This is <strong>interference</strong>, and it is the one move on the quantum
          board that classical probability cannot imitate.
        </p>
      </Prose>
      <WidgetFrame
        id="interference"
        title="Interference"
        caption="Two paths to the same box. Amplitudes add before squaring — so a sign is not decoration, it is ammunition."
      >
        <InterferenceDemo />
      </WidgetFrame>
      <Prose>
        <p>
          So the real question is not "how do we try everything at once?" — we already can,
          and it's a shrug. The question is: <em>can we choreograph interference so that
          all the wrong answers cancel and the right one adds up?</em> For unstructured
          search, Grover's algorithm is that choreography. It needs exactly two moves, both
          of them mirrors.
        </p>
      </Prose>
    </Chapter>
  )
}
