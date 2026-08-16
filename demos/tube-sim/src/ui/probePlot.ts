import type { Probe } from '../sim/types';

const COLORS = ['#ffd166', '#06d6a0', '#ef476f', '#a3a1ff'];

export function drawProbePlot(canvas: HTMLCanvasElement, probes: Probe[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 120;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (probes.length === 0) return;

  let maxAbs = 1;
  for (const probe of probes) {
    for (const v of probe.history) maxAbs = Math.max(maxAbs, Math.abs(v));
  }

  ctx.strokeStyle = 'rgba(150,175,225,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  probes.forEach((probe, i) => {
    if (probe.history.length < 2) return;
    ctx.strokeStyle = COLORS[i % COLORS.length];
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    probe.history.forEach((v, idx) => {
      const x = (idx / (probe.history.length - 1)) * w;
      const y = h / 2 - (v / maxAbs) * (h / 2 - 4);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

export function updateProbeLegend(container: HTMLElement, probes: Probe[]): void {
  container.innerHTML = '';
  probes.forEach((probe, i) => {
    const item = document.createElement('span');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = COLORS[i % COLORS.length];
    item.appendChild(dot);
    const latest = probe.history[probe.history.length - 1] ?? 0;
    item.appendChild(document.createTextNode(`P${i + 1}: ${latest.toFixed(1)} Pa`));
    container.appendChild(item);
  });
  if (probes.length === 0) {
    container.textContent = 'No probes placed yet.';
  }
}
