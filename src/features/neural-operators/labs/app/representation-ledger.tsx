import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { E } from '@/features/neural-operators/labs/lib/equations';
import { ArrowRight } from 'lucide-react';
export default function RepresentationLedger({
  inputN,
  outputN,
  horizon,
}: {
  inputN: number;
  outputN: number;
  horizon: number;
}) {
  const k = Math.min(4, Math.floor((inputN - 1) / 2)),
    active = 2 * k * (k + 1);
  return (
    <section className="representation-ledger">
      <span className="eyebrow">WHAT WE ARE ACTUALLY COMPUTING</span>
      <h3>A fixed spectral discretization, with its amplitudes changed.</h3>
      <p>
        This model does not invent a continuous field free of discretization. It
        represents the field with selected sine/cosine functions, then changes
        their coefficients. The coordinates and frequencies of those functions
        stay fixed.
      </p>
      <div className="ledger-flow">
        <div>
          <b>1. Input pixels</b>
          <span>
            {inputN} × {inputN} measured numbers
          </span>
          <MathTex tex={String.raw`F_{ij}(t)`} inline />
        </div>
        <ArrowRight />
        <div>
          <b>2. Fixed transform</b>
          <span>Compute selected Fourier sums</span>
          <MathTex tex={String.raw`a_k(t),\;b_k(t)`} inline />
        </div>
        <ArrowRight />
        <div className="learned-block">
          <b>3. Learned multiplication</b>
          <span>One weight per mode for Δt</span>
          <MathTex tex={E.pairedStep} />
        </div>
        <ArrowRight />
        <div>
          <b>4. Fixed reconstruction</b>
          <span>
            {outputN} × {outputN} output positions
          </span>
          <MathTex
            tex={String.raw`\widetilde u(t+${horizon.toFixed(2)}\,\mathrm s)`}
            inline
          />
        </div>
      </div>
      <p>
        <strong>The coefficients and weights are different things.</strong>{' '}
        Coefficients aₖ and bₖ describe this particular measured field and are
        recomputed for each input. Weights wₖ describe its learned evolution
        over Δt and are reused for every input after training. Prediction
        changes the coefficients by multiplication; training changes the
        weights.
      </p>
      <div className="ledger-capacity">
        <b>Current model: cutoff K = 4, 40 learned multipliers.</b>
        <p>
          Each multiplier acts on a sine/cosine pair. For this {inputN} ×{' '}
          {inputN} input grid, {active} of the model’s wave vectors are below
          Nyquist; unresolved inputs are set to zero. The grid mean is preserved
          separately. No new frequency is created by this linear model.
        </p>
      </div>
      <div className="story-two">
        <div>
          <b>Change only output grid N</b>
          <p>
            16 × 16 → 96 × 96 evaluates the same finite Fourier sum at more
            points. It changes neither the frequencies nor the learned parameter
            count. Finer input measurements can improve coefficient estimates,
            if supplied.
          </p>
        </div>
        <div>
          <b>Change Fourier cutoff K</b>
          <p>
            K = 4 → 8 adds higher-frequency basis functions: 40 → 144
            multipliers in this convention. You need 104 new parameters,
            suitable training data, and a grid resolving those modes (for
            example 32 × 32). This is a model change, not just a new output
            grid.
          </p>
        </div>
      </div>
      <p>
        <strong>Yes: we have moved to another discretization.</strong> The
        benefit is reusing frequency-indexed parameters across spatial grids on
        the same domain. It is not unlimited resolution or automatic recovery of
        missing physics. A full FNO is richer, but still finite and approximate.
      </p>
      <details>
        <summary>
          Does “higher Fourier resolution” mean more modes or closer
          frequencies?
        </summary>
        <p>
          On a fixed domain of length L, ordinary Fourier-series frequencies are
          k/L, spaced 1/L apart. More sample points raise the highest resolvable
          frequency; they do not make this spacing smaller. Adding higher k is a
          higher cutoff. Changing the domain length or basis changes the
          physical frequencies and needs separate treatment.
        </p>
      </details>
    </section>
  );
}
