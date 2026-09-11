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
          on the order of <M>{String.raw`2^{64}`}</M> oracle queries in the idealized
          search model. This is a query count, not a runtime estimate: reversible key
          checking, error correction and available hardware all have costs. Doubling
          key length offsets this square-root scaling in that model; it does not by
          itself establish a practical attack or a complete security assessment.
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
