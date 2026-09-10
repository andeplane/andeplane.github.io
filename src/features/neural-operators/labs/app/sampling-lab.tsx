'use client';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { E, phaseTex, amplitudesTex } from '@/features/neural-operators/labs/lib/equations';
import { useMemo, useState } from 'react';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/features/neural-operators/labs/components/ui/tabs';
import { ArrowRight } from 'lucide-react';
import { Heatmap } from './field-view';
import { modes, project, field, spatialField, average } from '@/features/neural-operators/labs/lib/operator';
const probes = [
  [1, 0],
  [0, 2],
  [3, 0],
] as const;
export default function SamplingLab({
  n,
  onNChange,
}: {
  n: number;
  onNChange: (value: number) => void;
}) {
  const [probe, setProbe] = useState(0),
    [cell, setCell] = useState(0);
  const reference = useMemo(() => spatialField(42, 96), []);
  const samples = useMemo(() => spatialField(42, n), [n]);
  const coeffs = useMemo(() => project(samples, n), [samples, n]);
  const limit = Math.min(4, Math.floor((n - 1) / 2));
  const recovered = useMemo(
    () => field(coeffs, 96, undefined, limit).map((v) => v + average(samples)),
    [coeffs, limit, samples],
  );
  const [kx, ky] = probes[probe];
  const modeIndex = modes.findIndex(([x, y]) => x === kx && y === ky);
  const c = coeffs[modeIndex];
  const term = (i: number, sine = false) =>
    samples[i] *
    (sine ? Math.sin : Math.cos)(
      2 * Math.PI * ((kx * (i % n)) / n + (ky * Math.floor(i / n)) / n),
    );
  const cosineTerms = samples.map((_, i) => term(i));
  const sum = cosineTerms.reduce((s, v) => s + v, 0);
  const selected = Math.min(cell, n * n - 1),
    x = (selected % n) / n,
    y = Math.floor(selected / n) / n,
    basis = Math.cos(2 * Math.PI * (kx * x + ky * y));
  const error = Math.sqrt(
    recovered.reduce((s, v, i) => s + (v - reference[i]) ** 2, 0) /
      reference.reduce((s, v) => s + v * v, 0),
  );
  return (
    <section className="sampling-lab">
      <div className="sampling-heading">
        <span className="eyebrow">
          THE SAME FIELD AS STEP 1 / PIXELS IN, COEFFICIENTS OUT
        </span>
        <h2>From measured pixels to an approximate field.</h2>
        <p>
          These are the same measured pixels measured in step 1. Now we fit a
          different representation: a sum of waves. We hide the original formula
          and work only from the pixel values. This is a synthetic temperature
          field, not experimental data. That lets us check every step against
          the truth.
        </p>
      </div>
      <p className="math-caption">
        <strong>Time stays at t = 0 throughout this experiment.</strong> We are
        changing the representation of the current field, not evolving it. All
        coefficient calculations are fixed mathematics; no weights are trained
        here.
      </p>
      <div className="sampling-controls">
        <label>
          Measurement grid{' '}
          <b>
            {n} × {n} samples
          </b>
        </label>
        <Slider
          aria-label="Measurement grid for Fourier detection"
          value={[n]}
          min={4}
          max={16}
          step={4}
          onValueChange={(v) => {
            onNChange(Array.isArray(v) ? v[0] : v);
            setCell(0);
          }}
        />
        <p>
          This grid size is shared with steps 1 and 4. Try 8 × 8, then 4 × 4.
        </p>
      </div>
      <div className="sampling-maps">
        <div>
          <span className="eyebrow">1 / THE HIDDEN TRUTH</span>
          <Heatmap
            values={reference}
            n={96}
            label="Continuous synthetic temperature field rendered at 96 by 96"
          />
          <h3>
            The underlying field <MathTex tex="f(x,y)" inline />
          </h3>
          <p>
            A continuous function of position. We render it at 96 × 96 for
            display.
          </p>
        </div>
        <div>
          <span className="eyebrow">2 / WHAT WE MEASURE</span>
          <Heatmap
            values={samples}
            n={n}
            label={`Pixelated temperature measurements on a ${n} by ${n} grid`}
          />
          <h3>Samples F: only {n * n} numbers</h3>
          <p>
            Each colored square displays one point sample. The reconstruction
            sees these numbers, not the formula.
          </p>
        </div>
        <div>
          <span className="eyebrow">3 / WHAT WE RECONSTRUCT</span>
          <Heatmap
            values={recovered}
            n={96}
            label="Fine field reconstructed solely from measured Fourier coefficients"
          />
          <h3>Approximation fitted to the samples</h3>
          <p>
            Evaluate recovered waves on a fine grid. Relative L₂ error:{' '}
            <b>{(error * 100).toFixed(2)}%</b>.
          </p>
        </div>
      </div>
      <div className={n === 4 ? 'sampling-alert' : 'sampling-success'}>
        <b>
          {n === 4
            ? 'Sparse samples miss and alias narrow features.'
            : 'A Fourier fit is an approximation, even at 8 × 8.'}
        </b>{' '}
        The spatial spots contain infinitely many Fourier frequencies. This lab
        retains at most 4 cycles per axis, and fewer on coarse grids. Increasing
        input resolution reduces sampling error; it does not remove the
        finite-mode approximation error. Try 8, 12, and 16 to see where the
        error plateaus.
      </div>
      <div className="detect-section">
        <span className="eyebrow">STEP A / TEST A CANDIDATE WAVE</span>
        <h3>Does this wave line up with the measurements?</h3>
        <p>
          A <strong>wave</strong> here is a sine or cosine pattern across space.
          Its <strong>frequency</strong> counts repetitions across the domain.
          Its <strong>amplitude</strong> is the signed number scaling its
          height. In this representation, an amplitude is also called a{' '}
          <strong>Fourier coefficient</strong>. It is measured from the pixels,
          not learned across examples.
        </p>
        <p>
          For each candidate frequency, multiply every measured value by a
          cosine wave and add the products. Matching patterns reinforce one
          another; other resolved frequencies cancel. Repeat with a sine wave to
          detect the other phase.
        </p>
        <Tabs value={probe} onValueChange={(v) => setProbe(Number(v))}>
          <TabsList className="probe-tabs">
            <TabsTrigger value={0}>1 cycle in x</TabsTrigger>
            <TabsTrigger value={1}>2 cycles in y</TabsTrigger>
            <TabsTrigger value={2}>3 cycles in x</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="detect-grid">
          <div>
            <div className="formula-block">
              <span>Wave angle at sample (i, j)</span>
              <MathTex tex={phaseTex(kx, ky)} />
              <span>Cosine amplitude</span>
              <MathTex tex={E.cosine} />
              <span>Sine amplitude</span>
              <MathTex tex={E.sine} />
            </div>
            <p className="math-caption">
              Σ means “add over all pixels.” The factor 2/N² normalizes the sum:
              on this periodic grid, a resolved unit cosine has average squared
              value ½. This formula excludes the constant and Nyquist modes.
            </p>
            <div className="detected-result">
              <span>DETECTED FROM {n * n} SAMPLES</span>
              <strong>
                <MathTex tex={amplitudesTex(c.c, c.s)} inline />
              </strong>
              <p>
                These amplitudes were measured from the grid, not specified by
                the spot generator.{' '}
                {Math.max(kx, Math.abs(ky)) >= n / 2
                  ? 'This candidate is unresolved on this grid and is excluded from reconstruction.'
                  : 'They describe part of the spatial shape, not a wave we planted in the source.'}
              </p>
            </div>
          </div>
          <div className="pixel-calculation">
            <h4>Inspect one term in the sum</h4>
            <label>
              Sample index{' '}
              <b>
                {selected} / {n * n - 1}
              </b>
            </label>
            <Slider
              aria-label="Sample to inspect in the Fourier sum"
              min={0}
              max={n * n - 1}
              value={[selected]}
              onValueChange={(v) => setCell(Array.isArray(v) ? v[0] : v)}
            />
            <dl>
              <div>
                <dt>Position (x, y)</dt>
                <dd>
                  ({x.toFixed(3)}, {y.toFixed(3)})
                </dd>
              </div>
              <div>
                <dt>Measured Fᵢⱼ = f(xᵢ, yⱼ)</dt>
                <dd>{samples[selected].toFixed(4)}</dd>
              </div>
              <div>
                <dt>Candidate cos(θ)</dt>
                <dd>{basis.toFixed(4)}</dd>
              </div>
              <div>
                <dt>This pixel's product</dt>
                <dd>{term(selected).toFixed(4)}</dd>
              </div>
              <div>
                <dt>Sum of all {n * n} products</dt>
                <dd>{sum.toFixed(4)}</dd>
              </div>
              <div>
                <dt>Normalize: × 2/{n * n}</dt>
                <dd>{c.c.toFixed(4)}</dd>
              </div>
            </dl>
            <p>
              Move the sample index to see individual contributions. The final
              amplitude uses every sample, not just the selected one.
            </p>
          </div>
        </div>
      </div>
      <div className="detect-section">
        <span className="eyebrow">STEP B / PUT THE WAVES BACK TOGETHER</span>
        <h3>Now query the reconstructed field at any position.</h3>
        <p>
          For each resolved wave, multiply the cosine and sine by the amplitudes
          we just detected. Add the waves. Choosing a denser set of positions
          gives a higher-resolution image of this same reconstructed function.
        </p>
        <div className="equation">
          <MathTex tex={E.reconstruction} />
        </div>
        <p>
          We keep frequencies below the grid’s Nyquist limit: fewer than N/2
          cycles per axis, capped at 4 in this lab. At 4 × 4 that means only 1
          cycle per axis. Nyquist-frequency modes are omitted because they need
          special treatment.
        </p>
        <details>
          <summary>Reveal the physical-space generator</summary>
          <div className="equation">
            <MathTex tex={E.gaussian} />
          </div>
          <p>
            Hot spot: center (0.32, 0.38), amplitude 1.5, width 0.065. Cold
            spot: center (0.71, 0.66), amplitude −1.1, width 0.095. Periodic
            copies join opposite edges. No wave amplitudes appear in this
            generator. The reconstruction receives only its point samples.
          </p>
        </details>
        <div className="code-panel detection-code">
          <div className="code-header">
            TypeScript / the detection and reconstruction calculations
          </div>
          <pre>
            <code>{`// Detect one wave from measured pixels.\nlet a = 0, b = 0;\nfor (let j = 0; j < N; j++) {\n  for (let i = 0; i < N; i++) {\n    const theta = 2 * Math.PI * (kx*i/N + ky*j/N);\n    const measured = samples[j*N + i];\n    a += measured * Math.cos(theta);\n    b += measured * Math.sin(theta);\n  }\n}\na *= 2 / (N*N);\nb *= 2 / (N*N);\n\n// Repeat for all resolved modes. At ANY position (x,y):\nlet value = average(samples);\nfor (const {kx, ky, a, b} of detectedModes) {\n  const theta = 2 * Math.PI * (kx*x + ky*y);\n  value += a * Math.cos(theta) + b * Math.sin(theta);\n}\n// The implementation uses a direct DFT for clarity.\n// An FFT computes the same transform more efficiently.`}</code>
          </pre>
        </div>
      </div>
      <div className="neural-bridge">
        <span className="eyebrow">
          STEP C / WHERE DOES THE NEURAL OPERATOR ENTER?
        </span>
        <h3>Detection is math. Prediction is learned.</h3>
        <p>
          Everything above is a Fourier transform and reconstruction—no neural
          network was needed. To predict <em>future</em> temperature, we insert
          learned weights between those two operations:
        </p>
        <div className="bridge-flow">
          <span>Pixels</span>
          <ArrowRight size={17} />
          <span>
            Detect waves
            <br />
            <small>fixed Fourier transform</small>
          </span>
          <ArrowRight size={17} />
          <span className="learned-block">
            Scale each wave
            <br />
            <small>learned weight wₖ</small>
          </span>
          <ArrowRight size={17} />
          <span>
            Reconstruct
            <br />
            <small>on the output grid</small>
          </span>
        </div>
        <div className="equation">
          <MathTex tex={E.pairedStep} />
        </div>
        <p>
          For a resolved wave, this lab's training error is ½[(wₖaₖ −
          aₖ,target)² + (wₖbₖ − bₖ,target)²]. Gradient descent changes wₖ in the
          direction that reduces that error, averaged over training fields.
          You’ll watch that happen in “Learn an operator.”
        </p>
        <p>
          <b>So the operator does not “discover” missing pixels.</b> It learns
          how the detected patterns should change. The next example shows the
          physical change we want it to learn.
        </p>
      </div>
    </section>
  );
}
