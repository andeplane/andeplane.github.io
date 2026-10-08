/**
 * The crossbar exhibit: lays an assembly out on the stage (reservoirs on the left, the valve
 * grid, collectors underneath), plays the fill → flow → collect animation of one operation,
 * and draws the HUD (labels, read-outs, tile seams and the overview map of a large matrix).
 */
import type { Assembly } from './assembly.ts';
import { emptyAssembly } from './assembly.ts';
import type { Stage } from './stage.ts';
import type { TankSpec } from './tanks.ts';

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Inter, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const GOLD = '#e4c487';
const POS = '#5cd6f2';
const NEG = '#ff9e52';

export interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  /** Grid rect in CSS px, y up. */
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  /** CSS px per cell. */
  cs: number;
  win: Win;
  /** Space available for the grid. */
  aw: number;
  ah: number;
  resX: number;
  resW: number;
  colY: number;
  colH: number;
  minimap: { x: number; y: number; w: number; h: number } | null;
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export interface ExhibitOptions {
  /** Show logical row values next to the reservoirs (when they fit). */
  rowLabels?: (row: number) => string | null;
  /** Labels under collector pairs (logical output j). */
  outLabels?: (j: number) => string | null;
  /** Extra caption under the title. */
  caption?: string;
  /** Logical output to highlight (e.g. the chosen next character). */
  highlightOut?: number;
}

export class Exhibit {
  asm: Assembly = emptyAssembly();
  private t = 0;
  duration = 1;
  /** Fraction of the duration spent filling reservoirs, flowing, collecting. */
  private zoom: Win | null = null;
  private lay: Layout | null = null;
  private spawnAcc: Float32Array = new Float32Array(1);
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapFor: Assembly | null = null;
  opts: ExhibitOptions = {};
  /** Chapter 1 keeps the flow running continuously once filled. */
  steady = false;
  hoverCell = -1;
  /** Reserved space (px) on the left of the stage, e.g. for a token strip. */
  insetTop = 0;

  constructor(
    readonly stage: Stage,
    readonly hud: CanvasRenderingContext2D,
  ) {}

  play(asm: Assembly, duration: number, keepZoom = false): void {
    const sameShape = asm.rows === this.asm.rows && asm.cols === this.asm.cols;
    this.asm = asm;
    this.t = 0;
    this.duration = duration;
    if (!keepZoom || !sameShape) this.zoom = null;
    this.spawnAcc = new Float32Array(asm.cols);
    this.stage.grid.setAssembly(asm);
    this.stage.particles.clear();
    this.lay = null;
  }

  /** Swap the data without restarting the animation (live edits in chapter 1). */
  update(asm: Assembly): void {
    this.asm = asm;
    if (this.spawnAcc.length !== asm.cols) this.spawnAcc = new Float32Array(asm.cols);
    this.stage.grid.setAssembly(asm);
  }

  get progress(): number {
    return Math.min(1, this.t / this.duration);
  }

  get done(): boolean {
    return this.t >= this.duration;
  }

  /** Jump to a fraction of the animation. */
  seek(f: number): void {
    this.t = f * this.duration;
  }

  /** Jump to the end state. */
  finish(): void {
    this.t = this.duration;
  }

  private phases(): { fill: number; front: number; collect: number } {
    const u = this.t / this.duration;
    return {
      fill: ease(u / 0.28),
      front: Math.min(1, Math.max(0, (u - 0.12) / 0.5)),
      collect: ease((u - 0.42) / 0.55),
    };
  }

  private layout(): Layout {
    const { w, h } = this.stage;
    const asm = this.asm;
    const top = (w < 640 ? 72 : 92) + this.insetTop;
    const colH = Math.min(150, Math.max(70, h * 0.17));
    const bottomText = 36;
    const colY = bottomText;
    const gapBelow = 34;
    const gyMin = colY + colH + gapBelow;
    const resW = Math.min(110, Math.max(w < 640 ? 36 : 56, w * 0.07));
    const narrow = w < 640;
    const labelW = this.opts.rowLabels ? (narrow ? 58 : 84) : 0;
    const left = (narrow ? 12 : 26) + labelW + resW + 10;
    const right = w < 640 ? 12 : 26;
    const availW = Math.max(50, w - left - right);
    const availH = Math.max(50, h - top - gyMin);
    const fitCs = Math.min(availW / asm.cols, availH / asm.rows, 104);
    let win: Win;
    let cs: number;
    if (this.zoom) {
      cs = Math.min(availW / this.zoom.w, availH / this.zoom.h);
      win = this.zoom;
    } else {
      cs = fitCs;
      win = { x: 0, y: 0, w: asm.cols, h: asm.rows };
    }
    const gw = Math.min(availW, win.w * cs);
    const gh = Math.min(availH, win.h * cs);
    win = { x: win.x, y: win.y, w: gw / cs, h: gh / cs };
    const gx = left + (availW - gw) / 2;
    const gy = gyMin + Math.min(availH - gh, 70);
    const big = asm.rows * asm.cols > 600;
    const mmW = big ? Math.min(200, w * 0.2) : 0;
    const minimap = big ? { x: w - mmW - 18, y: h - 18 - this.insetTop, w: mmW, h: (mmW * asm.rows) / asm.cols } : null;
    if (minimap && minimap.h > 130) {
      minimap.w *= 130 / minimap.h;
      minimap.h = 130;
      minimap.x = w - minimap.w - 18;
    }
    return { gx, gy, gw, gh, cs, win, aw: availW, ah: availH, resX: gx - resW - 10, resW, colY, colH, minimap };
  }

  /** Stage-pixel (y up) → cell coords, or null outside the grid. */
  cellAt(px: number, pyUp: number): { r: number; c: number } | null {
    const L = this.lay;
    if (!L) return null;
    if (px < L.gx || px > L.gx + L.gw || pyUp < L.gy || pyUp > L.gy + L.gh) return null;
    const c = Math.floor(L.win.x + (px - L.gx) / L.cs);
    const r = Math.floor(L.win.y + (L.gy + L.gh - pyUp) / L.cs);
    if (r < 0 || c < 0 || r >= this.asm.rows || c >= this.asm.cols) return null;
    return { r, c };
  }

  zoomAt(px: number, pyUp: number, factor: number): void {
    const L = this.lay;
    if (!L) return;
    const asm = this.asm;
    const cx = L.win.x + (px - L.gx) / L.cs;
    const cy = L.win.y + (L.gy + L.gh - pyUp) / L.cs;
    const fitCs = Math.min(L.aw / asm.cols, L.ah / asm.rows, 104);
    const cs = Math.min(140, L.cs * factor);
    if (cs <= fitCs * 1.01) {
      this.zoom = null;
      return;
    }
    // Square cells that fill the stage: the window takes the stage's aspect ratio.
    const nw = Math.max(4, Math.min(asm.cols, L.aw / cs));
    const nh = Math.max(3, Math.min(asm.rows, L.ah / cs));
    const fx = Math.min(1, Math.max(0, (px - L.gx) / L.gw));
    const fy = Math.min(1, Math.max(0, (L.gy + L.gh - pyUp) / L.gh));
    this.zoom = this.clampWin({ x: cx - fx * nw, y: cy - fy * nh, w: nw, h: nh });
  }

  pan(dxPx: number, dyPx: number): void {
    const L = this.lay;
    if (!L || !this.zoom) return;
    this.zoom = this.clampWin({ ...this.zoom, x: this.zoom.x - dxPx / L.cs, y: this.zoom.y + dyPx / L.cs });
  }

  /** Centre the zoom window on a point of the overview map; true if the point was on it. */
  minimapClick(px: number, pyUp: number): boolean {
    const L = this.lay;
    if (!L || !L.minimap) return false;
    const m = L.minimap;
    if (px < m.x || px > m.x + m.w || pyUp > m.y || pyUp < m.y - m.h) return false;
    const asm = this.asm;
    const cx = ((px - m.x) / m.w) * asm.cols;
    const cy = ((m.y - pyUp) / m.h) * asm.rows;
    const z = this.zoom ?? { x: 0, y: 0, w: Math.min(asm.cols, 48), h: Math.min(asm.rows, 24) };
    this.zoom = this.clampWin({ x: cx - z.w / 2, y: cy - z.h / 2, w: z.w, h: z.h });
    return true;
  }

  resetZoom(): void {
    this.zoom = null;
  }

  get zoomed(): boolean {
    return this.zoom !== null;
  }

  private clampWin(z: Win): Win {
    const asm = this.asm;
    return { ...z, x: Math.max(0, Math.min(asm.cols - z.w, z.x)), y: Math.max(0, Math.min(asm.rows - z.h, z.y)) };
  }

  frame(dt: number): void {
    this.t += dt;
    if (this.steady && this.t > this.duration) this.t = this.duration;
    const L = (this.lay = this.layout());
    const asm = this.asm;
    const stage = this.stage;
    const ph = this.phases();
    stage.grid.place(L.gx, L.gy, L.gw, L.gh, L.win);
    stage.grid.mat.uniforms.uFront.value = ph.front;
    stage.grid.mat.uniforms.uHover.value = this.hoverCell;
    stage.grid.advance(dt, ph.front);

    const r0 = Math.max(0, Math.floor(L.win.y));
    const r1 = Math.min(asm.rows, Math.ceil(L.win.y + L.win.h));
    const c0 = Math.max(0, Math.floor(L.win.x));
    const c1 = Math.min(asm.cols, Math.ceil(L.win.x + L.win.w));
    const tanks: TankSpec[] = [];
    const side = L.cs < 30;
    const rowY = (r: number) => L.gy + L.gh - (r - L.win.y + 0.5) * L.cs;
    const colX = (c: number) => L.gx + (c - L.win.x + 0.5) * L.cs;
    const used = new Uint8Array(asm.rows);
    for (const b of asm.blocks) for (let i = 0; i < b.tile.R; i++) used[b.rowOff + i] = 1;
    for (let r = r0; r < r1; r++) {
      if (!used[r]) continue;
      const y = rowY(r);
      const hh = Math.max(1.2, L.cs * (side ? 0.62 : 0.84));
      tanks.push({
        x: L.resX,
        y: y - (side ? hh / 2 : L.cs * 0.42),
        w: L.resW,
        h: hh,
        level: asm.heads[r] * ph.fill,
        side,
        tint: asm.negRow[r] ? 2 : 0,
        glow: 0.15,
      });
    }
    const colW = Math.max(1, L.cs * (L.cs > 12 ? 0.62 : 0.8));
    const hasCol = new Uint8Array(asm.cols);
    for (const b of asm.blocks) for (let j = 0; j < b.tile.C; j++) hasCol[b.colOff + j] = 1;
    for (let c = c0; c < c1; c++) {
      if (!hasCol[c]) continue;
      tanks.push({
        x: colX(c) - colW / 2,
        y: L.colY,
        w: colW,
        h: L.colH,
        level: Math.abs(asm.collect[c]) * ph.collect * 0.92,
        tint: c % 2 === 0 ? 1 : 2,
        glow: ph.collect > 0 && ph.collect < 1 ? 0.4 : 0.1,
      });
    }
    stage.tanks.set(tanks);

    // falling water: from each column outlet into its collector while it fills
    const p = stage.particles;
    const G = 1100;
    p.step(dt, G);
    // Emit with an age spread over the frame, so a stream stays continuous at any frame rate.
    const emit = (x: number, y: number, vx: number, vy: number, floor: number) => {
      const a = Math.random() * dt;
      p.spawn(x + vx * a, y + vy * a - 0.5 * G * a * a, vx, vy - G * a, floor);
    };
    const drop = Math.max(2.4, Math.min(11, L.cs * 0.22));
    stage.setDropSize(drop * 3.2);
    const flowing = ph.collect > 0 && ph.collect < 1;
    if (flowing && dt > 0) {
      const visCols = c1 - c0;
      const budget = Math.min(2400, 120 + visCols * 40) * dt;
      let tot = 0;
      for (let c = c0; c < c1; c++) if (hasCol[c]) tot += Math.abs(asm.collect[c]);
      for (let c = c0; c < c1; c++) {
        if (!hasCol[c]) continue;
        const f = Math.abs(asm.collect[c]);
        if (f < 1e-3) continue;
        this.spawnAcc[c] += (budget * f) / Math.max(tot, 1e-6);
        const surf = L.colY + 2 + Math.abs(asm.collect[c]) * ph.collect * 0.92 * (L.colH - 4);
        while (this.spawnAcc[c] >= 1) {
          this.spawnAcc[c] -= 1;
          const jitter = (Math.random() - 0.5) * Math.min(colW * 0.25, 3);
          emit(colX(c) + jitter, L.gy - 4 - Math.random() * 3, (Math.random() - 0.5) * 6, -30 - 60 * Math.sqrt(f), surf);
        }
      }
    }
    // pour into upright reservoirs while they fill
    if (!side && ph.fill > 0 && ph.fill < 1) {
      for (let r = r0; r < r1; r++) {
        if (!used[r] || asm.heads[r] < 0.02) continue;
        const y = rowY(r);
        const tankBottom = y - L.cs * 0.42;
        const surf = tankBottom + 2 + asm.heads[r] * ph.fill * (L.cs * 0.84 - 4);
        if (Math.random() < dt * 60 * asm.heads[r])
          emit(L.resX + L.resW * 0.5 + (Math.random() - 0.5) * 3, tankBottom + L.cs * 0.84 + 16, 0, -40, surf);
      }
    }
    this.drawHud(L, ph);
  }

  private drawHud(L: Layout, ph: { fill: number; front: number; collect: number }): void {
    const ctx = this.hud;
    const { w, h, dpr } = this.stage;
    const asm = this.asm;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const Y = (yUp: number) => h - yUp;
    const colX = (c: number) => L.gx + (c - L.win.x + 0.5) * L.cs;
    const rowY = (r: number) => L.gy + L.gh - (r - L.win.y + 0.5) * L.cs;

    // title
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f6eedd';
    ctx.font = `italic 500 22px ${SERIF}`;
    ctx.fillText(asm.title, 26, 36 + this.insetTop);
    ctx.font = `12px ${SANS}`;
    ctx.fillStyle = 'rgba(233, 227, 214, 0.62)';
    ctx.fillText(asm.subtitle, 26, 56 + this.insetTop);

    const r0 = Math.max(0, Math.floor(L.win.y));
    const r1 = Math.min(asm.rows, Math.ceil(L.win.y + L.win.h));
    const c0 = Math.max(0, Math.floor(L.win.x));
    const c1 = Math.min(asm.cols, Math.ceil(L.win.x + L.win.w));

    ctx.save();
    // clip HUD drawing inside the grid's horizontal span for seams
    ctx.beginPath();
    ctx.rect(L.gx, Y(L.gy + L.gh), L.gw, L.gh);
    ctx.clip();
    // tile seams
    ctx.strokeStyle = 'rgba(228, 196, 135, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const b of asm.blocks) {
      const x = L.gx + (b.colOff - L.win.x) * L.cs;
      const yTop = Y(L.gy + L.gh - (b.rowOff - L.win.y) * L.cs);
      const bw = b.tile.C * L.cs;
      const bh = b.tile.R * L.cs;
      if (asm.blocks.length > 1) ctx.strokeRect(x + 0.5, yTop + 0.5, bw - 1, bh - 1);
    }
    ctx.setLineDash([]);
    ctx.restore();

    // outlet nozzles under the grid
    if (L.cs >= 5) {
      ctx.fillStyle = 'rgba(228, 196, 135, 0.75)';
      const nw = Math.max(2, L.cs * 0.3);
      for (let c = c0; c < c1; c++) {
        const x = colX(c);
        ctx.fillRect(x - nw / 2, Y(L.gy) - 1, nw, Math.min(8, L.cs * 0.3));
      }
    }

    // row labels (reservoir values) when there is room
    if (L.cs >= 9 && this.opts.rowLabels) {
      ctx.font = `${Math.min(13, Math.max(9, L.cs * 0.38))}px ${MONO}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let r = r0; r < r1; r++) {
        const s = this.opts.rowLabels(r);
        if (!s) continue;
        ctx.fillStyle = asm.negRow[r] ? NEG : 'rgba(233, 227, 214, 0.8)';
        ctx.fillText(s, L.resX - 6, Y(rowY(r)));
      }
      ctx.textAlign = 'left';
    }

    // collector labels
    ctx.textBaseline = 'alphabetic';
    if (this.opts.outLabels && L.cs * 2 >= 10) {
      ctx.textAlign = 'center';
      ctx.font = `${Math.min(13, Math.max(10, L.cs * 0.42))}px ${MONO}`;
      for (let c = c0 - (c0 % 2); c < c1; c += 2) {
        const j = c / 2;
        const s = this.opts.outLabels(j);
        if (!s || ctx.measureText(s).width > L.cs * 2 + 2) continue;
        const hi = this.opts.highlightOut === j;
        ctx.fillStyle = hi ? '#8fe0ff' : ph.collect > 0.98 ? '#f6eedd' : 'rgba(233,227,214,0.35)';
        ctx.fillText(s, (colX(c) + colX(c + 1)) / 2, Y(L.colY) + 18);
      }
      ctx.textAlign = 'left';
    }
    if (L.cs >= 22) {
      ctx.font = `600 11px ${SANS}`;
      ctx.textAlign = 'center';
      for (let c = c0; c < c1; c++) {
        ctx.fillStyle = c % 2 === 0 ? POS : NEG;
        ctx.fillText(c % 2 === 0 ? '+' : '−', colX(c), Y(L.colY + L.colH) - 6);
      }
      ctx.textAlign = 'left';
    }

    // captions under the stage parts
    ctx.font = `600 10px ${SANS}`;
    ctx.fillStyle = 'rgba(228, 196, 135, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('RESERVOIRS', L.resX + L.resW / 2, Y(L.gy) + 16);
    ctx.textAlign = 'left';
    ctx.fillText('COLLECTORS', L.resX, Y(L.colY + L.colH / 2) + 4);
    if (this.opts.caption && w >= 640) {
      ctx.font = `12px ${SANS}`;
      ctx.fillStyle = 'rgba(233, 227, 214, 0.55)';
      ctx.fillText(this.opts.caption, 26, 74 + this.insetTop);
    }

    // zoom hint
    if (asm.rows * asm.cols > 600) {
      ctx.font = `11px ${SANS}`;
      ctx.fillStyle = 'rgba(233, 227, 214, 0.45)';
      ctx.textAlign = 'right';
      ctx.fillText(this.zoom ? 'scroll to zoom · drag to pan · double-click for the whole matrix' : 'scroll on the grid to zoom in', w - 18, h - 12);
      ctx.textAlign = 'left';
    }

    if (L.minimap) this.drawMinimap(L);
  }

  private drawMinimap(L: Layout): void {
    const asm = this.asm;
    const ctx = this.hud;
    const m = L.minimap!;
    if (this.minimapFor !== asm) {
      const cv = this.minimapCanvas ?? document.createElement('canvas');
      cv.width = asm.cols;
      cv.height = asm.rows;
      const c2 = cv.getContext('2d')!;
      const img = c2.createImageData(asm.cols, asm.rows);
      for (let r = 0; r < asm.rows; r++)
        for (let c = 0; c < asm.cols; c++) {
          const k = r * asm.cols + c;
          const o = asm.cells[k * 4];
          const f = Math.sqrt(Math.max(0, asm.cells[k * 4 + 1]));
          const p = k * 4;
          if (o < -0.5) {
            img.data[p + 3] = 0;
            continue;
          }
          const neg = c % 2 === 1;
          const base = neg ? [255, 158, 82] : [92, 214, 242];
          const v = Math.pow(o, 0.7);
          img.data[p] = 14 + base[0] * v * 0.6 + 100 * f;
          img.data[p + 1] = 20 + base[1] * v * 0.6 + 200 * f;
          img.data[p + 2] = 30 + base[2] * v * 0.6 + 255 * f;
          img.data[p + 3] = 255;
        }
      c2.putImageData(img, 0, 0);
      this.minimapCanvas = cv;
      this.minimapFor = asm;
    }
    const top = this.stage.h - m.y;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.75)';
    const label = `OVERVIEW · ${asm.rows} × ${asm.cols}`;
    ctx.font = `600 9.5px ${SANS}`;
    const bw = Math.max(m.w, ctx.measureText(label).width);
    const bx = Math.min(m.x, this.stage.w - 18 - bw);
    ctx.fillRect(bx - 6, top - 22, bw + 12, m.h + 30);
    ctx.strokeStyle = 'rgba(228, 196, 135, 0.3)';
    ctx.strokeRect(bx - 6 + 0.5, top - 22 + 0.5, bw + 11, m.h + 29);
    ctx.fillStyle = 'rgba(228, 196, 135, 0.85)';
    ctx.fillText(label, bx, top - 9);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.minimapCanvas!, m.x, top, m.w, m.h);
    ctx.imageSmoothingEnabled = true;
    const win = L.win;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      m.x + (win.x / asm.cols) * m.w,
      top + (win.y / asm.rows) * m.h,
      (win.w / asm.cols) * m.w,
      (win.h / asm.rows) * m.h,
    );
    ctx.lineWidth = 1;
  }
}
