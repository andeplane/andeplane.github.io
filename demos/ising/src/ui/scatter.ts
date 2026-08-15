/**
 * A temperature-domain scatter chart: binned measurements accumulate as dots over a
 * fixed x-domain, with an optional exact reference curve, a vertical T_c marker, and a
 * cursor line at the current temperature. Visual language matches charts.ts.
 */

const INK_MUTED = '#6B7689';
const GRID = 'rgba(150, 168, 200, 0.13)';

export interface ScatterSpec {
  title: string;
  format: (v: number) => string;
  color: string;
  xDomain: [number, number];
  /** Force the y-axis to include these values. */
  include?: number[];
}

export interface ScatterDatum {
  T: number;
  y: number;
  /** Samples in the bin; drawn more opaque as it firms up. */
  n: number;
}

export class ScatterChart {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly spec: ScatterSpec;
  private readonly note: HTMLElement;
  private readonly count: HTMLElement;

  private points: ScatterDatum[] = [];
  private refCurve: ((T: number) => number | null) | null = null;
  private refLabel = '';
  private tc = 0;
  private cursorT: number | null = null;
  private dirty = true;
  private lo = Number.POSITIVE_INFINITY;
  private hi = Number.NEGATIVE_INFINITY;
  private width = 0;
  private height = 0;

  constructor(spec: ScatterSpec) {
    this.spec = spec;
    this.element = document.createElement('figure');
    this.element.className = 'chart scatter';

    const head = document.createElement('figcaption');
    const title = document.createElement('h3');
    title.textContent = spec.title;
    this.count = document.createElement('span');
    this.count.className = 'scatter-count';
    head.append(title, this.count);

    this.note = document.createElement('small');
    this.note.className = 'scatter-note';
    this.note.hidden = true;

    this.canvas = document.createElement('canvas');
    this.element.append(head, this.note, this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  setTc(tc: number): void {
    if (tc !== this.tc) {
      this.tc = tc;
      this.dirty = true;
    }
  }

  setRefCurve(fn: ((T: number) => number | null) | null, label = ''): void {
    this.refCurve = fn;
    this.refLabel = label;
    this.dirty = true;
  }

  setPoints(points: ScatterDatum[]): void {
    this.points = points;
    this.dirty = true;
    const total = points.reduce((s, p) => s + p.n, 0);
    this.count.textContent = total > 0 ? `${points.length} bins` : '';
  }

  setCursor(T: number | null): void {
    if (T !== this.cursorT) {
      this.cursorT = T;
      this.dirty = true;
    }
  }

  /** Grey out with a one-line explanation, e.g. while h ≠ 0. */
  setPaused(reason: string | null): void {
    this.note.hidden = reason === null;
    this.note.textContent = reason ?? '';
    this.element.classList.toggle('paused', reason !== null);
  }

  draw(): void {
    if (!this.dirty) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // Hidden canvases stay dirty so they render on first reveal (see charts.ts).
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

    const padL = 46;
    const padR = 8;
    const padT = 6;
    const padB = 16;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const [x0, x1] = this.spec.xDomain;

    this.updateRange();
    const { lo, hi } = niceRange(this.lo, this.hi);
    const spanY = Math.max(hi - lo, 1e-12);
    const px = (T: number) => padL + ((T - x0) / (x1 - x0)) * plotW;
    const py = (v: number) => padT + plotH - ((v - lo) / spanY) * plotH;

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

    // T_c marker.
    if (this.tc > x0 && this.tc < x1) {
      const x = Math.round(px(this.tc)) + 0.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(215, 226, 245, 0.42)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(215, 226, 245, 0.7)';
      ctx.fillText('T_c', x + 3, padT + 7);
    }

    // Exact reference curve.
    if (this.refCurve) {
      ctx.save();
      ctx.strokeStyle = 'rgba(215, 226, 245, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const T = x0 + ((x1 - x0) * i) / steps;
        const v = this.refCurve(T);
        if (v === null || !Number.isFinite(v)) {
          started = false;
          continue;
        }
        const X = px(T);
        const Y = py(v);
        if (!started) {
          ctx.moveTo(X, Y);
          started = true;
        } else {
          ctx.lineTo(X, Y);
        }
      }
      ctx.stroke();
      ctx.restore();
      if (this.refLabel) {
        ctx.fillStyle = 'rgba(215, 226, 245, 0.55)';
        ctx.textAlign = 'right';
        ctx.fillText(this.refLabel, w - padR - 2, padT + 7);
      }
    }

    // Cursor: where the temperature slider is right now.
    if (this.cursorT !== null && this.cursorT >= x0 && this.cursorT <= x1) {
      const x = Math.round(px(this.cursorT)) + 0.5;
      ctx.strokeStyle = 'rgba(127, 178, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }

    // The measured dots. Opacity encodes how firm the bin is.
    ctx.fillStyle = this.spec.color;
    for (const p of this.points) {
      if (p.T < x0 || p.T > x1) continue;
      ctx.globalAlpha = Math.min(1, 0.3 + p.n / 80);
      ctx.beginPath();
      ctx.arc(px(p.T), py(p.y), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = INK_MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(this.spec.format(x0), padL, h - 3);
    ctx.textAlign = 'right';
    ctx.fillText(`${this.spec.format(x1)} T`, w - padR, h - 3);
  }

  private updateRange(): void {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const p of this.points) {
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
    for (const v of this.spec.include ?? []) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo)) {
      this.lo = this.spec.include?.[0] ?? 0;
      this.hi = this.spec.include?.[1] ?? 1;
      return;
    }
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
    lo -= pad;
    hi += pad;
    this.lo = Number.isFinite(this.lo) ? Math.min(lo, this.lo * 0.9 + lo * 0.1) : lo;
    this.hi = Number.isFinite(this.hi) ? Math.max(hi, this.hi * 0.9 + hi * 0.1) : hi;
  }
}

function niceRange(lo: number, hi: number): { lo: number; hi: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return { lo: 0, hi: 1 };
  const span = hi - lo;
  const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const mult = span / 3 / step;
  const nice = step * (mult > 5 ? 10 : mult > 2 ? 5 : mult > 1 ? 2 : 1);
  return { lo: Math.floor(lo / nice) * nice, hi: Math.ceil(hi / nice) * nice };
}
