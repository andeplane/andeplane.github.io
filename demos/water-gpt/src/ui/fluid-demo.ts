/**
 * Small live water simulations for the intro.
 *
 * The same physics as the crossbar, run in time so you can watch it:
 *  - an input tank is fed by a hose and has an overflow slot, so its level x (its pressure)
 *    stays fixed however much water leaves it: an endless supply at a fixed pressure;
 *  - a thin tube of conductance g passes q = g·x (Hagen–Poiseuille: laminar flow is
 *    proportional to pressure); tubes side by side add;
 *  - outlets fall into an open drain, at zero pressure, so nothing pushes back;
 *  - a flowmeter reads the flow rate. After a change the flow takes a moment to speed up or
 *    slow down (the water in the pipe has inertia), then holds steady. That steady rate is the
 *    answer; the machine never measures an amount of water.
 */

const WATER = '#6fd3ff';
const WATER_DIM = 'rgba(111, 211, 255, 0.5)';
const GOLD = '#e4c487';
const DIM = '#6f6c66';
const INK = '#e9e3d6';
const PIPE = '#1d2733';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Time constant (s) of the water in a pipe getting up to speed. */
const TAU = 0.45;
/** Full scale of the flowmeters, L/s. */
const METER_MAX = 1.6;

export interface Demo {
  stop(): void;
}

interface Ctx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** A flow that relaxes towards its steady value. */
class Flow {
  now = 0;
  phase = 0;
  step(target: number, dt: number): void {
    this.now += (target - this.now) * (1 - Math.exp(-dt / TAU));
    this.phase = (this.phase + this.now * dt * 1.4) % 1;
  }
  steady(target: number): boolean {
    return Math.abs(target - this.now) < 0.004;
  }
}

function setupCanvas(host: HTMLElement, height: number): { canvas: HTMLCanvasElement; c: () => Ctx } {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = `${height}px`;
  canvas.style.display = 'block';
  host.append(canvas);
  const c = (): Ctx => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    return { ctx, w, h: height };
  };
  return { canvas, c };
}

function loop(step: (dt: number, t: number) => void): () => void {
  let last = performance.now();
  let t = 0;
  let raf = 0;
  const f = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    step(dt, t);
    raf = requestAnimationFrame(f);
  };
  raf = requestAnimationFrame(f);
  return () => cancelAnimationFrame(raf);
}

function controls(host: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'fd-controls';
  host.append(d);
  return d;
}

function slider(host: HTMLElement, label: string, value: number, onInput: (v: number) => void): void {
  const row = document.createElement('label');
  row.className = 'fd-slider';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.value = String(value);
  const out = document.createElement('output');
  out.textContent = value.toFixed(2);
  const sync = () => input.style.setProperty('--fill', `${Number(input.value) * 100}%`);
  sync();
  input.addEventListener('input', () => {
    out.textContent = Number(input.value).toFixed(2);
    sync();
    onInput(Number(input.value));
  });
  row.append(span, input, out);
  host.append(row);
}

function hint(host: HTMLElement, s: string): void {
  const el = document.createElement('span');
  el.className = 'fd-hint';
  el.textContent = s;
  host.append(el);
}

function text(c: Ctx, s: string, x: number, y: number, color = INK, font = `12px ${MONO}`, align: CanvasTextAlign = 'left'): void {
  c.ctx.fillStyle = color;
  c.ctx.font = font;
  c.ctx.textAlign = align;
  c.ctx.fillText(s, x, y);
  c.ctx.textAlign = 'left';
}

function line(c: Ctx, pts: [number, number][], color: string, width: number): void {
  const { ctx } = c;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

/**
 * An input tank held at a fixed level: a hose pours in from above, and the surplus spills out
 * of an overflow slot in the wall at exactly that level.
 */
function drawSupplyTank(c: Ctx, x: number, y: number, w: number, h: number, level: number, t: number, label?: string): void {
  const { ctx } = c;
  const top = y + h * (1 - level);
  // the hose, always pouring a little more than is needed
  line(c, [[x - 12, y - 12], [x + w * 0.35, y - 12], [x + w * 0.35, y - 4]], '#3a4656', 5);
  line(c, [[x + w * 0.35, y - 4], [x + w * 0.35, top]], WATER, 2.5);
  // the water
  ctx.fillStyle = WATER_DIM;
  ctx.fillRect(x + 1, top, w - 2, y + h - top - 1);
  ctx.strokeStyle = WATER;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let k = 0; k <= 10; k++) {
    const px = x + 1 + ((w - 2) * k) / 10;
    const py = top + Math.sin(t * 3 + k) * 1;
    if (k) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  // walls, with the overflow slot cut into the left wall at the level
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y);
  ctx.lineTo(x + 0.5, top - 1);
  ctx.moveTo(x + 0.5, top + 4);
  ctx.lineTo(x + 0.5, y + h - 0.5);
  ctx.lineTo(x + w - 0.5, y + h - 0.5);
  ctx.lineTo(x + w - 0.5, y);
  ctx.stroke();
  // the surplus spilling over the slot
  if (level > 0.02) {
    ctx.strokeStyle = 'rgba(111, 211, 255, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, top + 1.5);
    ctx.quadraticCurveTo(x - 7, top + 2, x - 7, y + h);
    ctx.stroke();
  }
  if (label) text(c, label, x + w / 2, y + h + 15, INK, `12px ${MONO}`, 'center');
}

/** A tube, with dots moving at a speed set by its flow. */
function drawTube(c: Ctx, pts: [number, number][], flow: Flow, open = true): void {
  line(c, pts, PIPE, 7);
  if (!open) return;
  line(c, pts, 'rgba(111, 211, 255, 0.3)', 3);
  if (flow.now <= 1e-4) return;
  const seg: number[] = [0];
  for (let k = 1; k < pts.length; k++) seg.push(seg[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const L = seg[seg.length - 1];
  const n = Math.max(2, Math.round(L / 20));
  c.ctx.fillStyle = WATER;
  for (let k = 0; k < n; k++) {
    const d = ((flow.phase + k / n) % 1) * L;
    let i = 1;
    while (i < seg.length - 1 && seg[i] < d) i++;
    const f = (d - seg[i - 1]) / Math.max(1e-6, seg[i] - seg[i - 1]);
    const px = pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]);
    const py = pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]);
    c.ctx.beginPath();
    c.ctx.arc(px, py, 1.8, 0, Math.PI * 2);
    c.ctx.fill();
  }
}

/** Water falling from (x, y) into an open drain at zero pressure. */
function drawDrain(c: Ctx, x: number, y: number, yDrain: number, flow: number, label = true): void {
  if (flow > 1e-4) line(c, [[x, y], [x + 4, y + 6], [x + 5, yDrain]], WATER, Math.max(1, Math.min(6, 1 + flow * 4)));
  const { ctx } = c;
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 1;
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath();
    ctx.moveTo(x + 5 + k * 5, yDrain);
    ctx.lineTo(x + 5 + k * 5 - 3, yDrain + 5);
    ctx.stroke();
  }
  if (label) text(c, 'open drain', x + 5, yDrain + 16, DIM, `10px ${SANS}`, 'center');
}

/** A flowmeter on a pipe: a dial reading L/s, and whether the flow has settled. */
function drawMeter(c: Ctx, cx: number, cy: number, r: number, flow: Flow, target: number, labels: 'top' | 'right' = 'top'): void {
  const { ctx } = c;
  line(c, [[cx, cy + r * 0.4], [cx, cy + r + 6]], '#3a4656', 4);
  ctx.fillStyle = '#0f151e';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // scale: 0 at lower left, full at lower right, through the top
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;
  ctx.strokeStyle = 'rgba(233, 227, 214, 0.35)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= 8; k++) {
    const a = a0 + ((a1 - a0) * k) / 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
    ctx.stroke();
  }
  const a = a0 + (a1 - a0) * Math.min(1, flow.now / METER_MAX);
  line(c, [[cx, cy], [cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78]], WATER, 2);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  const steady = flow.steady(target);
  const [lx, ly, al]: [number, number, CanvasTextAlign] = labels === 'top' ? [cx, cy - r - 16, 'center'] : [cx + r + 8, cy - 2, 'left'];
  text(c, `${flow.now.toFixed(2)} L/s`, lx, ly, WATER, `600 12px ${MONO}`, al);
  text(c, steady ? 'steady' : 'settling…', lx, ly + 12, steady ? INK : GOLD, `10px ${SANS}`, al);
}

// ---------------------------------------------------------------- the demos

/** Step: fixed level in, steady flow rate out. Two tanks, two identical thin tubes. */
export function mountTubeDemo(host: HTMLElement): Demo {
  const H = 220;
  const { c } = setupCanvas(host, H);
  const levels = [0.4, 0.8];
  const flows = [new Flow(), new Flow()];
  const ui = controls(host);
  slider(ui, 'left tank level', levels[0], (v) => (levels[0] = v));
  slider(ui, 'right tank level', levels[1], (v) => (levels[1] = v));
  const stop = loop((dt, t) => {
    const k = c();
    const half = k.w / 2;
    for (let p = 0; p < 2; p++) {
      const x0 = p * half;
      const q = levels[p]; // one thin tube, conductance 1 L/s per unit of level: q = g·x
      flows[p].step(q, dt);
      const tx = x0 + 26;
      const ty = 44;
      const tw = 46;
      const th = 120;
      drawSupplyTank(k, tx, ty, tw, th, levels[p], t, `level ${levels[p].toFixed(2)}`);
      const py = ty + th - 8;
      const end = x0 + half - 24;
      const mx = (tx + tw + end) / 2 + 8;
      drawTube(k, [[tx + tw, py], [end, py]], flows[p]);
      drawMeter(k, mx, py - 40, 20, flows[p], q);
      drawDrain(k, end, py, H - 22, flows[p].now, p === 1);
    }
  });
  return { stop };
}

/** Step: a valve is a bundle of 8 identical tubes with taps; click a tap to open or shut it. */
export function mountBundleDemo(host: HTMLElement): Demo {
  const H = 228;
  const { canvas, c } = setupCanvas(host, H);
  const open = [true, false, true, true, false, false, true, false];
  const tubes = open.map(() => new Flow());
  const out = new Flow();
  let level = 0.8;
  const ui = controls(host);
  slider(ui, 'tank level x', level, (v) => (level = v));
  hint(ui, 'click a tap to open or shut it');
  const tapX = () => canvas.clientWidth * 0.33;
  const tubeY = (i: number) => 42 + i * 15;
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    if (Math.abs(e.clientX - r.left - tapX()) > 16) return;
    const i = Math.round((e.clientY - r.top - 42) / 15);
    if (i >= 0 && i < open.length) open[i] = !open[i];
  });
  const stop = loop((dt, t) => {
    const k = c();
    const tx = 22;
    const tw = 44;
    const ty = 40;
    const th = 130;
    drawSupplyTank(k, tx, ty, tw, th, level, t, `x = ${level.toFixed(2)}`);
    const x0 = tx + tw + 10;
    const x1 = k.w * 0.5;
    line(k, [[tx + tw, ty + th - 6], [x0, ty + th - 6], [x0, tubeY(0)]], PIPE, 7);
    line(k, [[x1, tubeY(0)], [x1, tubeY(7) + 18]], PIPE, 7);
    let target = 0;
    let n = 0;
    open.forEach((o, i) => {
      const q = o ? level / 8 : 0;
      target += q;
      if (o) n++;
      tubes[i].step(q * 8, dt);
      drawTube(k, [[x0, tubeY(i)], [x1, tubeY(i)]], tubes[i], o);
      const ax = tapX();
      k.ctx.fillStyle = o ? GOLD : '#2a2f38';
      k.ctx.strokeStyle = GOLD;
      k.ctx.lineWidth = 1;
      k.ctx.fillRect(ax - 7, tubeY(i) - 6, 14, 12);
      k.ctx.strokeRect(ax - 6.5, tubeY(i) - 5.5, 13, 11);
    });
    out.step(target, dt);
    const oy = tubeY(7) + 18;
    const end = x1 + 70;
    drawTube(k, [[x1, oy], [end, oy]], out);
    drawMeter(k, x1 + 38, oy - 36, 18, out, target);
    drawDrain(k, end, oy, H - 22, out.now);
    text(k, '8 identical tubes, each with a tap', (x0 + x1) / 2, 24, DIM, `11px ${SANS}`, 'center');
    const rx = end + 26;
    const w = n / 8;
    text(k, `${n} of 8 open`, rx, 56, GOLD);
    text(k, `w = ${w.toFixed(3)}`, rx, 74, GOLD);
    text(k, 'flow = w × x', rx, 106, INK);
    text(k, `= ${w.toFixed(3)} × ${level.toFixed(2)}`, rx, 124, INK);
    text(k, `= ${target.toFixed(3)} L/s`, rx, 142, WATER, `600 12px ${MONO}`);
  });
  return { stop };
}

/** Step: three tanks drain through three valves into one collector; its flowmeter reads the sum. */
export function mountColumnDemo(host: HTMLElement): Demo {
  const H = 240;
  const { c } = setupCanvas(host, H);
  const x = [0.8, 0.4, 0.6];
  const w = [0.5, 0.25, 1.0];
  const rows = x.map(() => new Flow());
  const total = new Flow();
  const ui = controls(host);
  x.forEach((v, i) => slider(ui, `x${i}`, v, (nv) => (x[i] = nv)));
  const stop = loop((dt, t) => {
    const k = c();
    const colX = k.w * 0.56;
    let target = 0;
    x.forEach((xi, i) => {
      const y = 36 + i * 50;
      const q = w[i] * xi;
      target += q;
      rows[i].step(q, dt);
      drawSupplyTank(k, 40, y - 18, 34, 36, xi, t + i);
      text(k, xi.toFixed(2), 24, y + 6, INK, `11px ${MONO}`, 'right');
      drawTube(k, [[74, y + 12], [colX, y + 12]], rows[i]);
      const vx = colX - 70;
      k.ctx.fillStyle = '#121821';
      k.ctx.beginPath();
      k.ctx.arc(vx, y + 12, 12, 0, Math.PI * 2);
      k.ctx.fill();
      k.ctx.fillStyle = WATER;
      k.ctx.beginPath();
      k.ctx.moveTo(vx, y + 12);
      k.ctx.arc(vx, y + 12, 9, -Math.PI / 2, -Math.PI / 2 + w[i] * Math.PI * 2);
      k.ctx.fill();
      k.ctx.strokeStyle = GOLD;
      k.ctx.lineWidth = 2;
      k.ctx.beginPath();
      k.ctx.arc(vx, y + 12, 11, 0, Math.PI * 2);
      k.ctx.stroke();
      text(k, `w ${w[i]}`, vx, y - 4, GOLD, `10px ${MONO}`, 'center');
      text(k, `${xi.toFixed(2)} × ${w[i]} = ${q.toFixed(3)}`, colX + 14, y + 16, WATER, `11px ${MONO}`);
    });
    total.step(target, dt);
    const bottom = 200;
    const end = colX + 84;
    drawTube(k, [[colX, 40], [colX, bottom], [end, bottom]], total);
    drawMeter(k, colX + 30, bottom - 26, 14, total, target, 'right');
    drawDrain(k, end, bottom, H - 18, total.now, false);
    text(k, `collector: ${total.now.toFixed(3)} L/s`, colX - 20, 212, WATER, `600 12px ${MONO}`, 'right');
    text(k, 'steady flows add up: the sum', colX - 20, 228, DIM, `10.5px ${SANS}`, 'right');
  });
  return { stop };
}
