import { PROBE_COLORS } from '../render/palette';
import type { Probe } from '../sim/types';

const PAD_LEFT = 46;
const PAD_RIGHT = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;
const MIN_SPAN_S = 4e-3; // always show at least 4 ms of axis

/**
 * p(t) for every pressure meter, on one shared pair of axes so traces can be
 * compared directly: same time base, same pressure scale. Hovering reads the
 * value of each trace at that instant, which is the whole point of dropping a
 * meter somewhere specific.
 */
export class ProbePlot {
  private hoverX: number | null = null;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.hoverX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    });
    canvas.addEventListener('pointerleave', () => {
      this.hoverX = null;
    });
  }

  draw(probes: Probe[]): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (cssW < 2 || cssH < 2) return; // dock collapsed: nothing to draw into
    const wantW = Math.round(cssW * this.dpr);
    const wantH = Math.round(cssH * this.dpr);
    if (this.canvas.width !== wantW || this.canvas.height !== wantH) {
      this.canvas.width = wantW;
      this.canvas.height = wantH;
    }

    const d = this.dpr;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const x0 = PAD_LEFT * d;
    const x1 = w - PAD_RIGHT * d;
    const y0 = PAD_TOP * d;
    const y1 = h - PAD_BOTTOM * d;
    const mid = (y0 + y1) / 2;
    ctx.clearRect(0, 0, w, h);

    const withData = probes.filter((p) => p.t.length > 1);
    let tMin = Infinity;
    let tMax = 0;
    let pMax = 1;
    for (const probe of withData) {
      tMin = Math.min(tMin, probe.t[0]);
      tMax = Math.max(tMax, probe.t[probe.t.length - 1]);
      pMax = Math.max(pMax, probe.peak);
    }
    if (!Number.isFinite(tMin)) tMin = 0;
    const tSpan = Math.max(tMax - tMin, MIN_SPAN_S);
    const xOf = (t: number) => x0 + ((t - tMin) / tSpan) * (x1 - x0);
    const yOf = (p: number) => mid - (p / pMax) * (mid - y0);

    this.drawAxes(ctx, { x0, x1, y0, y1, mid, tMin, tSpan, pMax });

    if (withData.length === 0) {
      // A meter with no samples yet means the tube is silent, not that there is
      // no meter — say the thing that actually gets a trace on screen.
      const message =
        probes.length === 0 ? 'click the air to drop a pressure meter' : 'press Hit to record p(t)';
      ctx.fillStyle = 'rgba(150,175,225,0.4)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = 11 * d;
      do {
        ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        size -= 0.5 * d;
      } while (size > 7 * d && ctx.measureText(message).width > x1 - x0);
      ctx.fillText(message, (x0 + x1) / 2, mid);
      return;
    }

    for (const probe of withData) {
      const color = PROBE_COLORS[probes.indexOf(probe) % PROBE_COLORS.length];
      this.drawTrace(ctx, probe, color, xOf, yOf, x0, x1);
    }

    if (this.hoverX !== null && this.hoverX > x0 && this.hoverX < x1) {
      this.drawCursor(ctx, probes, withData, { x0, x1, y0, y1, tMin, tSpan, xOf, yOf });
    }
  }

  private drawAxes(
    ctx: CanvasRenderingContext2D,
    a: { x0: number; x1: number; y0: number; y1: number; mid: number; tMin: number; tSpan: number; pMax: number },
  ): void {
    const d = this.dpr;
    ctx.font = `${9.5 * d}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.lineWidth = 1;

    // Horizontal guides at 0 and ±full scale.
    for (const [frac, label] of [
      [1, `+${formatPa(a.pMax)}`],
      [0, '0'],
      [-1, `−${formatPa(a.pMax)}`],
    ] as [number, string][]) {
      const y = a.mid - frac * (a.mid - a.y0);
      ctx.strokeStyle = frac === 0 ? 'rgba(150,175,225,0.22)' : 'rgba(150,175,225,0.09)';
      ctx.beginPath();
      ctx.moveTo(a.x0, y);
      ctx.lineTo(a.x1, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(154,166,189,0.75)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, a.x0 - 6 * d, y);
    }

    // Time ticks on a round millisecond grid.
    const stepMs = niceStep((a.tSpan * 1000) / 6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const firstMs = Math.ceil((a.tMin * 1000) / stepMs) * stepMs;
    for (let ms = firstMs; ms <= (a.tMin + a.tSpan) * 1000 + 1e-9; ms += stepMs) {
      const x = a.x0 + ((ms / 1000 - a.tMin) / a.tSpan) * (a.x1 - a.x0);
      if (x > a.x1 - 22 * d) break; // leave room for the "ms" unit label
      ctx.strokeStyle = 'rgba(150,175,225,0.08)';
      ctx.beginPath();
      ctx.moveTo(x, a.y0);
      ctx.lineTo(x, a.y1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(108,119,137,0.9)';
      ctx.fillText(`${round(ms, 3)}`, x, a.y1 + 4 * d);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(108,119,137,0.9)';
    ctx.fillText('ms', a.x1, a.y1 + 4 * d);
  }

  /**
   * Draws the trace as a per-pixel min/max envelope once there are more samples
   * than pixels, so a fast oscillation reads as a band instead of aliasing into
   * a misleading smooth line.
   */
  private drawTrace(
    ctx: CanvasRenderingContext2D,
    probe: Probe,
    color: string,
    xOf: (t: number) => number,
    yOf: (p: number) => number,
    x0: number,
    x1: number,
  ): void {
    const cols = Math.max(2, Math.round(x1 - x0));
    const n = probe.t.length;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 5 * this.dpr;

    if (n <= cols * 1.5) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = xOf(probe.t[i]);
        const y = yOf(probe.p[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      const mins = new Float32Array(cols).fill(Infinity);
      const maxs = new Float32Array(cols).fill(-Infinity);
      for (let i = 0; i < n; i++) {
        const col = Math.min(cols - 1, Math.max(0, Math.round(xOf(probe.t[i]) - x0)));
        if (probe.p[i] < mins[col]) mins[col] = probe.p[i];
        if (probe.p[i] > maxs[col]) maxs[col] = probe.p[i];
      }
      ctx.beginPath();
      let started = false;
      for (let c = 0; c < cols; c++) {
        if (maxs[c] === -Infinity) continue;
        const x = x0 + c;
        if (!started) {
          ctx.moveTo(x, yOf(maxs[c]));
          started = true;
        } else {
          ctx.lineTo(x, yOf(maxs[c]));
        }
      }
      for (let c = cols - 1; c >= 0; c--) {
        if (mins[c] === Infinity) continue;
        ctx.lineTo(x0 + c, yOf(mins[c]));
      }
      ctx.closePath();
      ctx.fillStyle = hexToRgba(color, 0.55);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCursor(
    ctx: CanvasRenderingContext2D,
    probes: Probe[],
    withData: Probe[],
    a: {
      x0: number;
      x1: number;
      y0: number;
      y1: number;
      tMin: number;
      tSpan: number;
      xOf: (t: number) => number;
      yOf: (p: number) => number;
    },
  ): void {
    const d = this.dpr;
    const x = this.hoverX!;
    const t = a.tMin + ((x - a.x0) / (a.x1 - a.x0)) * a.tSpan;

    ctx.save();
    ctx.strokeStyle = 'rgba(220,232,250,0.35)';
    ctx.setLineDash([3 * d, 3 * d]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, a.y0);
    ctx.lineTo(x, a.y1);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `${10 * d}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = x > (a.x0 + a.x1) / 2 ? 'right' : 'left';
    const tx = x + (ctx.textAlign === 'right' ? -6 * d : 6 * d);
    let ty = a.y0 + 2 * d;
    ctx.fillStyle = 'rgba(222,229,244,0.9)';
    ctx.fillText(`${(t * 1000).toFixed(2)} ms`, tx, ty);

    for (const probe of withData) {
      const i = nearestIndex(probe.t, t);
      if (i < 0) continue;
      ty += 12 * d;
      ctx.fillStyle = PROBE_COLORS[probes.indexOf(probe) % PROBE_COLORS.length];
      ctx.fillText(`${probe.p[i].toFixed(1)} Pa`, tx, ty);
      ctx.beginPath();
      ctx.arc(a.xOf(probe.t[i]), a.yOf(probe.p[i]), 2.5 * d, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * The readings update every frame, but the chips themselves are only rebuilt
 * when the set of meters changes — replacing the DOM under the pointer between
 * mousedown and mouseup would swallow the click on the remove button.
 */
export function updateProbeLegend(
  container: HTMLElement,
  probes: Probe[],
  onRemove: (id: number) => void,
): void {
  const key = probes.map((p) => p.id).join(',');
  if (container.dataset.probeKey !== key) {
    container.dataset.probeKey = key;
    container.innerHTML = '';
    if (probes.length === 0) {
      container.textContent = 'click the air to drop a meter (up to 3)';
    }
    probes.forEach((probe, i) => {
      const item = document.createElement('span');
      item.className = 'probe-chip';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = PROBE_COLORS[i % PROBE_COLORS.length];
      const text = document.createElement('span');
      text.className = 'probe-read';
      // Touch has no hover, so the on-canvas "click to remove" affordance never
      // shows there; this button is the one that always works.
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'probe-remove';
      remove.textContent = '×';
      remove.title = `Remove meter P${i + 1}`;
      remove.setAttribute('aria-label', `Remove meter P${i + 1}`);
      remove.addEventListener('click', () => onRemove(probe.id));
      item.append(dot, text, remove);
      container.appendChild(item);
    });
  }

  const readouts = container.querySelectorAll<HTMLElement>('.probe-read');
  probes.forEach((probe, i) => {
    const latest = probe.p[probe.p.length - 1] ?? 0;
    const el = readouts[i];
    if (el) el.textContent = `P${i + 1} ${latest.toFixed(1)} Pa · peak ${probe.peak.toFixed(0)}`;
  });
}

function nearestIndex(times: number[], t: number): number {
  if (times.length === 0) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - t) < Math.abs(times[lo] - t)) return lo - 1;
  return lo;
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  for (const m of [1, 2, 5]) {
    if (raw <= m * pow) return m * pow;
  }
  return 10 * pow;
}

function round(v: number, digits: number): number {
  return Number(v.toPrecision(digits));
}

function formatPa(v: number): string {
  return v >= 100 ? `${Math.round(v)} Pa` : `${v.toFixed(1)} Pa`;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
