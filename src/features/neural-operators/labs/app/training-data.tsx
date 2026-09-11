'use client';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { productTex } from '@/features/neural-operators/labs/lib/equations';
import { useState } from 'react';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
import { Heatmap } from './field-view';
import { field, modes, average, type Coeff } from '@/features/neural-operators/labs/lib/operator';
export default function TrainingData({
  data,
  weights,
  horizon,
}: {
  data: { x: Coeff; y: Coeff; inputPixels: number[]; targetPixels: number[] }[];
  weights: number[];
  horizon: number;
}) {
  const [pair, setPair] = useState(0);
  const { x, y, inputPixels, targetPixels } = data[pair],
    k = modes.findIndex(([kx, ky]) => kx === 1 && ky === 0);
  return (
    <section className="training-data">
      <span className="eyebrow">EXACTLY WHAT GOES INTO TRAINING</span>
      <h3>Pairs of pixel grids. Not one mystery input.</h3>
      <p>
        We generate 24 different spatial hot/cold spot arrangements. A physics
        solver supplies the future map for each. Both are stored as 16 × 16
        numbers, then converted to coefficients using the same pixel sums from
        step 2. Every pair has the same elapsed time Δt = {horizon.toFixed(2)}{' '}
        seconds. Our walkthrough field is kept out of training.
      </p>
      <label>
        Inspect training pair <b>{pair + 1} / 24</b>
      </label>
      <Slider
        aria-label="Training example pair"
        value={[pair]}
        min={0}
        max={23}
        step={1}
        onValueChange={(v) => setPair(Array.isArray(v) ? v[0] : v)}
      />
      <div className="map-grid three">
        <figure className="field-card">
          <figcaption>
            Input pixels<span>t = 0 s · 16 × 16</span>
          </figcaption>
          <Heatmap
            values={inputPixels}
            n={16}
            label={`Training pair ${pair + 1} input temperature pixels`}
          />
        </figure>
        <figure className="field-card">
          <figcaption>
            Target pixels<span>t = {horizon.toFixed(2)} s · from physics</span>
          </figcaption>
          <Heatmap
            values={targetPixels}
            n={16}
            label={`Training pair ${pair + 1} target future temperature pixels`}
          />
        </figure>
        <figure className="field-card">
          <figcaption>
            Current guess<span>Predicted t = {horizon.toFixed(2)} s</span>
          </figcaption>
          <Heatmap
            values={field(x, 16, weights).map((v) => v + average(inputPixels))}
            n={16}
            label={`Current prediction on training pair ${pair + 1}`}
          />
        </figure>
      </div>
      <div className="one-weight">
        <b>Follow one number: the 1-cycle-x cosine</b>
        <p>
          Pixel sums detect input amplitude <code>{x[k].c.toFixed(4)}</code> and
          target amplitude <code>{y[k].c.toFixed(4)}</code>.
        </p>
        <div className="equation">
          <MathTex tex={productTex(x[k].c, weights[k])} />
        </div>
        <p>
          The model changes the <strong>weight</strong> to move that prediction
          toward {y[k].c.toFixed(4)}. It updates all 40 weights using all 24
          pairs, including both sine and cosine coefficients. Fourier transforms
          and reconstruction formulas never change.
        </p>
      </div>
    </section>
  );
}
