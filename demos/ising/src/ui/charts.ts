/**
 * Live line charts on a canvas.
 *
 * Hand-rolled rather than pulled from a library: these are four polylines that update
 * continuously, and every charting library would cost 50-200 KB to fight with over
 * that. The parts that actually matter are the ones libraries usually get right and
 * hand-rolled charts usually get wrong -- device pixel ratio, one stroke per series,
 * sampling in simulation time rather than per frame, and a y-range that does not
 * jitter -- so those are handled explicitly below.
 */

export const SERIES_COLORS = {
  amber: '#C07C10',
  blue: '#3F8FE8',
  green: '#14AE84',
  violet: '#9C79E8',
} as const;

const INK = '#C9D2E3';
const INK_MUTED = '#6B7689';
const GRID = 'rgba(150, 168, 200, 0.13)';
const SURFACE = '#0B0F1A';

export interface SeriesSpec {
  key: string;
  label: string;
  color: string;
}

export interface ChartSpec {
  title: string;
  /** Formats a y value for the axis labels and readouts. */
  format: (v: number) => string;
  series: SeriesSpec[];
  /** Horizontal reference line, e.g. synchronous rotation at a ratio of 1. */
  reference?: { value: number; label: string };
  /** Force the y-axis to include these values. */
  include?: number[];
}

const MAX_POINTS = 640;

export class Chart {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly spec: ChartSpec;

  private readonly x = new Float64Array(MAX_POINTS);
  private readonly values = new Map<string, Float64Array>();
  private readonly readouts = new Map<string, HTMLElement>();
  private readonly lastText = new Map<string, string>();
  private count = 0;

  // Expand-fast, contract-slowly y-range. Recomputing min/max raw every frame makes
  // the axis twitch, which is the ugliest thing that can happen on a live chart.
  private lo = Number.POSITIVE_INFINITY;
  private hi = Number.NEGATIVE_INFINITY;
  private dirty = true;
  private width = 0;
  private height = 0;

  constructor(spec: ChartSpec) {
    this.spec = spec;
    for (const s of spec.series) this.values.set(s.key, new Float64Array(MAX_POINTS));

    this.element = document.createElement('figure');
    this.element.className = 'chart';

    const head = document.createElement('figcaption');
    const title = document.createElement('h3');
    title.textContent = spec.title;
    head.append(title);

    const legend = document.createElement('dl');
    legend.className = 'legend';
    for (const s of spec.series) {
      const term = document.createElement('dt');
      const swatch = document.createElement('i');
      swatch.style.background = s.color;
      term.append(swatch, document.createTextNode(s.label));
      const value = document.createElement('dd');
      value.textContent = '—';
      legend.append(term, value);
      this.readouts.set(s.key, value);
    }
    head.append(legend);

    this.canvas = document.createElement('canvas');
    this.element.append(head, this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Append one sample. `t` is simulation time (sweeps), not wall clock. */
  push(t: number, sample: Record<string, number>): void {
    if (this.count === MAX_POINTS) {
      this.x.copyWithin(0, 1);
      for (const array of this.values.values()) array.copyWithin(0, 1);
      this.count--;
    }
    const i = this.count++;
    this.x[i] = t;
    for (const [key, array] of this.values) array[i] = sample[key] ?? 0;
    this.dirty = true;
  }

  clear(): void {
    this.count = 0;
    this.lo = Number.POSITIVE_INFINITY;
    this.hi = Number.NEGATIVE_INFINITY;
    this.dirty = true;
  }

  /** Update the DOM readouts. Kept out of the canvas: text there is slow and uglier. */
  updateReadouts(sample: Record<string, number>): void {
    for (const s of this.spec.series) {
      const text = this.spec.format(sample[s.key] ?? 0);
      if (this.lastText.get(s.key) === text) continue;
      this.lastText.set(s.key, text);
      this.readouts.get(s.key)!.textContent = text;
    }
  }

  draw(): void {
    if (!this.dirty) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // Hidden (zero-size) canvases stay dirty, so they render on first reveal even if
    // no new data arrives — clearing the flag here would leave them blank forever.
    if (w === 0 || h === 0) return;
    this.dirty = false;
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this.count < 2) return;

    const padL = 46;
    const padR = 8;
    const padT = 6;
    const padB = 16;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    this.updateRange();
    const { lo, hi } = niceRange(this.lo, this.hi);
    const x0 = this.x[0];
    const x1 = this.x[this.count - 1];
    const spanX = Math.max(x1 - x0, 1e-9);
    const spanY = Math.max(hi - lo, 1e-12);

    const px = (t: number) => padL + ((t - x0) / spanX) * plotW;
    const py = (v: number) => padT + plotH - ((v - lo) / spanY) * plotH;

    // Grid and y labels.
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.fillStyle = INK_MUTED;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const v = lo + (spanY * i) / 3;
      const y = Math.round(py(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(this.spec.format(v), padL - 6, y);
    }

    if (this.spec.reference) {
      const y = Math.round(py(this.spec.reference.value)) + 0.5;
      if (y > padT && y < padT + plotH) {
        ctx.save();
        ctx.strokeStyle = 'rgba(215, 226, 245, 0.42)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(215, 226, 245, 0.7)';
        ctx.fillText(this.spec.reference.label, padL + 4, y - 7);
      }
    }

    // One path per series, not one per segment.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (const s of this.spec.series) {
      const array = this.values.get(s.key)!;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      for (let i = 0; i < this.count; i++) {
        const X = px(this.x[i]);
        const Y = py(array[i]);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();

      // A dot on the leading end, so the current value is findable at a glance.
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(px(this.x[this.count - 1]), py(array[this.count - 1]), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = INK_MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(x0)}`, padL, h - 3);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(x1)} sweeps`, w - padR, h - 3);
  }

  private updateRange(): void {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const array of this.values.values()) {
      for (let i = 0; i < this.count; i++) {
        const v = array[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    for (const v of this.spec.include ?? []) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (this.spec.reference) {
      const v = this.spec.reference.value;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo)) return;

    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
    lo -= pad;
    hi += pad;

    // Snap outward immediately, relax inward slowly.
    this.lo = Number.isFinite(this.lo) ? Math.min(lo, this.lo * 0.94 + lo * 0.06) : lo;
    this.hi = Number.isFinite(this.hi) ? Math.max(hi, this.hi * 0.94 + hi * 0.06) : hi;
  }
}

/** Round a range out to friendly numbers so the labels stop dancing. */
function niceRange(lo: number, hi: number): { lo: number; hi: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return { lo: 0, hi: 1 };
  const span = hi - lo;
  const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const mult = span / 3 / step;
  const nice = step * (mult > 5 ? 10 : mult > 2 ? 5 : mult > 1 ? 2 : 1);
  return { lo: Math.floor(lo / nice) * nice, hi: Math.ceil(hi / nice) * nice };
}

export { SURFACE, INK };
