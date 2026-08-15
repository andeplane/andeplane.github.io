import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { QueryCounter } from '../components/QueryCounter'
import { M } from '../components/M'

export function TheProblem() {
  return (
    <Chapter no="§ 1" title="A million boxes, one prize">
      <Prose>
        <p>
          Here is the least glamorous problem in computer science. You are standing in front
          of <M>N</M> closed boxes. Exactly one holds the prize. The boxes are unlabeled,
          unsorted, and identical from the outside; the only thing you can do is pick one,
          open it, and be told yes or no.
        </p>
        <p>
          How many boxes do you open? On average, about <M>N/2</M> — and there is genuinely
          nothing cleverer to do. No binary search, because nothing is sorted. No hashing,
          no indexing, no structure to exploit. That is what <em>unstructured search</em>{' '}
          means: every strategy is some order of opening boxes, and against a randomly
          placed prize, every order performs the same. With a million boxes, expect half a
          million looks.
        </p>
        <p>
          In 1996, Lov Grover showed that a quantum computer needs about{' '}
          <M>{String.raw`\sqrt N`}</M> looks. Not because it opens boxes faster — it uses the{' '}
          <em>same</em> yes/no check — but because it can arrange for wrong answers to
          cancel each other out. A million boxes: roughly 785 checks instead of half a
          million.
        </p>
      </Prose>
      <WidgetFrame
        id="query-hero"
        title="The gap"
        caption="Drag N. The quantum count grows like the square root: a thousand times more boxes, only ~32 times more work."
      >
        <QueryCounter hero initialN={1024} />
      </WidgetFrame>
      <Prose>
        <p>
          That claim should bother you. The check is the same; the boxes are the same; where
          does the saving come from? This essay's job is to make the answer{' '}
          <em>visible</em> — three times, at three altitudes: as a bar chart, as a rotating
          arrow, and finally as actual quantum gates. By the end, <M>{String.raw`\sqrt N`}</M> will
          not be a magic incantation. It will be a picture you can draw.
        </p>
      </Prose>
    </Chapter>
  )
}
