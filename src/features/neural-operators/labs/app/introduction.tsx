'use client';

import SamplingLab from './sampling-lab';
import FieldFoundation from './field-foundation';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import TransportLab from './transport-lab';
import { useMemo, useState, useEffect } from 'react';
import { ArrowRight, Play, Pause } from 'lucide-react';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
import { spatialField } from '@/features/neural-operators/labs/lib/operator';
import { Heatmap } from './field-view';
export default function Introduction({
  onContinue,
  n,
  onNChange,
  diffusivity,
  horizon,
}: {
  onContinue: () => void;
  n: number;
  onNChange: (n: number) => void;
  diffusivity: number;
  horizon: number;
}) {
  const [time, setTime] = useState(horizon),
    [playing, setPlaying] = useState(false);
  const initial = useMemo(() => spatialField(42, 48), []);
  const future = useMemo(
    () => spatialField(42, 48, time, diffusivity),
    [time, diffusivity],
  );
  useEffect(() => {
    if (!playing) return;
    if (time >= 1) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setTime((t) => Math.min(1, t + 0.015)), 50);
    return () => clearTimeout(id);
  }, [playing, time]);
  return (
    <div className="introduction">
      <FieldFoundation n={n} onNChange={onNChange} />
      <div className="story-intro">
        <span className="eyebrow">ONLY NOW ADD PHYSICAL TIME</span>
        <h2>How will that same field change?</h2>
        <p>
          Until now, <MathTex tex={String.raw`f(x,y)`} inline /> described one
          snapshot. When the field evolves, write{' '}
          <MathTex tex={String.raw`u(x,y,t)`} inline />. We have not changed the
          meaning of a field; we have added a time coordinate.
        </p>
        <div className="math-display">
          <MathTex
            tex={String.raw`f(x,y)=u(x,y,0),\qquad F_{ij}(t)=u(x_i,y_j,t)`}
          />
        </div>
        <p>
          An <strong>operator</strong> is a mapping from one entire field to
          another. The heat-evolution operator maps the initial field to a later
          field. A numerical or learned implementation receives sampled
          representations of those fields.
        </p>
        <div className="math-display">
          <MathTex
            tex={String.raw`\mathcal G_{\Delta t}:u(\cdot,\cdot,t)\longmapsto u(\cdot,\cdot,t+\Delta t)`}
          />
        </div>
        <p>
          The dots mean “the whole spatial field,” not one temperature value. In
          the learning experiment, one application advances a fixed{' '}
          <MathTex
            tex={String.raw`\Delta t=${horizon.toFixed(2)}\,\mathrm s`}
            inline
          />
          . Training updates fit the model; they do not advance physical time.
        </p>
        <div className="story-two">
          <div>
            <b>Steps 1–2: represent one snapshot</b>
            <p>
              Continuous field → measured samples → approximate reconstructed
              field. Time stays at zero.
            </p>
          </div>
          <div>
            <b>Steps 3–4: learn and apply its evolution</b>
            <p>
              Use example snapshot pairs to fit a model for one time jump, then
              apply it to an unseen field.
            </p>
          </div>
        </div>
        <p>
          The first learned model will be deliberately simple: after converting
          samples into Fourier coefficients, multiply each coefficient by a
          learned number for that frequency and time jump. Those numbers are
          weights. We introduce this model in detail before training it; the
          Theory tab then expands it to a full FNO.
        </p>
      </div>
      <section className="intro-lab">
        <div className="intro-explanation">
          <span className="eyebrow">
            START HERE / NO MACHINE LEARNING REQUIRED
          </span>
          <h2>Now evolve that same temperature field.</h2>
          <p>
            Some places are warmer than others. We know the temperature{' '}
            <strong>everywhere right now</strong>. We want the temperature
            everywhere a little later.
          </p>
          <p>
            Heat flows from warmer places to cooler ones, so the pattern
            gradually smooths out. Move time forward to see it happen.
          </p>
          <label className="intro-range-label">
            Exact simulator: elapsed time t <b>{time.toFixed(2)} seconds</b>
          </label>
          <Slider
            aria-label="Introduction simulation time"
            min={0}
            max={1}
            step={0.01}
            value={[time]}
            onValueChange={(v) => {
              setPlaying(false);
              setTime(Array.isArray(v) ? v[0] : v);
            }}
          />
          <div className="intro-actions">
            <button
              className="primary"
              onClick={() => {
                if (time >= 1) setTime(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}{' '}
              {playing ? 'Pause' : 'Watch heat spread'}
            </button>
          </div>
          <p className="intro-caption">
            This simulation below uses an exact heat calculation at the selected
            elapsed time; it has no trained model or time-stepping
            approximation. It uses diffusivity ν = {diffusivity.toFixed(3)}.
            This slider explores exact physical time; the learned model in step
            3 instead fits a single fixed jump Δt. No neural network yet. To
            keep the example simple, opposite edges are connected.
          </p>
        </div>
        <div className="intro-diagram">
          <div className="mapping-label">
            <span>INPUT</span>
            <span>OUTPUT</span>
          </div>
          <div className="intro-fields">
            <div>
              <Heatmap
                values={initial}
                n={48}
                label="Initial temperature map"
              />
              <h3>Temperature at t = 0</h3>
              <p>One value at every position</p>
            </div>
            <div className="operator-arrow">
              <ArrowRight />
            </div>
            <div>
              <Heatmap
                values={future}
                n={48}
                label="Temperature after heat diffusion"
              />
              <h3>Temperature at t = {time.toFixed(2)} s</h3>
              <p>A new value at every position</p>
            </div>
          </div>
          <div className="rule-box">
            <span>THE OPERATOR</span>
            <strong>
              The heat-evolution computation: initial temperature field →
              temperature field after the selected elapsed time.
            </strong>
          </div>
          <div className="intro-legend">
            <i /> cool <span /> warm &nbsp; · &nbsp; same color scale on both
            maps
          </div>
        </div>
      </section>
      <section className="plain-concept">
        <span className="eyebrow">01 / WHAT IS AN OPERATOR?</span>
        <h2>A rule for entire fields.</h2>
        <div className="concept-comparison">
          <div>
            <span>A regular function</span>
            <div className="word-equation">
              one number <ArrowRight /> another number
            </div>
            <p>Example: square 3 to get 9.</p>
          </div>
          <div className="chosen">
            <span>An operator</span>
            <div className="word-equation">
              a whole field <ArrowRight /> another field
            </div>
            <p>
              Example: turn today's temperature map into a future temperature
              map.
            </p>
          </div>
        </div>
        <p>
          A <strong>field</strong> just means “a value at each position.” An
          image is a color field. A weather map is a temperature field. A fluid
          simulation has pressure and velocity fields. A grid is how we store
          samples of these fields on a computer.
        </p>
      </section>
      <section className="plain-concept">
        <span className="eyebrow">02 / WHAT MAKES IT NEURAL?</span>
        <h2>We learn the rule from examples.</h2>
        <p>
          A physics solver computes the future by following an equation. A
          neural operator learns to imitate the input-to-output mapping from
          many solved examples. It must work for starting patterns it has never
          seen.
        </p>
        <div className="learning-cards">
          <article>
            <span>1</span>
            <h3>Show it examples</h3>
            <p>
              Generate many different starting maps. Use physics to calculate
              the correct future map for each one.
            </p>
            <div className="mini-equation">starting map → correct future</div>
          </article>
          <article>
            <span>2</span>
            <h3>Predict, compare, adjust</h3>
            <p>
              The model guesses a future map. Measure its error against the
              correct map. Adjust its weights to reduce that error. Repeat.
            </p>
            <div className="mini-equation">guess → error → weight update ↺</div>
          </article>
          <article>
            <span>3</span>
            <h3>Try a new starting map</h3>
            <p>
              Keep the learned weights fixed. Give it an unseen initial field
              and check the prediction against physics.
            </p>
            <div className="mini-equation">
              new input → learned rule → prediction
            </div>
          </article>
        </div>
        <div className="concrete-example">
          <b>What does a “weight” actually do here?</b>
          <p>
            Imagine a temperature pattern made of one wave. Heat makes that wave
            flatter. A weight of <code>0.8</code> means “keep 80% of its
            starting amplitude.” Our model learns a different multiplier for
            each wave frequency. It learns these numbers from examples, rather
            than being given the heat equation's formula.
          </p>
        </div>
      </section>
      <section className="plain-concept">
        <span className="eyebrow">03 / HOW CAN IT WORK ON A FINER GRID?</span>
        <h2>Attach the weights to patterns, not pixel positions.</h2>
        <p>
          This lab uses a <strong>spectral operator</strong>. “Spectral” means
          we describe the temperature map as a sum of waves. Big, broad waves
          describe large structures; short waves describe fine details.
        </p>
        <ol className="how-list">
          <li>
            <b>Read the field as waves.</b>
            <span>
              The Fourier transform tells us how much of each wave the input
              contains.
            </span>
          </li>
          <li>
            <b>Apply the learned multipliers.</b>
            <span>
              Each wave's amplitude is scaled by its trained weight. For heat,
              short waves usually fade faster.
            </span>
          </li>
          <li>
            <b>Add the waves back together.</b>
            <span>
              Evaluate their sum at the points of a 16 × 16, 64 × 64, or 96 × 96
              grid. The wave frequencies and weights stay the same.
            </span>
          </li>
        </ol>
        <div className="concrete-example">
          <b>The important distinction for upscaling</b>
          <p>
            Evaluating a learned field on more points does not magically reveal
            missing details. In this story we start from the measured coarse
            pixels, recover the waves they resolve, apply learned physics, then
            sample the prediction on a finer grid. This works well for the
            spatial-spot example only approximately, because it contains
            frequencies beyond our finite mode set. If a wave is missing or
            aliased in the input, the model cannot uniquely recover it. Step 4
            also lets you explicitly supply new fine measurements to see the
            difference.
          </p>
        </div>
        <p className="intro-caption">
          A full Fourier neural operator (FNO) combines multiple spectral
          layers, feature channels, and nonlinearities. We start with one linear
          spectral layer because heat diffusion is linear: you can understand
          every learned parameter.
        </p>
      </section>
      <details className="optional-example">
        <summary>Another operator: transporting a dye pattern</summary>
        <TransportLab />
      </details>
      <details className="optional-example">
        <summary>Follow every pixel-to-Fourier sum (also in step 2)</summary>
        <SamplingLab n={n} onNChange={onNChange} />
      </details>
      <div className="intro-next">
        <div>
          <h3>Now test each piece yourself.</h3>
          <p>
            First, measure the spatial hot and cold spots. Then reconstruct from
            those measured pixels.
          </p>
        </div>
        <button className="primary" onClick={onContinue}>
          Step 1: measure the field <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
