import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import {
  FREQS,
  HALF_K2,
  N,
  SIZE,
  canonical,
  colour,
  fmt,
  isCanonical,
  isKept,
  modeIndex,
  pixelOf,
  type Complex,
  type Mode,
} from './lib/fno';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

// ------------------------------------------------------------ pencil filter

/** A faint wobble that makes straight SVG strokes look drawn by hand. */
function PencilFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="4" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" />
    </filter>
  );
}

// ------------------------------------------------------------ pixel grid

/**
 * A 5×5 grid of buttons, one per pixel. Arrow keys move the pink selection
 * (periodically, like the domain) and only the selected cell is a tab stop.
 */
export function PixelGrid({
  values,
  scale,
  pixel,
  onPixel,
  label,
  caption,
  format = (x) => fmt(x),
  fill,
  decorate,
}: {
  values: readonly number[];
  scale: number;
  pixel: number;
  onPixel: (p: number) => void;
  label: string;
  caption?: ReactNode;
  format?: (x: number) => string;
  fill?: (p: number) => string;
  decorate?: (p: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    const [i, j] = pixelOf(pixel);
    const next = ((i + d[0] + SIZE) % SIZE) * SIZE + ((j + d[1] + SIZE) % SIZE);
    onPixel(next);
    ref.current?.querySelectorAll('button')[next]?.focus();
  };
  return (
    <figure className="fs-fig">
      <div ref={ref} className="fs-grid" role="group" aria-label={label} onKeyDown={onKeyDown}>
        {values.map((x, p) => {
          const [i, j] = pixelOf(p);
          return (
            <button
              key={p}
              type="button"
              className={cx('fs-cell', p === pixel && 'is-pixel')}
              style={{ background: fill ? fill(p) : colour(x, scale) }}
              tabIndex={p === pixel ? 0 : -1}
              aria-pressed={p === pixel}
              aria-label={`${label}, pixel (${i}, ${j}): ${format(x)}`}
              onClick={() => onPixel(p)}
            >
              <span className="fs-cell-value">{format(x)}</span>
              {decorate?.(p)}
            </button>
          );
        })}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

// ------------------------------------------------------------ mode grid

/**
 * Spectral grid. `half` draws her rfft layout (rows k1 = −2..2, columns k2 = 0..2);
 * otherwise all 25 modes. `values` are indexed by modeIndex.
 */
export function ModeGrid({
  values,
  mode,
  onMode,
  K,
  half = true,
  label,
  caption,
  digits = 1,
}: {
  values: readonly number[];
  mode: Mode;
  /** Called with the canonical (drawn half-plane) mode and the cell actually clicked. */
  onMode: (m: Mode, clicked: Mode) => void;
  /** Truncation to draw (null: nothing discarded). */
  K: readonly [number, number] | null;
  half?: boolean;
  label: string;
  caption?: ReactNode;
  digits?: number;
}) {
  const cols = half ? HALF_K2 : FREQS;
  const scale = Math.max(...values.map(Math.abs)) || 1;
  return (
    <figure className="fs-fig">
      <div
        className="fs-modes"
        role="group"
        aria-label={label}
        style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(0, 1fr))` }}
      >
        <span className="fs-modes-corner" aria-hidden="true">
          k₁ \ k₂
        </span>
        {cols.map((k2) => (
          <span key={k2} className="fs-modes-head" aria-hidden="true">
            {k2}
          </span>
        ))}
        {FREQS.map((k1) => (
          <ModeRow key={k1} k1={k1} cols={cols} values={values} mode={mode} onMode={onMode} K={K} scale={scale} digits={digits} label={label} />
        ))}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function ModeRow({
  k1,
  cols,
  values,
  mode,
  onMode,
  K,
  scale,
  digits,
  label,
}: {
  k1: number;
  cols: readonly number[];
  values: readonly number[];
  mode: Mode;
  onMode: (m: Mode, clicked: Mode) => void;
  K: readonly [number, number] | null;
  scale: number;
  digits: number;
  label: string;
}) {
  return (
    <>
      <span className="fs-modes-head" aria-hidden="true">
        {k1}
      </span>
      {cols.map((k2) => {
        const kept = K === null || isKept(K[0], K[1], k1, k2);
        const mirror = !isCanonical(k1, k2);
        const [c1, c2] = canonical(k1, k2);
        const selected = c1 === mode[0] && c2 === mode[1];
        const value = values[modeIndex(k1, k2)];
        const state = kept ? fmt(value, digits) : `${fmt(value, digits)}, dropped`;
        return (
          <button
            key={k2}
            type="button"
            className={cx(
              'fs-mode',
              !kept && 'is-dropped',
              mirror && 'is-mirror',
              selected && (mirror ? 'is-mode-partner' : 'is-mode'),
            )}
            style={{ background: kept ? colour(value, scale) : undefined }}
            aria-pressed={selected && !mirror}
            aria-label={`${label}, mode (${k1}, ${k2}): ${state}${mirror ? `, conjugate of (${c1}, ${c2})` : ''}`}
            onClick={() => onMode([c1, c2], [k1, k2])}
          >
            {fmt(value, digits)}
          </button>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------ stacked sheets

/** Her 5×5×d box: one 5×5 sheet per channel, offset diagonally, with the pink pixel's column. */
export function SheetStack({
  data,
  pixel,
  name,
  nameSub,
  shape,
}: {
  data: readonly (readonly number[])[];
  pixel: number;
  name: string;
  nameSub?: string;
  shape: string;
}) {
  const filter = useId().replace(/:/g, '');
  const C = data[0].length;
  const cell = 13;
  const sheet = cell * SIZE;
  const dx = 9;
  const dy = 7;
  const width = sheet + dx * (C - 1) + 8;
  const top = dy * (C - 1) + 4;
  const height = top + sheet + 34;
  const scale = Math.max(...data.flat().map(Math.abs)) || 1;
  const [pi, pj] = pixelOf(pixel);
  const origin = (c: number) => [4 + dx * c, top - dy * c] as const;
  const centres = Array.from({ length: C }, (_, c) => {
    const [x, y] = origin(c);
    return [x + pj * cell + cell / 2, y + pi * cell + cell / 2] as const;
  });
  return (
    <svg
      className="fs-sheets"
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: Math.round(width * 1.45) }}
      role="img"
      aria-label={`${name}${nameSub ? ` ${nameSub}` : ''}: ${shape}, one sheet per channel`}
    >
      <defs>
        <PencilFilter id={filter} />
      </defs>
      {Array.from({ length: C }, (_, k) => C - 1 - k).map((c) => {
        const [x0, y0] = origin(c);
        return (
          <g key={c}>
            <rect x={x0} y={y0} width={sheet} height={sheet} className="fs-sheet-paper" />
            {Array.from({ length: N }, (_, p) => {
              const [i, j] = pixelOf(p);
              return (
                <rect key={p} x={x0 + j * cell} y={y0 + i * cell} width={cell} height={cell} fill={colour(data[p][c], scale)} />
              );
            })}
            <g filter={`url(#${filter})`} className="fs-pencil-stroke">
              <rect x={x0} y={y0} width={sheet} height={sheet} fill="none" />
              {[1, 2, 3, 4].map((t) => (
                <g key={t} className="fs-pencil-faint">
                  <line x1={x0 + t * cell} y1={y0} x2={x0 + t * cell} y2={y0 + sheet} />
                  <line x1={x0} y1={y0 + t * cell} x2={x0 + sheet} y2={y0 + t * cell} />
                </g>
              ))}
            </g>
            <rect x={x0 + pj * cell} y={y0 + pi * cell} width={cell} height={cell} className="fs-pink-cell" />
          </g>
        );
      })}
      <polyline points={centres.map(([x, y]) => `${x},${y}`).join(' ')} className="fs-pink-line" />
      {centres.map(([x, y], c) => (
        <circle key={c} cx={x} cy={y} r={1.8} className="fs-pink-dot" />
      ))}
      <text x={4} y={top + sheet + 16} className="fs-svg-name">
        {name}
        {nameSub && (
          <tspan dy={3} className="fs-svg-sub">
            {nameSub}
          </tspan>
        )}
      </text>
      <text x={4} y={top + sheet + 29} className="fs-svg-small">
        {shape}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------ phasor chain

/**
 * The 25 terms of one DFT coefficient drawn head to tail in the complex plane,
 * with the resultant from the origin. `order` lists the pixels in drawing order.
 */
export function PhasorPlot({
  terms,
  order,
  pixel,
  directions,
}: {
  terms: readonly Complex[];
  order: readonly number[];
  pixel: number;
  /** Distinct phase directions e^{-2πi q/5} present for this mode. */
  directions: readonly number[];
}) {
  const id = useId().replace(/:/g, '');
  const points: [number, number][] = [[0, 0]];
  for (const p of order) {
    const [x, y] = points[points.length - 1];
    points.push([x + terms[p].re, y + terms[p].im]);
  }
  const xs = points.map((q) => q[0]);
  const ys = points.map((q) => q[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-6);
  const size = 340;
  const pad = 34;
  const s = (size - 2 * pad) / span;
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const my = (Math.max(...ys) + Math.min(...ys)) / 2;
  const X = (x: number) => size / 2 + (x - mx) * s;
  const Y = (y: number) => size / 2 - (y - my) * s;
  const end = points[points.length - 1];
  const resultantLength = Math.hypot(end[0], end[1]) * s;
  return (
    <svg className="fs-phasor" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Phasor sum: the 25 terms head to tail and their resultant">
      <defs>
        {(['pencil', 'pink', 'orange'] as const).map((tone) => (
          <marker key={tone} id={`${id}-${tone}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0,1 L10,5 L0,9 z" className={`fs-head-${tone}`} />
          </marker>
        ))}
      </defs>
      <line x1={0} x2={size} y1={Y(0)} y2={Y(0)} className="fs-axis" />
      <line x1={X(0)} x2={X(0)} y1={0} y2={size} className="fs-axis" />
      <text x={size - 6} y={Y(0) - 5} textAnchor="end" className="fs-svg-small">
        Re
      </text>
      <text x={X(0) + 5} y={12} className="fs-svg-small">
        Im
      </text>
      {order.map((p, n) => {
        const [x1, y1] = points[n];
        const [x2, y2] = points[n + 1];
        const long = Math.hypot(x2 - x1, y2 - y1) * s > 7;
        const tone = p === pixel ? 'pink' : 'pencil';
        return (
          <line
            key={p}
            x1={X(x1)}
            y1={Y(y1)}
            x2={X(x2)}
            y2={Y(y2)}
            className={`fs-arrow-${tone}`}
            markerEnd={long ? `url(#${id}-${tone})` : undefined}
          />
        );
      })}
      {resultantLength > 1 && (
        <line x1={X(0)} y1={Y(0)} x2={X(end[0])} y2={Y(end[1])} className="fs-arrow-orange" markerEnd={resultantLength > 8 ? `url(#${id}-orange)` : undefined} />
      )}
      <circle cx={X(0)} cy={Y(0)} r={3} className="fs-origin" />
      <g transform={`translate(${size - 40}, ${size - 40})`} aria-hidden="true">
        <circle r={24} className="fs-axis" fill="none" />
        {directions.map((q) => {
          const t = (-2 * Math.PI * q) / 5;
          return <line key={q} x1={0} y1={0} x2={22 * Math.cos(t)} y2={-22 * Math.sin(t)} className="fs-arrow-pencil" />;
        })}
        <text y={36} textAnchor="middle" className="fs-svg-small">
          {directions.length} {directions.length === 1 ? 'direction' : 'directions'}
        </text>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------ pipeline strip

const PIPE: { stage: number; x: number; w: number; label: string; sub?: string; kind: 'box' | 'tensor' | 'plus' }[] = [
  { stage: 0, x: 48, w: 0, label: 'a(x)', sub: '5×5×4', kind: 'tensor' },
  { stage: 1, x: 132, w: 44, label: 'P', kind: 'box' },
  { stage: 1, x: 214, w: 0, label: 'v', sub: '5×5×dᵥ', kind: 'tensor' },
  { stage: 2, x: 304, w: 44, label: 'F', kind: 'box' },
  { stage: 3, x: 386, w: 62, label: 'trunc', sub: 'K max', kind: 'box' },
  { stage: 4, x: 472, w: 52, label: 'R(k)', kind: 'box' },
  { stage: 5, x: 558, w: 52, label: 'F⁻¹', kind: 'box' },
  { stage: 6, x: 640, w: 0, label: '+', kind: 'plus' },
  { stage: 6, x: 712, w: 44, label: 'σ', kind: 'box' },
  { stage: 7, x: 800, w: 44, label: 'Q', kind: 'box' },
  { stage: 7, x: 888, w: 0, label: 'u(x)', sub: '5×5×1', kind: 'tensor' },
];

/** Her diagram as one strip: a → P → v → F → trunc → R → F⁻¹ → (+ W) → σ → Q → u. */
export function Pipeline({ stage, onStage }: { stage: number; onStage: (s: number) => void }) {
  const filter = useId().replace(/:/g, '');
  const y = 58;
  const edges: [number, number][] = [];
  for (let n = 0; n < PIPE.length - 1; n++) {
    const a = PIPE[n];
    const b = PIPE[n + 1];
    const right = a.kind === 'tensor' ? a.x + 20 : a.kind === 'plus' ? a.x + 13 : a.x + a.w / 2;
    const left = b.kind === 'tensor' ? b.x - 22 : b.kind === 'plus' ? b.x - 13 : b.x - b.w / 2;
    edges.push([right + 3, left - 3]);
  }
  return (
    <svg className="fs-pipeline" viewBox="0 0 940 150" aria-hidden="true">
      <defs>
        <PencilFilter id={filter} />
        <marker id={`${filter}-head`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0,1 L10,5 L0,9" className="fs-head-open" />
        </marker>
      </defs>
      <g filter={`url(#${filter})`} className="fs-pencil-stroke">
        {edges.map(([x1, x2], n) => (
          <line key={n} x1={x1} x2={x2} y1={y} y2={y} markerEnd={`url(#${filter}-head)`} />
        ))}
        {/* the bottom path: v → W → + */}
        <path d={`M214,${y + 22} L214,122 L626,122 L638,${y + 14}`} fill="none" markerEnd={`url(#${filter}-head)`} />
        {/* her "next layers": not computed here */}
        <path d={`M734,${y - 12} C760,10 790,10 810,22`} fill="none" className="fs-faded" strokeDasharray="4 4" />
      </g>
      <text x={812} y={18} className="fs-svg-small fs-faded-text">
        next layers
      </text>
      <g className={cx('fs-pipe-node', stage === 6 && 'is-current')} onClick={() => onStage(6)}>
        <rect x={398} y={108} width={44} height={28} rx={4} className="fs-pipe-box" />
        <text x={420} y={127} textAnchor="middle" className="fs-pipe-label">
          W
        </text>
      </g>
      {PIPE.map((n, k) => (
        <g key={k} className={cx('fs-pipe-node', stage === n.stage && 'is-current')} onClick={() => onStage(n.stage)}>
          {n.kind === 'box' && <rect x={n.x - n.w / 2} y={y - 16} width={n.w} height={32} rx={4} className="fs-pipe-box" />}
          {n.kind === 'plus' && <circle cx={n.x} cy={y} r={13} className="fs-pipe-box" />}
          {n.kind === 'tensor' &&
            [2, 1, 0].map((c) => (
              <rect key={c} x={n.x - 18 + c * 4} y={y - 16 - c * 4} width={30} height={30} className="fs-pipe-box" />
            ))}
          <text x={n.x} y={n.kind === 'tensor' ? y + 4 : y + 6} textAnchor="middle" className={n.kind === 'tensor' ? 'fs-pipe-tensor' : 'fs-pipe-label'}>
            {n.label}
          </text>
          {n.sub && (
            <text x={n.x} y={y + 34} textAnchor="middle" className="fs-svg-small">
              {n.sub}
            </text>
          )}
          <text x={n.x} y={y - 26} textAnchor="middle" className="fs-pipe-number">
            {k === 0 || PIPE[k - 1].stage !== n.stage ? n.stage + 1 : ''}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------ vectors, matrices

/** A bracketed column vector, like the columns she draws next to the boxes. */
export function Column({
  entries,
  labels,
  tone = 'plain',
  title,
}: {
  entries: readonly string[];
  labels?: readonly string[];
  tone?: 'pink' | 'orange' | 'plain';
  title?: ReactNode;
}) {
  return (
    <div className={cx('fs-column', `tone-${tone}`)}>
      {title && <div className="fs-column-title">{title}</div>}
      <div className="fs-column-body">
        {entries.map((e, n) => (
          <div key={n} className="fs-column-row">
            {labels && <span className="fs-column-label">{labels[n]}</span>}
            <span className="fs-num">{e}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A small heat matrix: cells coloured by |value|, printed with `format`. */
export function HeatMatrix({
  values,
  format,
  label,
  rowLabel,
  colLabel,
}: {
  values: readonly (readonly number[])[];
  format: (x: number, r: number, c: number) => string;
  label: string;
  rowLabel: (r: number) => string;
  colLabel: (c: number) => string;
}) {
  const scale = Math.max(...values.flat().map(Math.abs)) || 1;
  const cols = values[0].length;
  return (
    <div className="fs-heat" role="table" aria-label={label} style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))` }}>
      <span role="columnheader" />
      {values[0].map((_, c) => (
        <span key={c} role="columnheader" className="fs-modes-head">
          {colLabel(c)}
        </span>
      ))}
      {values.map((row, r) => (
        <div key={r} role="row" className="fs-heat-row">
          <span role="rowheader" className="fs-modes-head">
            {rowLabel(r)}
          </span>
          {row.map((x, c) => (
            <span key={c} role="cell" className="fs-heat-cell" style={{ background: colour(Math.abs(x), scale) }}>
              {format(x, r, c)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ controls and notes

export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="fs-slider">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-describedby={hint ? `${id}-hint` : undefined} />
      <output htmlFor={id}>{value}</output>
      {hint && (
        <span id={`${id}-hint`} className="fs-visually-hidden">
          {hint}
        </span>
      )}
    </div>
  );
}

export function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="fs-btn" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

/** Her drawing vs what is computed: small, pencilled, kind. */
export function MarginNote({ sketch, computed, children }: { sketch: ReactNode; computed: ReactNode; children?: ReactNode }) {
  return (
    <aside className="fs-margin-note">
      <p>
        <span className="fs-margin-key">in the sketch:</span> {sketch}
      </p>
      <p>
        <span className="fs-margin-key">computed here:</span> {computed}
      </p>
      {children && <p className="fs-margin-extra">{children}</p>}
    </aside>
  );
}

export function ChannelPicker({ count, channel, onChannel, prefix = 'v' }: { count: number; channel: number; onChannel: (c: number) => void; prefix?: string }) {
  return (
    <div className="fs-channels" role="group" aria-label="Channel">
      <span className="fs-channels-label">channel</span>
      {Array.from({ length: count }, (_, c) => (
        <button key={c} type="button" className="fs-chip" aria-pressed={c === channel} onClick={() => onChannel(c)}>
          {prefix}
          <sub>{c + 1}</sub>
        </button>
      ))}
    </div>
  );
}
