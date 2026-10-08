/**
 * Canvas 2D painting for everything that is not water:
 *   - the background (wall, bench, sump trough, pipes, tank backs) — refracted by the water,
 *   - the static glass fronts with their etched scales and labels,
 *   - the per-frame instruments (valve wheels, level tags, knife, chart, gate clock, bubbles).
 */
import type { LinkSpec } from '../model/network.ts';
import { HEADER_Y, type SceneDef } from '../model/scenes.ts';
import { heightForReading, heightOf, widthAt, type VesselSpec } from '../model/vessel.ts';
import type { Machine } from '../model/machine.ts';
import { wallPolylines, type VisualWorld } from '../fluid/visual.ts';
import type { View } from './view.ts';

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const GOLD = '#e4c487';
const INK = 'rgba(255, 247, 228, 0.86)';

function interior(ctx: CanvasRenderingContext2D, v: VesselSpec): void {
  const { left, right } = wallPolylines(v);
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
}

function pipePath(ctx: CanvasRenderingContext2D, path: [number, number][], dx = 0, dy = 0): void {
  ctx.beginPath();
  ctx.moveTo(path[0][0] + dx, path[0][1] + dy);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0] + dx, path[i][1] + dy);
}

function copperPipe(ctx: CanvasRenderingContext2D, path: [number, number][], r: number): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = r * 2.6;
  pipePath(ctx, path, 0.03, -0.04);
  ctx.stroke();
  ctx.strokeStyle = '#5a2c17';
  ctx.lineWidth = r * 2;
  pipePath(ctx, path);
  ctx.stroke();
  ctx.strokeStyle = '#a65b33';
  ctx.lineWidth = r * 1.45;
  pipePath(ctx, path, -r * 0.12, r * 0.12);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 196, 150, 0.55)';
  ctx.lineWidth = r * 0.35;
  pipePath(ctx, path, -r * 0.45, r * 0.45);
  ctx.stroke();
}

function flange(ctx: CanvasRenderingContext2D, x: number, y: number, horizontal: boolean, r: number): void {
  const w = horizontal ? r * 0.9 : r * 3.2;
  const h = horizontal ? r * 3.2 : r * 0.9;
  const g = ctx.createLinearGradient(x - w / 2, y + h / 2, x + w / 2, y - h / 2);
  g.addColorStop(0, '#7a5a2a');
  g.addColorStop(0.5, '#d9b46a');
  g.addColorStop(1, '#6a4a22');
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
}

function nozzle(ctx: CanvasRenderingContext2D, link: LinkSpec): void {
  const { x, y, dx, dy, width } = link.spout;
  const len = 0.16;
  const back = Math.max(width * 0.5 + 0.05, 0.1);
  const front = width * 0.5 + 0.02;
  const nx = -dy;
  const ny = dx;
  ctx.beginPath();
  ctx.moveTo(x - dx * len + nx * back, y - dy * len + ny * back);
  ctx.lineTo(x + nx * front, y + ny * front);
  ctx.lineTo(x - nx * front, y - ny * front);
  ctx.lineTo(x - dx * len - nx * back, y - dy * len - ny * back);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - nx * back, y - ny * back, x + nx * back, y + ny * back);
  g.addColorStop(0, '#6b4b20');
  g.addColorStop(0.45, '#e8c77d');
  g.addColorStop(1, '#5d3f1a');
  ctx.fillStyle = g;
  ctx.fill();
}

// ------------------------------------------------------------------ background

export function paintBackground(ctx: CanvasRenderingContext2D, view: View, scene: SceneDef): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#131c2b');
  base.addColorStop(0.65, '#0c121c');
  base.addColorStop(1, '#080b11');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  view.world(ctx);
  const L = view.left;
  const R = view.right;
  const T = view.top;
  const B = view.bottom;

  // Wall panelling: faint vertical boards and a dado rail.
  ctx.lineWidth = 0.012;
  for (let x = Math.floor(L); x <= R; x += 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.022)';
    ctx.beginPath();
    ctx.moveTo(x, 0.6);
    ctx.lineTo(x, T);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(x + 0.015, 0.6);
    ctx.lineTo(x + 0.015, T);
    ctx.stroke();
  }

  // Warm spotlights from above.
  const spot = (x: number, y: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255, 232, 196, ${a})`);
    g.addColorStop(0.5, `rgba(255, 220, 180, ${a * 0.35})`);
    g.addColorStop(1, 'rgba(255, 220, 180, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(L, B, R - L, T - B);
  };
  spot(-3.5, 10.6, 8.5, 0.12);
  spot(3.5, 10.6, 8.5, 0.1);
  spot(0, 4, 9, 0.035);

  // Bench and sump trough.
  const bench = ctx.createLinearGradient(0, 0.62, 0, B);
  bench.addColorStop(0, '#3a2818');
  bench.addColorStop(0.08, '#24170d');
  bench.addColorStop(1, '#0d0805');
  ctx.fillStyle = bench;
  ctx.fillRect(L, B, R - L, 0.62 - B);
  ctx.fillStyle = 'rgba(255, 210, 160, 0.18)';
  ctx.fillRect(L, 0.6, R - L, 0.022);
  // Trough: a slate channel let into the bench.
  const tr = ctx.createLinearGradient(0, 0.6, 0, 0.05);
  tr.addColorStop(0, '#0b0f14');
  tr.addColorStop(1, '#1b222b');
  ctx.fillStyle = tr;
  ctx.fillRect(-7.85, 0.05, 15.7, 0.55);
  ctx.strokeStyle = 'rgba(200, 220, 240, 0.12)';
  ctx.lineWidth = 0.02;
  ctx.strokeRect(-7.85, 0.05, 15.7, 0.55);

  // Supply main along the top.
  const main: [number, number][] = [
    [L - 1, HEADER_Y],
    [R + 1, HEADER_Y],
  ];
  copperPipe(ctx, main, 0.1);
  for (let x = Math.ceil(L); x < R; x += 3) {
    ctx.fillStyle = '#1a1f27';
    ctx.fillRect(x - 0.04, HEADER_Y + 0.1, 0.08, T - HEADER_Y);
    flange(ctx, x, HEADER_Y, true, 0.1);
  }

  // Tank backs: a faint tint and a graph-paper grid that the water visibly refracts.
  for (const v of scene.vessels) {
    if (v.infinite) continue;
    ctx.save();
    interior(ctx, v);
    ctx.clip();
    const g = ctx.createLinearGradient(v.x - 2, v.y0, v.x + 2, v.y0 + v.height);
    g.addColorStop(0, 'rgba(120, 160, 205, 0.10)');
    g.addColorStop(1, 'rgba(170, 200, 235, 0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(v.x - 3, v.y0, 6, v.height);
    ctx.lineWidth = 0.008;
    for (let gx = -3; gx <= 3; gx += 0.2) {
      ctx.strokeStyle = Math.abs(gx % 1) < 1e-6 ? 'rgba(200,225,255,0.10)' : 'rgba(200,225,255,0.045)';
      ctx.beginPath();
      ctx.moveTo(v.x + gx, v.y0);
      ctx.lineTo(v.x + gx, v.y0 + v.height);
      ctx.stroke();
    }
    for (let gy = 0; gy <= v.height; gy += 0.2) {
      ctx.strokeStyle = 'rgba(200,225,255,0.045)';
      ctx.beginPath();
      ctx.moveTo(v.x - 3, v.y0 + gy);
      ctx.lineTo(v.x + 3, v.y0 + gy);
      ctx.stroke();
    }
    ctx.restore();
    paintStand(ctx, v);
  }

  // Pipes, valves and nozzles.
  for (const l of scene.links) {
    if (l.path.length >= 2) {
      const supply = l.from === 'supply';
      copperPipe(ctx, l.path, supply ? 0.06 : 0.065);
      const [x0, y0] = l.path[0];
      if (!supply) flange(ctx, x0, y0 - 0.02, true, 0.05);
    }
    if (l.path.length >= 2 || l.id === 'orifice') nozzle(ctx, l);
  }
  // The Torricelli orifice is a brass boss on the tank wall.
  const orifice = scene.links.find((l) => l.id === 'orifice');
  if (orifice) {
    const { x, y } = orifice.spout;
    ctx.fillStyle = '#c9a25c';
    ctx.beginPath();
    ctx.arc(x - 0.1, y, 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vignette.
  view.device(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function paintStand(ctx: CanvasRenderingContext2D, v: VesselSpec): void {
  const w0 = widthAt(v.profile, 0);
  const steel = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y1, x1, y0);
    g.addColorStop(0, '#2b313a');
    g.addColorStop(0.5, '#59616d');
    g.addColorStop(1, '#22272e');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  };
  if (w0 > 0) {
    const half = w0 / 2 + 0.1;
    steel(v.x - half, v.y0 - 0.12, v.x + half, v.y0 - 0.005);
    if (v.y0 < 2.6) {
      for (const sx of [-1, 1]) steel(v.x + sx * (half - 0.12) - 0.04, 0.6, v.x + sx * (half - 0.12) + 0.04, v.y0 - 0.12);
    } else {
      // Wall bracket: a shelf with two gussets.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(v.x + sx * (half - 0.05), v.y0 - 0.12);
        ctx.lineTo(v.x + sx * (half - 0.4), v.y0 - 0.12);
        ctx.lineTo(v.x + sx * (half - 0.4), v.y0 - 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a414b';
        ctx.beginPath();
        ctx.moveTo(v.x + sx * (half - 0.08), v.y0 - 0.12);
        ctx.lineTo(v.x + sx * (half - 0.36), v.y0 - 0.12);
        ctx.lineTo(v.x + sx * (half - 0.36), v.y0 - 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
      }
    }
  } else {
    // A wedge is held by a laboratory ring stand: an iron rod from the bench and a clamp arm.
    const side = v.labelPos === 'left' ? 1 : -1;
    const half = widthAt(v.profile, v.height) / 2;
    const rx = v.x + side * (half + 0.35);
    const hc = v.height * 0.55;
    const wx = v.x + (side * widthAt(v.profile, hc)) / 2;
    const rod = ctx.createLinearGradient(rx - 0.04, 0, rx + 0.04, 0);
    rod.addColorStop(0, '#22272e');
    rod.addColorStop(0.5, '#6a727e');
    rod.addColorStop(1, '#1d2127');
    ctx.fillStyle = rod;
    ctx.fillRect(rx - 0.035, 0.6, 0.07, v.y0 + v.height + 0.1 - 0.6);
    ctx.fillStyle = '#2a2f37';
    ctx.fillRect(rx - 0.3, 0.6, 0.6, 0.06);
    // Clamp arm and jaw.
    ctx.strokeStyle = '#4a515c';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(rx, v.y0 + hc);
    ctx.lineTo(wx + side * 0.06, v.y0 + hc);
    ctx.stroke();
    const g = ctx.createLinearGradient(0, v.y0 + hc - 0.08, 0, v.y0 + hc + 0.08);
    g.addColorStop(0, '#5d3f1a');
    g.addColorStop(0.5, '#e2c27a');
    g.addColorStop(1, '#5d3f1a');
    ctx.fillStyle = g;
    ctx.fillRect(rx - 0.07, v.y0 + hc - 0.08, 0.14, 0.16);
    ctx.fillRect(wx + (side > 0 ? 0.02 : -0.1), v.y0 + hc - 0.07, 0.08, 0.14);
  }
}

// ------------------------------------------------------------------ glass + scales

export function paintGlass(ctx: CanvasRenderingContext2D, view: View, scene: SceneDef): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const v of scene.vessels) {
    if (v.infinite) continue;
    view.world(ctx);
    const { left, right } = wallPolylines(v);
    const w0 = widthAt(v.profile, 0);

    // Reflections: a broad soft band and a sharp streak, following the left wall.
    ctx.save();
    interior(ctx, v);
    ctx.clip();
    const band = (offset: number, width: number, a: number) => {
      ctx.beginPath();
      left.forEach((p, i) => (i ? ctx.lineTo(p[0] + offset, p[1]) : ctx.moveTo(p[0] + offset, p[1] + 0.05)));
      for (let i = left.length - 1; i >= 0; i--) ctx.lineTo(left[i][0] + offset + width, left[i][1]);
      ctx.closePath();
      ctx.fillStyle = `rgba(235, 245, 255, ${a})`;
      ctx.fill();
    };
    band(0.07, 0.16, 0.045);
    band(0.12, 0.035, 0.07);
    // Right side: a dimmer return reflection.
    ctx.beginPath();
    right.forEach((p, i) => (i ? ctx.lineTo(p[0] - 0.1, p[1]) : ctx.moveTo(p[0] - 0.1, p[1])));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0] - 0.16, right[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(235,245,255,0.03)';
    ctx.fill();
    ctx.restore();

    // The glass walls themselves.
    const strokeWalls = (style: string, width: number, dx = 0) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const lw = left.map((p) => [p[0] + dx, p[1]] as const);
      const rw = right.map((p) => [p[0] - dx, p[1]] as const);
      ctx.moveTo(lw[lw.length - 1][0], lw[lw.length - 1][1]);
      for (let i = lw.length - 2; i >= 0; i--) ctx.lineTo(lw[i][0], lw[i][1]);
      if (w0 > 0) ctx.lineTo(rw[0][0], rw[0][1]);
      else ctx.moveTo(rw[0][0], rw[0][1]);
      for (let i = 1; i < rw.length; i++) ctx.lineTo(rw[i][0], rw[i][1]);
      ctx.stroke();
    };
    strokeWalls('rgba(170, 205, 240, 0.20)', 0.075);
    strokeWalls('rgba(225, 240, 255, 0.55)', 1.3 / view.s, 0.028);
    strokeWalls('rgba(255, 255, 255, 0.28)', 1 / view.s, -0.03);
    // Rim lips.
    ctx.strokeStyle = 'rgba(230, 242, 255, 0.6)';
    ctx.lineWidth = 0.04;
    const lt = left[left.length - 1];
    const rt = right[right.length - 1];
    ctx.beginPath();
    ctx.moveTo(lt[0] - 0.07, lt[1]);
    ctx.lineTo(lt[0] + 0.03, lt[1]);
    ctx.moveTo(rt[0] - 0.03, rt[1]);
    ctx.lineTo(rt[0] + 0.07, rt[1]);
    ctx.stroke();

    paintScale(ctx, view, v);
    paintLabel(ctx, view, v, scene);
  }
  if (scene.plaque && view.s > 45) paintPlaque(ctx, view, scene.plaque);
}

function paintPlaque(ctx: CanvasRenderingContext2D, view: View, p: NonNullable<SceneDef['plaque']>): void {
  view.device(ctx);
  const titleFs = Math.max(8, view.s * 0.12);
  const fs = Math.max(11, view.s * 0.24);
  ctx.font = `italic 500 ${fs}px ${SERIF}`;
  let w = 0;
  for (const l of p.lines) w = Math.max(w, ctx.measureText(l).width);
  ctx.font = `600 ${titleFs}px ${SERIF}`;
  const title = p.title.toUpperCase().split('').join('\u200a');
  w = Math.max(w, ctx.measureText(title).width) + fs * 1.8;
  const h = titleFs * 2.2 + p.lines.length * fs * 1.35 + fs * 0.5;
  const x = view.px(p.x) - w / 2;
  const y = view.py(p.y) - h / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#1a1712');
  g.addColorStop(1, '#100e0b');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(228, 196, 135, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(228, 196, 135, 0.18)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 4);
  ctx.stroke();
  for (const [sx, sy] of [
    [x + 9, y + 9],
    [x + w - 9, y + 9],
    [x + 9, y + h - 9],
    [x + w - 9, y + h - 9],
  ]) {
    ctx.fillStyle = 'rgba(228, 196, 135, 0.5)';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(228, 196, 135, 0.8)';
  ctx.fillText(title, x + w / 2, y + titleFs * 1.5);
  ctx.font = `italic 500 ${fs}px ${SERIF}`;
  ctx.fillStyle = 'rgba(246, 238, 221, 0.92)';
  p.lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + titleFs * 2.4 + fs * (0.75 + i * 1.35)));
}

function wallX(v: VesselSpec, h: number, side: 'left' | 'right'): number {
  const w = widthAt(v.profile, h) / 2;
  return side === 'left' ? v.x - w : v.x + w;
}

function paintScale(ctx: CanvasRenderingContext2D, view: View, v: VesselSpec): void {
  const s = v.scale;
  if (!s) return;
  const dir = s.side === 'left' ? 1 : -1;
  const n = Math.round(s.max / s.step);
  for (let i = 0; i <= n; i++) {
    const reading = i * s.step;
    const h = heightForReading(v, reading);
    if (h > v.height) break;
    const major = i % s.labelEvery === 0;
    const mid = !major && s.labelEvery % 2 === 0 && i % (s.labelEvery / 2) === 0;
    const x0 = wallX(v, h, s.side) + dir * 0.05;
    const len = major ? 0.24 : mid ? 0.16 : 0.1;
    view.world(ctx);
    ctx.strokeStyle = major ? 'rgba(255, 240, 210, 0.85)' : 'rgba(255, 240, 210, 0.5)';
    ctx.lineWidth = major ? 0.018 : 0.012;
    ctx.beginPath();
    ctx.moveTo(x0, v.y0 + h);
    ctx.lineTo(x0 + dir * len, v.y0 + h);
    ctx.stroke();
    if (major) {
      view.device(ctx);
      const fs = Math.max(7, view.s * 0.17);
      ctx.font = `500 ${fs}px ${SERIF}`;
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.textAlign = s.side === 'left' ? 'left' : 'right';
      const label = Number.isInteger(reading) ? String(reading) : reading.toFixed(1);
      ctx.fillText(label, view.px(x0 + dir * (len + 0.06)), view.py(v.y0 + h));
    }
  }
}

function paintLabel(ctx: CanvasRenderingContext2D, view: View, v: VesselSpec, scene: SceneDef): void {
  view.device(ctx);
  const top = v.y0 + v.height;
  const fs = Math.max(10, view.s * 0.34);
  const pos = v.labelPos ?? 'top';
  let x = v.x;
  let y = top + 0.16;
  let align: CanvasTextAlign = 'center';
  ctx.font = `italic 500 ${fs}px ${SERIF}`;
  if (pos === 'top') {
    // Step aside from a tap pouring in from above.
    const tap = scene.links.find((l) => l.from === 'supply' && l.targets[0].to === v.id && l.path.length);
    if (tap) {
      const half = ctx.measureText(v.label).width / 2 / view.s;
      x = tap.spout.x - Math.sign(tap.spout.x - v.x || 1) * (0.32 + half);
    }
  } else {
    const half = widthAt(v.profile, v.height) / 2;
    x = pos === 'left' ? v.x - half - 0.22 : v.x + half + 0.22;
    y = top - 0.42;
    align = pos === 'left' ? 'right' : 'left';
  }
  ctx.font = `italic 500 ${fs}px ${SERIF}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = GOLD;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.fillText(v.label, view.px(x), view.py(y));
  ctx.shadowBlur = 0;
  if (v.caption) {
    ctx.font = `600 ${Math.max(8, view.s * 0.12)}px ${SERIF}`;
    ctx.fillStyle = 'rgba(228, 196, 135, 0.6)';
    ctx.fillText(v.caption.toUpperCase().split('').join('\u200a'), view.px(x), view.py(y) + fs * 0.62);
  }
}

// ------------------------------------------------------------------ per-frame instruments

export interface ChartSample {
  t: number;
  u: number;
  v: number;
  exact: number;
}

export function paintDynamic(
  ctx: CanvasRenderingContext2D,
  view: View,
  m: Machine,
  world: VisualWorld,
  valveAngles: Map<string, number>,
  chart: ChartSample[],
  time: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const scene = m.scene;

  // Bubbles.
  view.world(ctx);
  ctx.lineWidth = 0.007;
  for (const b of world.bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 240, 255, 0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(225, 245, 255, 0.55)';
    ctx.stroke();
  }

  // Knife edge and chute.
  const knife = scene.knife?.(m.inputs);
  if (knife) paintKnife(ctx, view, knife, m.inputs.k);

  // Valve wheels and indicator lamps.
  for (const l of scene.links) {
    if (l.path.length < 2) continue;
    const st = m.net.link(l.id);
    const p = l.path[l.valveAt ?? 1];
    const target = st.open && !st.done ? 1 : 0;
    const a = valveAngles.get(l.id) ?? 0;
    const na = a + (target - a) * 0.12;
    valveAngles.set(l.id, na);
    view.world(ctx);
    const r = 0.11;
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.fillStyle = '#2a2116';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(na * Math.PI * 0.75);
    ctx.strokeStyle = '#d8b56d';
    ctx.lineWidth = 0.028;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.02;
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      ctx.stroke();
    }
    ctx.restore();
    // Lamp.
    const flowing = st.q > 1e-6;
    const lx = p[0] + 0.19;
    const ly = p[1] + 0.13;
    if (flowing) {
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 0.16);
      g.addColorStop(0, 'rgba(140, 255, 190, 0.55)');
      g.addColorStop(1, 'rgba(140, 255, 190, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = flowing ? '#9dffc4' : '#3b2a22';
    ctx.beginPath();
    ctx.arc(lx, ly, 0.035, 0, Math.PI * 2);
    ctx.fill();
  }

  // Set points (float valves).
  const sp = scene.setpoints?.(m.inputs) ?? {};
  for (const [id, reading] of Object.entries(sp)) {
    const v = scene.vessels.find((x) => x.id === id);
    if (!v) continue;
    const h = heightForReading(v, reading);
    view.world(ctx);
    const xl = wallX(v, h, 'left');
    const xr = wallX(v, h, 'right');
    ctx.strokeStyle = 'rgba(255, 186, 92, 0.75)';
    ctx.lineWidth = 0.014;
    ctx.setLineDash([0.06, 0.05]);
    ctx.beginPath();
    ctx.moveTo(xl + 0.04, v.y0 + h);
    ctx.lineTo(xr - 0.04, v.y0 + h);
    ctx.stroke();
    ctx.setLineDash([]);
    const side = v.scale?.side === 'right' ? -1 : 1;
    const tx = side > 0 ? xr + 0.05 : xl - 0.05;
    ctx.fillStyle = 'rgba(255, 186, 92, 0.9)';
    ctx.beginPath();
    ctx.moveTo(tx, v.y0 + h);
    ctx.lineTo(tx + side * 0.13, v.y0 + h + 0.07);
    ctx.lineTo(tx + side * 0.13, v.y0 + h - 0.07);
    ctx.closePath();
    ctx.fill();
    view.device(ctx);
    ctx.font = `600 ${Math.max(7, view.s * 0.13)}px ${MONO}`;
    ctx.textAlign = side > 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`set ${fmt(reading, 2)}`, view.px(tx + side * 0.18), view.py(v.y0 + h));
  }

  // Level tags: the current reading of every tank, at its surface.
  for (const v of scene.vessels) {
    if (v.infinite || !v.scale) continue;
    const V = m.net.vessel(v.id).V;
    const h = heightOf(v.profile, V);
    const reading = v.scale.mode === 'level' ? h / v.scale.unit : V / v.scale.unit;
    const side = v.scale.side === 'left' ? 1 : -1;
    const hasSet = v.id in sp;
    const x = side > 0 ? wallX(v, h, 'right') + 0.08 : wallX(v, h, 'left') - 0.08;
    let y = v.y0 + h;
    if (hasSet) {
      const hs = heightForReading(v, sp[v.id]);
      if (Math.abs(hs - h) < 0.22) y = v.y0 + Math.min(hs, h) - 0.22;
    }
    view.device(ctx);
    const fs = Math.max(7.5, view.s * 0.15);
    ctx.font = `600 ${fs}px ${MONO}`;
    const text = reading.toFixed(2);
    const tw = ctx.measureText(text).width;
    const px = view.px(x);
    const py = view.py(y);
    const pad = fs * 0.4;
    const bw = tw + pad * 2 + fs * 0.5;
    const bh = fs * 1.5;
    const bx = side > 0 ? px + fs * 0.1 : px - bw - fs * 0.1;
    ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
    ctx.strokeStyle = 'rgba(160, 215, 255, 0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, py - bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#bfe6ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, py + 0.5);
    // Pointer.
    ctx.beginPath();
    const tipX = view.px(side > 0 ? x - 0.05 : x + 0.05);
    ctx.moveTo(tipX, view.py(v.y0 + h));
    ctx.lineTo(side > 0 ? bx : bx + bw, py);
    ctx.strokeStyle = 'rgba(160, 215, 255, 0.45)';
    ctx.stroke();
  }

  if (scene.chart) paintChart(ctx, view, scene.chart, chart, m);
  if (scene.clock) paintClock(ctx, view, scene.clock, m, time);
}

function fmt(x: number, d: number): string {
  return x.toFixed(d).replace(/\.?0+$/, '') || '0';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintKnife(
  ctx: CanvasRenderingContext2D,
  view: View,
  k: NonNullable<ReturnType<NonNullable<SceneDef['knife']>>>,
  kv: number,
): void {
  view.world(ctx);
  // Chute plate.
  ctx.strokeStyle = '#3a414b';
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(k.x, k.base);
  ctx.lineTo(k.chuteEnd[0], k.chuteEnd[1]);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(220, 230, 245, 0.5)';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(k.x, k.base + 0.02);
  ctx.lineTo(k.chuteEnd[0], k.chuteEnd[1] + 0.02);
  ctx.stroke();
  // Blade: a slim steel wedge with its edge up.
  const g = ctx.createLinearGradient(k.x - 0.05, 0, k.x + 0.05, 0);
  g.addColorStop(0, '#5d6672');
  g.addColorStop(0.5, '#e8eef6');
  g.addColorStop(1, '#4b535e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(k.x, k.tip);
  ctx.lineTo(k.x + 0.045, k.base);
  ctx.lineTo(k.x - 0.045, k.base);
  ctx.closePath();
  ctx.fill();
  // A ruler across the jet, 0 … 1.
  const y = k.tip + 0.28;
  ctx.strokeStyle = 'rgba(255, 240, 210, 0.4)';
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.moveTo(k.jetLeft, y);
  ctx.lineTo(k.jetRight, y);
  for (let i = 0; i <= 10; i++) {
    const x = k.jetLeft + ((k.jetRight - k.jetLeft) * i) / 10;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + (i % 5 === 0 ? 0.08 : 0.045));
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 186, 92, 0.95)';
  ctx.beginPath();
  ctx.moveTo(k.x, y - 0.01);
  ctx.lineTo(k.x - 0.06, y - 0.11);
  ctx.lineTo(k.x + 0.06, y - 0.11);
  ctx.closePath();
  ctx.fill();
  view.device(ctx);
  ctx.font = `600 ${Math.max(9, view.s * 0.13)}px ${MONO}`;
  ctx.fillStyle = 'rgba(255, 186, 92, 0.95)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`k = ${kv.toFixed(2)}`, view.px(k.jetRight + 0.12), view.py(y + 0.02));
  ctx.font = `500 ${Math.max(8, view.s * 0.11)}px ${SERIF}`;
  ctx.fillStyle = 'rgba(255, 240, 210, 0.6)';
  ctx.textAlign = 'center';
  ctx.fillText('0', view.px(k.jetLeft), view.py(y + 0.17));
  ctx.fillText('1', view.px(k.jetRight), view.py(y + 0.17));
  ctx.textAlign = 'left';
  ctx.fillText('to sump →', view.px(k.chuteEnd[0] - 0.9), view.py(k.chuteEnd[1] - 0.1));
}

function paintChart(
  ctx: CanvasRenderingContext2D,
  view: View,
  box: [number, number, number, number],
  data: ChartSample[],
  m: Machine,
): void {
  const [x0, y0, x1, y1] = box;
  view.device(ctx);
  const X0 = view.px(x0);
  const X1 = view.px(x1);
  const Y0 = view.py(y0);
  const Y1 = view.py(y1);
  ctx.fillStyle = 'rgba(6, 10, 18, 0.55)';
  ctx.strokeStyle = 'rgba(228, 196, 135, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, X0, Y1, X1 - X0, Y0 - Y1, 8);
  ctx.fill();
  ctx.stroke();
  const pad = Math.max(26, view.s * 0.45);
  const px0 = X0 + pad;
  const px1 = X1 - pad * 0.5;
  const pyTop = Y1 + pad * 0.9;
  const midGap = pad * 0.6;
  const h = (Y0 - pad * 0.6 - pyTop - midGap) / 2;
  const uTop = pyTop;
  const vTop = pyTop + h + midGap;
  const Tmax = Math.max(m.inputs.T, 2) + 2;
  const fs = Math.max(10, view.s * 0.17);
  ctx.font = `600 ${fs}px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = GOLD;
  ctx.fillText('flow u(t)', px0, uTop - fs * 0.5);
  ctx.fillText('volume V(t) = ∫ u dt', px0, vTop - fs * 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  for (const top of [uTop, vTop]) {
    ctx.beginPath();
    ctx.moveTo(px0, top);
    ctx.lineTo(px0, top + h);
    ctx.lineTo(px1, top + h);
    ctx.stroke();
  }
  ctx.font = `500 ${fs * 0.9}px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  for (let t = 0; t <= Tmax; t += 2) {
    const x = px0 + ((px1 - px0) * t) / Tmax;
    ctx.fillText(`${t}s`, x, vTop + h + fs * 1.2);
  }
  const tx = (t: number) => px0 + ((px1 - px0) * Math.min(t, Tmax)) / Tmax;
  const line = (key: 'u' | 'v' | 'exact', top: number, max: number, color: string, dash: number[] = []) => {
    if (data.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = tx(d.t);
      const y = top + h - (h * Math.min(d[key], max)) / max;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };
  line('u', uTop, 1.25, '#ffb85c');
  const vmax = 10;
  line('exact', vTop, vmax, 'rgba(255,255,255,0.75)', [5, 5]);
  line('v', vTop, vmax, '#6fd3ff');
  ctx.font = `500 ${fs * 0.9}px ${SERIF}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6fd3ff';
  ctx.fillText('tank', px1, vTop + fs * 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('exact', px1, vTop + fs * 1.5);
}

function paintClock(ctx: CanvasRenderingContext2D, view: View, at: [number, number], m: Machine, time: number): void {
  const pd = m.phaseDef;
  const T = pd?.duration ?? 8;
  const running = m.state === 'running' && m.phase === 0;
  const elapsed = running ? Math.min(m.phaseTime, T) : m.state === 'done' ? T : 0;
  view.device(ctx);
  const cx = view.px(at[0]);
  const cy = view.py(at[1]);
  const r = view.s * 1.05;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * 1.1);
  g.addColorStop(0, '#f3ead6');
  g.addColorStop(1, '#bfae8a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = '#b38b45';
  ctx.stroke();
  // Elapsed sector.
  if (elapsed > 0) {
    ctx.fillStyle = 'rgba(40, 140, 190, 0.35)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 0.86, -Math.PI / 2, -Math.PI / 2 + (elapsed / T) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#3b3326';
  ctx.fillStyle = '#3b3326';
  ctx.font = `600 ${r * 0.17}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let s = 0; s < T; s++) {
    const a = -Math.PI / 2 + (s / T) * Math.PI * 2;
    ctx.lineWidth = r * 0.025;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
    ctx.lineTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74);
    ctx.stroke();
    ctx.fillText(String(s), cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
  }
  const a = -Math.PI / 2 + (elapsed / T) * Math.PI * 2;
  ctx.lineWidth = r * 0.045;
  ctx.strokeStyle = '#7a2a1a';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
  ctx.stroke();
  ctx.fillStyle = '#7a2a1a';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `italic 500 ${Math.max(11, view.s * 0.2)}px ${SERIF}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(running ? 'orifice open' : 'gate timer', cx, cy + r * 1.3);
  ctx.font = `500 ${Math.max(9, view.s * 0.13)}px ${MONO}`;
  ctx.fillStyle = 'rgba(255,240,210,0.7)';
  ctx.fillText(`${elapsed.toFixed(2)} / ${T.toFixed(0)} s`, cx, cy + r * 1.55);
  void time;
}
