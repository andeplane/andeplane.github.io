/**
 * The d(t) plot: how far the middle of the loaded wall has moved, against time.
 *
 * This is the trace a real blast test produces — a displacement transducer at mid-span —
 * and it is the one picture that separates "the wall rang and came back" from "the wall
 * went and kept going". The samples come off the solver's own clock, so the horizontal
 * axis is simulation time and does not stretch when the playback speed changes.
 */

const PAD = { l: 40, r: 10, t: 10, b: 20 };

export class TracePlot {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private data: Float32Array = new Float32Array(0);
  /** Range seen so far, so the axis grows but never shrinks mid-event. */
  private lo = 0;
  private hi = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  reset(): void {
    this.data = new Float32Array(0);
    this.lo = 0;
    this.hi = 0;
    this.draw();
  }

  update(trace: Float32Array): void {
    this.data = trace;
    for (let i = 1; i < trace.length; i += 2) {
      this.lo = Math.min(this.lo, trace[i]);
      this.hi = Math.max(this.hi, trace[i]);
    }
    this.draw();
  }

  /** Latest displacement in millimetres, for the readout. */
  latest(): number {
    return this.data.length >= 2 ? this.data[this.data.length - 1] * 1000 : 0;
  }

  draw(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const c = this.ctx;
    const style = getComputedStyle(document.documentElement);
    const muted = style.getPropertyValue('--muted').trim() || '#8e96a2';
    const accent = style.getPropertyValue('--accent').trim() || '#e2703a';
    const edge = 'rgba(255,255,255,0.12)';

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const iw = this.canvas.clientWidth - PAD.l - PAD.r;
    const ih = this.canvas.clientHeight - PAD.t - PAD.b;

    // Time axis spans the event, not just what has been recorded, so the curve draws
    // itself across a stable frame instead of rescaling on every sample.
    const tEnd = Math.max(0.05, this.data.length >= 2 ? this.data[this.data.length - 2] : 0.05);
    // Scale to the range actually reached, keeping zero on the axis. A symmetric axis
    // wastes half the plot whenever the wall only ever goes one way, which is most of
    // the time — the blast pushes, it does not pull it back through zero.
    const span = Math.max(this.hi - this.lo, 0.002);
    const top = this.hi + span * 0.12;
    const bot = this.lo - span * 0.12;

    const x = (t: number) => PAD.l + (t / tEnd) * iw;
    const y = (d: number) => PAD.t + ((top - d) / (top - bot)) * ih;

    c.strokeStyle = edge;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(PAD.l, y(0));
    c.lineTo(PAD.l + iw, y(0));
    c.moveTo(PAD.l, PAD.t);
    c.lineTo(PAD.l, PAD.t + ih);
    c.stroke();

    c.fillStyle = muted;
    c.font = '9px ui-monospace, Menlo, monospace';
    c.textAlign = 'right';
    c.fillText(`${(top * 1000).toFixed(0)}`, PAD.l - 4, PAD.t + 8);
    // Only label zero when it is not sitting on top of one of the ends.
    if (y(0) > PAD.t + 16 && y(0) < PAD.t + ih - 10) c.fillText('0', PAD.l - 4, y(0) + 3);
    c.fillText(`${(bot * 1000).toFixed(0)}`, PAD.l - 4, PAD.t + ih);
    c.fillText(`${(tEnd * 1000).toFixed(0)} ms`, PAD.l + iw, PAD.t + ih + 14);

    if (this.data.length < 4) return;

    c.strokeStyle = accent;
    c.lineWidth = 1.6;
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i < this.data.length; i += 2) {
      const px = x(this.data[i]);
      const py = y(this.data[i + 1]);
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();

    // Mark where it is now, since the curve is still being written.
    const lastX = x(this.data[this.data.length - 2]);
    const lastY = y(this.data[this.data.length - 1]);
    c.fillStyle = accent;
    c.beginPath();
    c.arc(lastX, lastY, 2.4, 0, Math.PI * 2);
    c.fill();
  }
}
