import { Chapter, Prose } from './Chapter'
import { M } from '../components/M'

export function Closing() {
  return (
    <Chapter no="§ 12" title="What √N buys, honestly">
      <Prose>
        <p>
          Time to close the loop with straight talk, because Grover's algorithm attracts
          more than its share of hype in both directions.
        </p>
        <p>
          The speedup is <strong>quadratic, not exponential</strong> — and that is proven
          optimal: no quantum algorithm can do unstructured search in fewer than{' '}
          <M>{String.raw`\Omega(\sqrt N)`}</M> oracle calls. Quadratic is not nothing; it
          is also not the sci-fi version. Searching an exponentially large haystack —
          say, all <M>{String.raw`2^{128}`}</M> AES keys — still takes{' '}
          <M>{String.raw`2^{64}`}</M> quantum steps. Grover does not "break encryption";
          it halves the effective key length, which is why the practical response was not
          panic but AES-256. And each "step" here is a full, coherent, error-corrected run
          of the oracle circuit — plausibly slower per step than classical hardware by
          enough to eat the advantage for any N a datacenter could brute-force anyway.
        </p>
        <p>
          What the algorithm actually is, is something better than a product pitch: the
          cleanest possible demonstration of <em>how quantum computation works at all</em>.
          Not "trying everything at once" — you watched that myth die in chapter 3 — but
          hiding an answer in a sign, then using interference to convert one bit of hidden
          phase into probability you can harvest, a fixed 2θ at a time. Two mirrors, a
          quarter turn of sky, and the discipline to stop on time.
        </p>
        <p>
          Reflection, reflection, rotation. That's the whole trick — and now it's yours.
        </p>
      </Prose>
    </Chapter>
  )
}
