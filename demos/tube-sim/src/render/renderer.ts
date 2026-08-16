import { wallRects } from '../sim/geometry';
import type { Solver } from '../sim/solver';
import type { Probe } from '../sim/types';

const WALL_COLOR = '#8a8172';
const WALL_STROKE = '#5b5548';
const NEUTRAL = [22, 26, 36] as const;
const RED = [235, 70, 55] as const;
const BLUE = [60, 130, 235] as const;
const MIN_SCALE_PA = 4;

export interface Transform {
  scale: number; // canvas px per cell
  offsetX: number;
  offsetY: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private fieldCanvas: HTMLCanvasElement;
  private fieldCtx: CanvasRenderingContext2D;
  private fieldImage: ImageData | null = null;
  private colorScale = MIN_SCALE_PA;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.fieldCanvas = document.createElement('canvas');
    const fctx = this.fieldCanvas.getContext('2d');
    if (!fctx) throw new Error('2D canvas context unavailable');
    this.fieldCtx = fctx;
    this.fieldCtx.imageSmoothingEnabled = false;
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  computeTransform(nx: number, ny: number): Transform {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const margin = 0.04;
    const scale = Math.min((w * (1 - 2 * margin)) / nx, (h * (1 - 2 * margin)) / ny);
    return {
      scale,
      offsetX: (w - nx * scale) / 2,
      offsetY: (h - ny * scale) / 2,
    };
  }

  render(
    solver: Solver,
    opts: { showVelocity: boolean; probes: Probe[]; labels: boolean },
  ): Transform {
    const { layout, p, solid } = solver;
    const { nx, ny } = layout;
    const t = this.computeTransform(nx, ny);
    const ctx = this.ctx;

    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.updateFieldImage(p, solid, nx, ny);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fieldCanvas, t.offsetX, t.offsetY, nx * t.scale, ny * t.scale);
    ctx.restore();

    this.drawWalls(layout, t);
    if (opts.showVelocity) this.drawVelocity(solver, t);
    this.drawProbes(opts.probes, layout, t);
    if (opts.labels) this.drawLabels(layout, t);

    return t;
  }

  private updateFieldImage(p: Float32Array, solid: Uint8Array, nx: number, ny: number): void {
    if (this.fieldCanvas.width !== nx || this.fieldCanvas.height !== ny) {
      this.fieldCanvas.width = nx;
      this.fieldCanvas.height = ny;
      this.fieldImage = this.fieldCtx.createImageData(nx, ny);
    }
    const img = this.fieldImage!;
    const data = img.data;

    let currentMax = MIN_SCALE_PA;
    for (let i = 0; i < p.length; i++) {
      const a = Math.abs(p[i]);
      if (a > currentMax) currentMax = a;
    }
    this.colorScale =
      currentMax > this.colorScale ? currentMax : this.colorScale * 0.995 + currentMax * 0.005;
    if (this.colorScale < MIN_SCALE_PA) this.colorScale = MIN_SCALE_PA;

    const scale = this.colorScale;
    for (let i = 0; i < p.length; i++) {
      const o = i * 4;
      if (solid[i]) {
        data[o + 3] = 0;
        continue;
      }
      const v = Math.max(-1, Math.min(1, p[i] / scale));
      const mag = Math.pow(Math.abs(v), 0.6);
      const target = v >= 0 ? RED : BLUE;
      data[o] = NEUTRAL[0] + (target[0] - NEUTRAL[0]) * mag;
      data[o + 1] = NEUTRAL[1] + (target[1] - NEUTRAL[1]) * mag;
      data[o + 2] = NEUTRAL[2] + (target[2] - NEUTRAL[2]) * mag;
      data[o + 3] = 255;
    }
    this.fieldCtx.putImageData(img, 0, 0);
  }

  private drawWalls(layout: Solver['layout'], t: Transform): void {
    const ctx = this.ctx;
    ctx.fillStyle = WALL_COLOR;
    ctx.strokeStyle = WALL_STROKE;
    ctx.lineWidth = Math.max(1, t.scale * 0.15);
    for (const r of wallRects(layout)) {
      const x = t.offsetX + r.x0 * t.scale;
      const y = t.offsetY + r.y0 * t.scale;
      const w = (r.x1 - r.x0 + 1) * t.scale;
      const h = (r.y1 - r.y0 + 1) * t.scale;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }

  private drawVelocity(solver: Solver, t: Transform): void {
    const { layout } = solver;
    const { nx, ny } = layout;
    const ctx = this.ctx;
    const step = 8; // sample every N cells, sparse enough to stay unobtrusive
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let j = step / 2; j < ny; j += step) {
      for (let i = step / 2; i < nx; i += step) {
        const idx = Math.floor(j) * nx + Math.floor(i);
        if (solver.solid[idx]) continue;
        const p = solver.pressureAt(Math.floor(i), Math.floor(j));
        if (Math.abs(p) < this.colorScale * 0.08) continue;
        const cx = t.offsetX + i * t.scale;
        const cy = t.offsetY + j * t.scale;
        const len = Math.min(step * t.scale * 0.4, (Math.abs(p) / this.colorScale) * step * t.scale);
        const dx = p >= 0 ? len : -len;
        ctx.beginPath();
        ctx.moveTo(cx - dx / 2, cy);
        ctx.lineTo(cx + dx / 2, cy);
        ctx.stroke();
      }
    }
  }

  private drawProbes(probes: Probe[], layout: Solver['layout'], t: Transform): void {
    const ctx = this.ctx;
    probes.forEach((probe, i) => {
      const cx = t.offsetX + (probe.fx * layout.nx + 0.5) * t.scale;
      const cy = t.offsetY + (probe.fy * layout.ny + 0.5) * t.scale;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(4, t.scale * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = PROBE_COLORS[i % PROBE_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  private drawLabels(layout: Solver['layout'], t: Transform): void {
    const ctx = this.ctx;
    const fontSize = Math.max(11, Math.min(16, t.scale * 4)) * this.dpr;
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(230,232,240,0.85)';
    ctx.strokeStyle = 'rgba(12,14,20,0.85)';
    ctx.lineWidth = 3;
    ctx.textBaseline = 'middle';

    const label = (text: string, xCell: number, yCell: number, align: CanvasTextAlign = 'left') => {
      const x = t.offsetX + xCell * t.scale;
      const y = t.offsetY + yCell * t.scale;
      ctx.textAlign = align;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    };

    label('closed end (strike here)', layout.tubeX0 + 2, layout.tubeY0 - layout.wallThicknessCells - 8, 'left');
    label('tube wall', layout.tubeX0 + 2, layout.tubeY0 - 3, 'left');
    label('atmosphere', layout.nx - 2, 8, 'right');
    label('open end →', layout.tubeX1 + 4, (layout.tubeY0 + layout.tubeY1) / 2, 'left');

    for (const gap of layout.holeGaps) {
      const cx = (gap.x0 + gap.x1) / 2;
      const y = gap.wall === 'top' ? layout.tubeY0 - layout.wallThicknessCells - 12 : layout.tubeY1 + layout.wallThicknessCells + 14;
      label('hole', cx, y, 'center');
    }
  }
}

const PROBE_COLORS = ['#ffd166', '#06d6a0', '#ef476f', '#a3a1ff'];
