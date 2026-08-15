import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { CircuitView } from '../components/CircuitView'
import { CodeReveal } from '../components/CodeReveal'
import { M } from '../components/M'

export function TheCircuit() {
  return (
    <Chapter no="§ 9" title="No metaphors: the circuit">
      <Prose>
        <p>
          Everything so far could be accused of being a cartoon. So here is the third
          altitude: real gates on real qubits, no shortcuts. Three qubits give{' '}
          <M>{String.raw`2^3 = 8`}</M> basis states — our eight boxes; "box 5" is the
          bitstring <M>{String.raw`|101\rangle`}</M>. Only three gate types appear:{' '}
          <strong>H</strong> (the Hadamard, which builds and unbuilds superpositions),{' '}
          <strong>X</strong> (a bit flip), and one <strong>CCZ</strong> — a controlled-Z
          that flips the sign of the single state <M>{String.raw`|111\rangle`}</M> and
          touches nothing else.
        </p>
        <p>
          The oracle is the CCZ wearing a costume of X gates: put X on every wire where the
          marked bitstring has a 0, and exactly the marked state gets steered onto{' '}
          <M>{String.raw`|111\rangle`}</M>, signed, and steered back. Change the marked
          item in the widget and watch the X pattern move — <em>that</em> is where the
          answer is wired in, and nowhere else. Diffusion is the same trick pointed at{' '}
          <M>{String.raw`|s\rangle`}</M>: H's map <M>{String.raw`|s\rangle`}</M> to{' '}
          <M>{String.raw`|0\ldots0\rangle`}</M>, X's map that to{' '}
          <M>{String.raw`|1\ldots1\rangle`}</M>, CCZ stamps the sign, and everything
          unwinds.
        </p>
      </Prose>
      <WidgetFrame
        id="circuit"
        title="Grover on three qubits, gate by gate"
        caption="Step the playhead and watch the amplitudes below respond to each column. The norm readout is the unitarity receipt: twelve decimal places of exactly 1."
      >
        <CircuitView />
      </WidgetFrame>
      <Prose>
        <p>
          One honest footnote, because the sharp-eyed will catch it: after the diffusion
          block, <em>every</em> bar comes out upside-down compared with the bar-chart
          chapters. The gate decomposition implements{' '}
          <M>{String.raw`-(2|s\rangle\langle s| - I)`}</M> — inversion about the mean times
          an overall minus sign. An overall sign multiplies <em>all</em> amplitudes at
          once, so no measurement, ever, can detect it; physicists call it a global phase
          and throw it away. The widget shows you what the gates literally produce, minus
          sign and all, because watching a "different" state give identical physics is
          worth one raised eyebrow.
        </p>
        <p>
          And a confession that doubles as a proof of honesty: everything on this page runs
          on the simulator below — about two hundred lines, most of them comments. The
          scary parts of quantum computing are not in the arithmetic.
        </p>
      </Prose>
      <CodeReveal />
    </Chapter>
  )
}
