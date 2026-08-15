/**
 * The M–h hysteresis loop: an x-y trace with a fading trail, drawn while the field
 * auto-sweep is on. Same card style as the other charts.
 */

const INK_MUTED = '#6B7689';
const GRID = 'rgba(150, 168, 200, 0.13)';

const MAX_POINTS = 420;

export class LoopChart {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly color: string;
  private readonly hMax: number;

  private readonly hs = new Float64Array(MAX_POINTS);
  private readonly ms = new Float64Array(MAX_POINTS);
  private count = 0;
  private dirty = true;
  private width = 0;
  private height = 0;
  private dpr = 0;

  constructor(title: string, color: string, hMax: number) {
    this.color = color;
    this.hMax = hMax;
    this.element = document.createElement('figure');
    this.element.className = 'chart';
    const head = document.createElement('figcaption');
    const h3 = document.createElement('h3');
    h3.textContent = title;
    head.append(h3);
    this.canvas = document.createElement('canvas');
    this.element.append(head, this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  push(h: number, m: number): void {
    if (this.count === MAX_POINTS) {
      this.hs.copyWithin(0, 1);
      this.ms.copyWithin(0, 1);
      this.count--;
    }
    this.hs[this.count] = h;
    this.ms[this.count] = m;
    this.count++;
    this.dirty = true;
  }

  clear(): void {
    this.count = 0;
    this.dirty = true;
  }

  /** Force a redraw, e.g. after a devicePixelRatio change. */
  invalidate(): void {
    this.dirty = true;
  }

  draw(): void {
    if (!this.dirty) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // Hidden canvases stay dirty so they render on first reveal (see charts.ts).
    if (w === 0 || h === 0) return;
    this.dirty = false;
    if (w !== this.width || h !== this.height || dpr !== this.dpr) {
      this.width = w;
      this.height = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 30;
    const padR = 8;
    const padT = 6;
    const padB = 14;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const px = (hv: number) => padL + ((hv + this.hMax) / (2 * this.hMax)) * plotW;
    const py = (mv: number) => padT + plotH - ((mv + 1) / 2) * plotH;

    // Axes through the origin.
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(0) + 0.5, padT);
    ctx.lineTo(px(0) + 0.5, padT + plotH);
    ctx.moveTo(padL, Math.round(py(0)) + 0.5);
    ctx.lineTo(w - padR, Math.round(py(0)) + 0.5);
    ctx.stroke();

    ctx.fillStyle = INK_MUTED;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(`−${this.hMax}`, padL, h - 2);
    ctx.textAlign = 'right';
    ctx.fillText(`h  +${this.hMax}`, w - padR, h - 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('m ±1', padL + 2, padT);

    if (this.count < 2) return;

    // Fading trail: older segments dimmer.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = this.color;
    for (let i = 1; i < this.count; i++) {
      ctx.globalAlpha = 0.12 + (0.88 * i) / this.count;
      ctx.beginPath();
      ctx.moveTo(px(this.hs[i - 1]), py(this.ms[i - 1]));
      ctx.lineTo(px(this.hs[i]), py(this.ms[i]));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(px(this.hs[this.count - 1]), py(this.ms[this.count - 1]), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
