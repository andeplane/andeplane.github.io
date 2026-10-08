/**
 * The tank hall: a thumbnail of every tank in the model, laid out like the two
 * weight matrices they hold. Each thumbnail shows that tank's steady ripple for
 * the current letter, Re(Σⱼ xⱼUⱼ e^{iωt}), from the frequency-domain solve, over a
 * dimmed picture of its floor.
 */
import { THUMB_NX, THUMB_NY } from '../sim/calib.worker.ts';
import { C2_DEEP, C2_SHALLOW, OMEGA, type TankSpec } from '../sim/tank.ts';
import type { Tile } from '../model/llm.ts';

export class TankHall {
  readonly canvases: HTMLCanvasElement[] = [];
  private readonly ctxs: CanvasRenderingContext2D[] = [];
  private readonly images: ImageData[] = [];
  private readonly floors: Float32Array[] = [];
  /** Combined steady field per tile (interleaved re/im), and its peak. */
  private readonly fields: Float32Array[] = [];
  private readonly peaks: number[] = [];
  readonly activity: number[] = [];
  shown = -1;

  constructor(root: HTMLElement, tiles: Tile[], specs: TankSpec[], onPick: (k: number) => void) {
    root.innerHTML = '';
    const layers: [1 | 2, string, string][] = [
      [1, 'W₁', '31×16 · 8 tanks'],
      [2, 'W₂', '27×32 · 16 tanks'],
    ];
    for (const [layer, name, dims] of layers) {
      const block = document.createElement('div');
      block.className = 'block';
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = `<i>${name}</i> layer ${layer}<span>${dims}</span>`;
      const grid = document.createElement('div');
      grid.className = 'grid';
      const cols = Math.max(...tiles.filter((t) => t.layer === layer).map((t) => t.c)) + 1;
      grid.style.gridTemplateColumns = `repeat(${cols}, auto)`;
      block.append(cap, grid);
      root.appendChild(block);
      tiles.forEach((t, k) => {
        if (t.layer !== layer) return;
        const c = document.createElement('canvas');
        c.width = THUMB_NX;
        c.height = THUMB_NY;
        c.title = `Layer ${t.layer} tile (${t.r + 1}, ${t.c + 1}): outputs ${t.r * 8 + 1}–${t.r * 8 + t.rows}, inputs ${t.c * 8 + 1}–${t.c * 8 + t.cols}`;
        c.style.gridRow = String(t.r + 1);
        c.style.gridColumn = String(t.c + 1);
        c.addEventListener('click', () => onPick(k));
        grid.appendChild(c);
        this.canvases[k] = c;
      });
    }
    tiles.forEach((_, k) => {
      const g = this.canvases[k].getContext('2d')!;
      this.ctxs[k] = g;
      this.images[k] = g.createImageData(THUMB_NX, THUMB_NY);
      const f = new Float32Array(THUMB_NX * THUMB_NY);
      const c2 = specs[k].c2;
      const nx = THUMB_NX * 2;
      for (let y = 0; y < THUMB_NY; y++) {
        for (let x = 0; x < THUMB_NX; x++) {
          const v = c2[2 * y * nx + 2 * x];
          f[y * THUMB_NX + x] = (v - C2_SHALLOW) / (C2_DEEP - C2_SHALLOW);
        }
      }
      this.floors[k] = f;
      this.fields[k] = new Float32Array(THUMB_NX * THUMB_NY * 2);
      this.peaks[k] = 1;
      this.activity[k] = 0;
    });
  }

  /** Set tile k's drive: field = Σⱼ xⱼ·Uⱼ from its per-wave-maker thumbnails. */
  setDrive(k: number, thumbs: Float32Array[] | undefined, x: ArrayLike<number>): void {
    const f = this.fields[k];
    f.fill(0);
    if (!thumbs) return;
    for (let j = 0; j < x.length && j < thumbs.length; j++) {
      const a = x[j];
      if (a === 0) continue;
      const u = thumbs[j];
      for (let i = 0; i < f.length; i++) f[i] += a * u[i];
    }
    // Normalise on the open water away from the wave-makers, so every tank reads.
    let peak = 1e-6;
    for (let y = 0; y < THUMB_NY; y++) {
      for (let x = 6; x < THUMB_NX; x++) {
        const i = 2 * (y * THUMB_NX + x);
        peak = Math.max(peak, Math.hypot(f[i], f[i + 1]));
      }
    }
    this.peaks[k] = peak;
  }

  draw(time: number): void {
    const c = Math.cos(OMEGA * time);
    const s = Math.sin(OMEGA * time);
    this.canvases.forEach((cv, k) => {
      cv.classList.toggle('shown', k === this.shown);
      const img = this.images[k];
      const d = img.data;
      const f = this.fields[k];
      const fl = this.floors[k];
      const act = this.activity[k];
      const g = 1.6 / this.peaks[k];
      for (let i = 0, n = THUMB_NX * THUMB_NY; i < n; i++) {
        const depth = fl[i];
        // Floor: sand in the shallows, slate in the deeps, dimmed.
        const r0 = 0.07 + 0.09 * (1 - depth);
        const g0 = 0.09 + 0.08 * (1 - depth);
        const b0 = 0.11 + 0.05 * (1 - depth);
        // The wave's local amplitude glows; its phase makes it shimmer.
        const re = f[2 * i];
        const im = f[2 * i + 1];
        const a = Math.hypot(re, im);
        const v = Math.tanh(g * a) * act;
        const sh = a > 0 ? 0.62 + 0.38 * ((re * c - im * s) / a) : 0;
        const w = v * sh;
        d[4 * i] = Math.min(255, (r0 + w * 0.42) * 255);
        d[4 * i + 1] = Math.min(255, (g0 + w * 0.88) * 255);
        d[4 * i + 2] = Math.min(255, (b0 + w * 1.0) * 255);
        d[4 * i + 3] = 255;
      }
      this.ctxs[k].putImageData(img, 0, 0);
    });
  }
}
