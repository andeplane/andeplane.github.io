'use client';
import { useMemo, useState } from 'react';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { E } from '@/features/neural-operators/labs/lib/equations';
import { spatialField } from '@/features/neural-operators/labs/lib/operator';
import { Heatmap } from './field-view';
export default function FieldFoundation({
  n,
  onNChange,
}: {
  n: number;
  onNChange: (n: number) => void;
}) {
  const [selected, setSelected] = useState(26);
  const fine = useMemo(() => spatialField(42, 96), []),
    samples = useMemo(() => spatialField(42, n), [n]);
  const p = Math.min(selected, n * n - 1),
    i = p % n,
    j = Math.floor(p / n);
  return (
    <section className="field-foundation">
      <span className="eyebrow">
        THE FOUNDATION / A CONTINUOUS FIELD AND ITS SAMPLES
      </span>
      <h2>There is a field. We only measure some of it.</h2>
      <p>
        Assume there is an underlying continuous scalar field{' '}
        <MathTex tex={String.raw`f(x,y)`} inline />. For example, it gives the
        temperature at <em>any</em> physical position on a plate. The field
        exists independently of our grid and independently of any neural
        network.
      </p>
      <div className="math-display">
        <MathTex tex={E.samples} />
      </div>
      <p>
        <MathTex tex={String.raw`x_i,y_j`} inline /> are physical coordinates.{' '}
        <MathTex tex={String.raw`i,j`} inline /> are integer array indices.{' '}
        <MathTex tex={String.raw`F_{ij}`} inline /> is one sampled value—not the
        whole function. In this lab the plate is a unit square and the samples
        are equally spaced.
      </p>
      <div className="foundation-controls">
        <label>
          Measurement grid{' '}
          <b>
            {n} × {n}
          </b>
        </label>
        <Slider
          aria-label="Foundation measurement grid"
          min={4}
          max={16}
          step={4}
          value={[n]}
          onValueChange={(v) => onNChange(Array.isArray(v) ? v[0] : v)}
        />
      </div>
      <div className="foundation-fields">
        <figure>
          <figcaption>
            <MathTex tex={String.raw`f(x,y)`} inline />
            <b>The underlying field</b>
          </figcaption>
          <div className="point-overlay">
            <Heatmap
              values={fine}
              n={96}
              label="Underlying spatial temperature field rendered densely for display"
            />
            <span
              className="sample-marker"
              style={{ left: `${(100 * i) / n}%`, top: `${(100 * j) / n}%` }}
            />
          </div>
          <p>
            Localized hot and cold spots defined directly in space. The display
            uses a dense grid to visualize the known reference.
          </p>
        </figure>
        <figure>
          <figcaption>
            <MathTex tex={String.raw`F_{ij}=f(x_i,y_j)`} inline />
            <b>The measurements we get</b>
          </figcaption>
          <div className="point-overlay">
            <Heatmap
              values={samples}
              n={n}
              label={`${n} by ${n} sampled temperature measurements`}
            />
            <span
              className="sample-cell"
              style={{
                left: `${(100 * i) / n}%`,
                top: `${(100 * j) / n}%`,
                width: `${100 / n}%`,
                height: `${100 / n}%`,
              }}
            />
          </div>
          <p>
            {n * n} numbers plus their coordinates. Each pixel shows one point
            measurement. Changing the grid does not change the underlying field.
          </p>
        </figure>
      </div>
      <div className="sample-inspector">
        <label>
          Inspect one measurement{' '}
          <b>
            array index ({i}, {j})
          </b>
        </label>
        <Slider
          aria-label="Measurement to inspect on the field"
          min={0}
          max={n * n - 1}
          step={1}
          value={[p]}
          onValueChange={(v) => setSelected(Array.isArray(v) ? v[0] : v)}
        />
        <MathTex
          tex={String.raw`F_{${i},${j}}=f\!\left(\frac{${i}}{${n}},\frac{${j}}{${n}}\right)=f(${(i / n).toFixed(3)},${(j / n).toFixed(3)})=${samples[p].toFixed(4)}`}
        />
      </div>
      <div className="foundation-distinction">
        <h3>The next question is reconstruction—not prediction yet.</h3>
        <div className="math-display">
          <MathTex
            tex={String.raw`\{(x_i,y_j,F_{ij})\}\;\xrightarrow{\ \text{choose and fit a representation}\ }\;\widetilde f(x,y)\;\approx\;f(x,y)`}
          />
        </div>
        <p>
          The tilde marks an approximation. We choose a representation and fit
          it to the samples. A finite Fourier sum is one choice; interpolation
          is another. Neither guarantees the hidden true field between
          measurements.
        </p>
        <p>
          In the reconstruction code, we deliberately hide the spatial formula.
          It receives only the sampled array and coordinates. The known
          reference is used afterward to measure error.
        </p>
        <details>
          <summary>
            Why do the samples not uniquely determine the field?
          </summary>
          <MathTex
            tex={String.raw`h(x,y)=f(x,y)+\varepsilon\sin(2\pi N_xx),\qquad h(x_i,y_j)=f(x_i,y_j)=F_{ij}`}
          />
          <p>
            The added wave is zero at every sample position, so these two
            different continuous fields produce identical measured arrays.
            Assumptions about smoothness, bandwidth or physics are needed to
            choose between them.
          </p>
        </details>
      </div>
    </section>
  );
}
