'use client';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import { E } from '@/features/neural-operators/labs/lib/equations';
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Slider } from '@/features/neural-operators/labs/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/features/neural-operators/labs/components/ui/tabs';
import {
  ArrowRight,
  FlaskConical,
  Play,
  RotateCcw,
  Code2,
  Check,
  Box,
} from 'lucide-react';
import {
  field,
  modes,
  multiplier,
  dataset,
  trainStep,
  relativeError,
  interpolate,
  project,
  spatialField,
  average,
} from '@/features/neural-operators/labs/lib/operator';
import { Heatmap, Surface } from './field-view';
import Introduction from './introduction';
import SamplingLab from './sampling-lab';
import TrainingData from './training-data';
import Theory from './theory';
import DiscretizationLab from './discretization-lab';
import RepresentationLedger from './representation-ledger';
const lessons = [
  'Field → pixels',
  'Pixels → waves',
  'Learn the change',
  'Predict finer',
];
const titles = [
  'A real shape.\nA few measurements.',
  'A field, written\nas waves.',
  'What changes\nbetween two maps?',
  'A finer grid.\nThe same operator.',
];
const description = [
  [
    'Start with a narrow hot spot and a broader cold spot, defined directly in space. We measure temperatures on a grid. These same pixels are the input to steps 2 and 4.',
    'At a coarse resolution, a measurement can miss a peak. Next we will estimate the whole current field from these pixels. Interpolation is an optional baseline here, not the learning method.',
  ],
  [
    'The input is the measured pixel grid from step 1. Multiply those numbers by candidate sine and cosine waves and sum them to detect each wave’s amplitude.',
    'Reconstruct the current field by adding the detected waves. No learning is involved. This is the representation the model in step 3 will use.',
  ],
  [
    'Now we change the task: instead of reconstructing today’s field, predict its future. We learn from 24 pairs of temperature maps: now and later.',
    'Each pair starts as two 16 × 16 pixel grids. Step 2 turns them into wave amplitudes. Our model multiplies each amplitude by an adjustable number to predict its amplitude after Δt. These numbers are called weights. Training fits these multipliers; the pixel-to-wave calculation itself is fixed.',
  ],
  [
    'Return to our original field, which was never in the training set. Read its measured pixels, compute coefficients, multiply by learned weights, and reconstruct the future on a finer grid.',
    'The default input is the same coarse grid you used in steps 1–2. More output points do not add observations. If the input grid misses a wave, the prediction can miss it too.',
  ],
];
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label>
        {label}
        <b>{format ?? value}</b>
      </label>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );
}
const code = [
  `// The ground-truth shape is defined in physical space.
// One localized hot spot has the form:
const temperature = A * Math.exp(
  -((x-x0)**2 + (y-y0)**2) / (2*sigma**2)
);
// Our field combines hot/cold spots and periodic copies.
// Measure it at N*N positions:
for (let j=0; j<N; j++) for (let i=0; i<N; i++)
  pixels[j*N+i] = spatialTemperature(i/N,j/N);
// Reconstruction receives ONLY pixels and coordinates.
// It is not given A, sigma, x0, y0 or this formula.`,
  `// Input: EXACTLY the pixel numbers from step 1.
const detected = modes.map(([kx,ky]) => {
  if (Math.max(kx,Math.abs(ky)) >= N/2) return {c:0,s:0};
  let c = 0, s = 0;
  for (let j=0; j<N; j++) for (let i=0; i<N; i++) {
    const angle = 2*Math.PI*(kx*i/N + ky*j/N);
    c += pixels[j*N+i] * Math.cos(angle) * 2/(N*N);
    s += pixels[j*N+i] * Math.sin(angle) * 2/(N*N);
  }
  return {c,s};
});
// Keep only resolved modes: |kx|, |ky| < N/2.
// Reconstruct by evaluating the sum of detected waves.
const currentField = field(detected, outputSize)
  .map(v => v + average(pixels));
// Still no training: fixed math, computed coefficients.`,
  `// Every pair spans the same physical time jump, deltaT.
// now: t=0. later: t=deltaT. Training updates are NOT time steps.
const data = pixelPairs.map(({now,later}) => ({
  x: project(now,16),   // same DFT as step 2
  y: project(later,16), // target comes from physics
}));
// The only learned parameters are weights[k].
for (let k=0; k<weights.length; k++) {
  let gradient=0;
  for (const {x,y} of data) {
    const dc = weights[k]*x[k].c - y[k].c;
    const ds = weights[k]*x[k].s - y[k].s;
    gradient += dc*x[k].c + ds*x[k].s;
  }
  weights[k] -= 20 * gradient/data.length;
}
// DFT and reconstruction stay fixed. Repeat updates.`,
  `// One prediction advances from t to t+deltaT.
// The weights were trained for this fixed deltaT.
// Return to the walkthrough field's measured pixels.
const detected = project(inputPixels, inputN);
// Remove unresolved modes, just like step 2.
for (let k=0; k<modes.length; k++) {
  const [kx,ky] = modes[k];
  if (Math.max(kx,Math.abs(ky)) >= inputN/2)
    detected[k] = {c:0,s:0};
}
// Step 2 would reconstruct the CURRENT field:
const current = field(detected, outputN).map(v=>v+average(inputPixels));
// Learned weights transform it into the FUTURE field:
const future = field(detected, outputN, weights)
  .map(v=>v+average(inputPixels));
// Inside field(): c and s are multiplied by weights[k].
// outputN changes sampling, not learned parameters.`,
];
export default function FourierCaseStudy() {
  const [lesson, setLesson] = useState(-1),
    [n, setN] = useState(8),
    [inputSource, setInputSource] = useState('coarse'),
    [seed, setSeed] = useState(42),
    [resolution, setResolution] = useState(64),
    [nu, setNu] = useState(0.02),
    [time, setTime] = useState(0.3),
    [weights, setWeights] = useState(() => modes.map(() => 0.1)),
    [epoch, setEpoch] = useState(0),
    [running, setRunning] = useState(false),
    [losses, setLosses] = useState<number[]>([]),
    [view, setView] = useState('2d'),
    [method, setMethod] = useState('none'),
    [quiz, setQuiz] = useState<number | null>(null),
    [copied, setCopied] = useState(false);

  const inputN = inputSource === 'coarse' ? n : resolution;
  const data = useMemo(() => dataset(nu, time), [nu, time]);
  const exact = useMemo(
    () => modes.map((_, k) => multiplier(k, nu, time)),
    [nu, time],
  );
  const truth = useMemo(
    () => spatialField(seed, resolution, time, nu),
    [seed, resolution, time, nu],
  );
  const fineInputModes = useMemo(
    () =>
      project(spatialField(seed, inputN), inputN).map((c, k) =>
        Math.max(modes[k][0], Math.abs(modes[k][1])) < inputN / 2
          ? c
          : { c: 0, s: 0 },
      ),
    [seed, inputN],
  );
  const prediction = useMemo(
    () =>
      field(fineInputModes, resolution, weights).map(
        (v) => v + average(spatialField(seed, inputN)),
      ),
    [fineInputModes, resolution, weights, seed, inputN],
  );
  const full = useMemo(() => spatialField(42, 64), []);
  const coarse = useMemo(() => spatialField(42, n), [n]);
  const up = useMemo(
    () => interpolate(coarse, n, 64, method === 'nearest'),
    [coarse, n, method],
  );
  const reset = () => {
    setRunning(false);
    setWeights(modes.map(() => 0.1));
    setEpoch(0);
    setLosses([]);
  };
  useEffect(() => {
    if (!running || epoch >= 400) return;
    const timer = setTimeout(() => {
      let current = weights;
      let loss = 0;
      for (let i = 0; i < 5; i++) {
        const result = trainStep(current, data);
        current = result.weights;
        loss = result.loss;
      }
      setWeights(current);
      setLosses((h) => [...h, loss]);
      setEpoch((e) => e + 5);
    }, 40);
    return () => clearTimeout(timer);
  }, [running, data, weights, epoch]);
  useEffect(() => {
    if (epoch >= 400) setRunning(false);
  }, [epoch]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: unknown,
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context) return;
    const life = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'open_operator_lesson',
            description:
              'Open one of the four interactive neural operator lessons.',
            inputSchema: {
              type: 'object',
              properties: {
                lesson: { type: 'integer', minimum: 1, maximum: 4 },
              },
              required: ['lesson'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: (input: unknown) => {
              const v = (input as { lesson?: number })?.lesson;
              if (!Number.isInteger(v) || v! < 1 || v! > 4)
                throw Error('lesson must be an integer from 1 to 4');
              flushSync(() => setLesson(v! - 1));
              return { lesson: v, title: lessons[v! - 1] };
            },
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => life.abort();
  }, []);
  const err = relativeError(prediction, truth);
  const storyMode = modes.findIndex(([x, y]) => x === 1 && y === 0);
  const metric = (v: number) => (v * 100).toFixed(2) + '%';
  return (
    <div className="fourier-case-study">
      <div className="shell case-study-shell">
        <div className="chapter-bridge"><strong>Optional case study: Fourier representation → a learned heat map.</strong><p>This is our teaching experiment, not the paper’s Navier–Stokes benchmark. Its trainable model is linear in Fourier coefficients. The Theory & code tab distinguishes it from a full nonlinear FNO.</p></div>
        <Tabs
          value={lesson}
          onValueChange={(v) => {
            setLesson(Number(v));
            setQuiz(null);
          }}
        >
          <TabsList className="steps lesson-tabs" aria-label="Learning path">
            <TabsTrigger value={-1}>
              <span className="step-number">→</span>Start here
            </TabsTrigger>
            {lessons.map((l, i) => (
              <TabsTrigger key={l} value={i}>
                <span className="step-number">0{i + 1}</span>
                {l}
                {i < 3 && <ArrowRight className="step-arrow" size={15} />}
              </TabsTrigger>
            ))}
            <TabsTrigger value={4}>
              <span className="step-number">∑</span>Theory & code
            </TabsTrigger>
          </TabsList>
          <TabsContent value={4}>
            <Theory />
          </TabsContent>
          <TabsContent value={-1}>
            <Introduction
              diffusivity={nu}
              horizon={time}
              n={n}
              onNChange={setN}
              onContinue={() => {
                setLesson(0);
                window.scrollTo({ top: 180, behavior: 'smooth' });
              }}
            />
          </TabsContent>
          {lessons.map((l, i) => (
            <TabsContent key={l} value={i}>
              <div className="chapter-bridge">
                <span className="eyebrow">
                  {i < 2
                    ? 'CURRENT FIELD AT t = 0 / NO LEARNING OR TIME EVOLUTION'
                    : 'PREDICT THE FUTURE FIELD / LEARNED WEIGHTS'}
                </span>
                <p>
                  {
                    [
                      'Start with localized hot/cold spots, then measure a coarse grid. Step 2 receives only these pixel values and their coordinates. Interpolation is available as an optional baseline.',
                      'Input: exactly the pixels from step 1. Output: measured wave coefficients and an approximate reconstructed current field. We compute the coefficients here; they are not given to us.',
                      'Input: 24 visible pairs of pixel grids, now and later. Step 2’s Fourier transform encodes both. Only the multipliers between their coefficients are learned.',
                      'Input: the original field’s pixels (or another unseen test field). Transform → learned multipliers → reconstruct. The output is now the future field.',
                    ][i]
                  }
                </p>
              </div>
              {i === 2 && (
                <section className="model-primer">
                  <span className="eyebrow">
                    BEFORE TRAINING / WHAT MODEL ARE WE BUILDING?
                  </span>
                  <h3>An adjustable rule for how each wave changes.</h3>
                  <p>
                    An <strong>operator</strong> maps one whole field to
                    another. Here: temperature now → temperature later. We
                    represent both fields using the pixel-to-wave transform from
                    step 2.
                  </p>
                  <p>
                    Our first model is a <strong>linear spectral model</strong>,
                    not a full multilayer neural network. Each wave amplitude is
                    multiplied by an adjustable number, called a{' '}
                    <strong>weight</strong>. A weight of 0.8 means “keep 80% of
                    that wave’s amplitude after the chosen time jump Δt.” One
                    weight is reused for that frequency across every input
                    field. In f(x) = ax + b language, our multiplier plays the
                    role of a and b is zero. “Linear” means that doubling all
                    input amplitudes doubles the prediction; there are no
                    nonlinear activations in this first model.
                  </p>
                  <div className="equation">
                    <MathTex tex={E.timestep} />
                  </div>
                  <div className="time-contract">
                    <span className="eyebrow">
                      THE TIME CONTRACT FOR THIS MODEL
                    </span>
                    <h4>One prediction = one {time.toFixed(2)}-second jump.</h4>
                    <div className="time-flow">
                      <span>
                        Input field
                        <br />
                        <b>t = 0 s</b>
                      </span>
                      <ArrowRight />
                      <span>
                        Apply model once
                        <br />
                        <b>Δt = {time.toFixed(2)} s</b>
                      </span>
                      <ArrowRight />
                      <span>
                        Predicted field
                        <br />
                        <b>t = {time.toFixed(2)} s</b>
                      </span>
                    </div>
                    <p>
                      Every training target is {time.toFixed(2)} seconds after
                      its input. The “400 iterations” counter counts weight
                      updates, not seconds or simulation steps. The app predicts
                      one jump. Repeated application would advance 0 →{' '}
                      {time.toFixed(2)} → {(2 * time).toFixed(2)} seconds and
                      accumulate model error; that rollout is not what this
                      chart displays.
                    </p>
                  </div>
                  <p>
                    We start these 40 multipliers at 0.1, an intentionally poor
                    guess. Training compares predictions with known future
                    fields and adjusts the multipliers. The Fourier transform is
                    fixed; only the multipliers learn. The Theory tab then
                    expands this into a full FNO with learned channels and
                    nonlinear layers.
                  </p>
                </section>
              )}
              {i >= 2 && (
                <RepresentationLedger
                  inputN={i === 2 ? 16 : inputN}
                  outputN={i === 2 ? 16 : resolution}
                  horizon={time}
                />
              )}
              {i === 1 ? (
                <SamplingLab n={n} onNChange={setN} />
              ) : (
                <section className="workspace">
                  <aside className="lesson">
                    <span className="eyebrow">
                      EXPERIMENT 0{i + 1} /{' '}
                      {
                        [
                          'THE INTUITION',
                          'THE BUILDING BLOCK',
                          'THE LEARNING',
                          'THE APPLICATION',
                        ][i]
                      }
                    </span>
                    <h2>
                      {titles[i].split('\n').map((v, j) => (
                        <span key={v}>
                          {j > 0 && <br />}
                          {v}
                        </span>
                      ))}
                    </h2>
                    {description[i].map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                    {i === 0 && (
                      <>
                        <Range
                          label="Measurement grid"
                          value={n}
                          min={4}
                          max={16}
                          step={4}
                          format={`${n} × ${n}`}
                          onChange={setN}
                        />
                        <div className="toggle-label">
                          Optional interpolation baseline
                        </div>
                        <Tabs
                          value={method}
                          onValueChange={(v) => setMethod(String(v))}
                        >
                          <TabsList className="small-tabs">
                            <TabsTrigger value="none">Off</TabsTrigger>
                            <TabsTrigger value="bilinear">Bilinear</TabsTrigger>
                            <TabsTrigger value="nearest">Nearest</TabsTrigger>
                          </TabsList>
                        </Tabs>
                        <p className="fine-print">
                          Interpolation estimates values between samples. It is
                          a useful baseline, not the model we train.
                        </p>
                      </>
                    )}
                    {i >= 2 && (
                      <>
                        <Range
                          label="Diffusivity ν"
                          value={nu}
                          min={0.005}
                          max={0.06}
                          step={0.005}
                          format={nu.toFixed(3)}
                          onChange={(v) => {
                            reset();
                            setNu(v);
                          }}
                          disabled={running}
                        />
                        <Range
                          label="Physical time jump Δt"
                          value={time}
                          min={0.05}
                          max={1}
                          step={0.05}
                          format={`${time.toFixed(2)} s`}
                          onChange={(v) => {
                            reset();
                            setTime(v);
                          }}
                          disabled={running}
                        />
                        <p className="fine-print">
                          Changing ν or Δt resets the multipliers. Every
                          prediction advances by this fixed Δt. Training updates
                          never advance physical time.
                        </p>
                        <div className="actions">
                          <button
                            className="primary"
                            onClick={() => {
                              if (epoch >= 400) reset();
                              setRunning((r) => !r);
                            }}
                          >
                            {running
                              ? 'Pause training'
                              : epoch >= 400
                                ? 'Train again'
                                : epoch
                                  ? 'Resume training'
                                  : 'Train the model'}
                            {!running && <Play size={15} />}
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Reset model"
                            onClick={reset}
                          >
                            <RotateCcw size={17} />
                          </button>
                        </div>
                      </>
                    )}
                    {i === 3 && (
                      <>
                        <div className="toggle-label">Input observations</div>
                        <Tabs
                          value={inputSource}
                          onValueChange={(v) => setInputSource(String(v))}
                        >
                          <TabsList className="small-tabs">
                            <TabsTrigger value="coarse">
                              Same coarse pixels
                            </TabsTrigger>
                            <TabsTrigger value="fine">
                              New fine pixels
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                        {inputSource === 'coarse' && (
                          <Range
                            label="Shared input grid"
                            value={n}
                            min={4}
                            max={16}
                            step={4}
                            format={`${n} × ${n}`}
                            onChange={setN}
                          />
                        )}
                        <Range
                          label="Output grid"
                          value={resolution}
                          min={16}
                          max={96}
                          step={16}
                          format={`${resolution} × ${resolution}`}
                          onChange={setResolution}
                        />
                        <p className="fine-print">
                          {inputSource === 'coarse'
                            ? 'Only output sampling changes; no new measurements.'
                            : 'New input measurements are supplied on the output grid.'}
                        </p>
                        <button
                          className="text-button"
                          onClick={() =>
                            setSeed((v) => (v === 42 ? 1000 : v + 1))
                          }
                        >
                          Try another unseen field <RotateCcw size={14} />
                        </button>
                        {seed !== 42 && (
                          <button
                            className="text-button"
                            onClick={() => setSeed(42)}
                          >
                            Return to the original field
                          </button>
                        )}
                      </>
                    )}
                    <div className="insight">
                      <FlaskConical size={18} />
                      <p>
                        <strong>Try this</strong>
                        <br />
                        {i === 0
                          ? 'At 4 × 4, do any samples catch the hot spot? Increase the grid while keeping the shape fixed.'
                          : i === 2
                            ? 'Inspect a training pair. Watch its current guess move toward the target as training adjusts the multipliers.'
                            : 'After training, reduce the input to 4 × 4. Does increasing only the output grid fix the error?'}
                      </p>
                    </div>
                  </aside>
                  <div className="experiment">
                    <div className="experiment-top">
                      <span>
                        <span className="blue-dot" /> LIVE EXPERIMENT
                      </span>
                      <span>
                        {i === 0
                          ? 'Spatial hot/cold spots'
                          : 'Heat diffusion · periodic boundaries'}
                      </span>
                    </div>
                    {i === 0 && (
                      <>
                        <div
                          className={
                            method === 'none' ? 'map-grid' : 'map-grid three'
                          }
                        >
                          <FieldCard
                            title="The physical-space field"
                            detail="Localized hot/cold spots · reference"
                            values={full}
                            n={64}
                          />
                          <FieldCard
                            title="Our measurements"
                            detail={`${n} × ${n} point samples`}
                            values={coarse}
                            n={n}
                          />
                          {method !== 'none' && (
                            <FieldCard
                              title="Interpolation baseline"
                              detail="Estimate between the measurements"
                              values={up}
                              n={64}
                            />
                          )}
                        </div>
                        <div className="stat-row">
                          <div>
                            <small>MEASURED VALUES</small>
                            <strong>{n * n}</strong>
                          </div>
                          <div>
                            <small>SAMPLE SPACING</small>
                            <strong>{(1 / n).toFixed(3)}</strong>
                          </div>
                          <div>
                            <small>
                              {method === 'none'
                                ? 'HOT-SPOT WIDTH σ'
                                : 'BASELINE RELATIVE L₂'}
                            </small>
                            <strong>
                              {method === 'none'
                                ? '0.065'
                                : metric(relativeError(up, full))}
                            </strong>
                          </div>
                        </div>
                        <div className="takeaway">
                          <b>We have samples, not the formula.</b> A few
                          measurements can miss a narrow hot spot. Interpolation
                          can be useful, but it makes assumptions between those
                          measurements. Step 2 will use a Fourier representation
                          to estimate the same field from the same pixels.
                        </div>
                      </>
                    )}
                    {i === 2 && (
                      <>
                        <TrainingData
                          data={data}
                          weights={weights}
                          horizon={time}
                        />
                        <div className="training-panel">
                          <div className="training-title">
                            <div>
                              <small>TRAINING ON 24 FIELDS · 16 × 16</small>
                              <h3>
                                {running
                                  ? 'Learning the heat operator…'
                                  : epoch
                                    ? 'A rule learned from fields.'
                                    : 'Ready when you are.'}
                              </h3>
                            </div>
                            <span className="epoch">
                              {epoch} <small>/ 400 weight updates</small>
                            </span>
                          </div>
                          <LossChart losses={losses} />
                          <div className="chart-footer">
                            <span>Coefficient MSE · logarithmic scale</span>
                            <b>
                              {losses.length
                                ? losses[losses.length - 1].toExponential(2)
                                : 'Awaiting training'}
                            </b>
                          </div>
                        </div>
                        <div className="weights">
                          <div className="weight-heading">
                            LEARNED FOURIER MULTIPLIERS{' '}
                            <span>
                              blue: learned &nbsp; · &nbsp; coral: exact
                            </span>
                          </div>
                          <svg
                            viewBox="0 0 640 115"
                            role="img"
                            aria-label="Learned versus exact Fourier multipliers"
                          >
                            {weights.map((w, k) => (
                              <g key={k}>
                                <rect
                                  x={k * 16}
                                  y={100 - Math.max(0, w) * 85}
                                  width={7}
                                  height={Math.max(0, w) * 85}
                                  fill="#4485ff"
                                />
                                <path
                                  d={`M${k * 16 - 1},${100 - exact[k] * 85}h10`}
                                  stroke="#ffae92"
                                  strokeWidth={2}
                                />
                              </g>
                            ))}
                          </svg>
                          <p>
                            Each bar is one wave direction and frequency. Heat
                            suppresses high frequencies more strongly.
                          </p>
                        </div>
                        <div className="takeaway">
                          <b>A minimal spectral operator.</b> This trainable
                          linear layer is appropriate for linear heat diffusion.
                          A full FNO adds channels, nonlinear activations, and
                          stacked spectral layers.
                        </div>
                      </>
                    )}
                    {i === 3 && (
                      <>
                        <div className="result-tools">
                          <span
                            className={
                              epoch ? 'status-chip' : 'status-chip warning'
                            }
                          >
                            {epoch
                              ? `${epoch} weight updates · Δt ${time.toFixed(2)} s`
                              : 'Untrained model'}
                          </span>
                          <Tabs
                            value={view}
                            onValueChange={(v) => setView(String(v))}
                          >
                            <TabsList className="small-tabs">
                              <TabsTrigger value="2d">
                                Compare fields
                              </TabsTrigger>
                              <TabsTrigger value="3d">
                                <Box size={14} /> 3D surface
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>
                        <div className="inference-trace">
                          <span className="eyebrow">
                            FOLLOW THE SAME 1-CYCLE-X COSINE
                          </span>
                          <p>
                            {seed === 42
                              ? 'The walkthrough field from steps 1–2'
                              : 'A new test field'}{' '}
                            · measured amplitude{' '}
                            <b>{fineInputModes[storyMode].c.toFixed(4)}</b> ×
                            learned weight{' '}
                            <b>{weights[storyMode].toFixed(4)}</b> = future
                            amplitude{' '}
                            <b>
                              {(
                                fineInputModes[storyMode].c * weights[storyMode]
                              ).toFixed(4)}
                            </b>
                            .
                          </p>
                          <p>
                            The input amplitude comes from pixel sums. The
                            weight comes from training. The output image is
                            reconstructed from their product, along with the
                            other wave coefficients.
                          </p>
                        </div>
                        {view === '3d' ? (
                          <div className="surface-wrap">
                            <Surface values={prediction} n={resolution} />
                            <p>
                              Predicted temperature · drag to orbit · scroll to
                              zoom
                            </p>
                          </div>
                        ) : (
                          <div className="map-grid three">
                            <FieldCard
                              title="Initial condition"
                              detail={`t = 0 s · input pixels ${inputN} × ${inputN}`}
                              values={spatialField(seed, inputN)}
                              n={inputN}
                            />
                            <FieldCard
                              title="Learned prediction"
                              detail={`t = ${time.toFixed(2)} s · one Δt jump`}
                              values={prediction}
                              n={resolution}
                            />
                            <FieldCard
                              title="Exact solution"
                              detail={`Reference at t = ${time.toFixed(2)} s`}
                              values={truth}
                              n={resolution}
                            />
                          </div>
                        )}
                        <div className="stat-row">
                          <div>
                            <small>LEARNED RELATIVE L₂</small>
                            <strong>{metric(err)}</strong>
                          </div>
                          <div>
                            <small>MEASURED INPUT VALUES</small>
                            <strong>{inputN * inputN}</strong>
                          </div>
                          <div>
                            <small>OUTPUT VALUES</small>
                            <strong>{resolution * resolution}</strong>
                          </div>
                        </div>
                        <div className="takeaway">
                          <b>
                            Same Fourier transform, plus learned multipliers.
                          </b>{' '}
                          Training used 16 × 16 pairs. This prediction reads{' '}
                          {inputN} × {inputN} input pixels and writes{' '}
                          {resolution} × {resolution} output values. Coarse
                          measurements can omit or alias waves; making the
                          output larger cannot fix that.
                        </div>
                      </>
                    )}
                    <div className="color-key">
                      <span>−1.7</span>
                      <div />
                      <span>+1.7</span>
                      <span>
                        Field value {i >= 2 ? '(temperature deviation)' : ''} ·
                        fixed color scale
                      </span>
                    </div>
                  </div>
                </section>
              )}
              {i === 3 && <DiscretizationLab />}
              <div className="below-grid">
                <section className="notes">
                  <span className="eyebrow">THE IDEA TO TAKE WITH YOU</span>
                  <h3>
                    {
                      [
                        'A pixel is a sample, not a little square.',
                        'Pixels → measured coefficients → reconstructed field.',
                        'A network learns numbers. An operator learns a mapping between fields.',
                        'Grid flexibility is not a guarantee of physical accuracy.',
                      ][i]
                    }
                  </h3>
                  <p>
                    {
                      [
                        'The source is a spatial Gaussian hot spot and cold spot, not a finite wave sum. Narrow structures contain high frequencies. Coarse sampling can miss them, and finite Fourier reconstruction also introduces truncation error.',
                        'Step 1 measures the field; step 2 reconstructs from those same pixels. Optional interpolation assumes a local shape between samples. Fourier reconstruction assumes a periodic, band-limited sum of waves. The coefficients are computed from pixels, not guessed or learned. Step 3 introduces learning for a different task: predicting the future.',
                        'The 24 training pairs vary the initial condition. The original walkthrough field is held out for step 4. The model learns 40 multipliers shared by sine and cosine components; the measured input mean is preserved separately because periodic heat diffusion conserves it.',
                        'This example uses localized Gaussian fields, finite retained Fourier modes, constant diffusivity, a unit periodic square, and an exact spectral reference. Real applications require held-out fine-grid data, conservation checks, boundary treatment, and tests outside the training distribution.',
                      ][i]
                    }
                  </p>
                  <div className="equation">
                    <MathTex
                      tex={
                        [E.samples, E.reconstruction, E.timestep, E.heatPDE][i]
                      }
                    />
                  </div>
                  <details>
                    <summary>Check your intuition</summary>
                    <p>
                      {
                        [
                          'Does doubling the output grid necessarily double the measured information?',
                          'Are Fourier coefficients provided to the model by the hidden original formula?',
                          'Do we fit a new model for each initial temperature field?',
                          'Can this trained model safely be reused at a different diffusivity without retraining?',
                        ][i]
                      }
                    </p>
                    <div className="quiz">
                      <button onClick={() => setQuiz(0)}>Yes</button>
                      <button onClick={() => setQuiz(1)}>No</button>
                    </div>
                    {quiz !== null && (
                      <p
                        role="status"
                        className={quiz === 1 ? 'correct' : 'incorrect'}
                      >
                        {quiz === 1 ? 'Correct. ' : 'Try again. '}
                        {
                          [
                            'Only new observations add measured information.',
                            'They are computed from the measured pixel values using sine and cosine sums.',
                            'The learned mapping is reused across initial fields.',
                            'Here the weights depend on ν and time; changing either requires retraining.',
                          ][i]
                        }
                      </p>
                    )}
                  </details>
                </section>
                <section className="code-panel">
                  <div className="code-header">
                    <span>
                      <Code2 size={16} /> Under the hood
                    </span>
                    <span>
                      TypeScript{' '}
                      <button
                        aria-label="Copy TypeScript example"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(code[i]);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1800);
                          } catch {
                            setCopied(false);
                          }
                        }}
                      >
                        {copied ? <Check size={14} /> : 'Copy'}
                      </button>
                    </span>
                  </div>
                  <pre>
                    <code>{code[i]}</code>
                  </pre>
                  <p>
                    {i === 3
                      ? 'Call flow using the same project() and field() functions as this experiment.'
                      : 'Simplified excerpt of the calculations running in this lab.'}
                  </p>
                </section>
              </div>
              <div className="lesson-bottom">
                <span>
                  0{i + 1} / 04 &nbsp; {l}
                </span>
                {i < 3 ? (
                  <button
                    className="primary"
                    onClick={() => {
                      setLesson(i + 1);
                      setQuiz(null);
                      window.scrollTo({ top: 180, behavior: 'smooth' });
                    }}
                  >
                    Next: {lessons[i + 1]} <ArrowRight size={16} />
                  </button>
                ) : (
                  <a
                    href="https://arxiv.org/abs/2010.08895"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the original FNO paper ↗
                  </a>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <footer>
          <span>
            operator lab &nbsp; / &nbsp; Small experiments. Real computations.
          </span>
          <a
            href="https://neuraloperator.github.io/dev/theory_guide/fno.html"
            target="_blank"
            rel="noreferrer"
          >
            Go deeper: Fourier neural operators ↗
          </a>
        </footer>
      </div>
    </div>
  );
}
function FieldCard({
  title,
  detail,
  values,
  n,
}: {
  title: string;
  detail: string;
  values: number[];
  n: number;
}) {
  return (
    <figure className="field-card">
      <figcaption>
        {title}
        <span>{detail}</span>
      </figcaption>
      <Heatmap values={values} n={n} label={`${title}, ${n} by ${n} samples`} />
    </figure>
  );
}
function LossChart({ losses }: { losses: number[] }) {
  const points = losses
    .map(
      (l, i) =>
        `${50 + (i / 80) * 590},${30 + Math.max(-8, Math.min(-1, Math.log10(Math.max(l, 1e-8)))) * -1 * 22}`,
    )
    .join(' ');
  return (
    <svg
      className="loss-chart"
      viewBox="0 0 680 240"
      role="img"
      aria-label={
        losses.length
          ? `Training loss ${losses[losses.length - 1].toExponential(3)}`
          : 'Empty loss chart; start training to see progress'
      }
    >
      {[-2, -4, -6, -8].map((v) => (
        <g key={v}>
          <line
            x1={48}
            x2={655}
            y1={30 - v * 22}
            y2={30 - v * 22}
            stroke="#2a3a53"
          />
          <text x={2} y={34 - v * 22} fill="#91a3bc" fontSize={12}>
            10^{v}
          </text>
        </g>
      ))}
      <polyline fill="none" stroke="#69a5ff" strokeWidth={3} points={points} />
      <text x={48} y={235} fill="#91a3bc" fontSize={12}>
        0
      </text>
      <text x={603} y={235} fill="#91a3bc" fontSize={12}>
        400 updates
      </text>
      {!losses.length && (
        <text x={350} y={130} textAnchor="middle" fill="#91a3bc" fontSize={15}>
          Start training to watch the error fall
        </text>
      )}
    </svg>
  );
}
