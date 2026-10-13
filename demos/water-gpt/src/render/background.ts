/** The museum wall behind the machine (after the water-tanks demo's background). */
export function paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number): void {
  ctx.canvas.width = Math.max(1, Math.round(w * dpr));
  ctx.canvas.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#131c2b');
  base.addColorStop(0.65, '#0c121c');
  base.addColorStop(1, '#080b11');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // faint vertical boards
  const board = Math.max(60, w / 14);
  for (let x = 0; x <= w; x += board) {
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    ctx.fillRect(x, 0, 1, h);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(x + 1.5, 0, 1, h);
  }
  // warm spotlights from above
  const spot = (x: number, y: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255, 232, 196, ${a})`);
    g.addColorStop(0.5, `rgba(255, 220, 180, ${a * 0.35})`);
    g.addColorStop(1, 'rgba(255, 220, 180, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  spot(w * 0.3, -h * 0.05, h * 0.95, 0.1);
  spot(w * 0.72, -h * 0.05, h * 0.95, 0.08);
  spot(w * 0.5, h * 0.55, h * 0.8, 0.03);
  // bench along the bottom
  const benchY = h - 36;
  const bench = ctx.createLinearGradient(0, benchY, 0, h);
  bench.addColorStop(0, '#3a2818');
  bench.addColorStop(0.1, '#24170d');
  bench.addColorStop(1, '#0d0805');
  ctx.fillStyle = bench;
  ctx.fillRect(0, benchY, w, h - benchY);
  ctx.fillStyle = 'rgba(255, 210, 160, 0.16)';
  ctx.fillRect(0, benchY, w, 1.5);
  // vignette
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
