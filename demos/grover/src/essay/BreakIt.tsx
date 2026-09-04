import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { GroverBars } from '../components/GroverBars'
import { useGrover } from '../hooks/useGrover'

export function BreakIt() {
  const g = useGrover({ n: 3, marked: [5] })

  return (
    <Chapter no="§ 11" title="Break it">
      <Prose>
        <p>
          A good way to trust a machine is to sabotage it. The widget below lets you hand
          Grover a defective oracle and watch the algorithm — which contains no error
          checking, no feedback, no idea what it's doing — fail in two instructive ways.
        </p>
        <p>
          Give it an oracle that <strong>marks nothing</strong>, and diffusion has nothing
          to bite on: the uniform state's mean is the uniform state, reflection fixes every
          bar in place, and the algorithm politely spins forever at{' '}
          <span style={{ whiteSpace: 'nowrap' }}>P = 1/N</span>. Give it an oracle that
          confidently <strong>marks the wrong box</strong>, and the machine works
          flawlessly — amplifying the wrong box to near-certainty. Grover's algorithm is
          an amplifier for whatever the oracle whispers, garbage in, loud garbage out.
        </p>
      </Prose>
      <WidgetFrame
        id="break-it"
        title="Sabotage bench"
        caption="The blue bar is where the prize really is; the red bar is the impostor the broken oracle vouches for. The algorithm cannot tell the difference — only the final classical check (open the box!) catches the lie, which is why a Grover run always ends with one."
      >
        <GroverBars g={g} behaviors showOptimal />
      </WidgetFrame>
      <Prose>
        <p>
          This is also why overshooting (chapter 8) never gets fixed by the machine
          itself: with no way to observe its own progress, the algorithm's only virtues
          are the ones you can prove about it with a triangle. Fortunately, you now can.
        </p>
      </Prose>
    </Chapter>
  )
}
