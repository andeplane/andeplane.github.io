'use client';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { E } from '@/features/neural-operators/labs/lib/equations';
import { useMemo, useState } from 'react';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
export default function DiscretizationLab() {
  const [n, setN] = useState(16),
    [cutoff, setCutoff] = useState(4);
  const count = 2 * cutoff * (cutoff + 1),
    known = 2 * Math.min(cutoff, 4) * (Math.min(cutoff, 4) + 1);
  const frequencies = useMemo(
    () => Array.from({ length: cutoff }, (_, i) => i + 1),
    [cutoff],
  );
  return (
    <section className="discretization-lab">
      <span className="eyebrow">
        TWO INDEPENDENT CHOICES / YES, BOTH ARE DISCRETIZATIONS
      </span>
      <h3>More sample points ≠ more trained frequencies.</h3>
      <p>
        On the same unit-size domain, frequency k = 3 always means three cycles
        across the domain. Increasing N changes how many samples describe those
        cycles. Increasing K adds higher-frequency modes, which need their own
        model parameters.
      </p>
      <div className="resolution-controls">
        <div>
          <label>
            Spatial grid N × N{' '}
            <b>
              {n} × {n}
            </b>
          </label>
          <Slider
            aria-label="Spatial grid in discretization explanation"
            min={8}
            max={64}
            step={8}
            value={[n]}
            onValueChange={(v) => setN(Array.isArray(v) ? v[0] : v)}
          />
          <p>
            {n * n} measured or evaluated positions. Frequency spacing stays 1
            cycle per domain; the Nyquist limit changes to {n / 2} cycles.
          </p>
        </div>
        <div>
          <label>
            Frequency cutoff K <b>{cutoff}</b>
          </label>
          <Slider
            aria-label="Retained frequency cutoff in discretization explanation"
            min={1}
            max={12}
            step={1}
            value={[cutoff]}
            onValueChange={(v) => setCutoff(Array.isArray(v) ? v[0] : v)}
          />
          <p>
            {count} real-basis wave vectors in this 2D convention, each with
            sine and cosine amplitudes and one shared learned multiplier.
          </p>
        </div>
      </div>
      <div className="frequency-cells">
        {frequencies.map((k) => (
          <div
            key={k}
            className={
              k >= n / 2
                ? 'frequency-unresolved'
                : k > 4
                  ? 'frequency-new'
                  : 'frequency-trained'
            }
          >
            <b>k = {k}</b>
            <span>
              {k >= n / 2
                ? 'unresolved on grid'
                : k > 4
                  ? 'new parameter needed'
                  : 'existing parameter'}
            </span>
          </div>
        ))}
      </div>
      <p className="math-caption">
        The tiles show axis frequencies only; the parameter count includes all
        2D directions. The actual lab allocates K = 4 (40 multipliers).
        “Existing” means allocated by that model, not necessarily trained yet.
        This explanation does not change the model.
      </p>
      <div className="theory-callout">
        <b>
          {cutoff > 4
            ? `${count - known} additional parameters would need fitting.`
            : 'Changing N alone adds no learned parameters.'}
        </b>
        <p>
          {cutoff >= n / 2
            ? 'Some selected frequencies cannot be resolved on this spatial grid; increase N or lower K.'
            : 'The selected frequencies fit within this grid’s sampling limit.'}{' '}
          Evaluating more output points can make a smooth representation look
          smoother. Increasing K can represent smaller structures, but needs
          adequate measurements and training data.
        </p>
      </div>
      <div className="equation">
        <MathTex tex={E.diagonal} />
      </div>
      <p>
        So yes: the browser model is a finite-dimensional approximation. Its
        useful property is parameter reuse across spatial grids for fixed
        physical frequencies. A full FNO replaces scalar multipliers by
        channel-mixing matrices and stacks nonlinear layers; it still has finite
        resolution, finite parameters and approximation error.
      </p>
    </section>
  );
}
