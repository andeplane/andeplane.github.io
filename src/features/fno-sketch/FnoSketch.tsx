import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import 'katex/dist/katex.min.css';
import '@/features/neural-operators/research.css';
import './fno-sketch.css';
import { MathTex } from '@/features/neural-operators/labs/components/math-tex';
import {
  N,
  SIZE,
  cabs,
  carg,
  defaultMask,
  fmt,
  fmtC,
  fmtSci,
  fnoLayer,
  halfPlaneCells,
  independentModes,
  isKept,
  makeField,
  makeWeights,
  maxAbs,
  modeIndex,
  phaseClass,
  phasorTerms,
  pixelOf,
  type Activation,
  type LayerResult,
  type Mode,
  type Weights,
} from './lib/fno';
import { TEX, type TexKey } from './lib/tex';
import {
  ChannelPicker,
  Column,
  HeatMatrix,
  MarginNote,
  ModeGrid,
  PhasorPlot,
  Pipeline,
  PixelGrid,
  SheetStack,
  Slider,
  Toggle,
} from './parts';

// ------------------------------------------------------------------ helpers

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number) => String(n).split('').map((d) => SUBSCRIPTS[Number(d)]).join('');
/** Negative factors get brackets when written out in a sum. */
const term = (x: number) => (Number(fmt(x).replace('−', '-')) < 0 ? `(${fmt(x)})` : fmt(x));
const vName = (c: number) => `v${sub(c + 1)}`;
const pixelName = (p: number) => {
  const [i, j] = pixelOf(p);
  return `(${i}, ${j})`;
};
const modeName = ([k1, k2]: Mode) => `(${fmt(k1, 0)}, ${fmt(k2, 0)})`;

/** Five muted hues for the five possible phases k₁i + k₂j mod 5 (pink and orange left free). */
const PHASE_HUES = [210, 160, 265, 115, 52];
const phaseFill = (q: number) => `hsla(${PHASE_HUES[q]}, 55%, 58%, 0.2)`;

function Tex({ k }: { k: TexKey }) {
  return (
    <div className="fs-tex">
      <MathTex tex={TEX[k]} />
    </div>
  );
}

const STAGES = [
  { short: 'Input a(x)', title: 'The input function a(x)' },
  { short: 'Lift P', title: 'Lift every pixel with P' },
  { short: 'Fourier F', title: 'Fourier transform, one channel at a time' },
  { short: 'Truncate', title: 'Keep only the low modes' },
  { short: 'Mix R(k)', title: 'Mix the channels of each mode with R(k)' },
  { short: 'Inverse F⁻¹', title: 'Zero-pad and transform back' },
  { short: 'W, bias, σ', title: 'Add the local path, then σ' },
  { short: 'Project Q', title: 'Project down to the output u' },
] as const;

// ------------------------------------------------------------------ state

type Sketch = {
  r: LayerResult;
  w: Weights;
  T: number[];
  mask: number[];
  dv: number;
  K1: number;
  K2: number;
  activation: Activation;
  identity: boolean;
  setIdentity: (on: boolean) => void;
  pixel: number;
  setPixel: (p: number) => void;
  mode: Mode;
  selectMode: (m: Mode, clicked: Mode) => void;
  mirrorClicked: Mode | null;
  channel: number;
  setChannel: (c: number) => void;
  nudgeT: (delta: number) => void;
  toggleMask: () => void;
};

// ------------------------------------------------------------------ page

export default function FnoSketch() {
  const [stage, setStage] = useState(0);
  const [weightSeed, setWeightSeed] = useState(1);
  const [fieldSeed, setFieldSeed] = useState(1);
  const [T, setT] = useState(() => makeField(1));
  const [mask, setMask] = useState(defaultMask);
  const [dv, setDv] = useState(4);
  const [K1, setK1] = useState(1);
  const [K2, setK2] = useState(1);
  const [activation, setActivation] = useState<Activation>('relu');
  const [identity, setIdentity] = useState(false);
  const [pixel, setPixel] = useState(12);
  const [mode, setMode] = useState<Mode>([1, 0]);
  const [mirrorClicked, setMirrorClicked] = useState<Mode | null>(null);
  const [channelRaw, setChannel] = useState(0);
  const channel = Math.min(channelRaw, dv - 1);

  useEffect(() => {
    // Put back whatever title the page was served with (build-seo bakes one in).
    const previous = document.title;
    document.title = 'One FNO layer, from a student’s sketch · Neural operators · andeplane';
    return () => {
      document.title = previous;
    };
  }, []);

  const w = useMemo(() => makeWeights(weightSeed, dv), [weightSeed, dv]);
  const r = useMemo(() => fnoLayer({ T, mask }, w, { K1, K2, activation, identity }), [T, mask, w, K1, K2, activation, identity]);

  const s: Sketch = {
    r,
    w,
    T,
    mask,
    dv,
    K1,
    K2,
    activation,
    identity,
    setIdentity,
    pixel,
    setPixel,
    mode,
    selectMode: (m, clicked) => {
      setMode(m);
      setMirrorClicked(clicked[0] === m[0] && clicked[1] === m[1] ? null : clicked);
    },
    mirrorClicked,
    channel,
    setChannel,
    nudgeT: (delta) => setT((old) => old.map((t, p) => (p === pixel ? Math.round(Math.min(1, Math.max(0, t + delta)) * 100) / 100 : t))),
    toggleMask: () => setMask((old) => old.map((m, p) => (p === pixel ? 1 - m : m))),
  };

  const Stage = [StageInput, StageLift, StageFourier, StageTruncate, StageMix, StageInverse, StageLocal, StageProject][stage];

  return (
    <div className="no-root fno-sketch">
      <nav className="no-breadcrumb" aria-label="Breadcrumb">
        <Link to="/interests">Interests</Link>
        <span aria-hidden="true">/</span>
        <Link to="/interests/neural-operators">Neural operators</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">From a student’s sketch</span>
      </nav>

      <header className="fs-header">
        <p className="no-eyebrow">Neural operators · from a notebook</p>
        <h1 className="no-page-title">One FNO layer, from a student’s sketch</h1>
        <p className="no-lead">
          A student drew one page of notes to work out, for herself, what a single Fourier Neural
          Operator layer does to a tiny 5×5 picture. This is that page brought to life: her notation,
          her eight steps, her pink pixel and orange mode — with every number computed live.
        </p>
      </header>

      <section className="fs-paper" aria-label="The sketch">
        <div className="fs-pipeline-wrap">
          <Pipeline stage={stage} onStage={setStage} />
        </div>

        <Stepper stage={stage} onStage={setStage} />

        <div className="fs-controls" aria-label="Settings">
          <Slider label={<>d<sub>v</sub> channels</>} value={dv} min={2} max={6} onChange={setDv} hint="Changing d_v redraws all weights." />
          <Slider label={<>K<sub>1</sub></>} value={K1} min={0} max={2} onChange={setK1} />
          <Slider label={<>K<sub>2</sub>max</>} value={K2} min={0} max={2} onChange={setK2} />
          <div className="fs-control-group" role="group" aria-label="Activation σ">
            <span className="fs-control-label">σ</span>
            <Toggle pressed={activation === 'relu'} onClick={() => setActivation('relu')}>
              ReLU
            </Toggle>
            <Toggle pressed={activation === 'gelu'} onClick={() => setActivation('gelu')}>
              GELU
            </Toggle>
          </div>
          <div className="fs-control-group">
            <button type="button" className="fs-btn" onClick={() => setWeightSeed((x) => x + 1)}>
              New random weights
            </button>
            <button
              type="button"
              className="fs-btn"
              onClick={() => {
                setFieldSeed((x) => x + 1);
                setT(makeField(fieldSeed + 1));
              }}
            >
              Random field
            </button>
          </div>
          {identity && (
            <p className="fs-identity-flag">
              Identity check on: all 25 modes, R(k) = I.{' '}
              <button type="button" className="fs-link" onClick={() => setIdentity(false)}>
                Turn off
              </button>
            </p>
          )}
        </div>

        <div className="fs-stage" role="tabpanel" id="fs-stage-panel" aria-labelledby={`fs-tab-${stage}`}>
          <Stage s={s} />
        </div>

        <details className="fs-conventions">
          <summary>Conventions behind the numbers</summary>
          <ul>
            <li>
              Grid points x₁ = i/5, x₂ = j/5 with i, j = 0…4 on the unit periodic square. In every grid,
              i is the row (x₁, downwards) and j the column (x₂, rightwards).
            </li>
            <li>
              N = m·n = 25 points, so frequencies are k₁, k₂ ∈ {'{'}−2, …, 2{'}'}. Five is odd: there is no
              Nyquist mode, and (0, 0) is the only mode that is its own conjugate.
            </li>
            <li>
              The forward transform is unnormalized and the inverse carries 1/N. So v̂(0, 0, c) is 25 × the
              mean of channel c, and spectral numbers are roughly 25× the pixel values.
            </li>
            <li>
              Weights are drawn from a seeded generator: P, W, Q entries uniform in ±1/√d<sub>in</sub>, R(k)
              real and imaginary parts uniform in ±1/d<sub>v</sub>, biases in ±0.1. R(k) is drawn for all 15
              half-plane modes, then made Hermitian (R(−k) = conj R(k), R(0, 0) real) so the output is real.
            </li>
            <li>d<sub>u</sub> = 1 and Q is one linear map; there is exactly one Fourier layer between P and Q.</li>
            <li>Reals are shown with 2 decimals, complex numbers as a ± bi.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ stepper

function Stepper({ stage, onStage }: { stage: number; onStage: (s: number) => void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (next: number) => {
    const n = Math.max(0, Math.min(STAGES.length - 1, next));
    onStage(n);
    tabs.current[n]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target: Record<string, number> = { ArrowLeft: stage - 1, ArrowRight: stage + 1, Home: 0, End: STAGES.length - 1 };
    if (!(e.key in target)) return;
    e.preventDefault();
    go(target[e.key]);
  };
  return (
    <div className="fs-stepper">
      <button type="button" className="fs-step-arrow" onClick={() => onStage(stage - 1)} disabled={stage === 0} aria-label="Previous step">
        ‹
      </button>
      <div className="fs-steps" role="tablist" aria-label="Steps of the sketch" onKeyDown={onKeyDown}>
        {STAGES.map((st, n) => (
          <button
            key={n}
            ref={(el) => {
              tabs.current[n] = el;
            }}
            id={`fs-tab-${n}`}
            type="button"
            role="tab"
            aria-selected={n === stage}
            aria-controls="fs-stage-panel"
            tabIndex={n === stage ? 0 : -1}
            className="fs-step"
            onClick={() => onStage(n)}
          >
            <span className="fs-step-number">{n + 1}</span>
            <span className="fs-step-label">{st.short}</span>
          </button>
        ))}
      </div>
      <button type="button" className="fs-step-arrow" onClick={() => onStage(stage + 1)} disabled={stage === STAGES.length - 1} aria-label="Next step">
        ›
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ layout pieces

function StageLayout({
  n,
  visual,
  children,
  numbers,
  notes,
}: {
  n: number;
  visual: ReactNode;
  children: ReactNode;
  numbers: ReactNode;
  notes?: ReactNode;
}) {
  return (
    <div className={notes ? 'fs-stage-grid has-notes' : 'fs-stage-grid'}>
      <div className="fs-visual">{visual}</div>
      <div className="fs-text">
        <h2 className="fs-stage-title">
          <span className="fs-stage-number">{n}</span> {STAGES[n - 1].title}
        </h2>
        {children}
      </div>
      <div className="fs-numbers">{numbers}</div>
      {notes && <div className="fs-notes">{notes}</div>}
    </div>
  );
}

const PixelHeading = ({ p }: { p: number }) => {
  const [i, j] = pixelOf(p);
  return (
    <h3 className="fs-numbers-title">
      At the <span className="fs-pink">pink pixel</span> {pixelName(p)}, x = ({fmt(i / SIZE)}, {fmt(j / SIZE)})
    </h3>
  );
};

const ModeHeading = ({ mode, children }: { mode: Mode; children?: ReactNode }) => (
  <h3 className="fs-numbers-title">
    At the <span className="fs-orange">orange mode</span> k = {modeName(mode)}
    {children}
  </h3>
);

function MirrorNote({ s }: { s: Sketch }) {
  if (!s.mirrorClicked) return null;
  return (
    <p className="fs-hint">
      {modeName(s.mirrorClicked)} is the conjugate of {modeName(s.mode)}, so that one is selected: it carries the same
      numbers, conjugated.
    </p>
  );
}

const channelColumn = (values: readonly number[]) => values.map((x) => fmt(x));
const vLabels = (dv: number) => Array.from({ length: dv }, (_, c) => vName(c));
const column = (t: readonly (readonly number[])[], c: number) => t.map((x) => x[c]);

// ------------------------------------------------------------------ 1. input

function StageInput({ s }: { s: Sketch }) {
  const { r, pixel } = s;
  const a = r.a[pixel];
  const grids = [
    { name: 'c₁ = T(x₁, x₂)', label: 'Temperature T', format: (x: number) => fmt(x) },
    { name: 'c₂ = mask (0/1)', label: 'Mask', format: (x: number) => fmt(x, 0) },
    { name: 'c₃ = x₁ = i/5', label: 'Coordinate x1', format: (x: number) => fmt(x) },
    { name: 'c₄ = x₂ = j/5', label: 'Coordinate x2', format: (x: number) => fmt(x) },
  ];
  return (
    <StageLayout
      n={1}
      visual={
        <div className="fs-grids fs-grids-4">
          {grids.map((g, c) => (
            <PixelGrid key={c} values={column(r.a, c)} scale={1} pixel={pixel} onPixel={s.setPixel} label={g.label} caption={g.name} format={g.format} />
          ))}
        </div>
      }
      numbers={
        <>
          <PixelHeading p={pixel} />
          <div className="fs-numbers-row">
            <Column title="a(x)" tone="pink" labels={['T', 'm', 'x₁', 'x₂']} entries={[fmt(a[0]), fmt(a[1], 0), fmt(a[2]), fmt(a[3])]} />
            <div className="fs-edit">
              <p className="fs-small">Change this pixel:</p>
              <div className="fs-edit-buttons">
                <button type="button" className="fs-btn" onClick={() => s.nudgeT(-0.25)} disabled={a[0] <= 0}>
                  T − 0.25
                </button>
                <button type="button" className="fs-btn" onClick={() => s.nudgeT(0.25)} disabled={a[0] >= 1}>
                  T + 0.25
                </button>
                <button type="button" className="fs-btn" onClick={s.toggleMask} aria-pressed={a[1] === 1}>
                  mask {fmt(a[1], 0)} → {fmt(1 - a[1], 0)}
                </button>
              </div>
            </div>
          </div>
        </>
      }
    >
      <Tex k="input" />
      <Tex k="inputGrid" />
      <p>
        Every one of the 25 grid points carries a column of d<sub>a</sub> = 4 numbers: the temperature T, a 0/1
        mask (here 1 on the boundary ring) and the point’s own coordinates x₁ and x₂.
      </p>
      <p className="fs-small">
        The coordinate channels tell the network where it is. That is why the whole map a → u is not
        shift-equivariant, even though the Fourier path in the middle is.
      </p>
    </StageLayout>
  );
}

// ------------------------------------------------------------------ 2. lift

function StageLift({ s }: { s: Sketch }) {
  const { r, w, pixel, dv } = s;
  const a = r.a[pixel];
  const scale = maxAbs(r.v.flat());
  const names = ['T', 'm', 'x₁', 'x₂'];
  return (
    <StageLayout
      n={2}
      visual={
        <>
          <div className="fs-stack-row">
            <SheetStack data={r.a} pixel={pixel} name="a" shape="5 × 5 × 4" />
            <div className="fs-stack-arrow" aria-hidden="true">
              <span>P a + b<sub>P</sub></span>
              <span className="fs-arrow-glyph">⟶</span>
              <span className="fs-small">each pixel alone</span>
            </div>
            <SheetStack data={r.v} pixel={pixel} name="v" shape={`5 × 5 × ${dv}`} />
          </div>
          <div className="fs-grids fs-grids-auto">
            {Array.from({ length: dv }, (_, c) => (
              <PixelGrid key={c} values={column(r.v, c)} scale={scale} pixel={pixel} onPixel={s.setPixel} label={`Channel ${vName(c)}`} caption={vName(c)} />
            ))}
          </div>
        </>
      }
      numbers={
        <>
          <PixelHeading p={pixel} />
          <ol className="fs-sums">
            {Array.from({ length: dv }, (_, c) => (
              <li key={c}>
                <span className="fs-sum-name">{vName(c)}</span>
                <span className="fs-num">
                  {a.map((x, d) => `${term(w.P[c][d])}·${fmt(x, d === 1 ? 0 : 2)}`).join(' + ')} + {term(w.bP[c])} ={' '}
                  <b className="fs-pink">{fmt(r.v[pixel][c])}</b>
                </span>
              </li>
            ))}
          </ol>
          <h3 className="fs-numbers-title">P and b<sub>P</sub></h3>
          <HeatMatrix
            values={w.P.map((row, c) => [...row, w.bP[c]])}
            format={(x) => fmt(x)}
            label="Lift matrix P with bias b_P as the last column"
            rowLabel={(c) => vName(c)}
            colLabel={(d) => (d < 4 ? names[d] : 'b')}
          />
        </>
      }
    >
      <Tex k="lift" />
      <Tex k="liftShape" />
      <p>
        The same P acts on every pixel’s column on its own — nothing talks to its neighbours yet. Each channel
        of v is a weighted sum of the four inputs, just as the sketch writes channel 1:
      </p>
      <Tex k="liftRow" />
    </StageLayout>
  );
}

// ------------------------------------------------------------------ 3. Fourier

function PhaseArrow({ q }: { q: number }) {
  const deg = (360 * q) / 5; // e^{-2πi q/5}: clockwise in maths, so clockwise on screen too
  return (
    <svg className="fs-phase-arrow" viewBox="-6 -6 12 12" aria-hidden="true">
      <g transform={`rotate(${deg})`}>
        <line x1={-4.5} y1={0} x2={4} y2={0} />
        <path d="M1.5,-2.2 L4.5,0 L1.5,2.2" fill="none" />
      </g>
    </svg>
  );
}

function StageFourier({ s }: { s: Sketch }) {
  const { r, pixel, mode, channel, dv } = s;
  const [grouped, setGrouped] = useState(false);
  const [k1, k2] = mode;
  const [pi, pj] = pixelOf(pixel);
  const terms = useMemo(() => phasorTerms(r.v, channel, k1, k2), [r.v, channel, k1, k2]);
  const classes = Array.from({ length: N }, (_, p) => {
    const [i, j] = pixelOf(p);
    return phaseClass(k1, k2, i, j);
  });
  const order = Array.from({ length: N }, (_, p) => p);
  if (grouped) order.sort((a, b) => classes[a] - classes[b] || a - b);
  const directions = [...new Set(classes)].sort();
  const z = r.vhat[modeIndex(k1, k2)][channel];
  const mean = column(r.v, channel).reduce((t, x) => t + x, 0) / N;
  const vc = column(r.v, channel);
  const spectrum = r.vhat.map((m) => cabs(m[channel]));
  const q = phaseClass(k1, k2, pi, pj);
  return (
    <StageLayout
      n={3}
      visual={
        <>
          <ChannelPicker count={dv} channel={channel} onChannel={s.setChannel} />
          <div className="fs-grids fs-grids-2">
            <PixelGrid
              values={vc}
              scale={maxAbs(vc)}
              pixel={pixel}
              onPixel={s.setPixel}
              label={`Channel ${vName(channel)}, tinted by phase`}
              caption={
                <>
                  {vName(channel)}, each cell tinted by its phase e<sup>−2πi(k₁i+k₂j)/5</sup>
                </>
              }
              fill={(p) => phaseFill(classes[p])}
              decorate={(p) => <PhaseArrow q={classes[p]} />}
            />
            <ModeGrid
              values={spectrum}
              mode={mode}
              onMode={s.selectMode}
              K={null}
              label={`|v̂| of ${vName(channel)}`}
              caption={<>|v̂(k, {channel + 1})| — pick a mode</>}
            />
          </div>
          <div className="fs-phasor-wrap">
            <PhasorPlot terms={terms} order={order} pixel={pixel} directions={directions} />
            <div className="fs-phasor-side">
              <p className="fs-small">
                The 25 terms v·e<sup>−2πi(k₁i+k₂j)/5</sup> head to tail. The <span className="fs-orange">orange</span> arrow
                from the origin is their sum, v̂{modeName(mode)}; the <span className="fs-pink">pink</span> one is the pink
                pixel’s term.
              </p>
              <div className="fs-control-group" role="group" aria-label="Order of the arrows">
                <Toggle pressed={!grouped} onClick={() => setGrouped(false)}>
                  pixel order
                </Toggle>
                <Toggle pressed={grouped} onClick={() => setGrouped(true)}>
                  grouped by phase
                </Toggle>
              </div>
            </div>
          </div>
        </>
      }
      numbers={
        <>
          <ModeHeading mode={mode}>, channel {vName(channel)}</ModeHeading>
          <MirrorNote s={s} />
          <dl className="fs-facts">
            <dt>v̂(k, {channel + 1})</dt>
            <dd className="fs-num fs-orange">{fmtC(z)}</dd>
            <dt>|v̂|</dt>
            <dd className="fs-num">{fmt(cabs(z))}</dd>
            <dt>phase</dt>
            <dd className="fs-num">
              {fmt(carg(z))} rad = {fmt((carg(z) * 180) / Math.PI, 0)}°
            </dd>
            <dt>
              <span className="fs-pink">pink</span> term
            </dt>
            <dd className="fs-num">
              {fmt(vc[pixel])} · e<sup>−2πi·{q}/5</sup> = {fmtC(terms[pixel])}
            </dd>
            <dt>25 × mean</dt>
            <dd className="fs-num">{fmt(25 * mean)} = v̂(0, 0, {channel + 1})</dd>
          </dl>
        </>
      }
      notes={
        <MarginNote sketch="i is both the row index and √−1" computed={<>same here; the imaginary unit is written upright, i</>} />
      }
    >
      <Tex k="dft" />
      <Tex k="dftComplex" />
      <p>
        Each pixel’s value is turned by a phase that depends on the mode k = (k₁, k₂), and the 25 turned arrows are
        added head to tail. On a 5×5 grid k₁i + k₂j mod 5 takes only five values, so the arrows point in at most five
        directions. For k = (0, 0) they all lie flat, and the sum is 25 × the channel mean.
      </p>
      <p className="fs-small">
        “Do this for each necessary k₁ and k₂, then for each channel.” The transform is unnormalized, so these numbers
        are about 25× the pixel values.
      </p>
    </StageLayout>
  );
}

// ------------------------------------------------------------------ 4. truncate

function StageTruncate({ s }: { s: Sketch }) {
  const { r, mode, channel, dv, K1, K2, identity } = s;
  const [k1, k2] = mode;
  const kept = identity || isKept(K1, K2, k1, k2);
  const K: [number, number] = identity ? [2, 2] : [K1, K2];
  const spectrum = r.vhat.map((m) => cabs(m[channel]));
  const col = r.vhat[modeIndex(k1, k2)];
  return (
    <StageLayout
      n={4}
      visual={
        <>
          <ChannelPicker count={dv} channel={channel} onChannel={s.setChannel} />
          <div className="fs-grids fs-grids-2">
            <ModeGrid
              values={spectrum}
              mode={mode}
              onMode={s.selectMode}
              K={K}
              label={`|v̂| of ${vName(channel)}, truncated`}
              caption={
                <>
                  |v̂(k, {channel + 1})|: rows k₁, columns k₂ ≥ 0. Crossed cells are dropped; dashed cells mirror (−k₁, 0).
                </>
              }
            />
            <Column
              title={
                <>
                  v̂{modeName(mode)} <span className="fs-small">(all channels)</span>
                </>
              }
              tone="orange"
              labels={vLabels(dv)}
              entries={col.map((z) => fmtC(z))}
            />
          </div>
        </>
      }
      numbers={
        <>
          <h3 className="fs-numbers-title">
            Kept with K₁ = {K[0]}, K₂max = {K[1]}
          </h3>
          <dl className="fs-facts">
            <dt>drawn cells</dt>
            <dd className="fs-num">
              (2K₁+1) × (K₂max+1) = {2 * K[0] + 1} × {K[1] + 1} = {halfPlaneCells(K[0], K[1])}
            </dd>
            <dt>independent modes</dt>
            <dd className="fs-num">
              {halfPlaneCells(K[0], K[1])} − K₁ = {independentModes(K[0], K[1])}
              <span className="fs-small"> (complex numbers per channel)</span>
            </dd>
            <dt>with k₂ &lt; 0 mirrors</dt>
            <dd className="fs-num">
              (2K₁+1)(2K₂max+1) = {r.kept.length} of 25
            </dd>
          </dl>
          <ModeHeading mode={mode} />
          <MirrorNote s={s} />
          <p className={kept ? 'fs-status' : 'fs-status is-dropped'}>
            {kept ? 'Kept: this vector goes on to R(k).' : 'Dropped: this mode is set to zero and never comes back.'}
          </p>
        </>
      }
      notes={
        <MarginNote
          sketch={<>keep 2K₁ × K₂max modes</>}
          computed={
            <>
              (2K₁+1) × (K₂max+1) = {2 * K[0] + 1} × {K[1] + 1} — k₁ runs from −K₁ to K₁, including 0.
            </>
          }
        >
          (The 2K₁ often comes from FNO code, which keeps k₁ = 0…K₁−1 and −K₁…−1.)
        </MarginNote>
      }
    >
      <Tex k="truncate" />
      <Tex k="hermitian" />
      <p>
        Because v is real, v̂(−k) is the complex conjugate of v̂(k), so half the plane is enough to draw: rows
        k₁ = −2…2 and columns k₂ = 0…2, as in the sketch. Each kept mode holds a vector of d<sub>v</sub> complex numbers
        a + bi, one per channel.
      </p>
      <p className="fs-small">
        The modes with k₂ &lt; 0 are kept too; they are the mirror images of the drawn ones, so they are not drawn.
      </p>
    </StageLayout>
  );
}

// ------------------------------------------------------------------ 5. mix

function StageMix({ s }: { s: Sketch }) {
  const { r, mode, K1, K2, identity } = s;
  const [k1, k2] = mode;
  const mi = modeIndex(k1, k2);
  const kept = identity || isKept(K1, K2, k1, k2);
  const K: [number, number] = identity ? [2, 2] : [K1, K2];
  const R = r.R[mi];
  const x = r.vhat[mi];
  const y = r.mixed[mi];
  const norms = r.mixed.map((m) => Math.hypot(...m.map(cabs)));
  return (
    <StageLayout
      n={5}
      visual={
        <>
          <div className="fs-grids fs-grids-side">
            <ModeGrid
              values={norms}
              mode={mode}
              onMode={s.selectMode}
              K={K}
              label="Length of R v-hat per mode"
              caption={<>‖R(k) v̂(k, :)‖ per mode</>}
            />
            <p className="fs-small fs-grow">
              Pick a mode. Every kept mode has its own complex d<sub>v</sub> × d<sub>v</sub> matrix; the same matrix is
              never used for two different frequencies.
            </p>
          </div>
          {kept ? (
            <div className="fs-equation-row">
              <figure className="fs-fig">
                <HeatMatrix
                  values={R.map((row) => row.map(cabs))}
                  format={(m) => fmt(m)}
                  label={`Magnitudes of R at mode ${modeName(mode)}`}
                  rowLabel={(a) => `${a + 1}`}
                  colLabel={(b) => `${b + 1}`}
                />
                <figcaption>|R{modeName(mode)}|, entry by entry</figcaption>
              </figure>
              <span className="fs-op" aria-hidden="true">
                ·
              </span>
              <Column title={<>v̂{modeName(mode)}</>} tone="orange" entries={x.map((z) => fmtC(z))} />
              <span className="fs-op" aria-hidden="true">
                =
              </span>
              <Column title={<>R v̂</>} tone="orange" entries={y.map((z) => fmtC(z))} />
            </div>
          ) : (
            <p className="fs-status is-dropped">
              Mode {modeName(mode)} was dropped in step 4, so R{modeName(mode)} is never used: (R v̂){modeName(mode)} = 0.
              Pick a kept mode, or raise K.
            </p>
          )}
        </>
      }
      numbers={
        <>
          <ModeHeading mode={mode} />
          <MirrorNote s={s} />
          {kept && (
            <>
              <div className="fs-table-wrap">
                <table className="fs-table">
                  <thead>
                    <tr>
                      <th scope="col">a</th>
                      <th scope="col">v̂ₐ</th>
                      <th scope="col">(R v̂)ₐ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {x.map((z, a) => (
                      <tr key={a}>
                        <th scope="row">{a + 1}</th>
                        <td className="fs-num">{fmtC(z)}</td>
                        <td className="fs-num fs-orange">{fmtC(y[a])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="fs-numbers-title">R{modeName(mode)}{identity ? ' (identity check: R = I)' : ''}</h3>
              <div className="fs-table-wrap">
                <table className="fs-table fs-table-dense">
                  <tbody>
                    {R.map((row, a) => (
                      <tr key={a}>
                        {row.map((z, b) => (
                          <td key={b} className="fs-num">
                            {fmtC(z)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {k1 === 0 && k2 === 0 && <p className="fs-small">R(0, 0) is real: v̂(0, 0) is real, and must stay real.</p>}
            </>
          )}
        </>
      }
    >
      <Tex k="mix" />
      <Tex k="mixShape" />
      <p>
        For each kept frequency pair, the orange channel vector v̂(k, :) is multiplied by its own complex matrix
        R(k). This mixes channels — never frequencies.
      </p>
      <Tex k="mixSymmetry" />
      <p className="fs-small">
        R is drawn for all 15 half-plane modes, so moving the K sliders only switches modes on and off; a surviving
        mode keeps its R. The mirrored modes get the conjugate matrix, which keeps the final output real.
      </p>
    </StageLayout>
  );
}

// ------------------------------------------------------------------ 6. inverse

function StageInverse({ s }: { s: Sketch }) {
  const { r, mode, pixel, channel, dv, K1, K2, identity } = s;
  const K: [number, number] = identity ? [2, 2] : [K1, K2];
  const vc = column(r.v, channel);
  const kc = column(r.spectralOut, channel);
  const scale = maxAbs([...vc, ...kc]);
  const padded = r.mixed.map((m) => cabs(m[channel]));
  return (
    <StageLayout
      n={6}
      visual={
        <>
          <ChannelPicker count={dv} channel={channel} onChannel={s.setChannel} />
          <div className="fs-grids fs-grids-3">
            <ModeGrid
              values={padded}
              mode={mode}
              onMode={s.selectMode}
              K={K}
              half={false}
              label={`Zero-padded spectrum of channel ${channel + 1}`}
              caption={<>|(R v̂)(k, {channel + 1})|, all 25 modes; dropped ones are 0</>}
            />
            <PixelGrid values={vc} scale={scale} pixel={pixel} onPixel={s.setPixel} label={`v, channel ${channel + 1}`} caption={<>v, channel {channel + 1}</>} />
            <PixelGrid
              values={kc}
              scale={scale}
              pixel={pixel}
              onPixel={s.setPixel}
              label={`Spectral output, channel ${channel + 1}`}
              caption={<>𝒦v, channel {channel + 1} (same colour scale)</>}
            />
          </div>
          <label className="fs-check">
            <input type="checkbox" checked={identity} onChange={(e) => s.setIdentity(e.target.checked)} />
            Identity check: keep all 25 modes and set R(k) = I
          </label>
        </>
      }
      numbers={
        <>
          <PixelHeading p={pixel} />
          <div className="fs-numbers-row">
            <Column title="𝒦v(x)" tone="pink" labels={vLabels(dv)} entries={channelColumn(r.spectralOut[pixel])} />
            <Column title="v(x)" labels={vLabels(dv)} entries={channelColumn(r.v[pixel])} />
          </div>
          <dl className="fs-facts">
            <dt>largest |Im| dropped</dt>
            <dd className="fs-num">{fmtSci(r.maxImag)}</dd>
            <dt>max |𝒦v − v|</dt>
            <dd className="fs-num">{identity ? fmtSci(r.roundTrip) : fmt(r.roundTrip)}</dd>
          </dl>
          <p className="fs-small">
            {identity
              ? 'With every mode kept and R = I, the round trip gives v back up to rounding: the DFT loses nothing.'
              : 'Truncation and R(k) change v on purpose. Tick the identity check to see the plain round trip.'}
          </p>
        </>
      }
      notes={<MarginNote sketch="1/n" computed={<>1/N with N = m·n = 25, the total number of grid points</>} />}
    >
      <Tex k="inverse" />
      <p>
        The dropped modes are filled with zeros (zero padding), and the inverse transform adds the kept ones back, divided by N = 25, with the
        opposite phase. Summed over the full symmetric set, the result is real; the imaginary part left over is only
        rounding error, and it is shown here rather than hidden.
      </p>
    </StageLayout>
  );
}

// ------------------------------------------------------------------ 7. local path

function StageLocal({ s }: { s: Sketch }) {
  const { r, pixel, channel, dv, activation } = s;
  const local = column(r.local, channel);
  const spec = column(r.spectralOut, channel);
  const next = column(r.next, channel);
  const scale = maxAbs([...local, ...spec, ...next]);
  return (
    <StageLayout
      n={7}
      visual={
        <>
          <ChannelPicker count={dv} channel={channel} onChannel={s.setChannel} />
          <div className="fs-grids fs-grids-ops">
            <PixelGrid values={local} scale={scale} pixel={pixel} onPixel={s.setPixel} label="W v plus b_W" caption={<>W v + b<sub>W</sub></>} />
            <PixelGrid values={spec} scale={scale} pixel={pixel} onPixel={s.setPixel} label="Spectral output" caption={<>+ 𝒦v</>} />
            <PixelGrid values={next} scale={scale} pixel={pixel} onPixel={s.setPixel} label="v next" caption={<>σ(sum) = v<sub>next</sub></>} />
          </div>
          <p className="fs-small">Channel {channel + 1}, all three on one colour scale.</p>
        </>
      }
      numbers={
        <>
          <PixelHeading p={pixel} />
          <div className="fs-table-wrap">
            <table className="fs-table">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">W v + b</th>
                  <th scope="col">𝒦v</th>
                  <th scope="col">sum</th>
                  <th scope="col">σ(sum)</th>
                </tr>
              </thead>
              <tbody>
                {r.local[pixel].map((l, c) => (
                  <tr key={c} className={c === channel ? 'is-channel' : undefined}>
                    <th scope="row">{vName(c)}</th>
                    <td className="fs-num">{fmt(l)}</td>
                    <td className="fs-num">{fmt(r.spectralOut[pixel][c])}</td>
                    <td className="fs-num">{fmt(r.preAct[pixel][c])}</td>
                    <td className="fs-num fs-pink">{fmt(r.next[pixel][c])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      }
    >
      <Tex k="local" />
      <p>
        The bottom path in the sketch: W is a plain real d<sub>v</sub> × d<sub>v</sub> matrix applied at every pixel,
        like P. It carries the local detail that the truncated spectral path cannot. σ then acts on each number on its
        own.
      </p>
      <Tex k={activation} />
      <p className="fs-small">{activation === 'relu' ? 'ReLU: negative sums become 0.' : 'GELU (tanh approximation): a smooth ReLU.'}</p>
    </StageLayout>
  );
}

// ------------------------------------------------------------------ 8. project

function StageProject({ s }: { s: Sketch }) {
  const { r, w, pixel, dv } = s;
  const z = r.next[pixel];
  return (
    <StageLayout
      n={8}
      visual={
        <div className="fs-stack-row">
          <SheetStack data={r.next} pixel={pixel} name="v" nameSub="next" shape={`5 × 5 × ${dv}`} />
          <div className="fs-stack-arrow" aria-hidden="true">
            <span>Q v + b<sub>Q</sub></span>
            <span className="fs-arrow-glyph">⟹</span>
            <span className="fs-small">
              d<sub>u</sub> ⇐ Q
            </span>
          </div>
          <PixelGrid values={r.u} scale={maxAbs(r.u)} pixel={pixel} onPixel={s.setPixel} label="Output u" caption={<>u(x), 5 × 5 × 1</>} />
        </div>
      }
      numbers={
        <>
          <PixelHeading p={pixel} />
          <p className="fs-num fs-written">
            u = {z.map((x, c) => `${term(w.Q[c])}·${term(x)}`).join(' + ')} + {term(w.bQ)} ={' '}
            <b className="fs-pink">{fmt(r.u[pixel])}</b>
          </p>
          <HeatMatrix values={[w.Q]} format={(x) => fmt(x)} label="Projection Q" rowLabel={() => 'Q'} colLabel={(c) => vName(c)} />
        </>
      }
      notes={
        <MarginNote sketch="“next layers”" computed={<>one Fourier layer, then straight on to Q</>}>
          Real FNOs repeat steps 3–7 a few times, and often use a small per-pixel MLP for Q.
        </MarginNote>
      }
    >
      <Tex k="project" />
      <Tex k="projectShape" />
      <p>
        Q brings each pixel’s d<sub>v</sub> channels down to d<sub>u</sub> = 1 number. The result is the output function u
        on the same 5×5 grid — the last box in the sketch.
      </p>
    </StageLayout>
  );
}

