import { C_SOUND, RHO_AIR } from '../physics/constants';
import { wallRects } from '../sim/geometry';
import type { Solver } from '../sim/solver';
import type { Probe } from '../sim/types';
import { PROBE_COLORS } from './palette';
import { ParticleField } from './particles';

/**
 * Everything on screen, drawn in layers so the geometry reads at a glance even
 * with the field at rest:
 *
 *   background → tube interior → pressure field (additive, with bloom) →
 *   air-motion particles → brass walls → probes → labels
 *
 * The field is drawn *additively* rather than as an opaque sheet: silence is
 * transparent, so a wave glows over the scene instead of tinting every cell.
 * That's what makes a weak, spread-out disturbance stay visible without
 * flattening the geometry underneath it.
 */

const NEUTRAL_FLOOR_PA = 2.5; // color scale never collapses below this
const PEAK_FORGET = 0.999; // per frame; the remembered peak fades over ~10 s
const PEAK_FLOOR_FRACTION = 0.12; // gain never rises past ~8× below the recent peak
const HOT: readonly [number, number, number] = [255, 104, 52]; // compression
const COLD: readonly [number, number, number] = [70, 156, 255]; // rarefaction

const BRASS_OUTER = '#4c4230';
const BRASS_MID = '#c9ae77';
const BRASS_LIGHT = '#f2e5c0';
const BRASS_DEEP = '#6d5c39';

export interface Transform {
  scale: number; // canvas px per cell
  offsetX: number;
  offsetY: number;
}

export interface Padding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RenderOptions {
  probes: Probe[];
  showParticles: boolean;
  labels: boolean;
  /** Simulated seconds advanced since the previous frame, for particle advection. */
  simDt: number;
}

export class Renderer {
  readonly particles = new ParticleField();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fieldCanvas: HTMLCanvasElement;
  private readonly fieldCtx: CanvasRenderingContext2D;
  private fieldImage: ImageData | null = null;
  private edgeMask: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private colorScale = NEUTRAL_FLOOR_PA;
  private peakPa = NEUTRAL_FLOOR_PA;
  private dpr = 1;
  private padding: Padding = { left: 0, right: 0, top: 0, bottom: 0 };
  private readonly blurSupported: boolean;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.fieldCanvas = document.createElement('canvas');
    const fctx = this.fieldCanvas.getContext('2d');
    if (!fctx) throw new Error('2D canvas context unavailable');
    this.fieldCtx = fctx;
    this.fieldCtx.imageSmoothingEnabled = false;
    fctx.filter = 'blur(2px)';
    this.blurSupported = fctx.filter === 'blur(2px)';
    fctx.filter = 'none';
  }

  /** Peak pressure the color scale currently maps to full saturation, in Pa. */
  get scalePa(): number {
    return this.colorScale;
  }

  resize(cssWidth: number, cssHeight: number, padding: Padding): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.padding = padding;
  }

  /** Fits the domain into the canvas area left free by the floating panels. */
  computeTransform(nx: number, ny: number): Transform {
    const d = this.dpr;
    const left = this.padding.left * d;
    const top = this.padding.top * d;
    const availW = Math.max(80, this.canvas.width - (this.padding.left + this.padding.right) * d);
    const availH = Math.max(80, this.canvas.height - (this.padding.top + this.padding.bottom) * d);
    const scale = Math.min(availW / nx, availH / ny);
    return {
      scale,
      offsetX: left + (availW - nx * scale) / 2,
      offsetY: top + (availH - ny * scale) / 2,
    };
  }

  render(solver: Solver, opts: RenderOptions): Transform {
    const { layout, p, solid } = solver;
    const { nx, ny } = layout;
    const t = this.computeTransform(nx, ny);
    const ctx = this.ctx;

    this.drawBackground(layout, t);
    this.drawTubeInterior(layout, t);

    this.updateFieldImage(p, solid, nx, ny, layout.spongeWidth);
    this.drawField(t, nx, ny);

    if (opts.showParticles) {
      this.particles.sync(solver);
      this.particles.update(solver, opts.simDt);
      this.particles.draw(ctx, t, this.colorScale / (RHO_AIR * C_SOUND));
    }

    this.drawWalls(layout, t);
    this.drawProbes(opts.probes, layout, t);
    if (opts.labels) this.drawLabels(layout, t);

    return t;
  }

  private drawBackground(layout: Solver['layout'], t: Transform): void {
    const ctx = this.ctx;
    const { width: w, height: h } = this.canvas;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a0e18');
    sky.addColorStop(0.55, '#080b13');
    sky.addColorStop(1, '#05070d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // A soft pool of light behind the tube, so the instrument sits in a space
    // rather than floating on a flat slab.
    const cx = t.offsetX + ((layout.tubeX0 + layout.tubeX1) / 2) * t.scale;
    const cy = t.offsetY + ((layout.tubeY0 + layout.tubeY1) / 2) * t.scale;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
    glow.addColorStop(0, 'rgba(88, 128, 200, 0.10)');
    glow.addColorStop(0.5, 'rgba(60, 90, 160, 0.04)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  private drawTubeInterior(layout: Solver['layout'], t: Transform): void {
    const ctx = this.ctx;
    const x = t.offsetX + layout.tubeX0 * t.scale;
    const y = t.offsetY + layout.tubeY0 * t.scale;
    const w = (layout.tubeX1 - layout.tubeX0 + 1) * t.scale;
    const h = (layout.tubeY1 - layout.tubeY0 + 1) * t.scale;

    const bore = ctx.createLinearGradient(0, y, 0, y + h);
    bore.addColorStop(0, 'rgba(120, 150, 205, 0.16)');
    bore.addColorStop(0.5, 'rgba(90, 118, 175, 0.07)');
    bore.addColorStop(1, 'rgba(120, 150, 205, 0.16)');
    ctx.fillStyle = bore;
    ctx.fillRect(x, y, w, h);
  }

  private updateFieldImage(
    p: Float32Array,
    solid: Uint8Array,
    nx: number,
    ny: number,
    spongeWidth: number,
  ): void {
    if (this.fieldCanvas.width !== nx || this.fieldCanvas.height !== ny) {
      this.fieldCanvas.width = nx;
      this.fieldCanvas.height = ny;
      this.fieldImage = this.fieldCtx.createImageData(nx, ny);
      this.edgeMask = buildEdgeMask(nx, ny, spongeWidth);
    }
    const img = this.fieldImage!;
    const data = img.data;

    // Auto-gain: snap up to a louder peak immediately, then release slowly and
    // never all the way. A pulse that has spread out stays readable, but the
    // gain can't chase the field down to where round-off noise fills the
    // screen — the exterior is *supposed* to look fainter than the bore.
    let currentMax = NEUTRAL_FLOOR_PA;
    for (let i = 0; i < p.length; i++) {
      const a = Math.abs(p[i]);
      if (a > currentMax) currentMax = a;
    }
    this.peakPa = Math.max(this.peakPa * PEAK_FORGET, currentMax);
    const target = Math.max(currentMax, this.peakPa * PEAK_FLOOR_FRACTION, NEUTRAL_FLOOR_PA);
    this.colorScale =
      target > this.colorScale ? target : this.colorScale * 0.99 + target * 0.01;

    const inv = 1 / this.colorScale;
    for (let i = 0; i < p.length; i++) {
      const o = i * 4;
      if (solid[i]) {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 0;
        continue;
      }
      const v = p[i] * inv;
      const clamped = v > 1 ? 1 : v < -1 ? -1 : v;
      // Gamma < 1 lifts the faint tail of the wave without blowing out the core.
      const mag = Math.pow(Math.abs(clamped), 0.7) * this.edgeMask[i];
      const c = clamped >= 0 ? HOT : COLD;
      data[o] = c[0] * mag;
      data[o + 1] = c[1] * mag;
      data[o + 2] = c[2] * mag;
      data[o + 3] = 255;
    }
    this.fieldCtx.putImageData(img, 0, 0);
  }

  private drawField(t: Transform, nx: number, ny: number): void {
    const ctx = this.ctx;
    const w = nx * t.scale;
    const h = ny * t.scale;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'lighter';
    if (this.blurSupported) {
      ctx.filter = `blur(${Math.max(2, t.scale * 0.9).toFixed(1)}px)`;
      ctx.globalAlpha = 0.45;
      ctx.drawImage(this.fieldCanvas, t.offsetX, t.offsetY, w, h);
      ctx.filter = 'none';
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.fieldCanvas, t.offsetX, t.offsetY, w, h);
    ctx.restore();
  }

  private drawWalls(layout: Solver['layout'], t: Transform): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.max(4, t.scale * 2);
    for (const r of wallRects(layout)) {
      const x = t.offsetX + r.x0 * t.scale;
      const y = t.offsetY + r.y0 * t.scale;
      const w = (r.x1 - r.x0 + 1) * t.scale;
      const h = (r.y1 - r.y0 + 1) * t.scale;
      // Brass, lit from the side the wall is thinnest across: vertical runs get
      // a horizontal gradient, horizontal runs a vertical one.
      const across = w < h ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
      across.addColorStop(0, BRASS_OUTER);
      across.addColorStop(0.3, BRASS_MID);
      across.addColorStop(0.45, BRASS_LIGHT);
      across.addColorStop(0.72, BRASS_DEEP);
      across.addColorStop(1, BRASS_OUTER);
      ctx.fillStyle = across;
      const radius = Math.min(t.scale * 0.8, w / 2, h / 2);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawProbes(probes: Probe[], layout: Solver['layout'], t: Transform): void {
    const ctx = this.ctx;
    probes.forEach((probe, i) => {
      const cx = t.offsetX + (probe.fx * layout.nx + 0.5) * t.scale;
      const cy = t.offsetY + (probe.fy * layout.ny + 0.5) * t.scale;
      const r = Math.max(4 * this.dpr, t.scale * 0.55);
      const color = PROBE_COLORS[i % PROBE_COLORS.length];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8, 11, 18, 0.85)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.35);
      ctx.strokeStyle = color;
      ctx.stroke();

      // The live reading sits on the meter itself, so you can watch the number
      // move with the wave without looking away from the field.
      const latest = probe.p[probe.p.length - 1] ?? 0;
      const text = `P${i + 1}  ${latest >= 0 ? '+' : '−'}${Math.abs(latest).toFixed(0)} Pa`;
      ctx.font = `${11 * this.dpr}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(text).width;
      const ty = cy - r * 1.9;
      ctx.beginPath();
      ctx.roundRect(cx - tw / 2 - 5 * this.dpr, ty - 13 * this.dpr, tw + 10 * this.dpr, 15 * this.dpr, 4 * this.dpr);
      ctx.fillStyle = 'rgba(9, 12, 20, 0.8)';
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(text, cx, ty);
    });
  }

  private drawLabels(layout: Solver['layout'], t: Transform): void {
    const ctx = this.ctx;
    const fontSize = Math.max(11, Math.min(14, t.scale * 3.2)) * this.dpr;
    ctx.font = `500 ${fontSize}px ${SANS}`;
    ctx.textBaseline = 'middle';

    const wall = layout.wallThicknessCells;
    const midY = (layout.tubeY0 + layout.tubeY1) / 2;

    this.pill('strike here', layout.tubeX0 - 1, layout.tubeY0 - wall - 6, t, 'left', [
      { x: layout.tubeX0 + 0.5, y: layout.tubeY0 - wall - 1 },
    ]);
    this.pill('tube wall', layout.tubeX0 + 14, layout.tubeY1 + wall + 7, t, 'left', [
      { x: layout.tubeX0 + 16, y: layout.tubeY1 + wall + 1 },
    ]);
    this.pill('open end', layout.tubeX1 + 6, midY, t, 'left', [{ x: layout.tubeX1 + 1, y: midY }]);
    this.pill('atmosphere', layout.nx - layout.spongeWidth - 4, layout.spongeWidth + 5, t, 'right', []);

    for (const gap of layout.holeGaps) {
      const cx = (gap.x0 + gap.x1) / 2;
      const top = gap.wall === 'top';
      const anchorY = top ? layout.tubeY0 - wall - 4 : layout.tubeY1 + wall + 4;
      const labelY = top ? anchorY - 8 : anchorY + 8;
      this.pill('hole', cx, labelY, t, 'center', [{ x: cx, y: anchorY }]);
    }
  }

  /** A label chip with an optional leader line to the thing it names. */
  private pill(
    text: string,
    xCell: number,
    yCell: number,
    t: Transform,
    align: 'left' | 'center' | 'right',
    anchors: { x: number; y: number }[],
  ): void {
    const ctx = this.ctx;
    const x = t.offsetX + xCell * t.scale;
    const y = t.offsetY + yCell * t.scale;
    const padX = 7 * this.dpr;
    const padY = 4 * this.dpr;
    const m = ctx.measureText(text);
    const w = m.width + padX * 2;
    const h = 11 * this.dpr + padY * 2;
    const bx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    const by = y - h / 2;

    for (const a of anchors) {
      ctx.beginPath();
      ctx.moveTo(t.offsetX + a.x * t.scale, t.offsetY + a.y * t.scale);
      ctx.lineTo(align === 'center' ? bx + w / 2 : bx + (align === 'left' ? padX : w - padX), y);
      ctx.strokeStyle = 'rgba(190, 205, 235, 0.3)';
      ctx.lineWidth = Math.max(1, this.dpr);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, h / 2);
    ctx.fillStyle = 'rgba(9, 12, 20, 0.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 185, 230, 0.18)';
    ctx.lineWidth = Math.max(1, this.dpr);
    ctx.stroke();

    ctx.fillStyle = 'rgba(214, 226, 245, 0.92)';
    ctx.textAlign = 'left';
    ctx.fillText(text, bx + padX, y + 0.5 * this.dpr);
  }
}

/**
 * Fades the field out across the damping sponge, so the domain's rectangular
 * edge never draws itself. Waves visibly die away into "somewhere else"
 * instead of stopping at a line — which is what the sponge physically models.
 */
function buildEdgeMask(nx: number, ny: number, spongeWidth: number): Float32Array {
  const mask = new Float32Array(nx * ny);
  const band = Math.max(1, spongeWidth);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const d = Math.min(i, nx - 1 - i, j, ny - 1 - j);
      const f = d >= band ? 1 : d / band;
      mask[j * nx + i] = f * f * (3 - 2 * f); // smoothstep
    }
  }
  return mask;
}

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
