import { Chapter, Prose } from './Chapter'
import { WidgetFrame } from '../components/WidgetFrame'
import { GroverBars } from '../components/GroverBars'
import { useGrover } from '../hooks/useGrover'
import { M, MD } from '../components/M'

export function TheDiffusion() {
  const g = useGrover({ n: 3, marked: [5] })

  return (
    <Chapter no="§ 5" title="Mirror two: inversion about the mean">
      <Prose>
        <p>
          The second move — Grover called it <strong>diffusion</strong> — never touches the
          oracle and knows nothing about which box is marked. It does one democratic thing:
          compute the average of all <M>N</M> amplitudes, then reflect every amplitude
          through that average:
        </p>
        <MD>{String.raw`a_i \;\longmapsto\; 2\bar a - a_i, \qquad \bar a = \tfrac{1}{N}\textstyle\sum_j a_j.`}</MD>
        <p>
          A bar sitting above the mean lands the same distance below it, and vice versa.
          Watch what that does right after an oracle call. Seven bars sit at{' '}
          <M>{String.raw`+1/\sqrt 8`}</M>; one hangs at <M>{String.raw`-1/\sqrt 8`}</M>.
          The lone negative bar drags the <em>mean</em> down slightly below the crowd. So
          when everything reflects: the crowd, barely above the mean, drops barely below
          it — while the marked bar, far below the mean, is flung far <em>above</em>.
        </p>
        <p>
          Press <strong>Oracle</strong>, then <strong>Diffuse</strong>. Then do it again.
        </p>
      </Prose>
      <WidgetFrame
        id="grover-bars"
        title="Inversion about the mean"
        caption={
          <>
            The dashed line is the mean. During diffusion every bar passes through it —
            reflection, literally. The oracle's invisible sign flip becomes a very visible
            height difference. Click any bar to move the prize; keep stepping and watch
            what happens after t*.
          </>
        }
      >
        <GroverBars g={g} sizes={[8, 16, 32]} />
      </WidgetFrame>
      <Prose>
        <p>
          This pair of moves is one <strong>Grover iteration</strong>: the oracle marks the
          winner with a sign only arithmetic can see, and diffusion — pure arithmetic —
          converts that sign into amplitude. The wrong boxes all shrink by a whisker; the
          right one grows by <M>{String.raw`\approx 2/\sqrt N`}</M>. Interference,
          choreographed: the essay's chapter three, weaponized.
        </p>
        <p>
          Notice also what the widget will not let you unsee if you keep pressing{' '}
          <strong>Step</strong>: the marked bar grows, peaks… and then <em>shrinks</em>.
          More effort makes the answer less likely. File that away — the next picture makes
          it obvious.
        </p>
      </Prose>
    </Chapter>
  )
}
