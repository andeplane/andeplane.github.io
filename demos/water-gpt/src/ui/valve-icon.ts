/**
 * A valve wheel as SVG, drawn like the crossbar's (render/grid.ts): brass rim and spokes, and a
 * wedge filling clockwise from 12 o'clock that shows how far the valve is open. Blue on a +
 * collector, orange on a − collector.
 */
export const POS_COL = '#5cd6f2';
export const NEG_COL = '#ff9e52';
const BRASS = '#e3c487';

export function valveSvg(cx: number, cy: number, r: number, open: number, neg = false): string {
  const o = Math.max(0, Math.min(1, open));
  const ri = r * 0.78;
  const a = o * 2 * Math.PI;
  const x1 = cx + ri * Math.sin(a);
  const y1 = cy - ri * Math.cos(a);
  const col = neg ? NEG_COL : POS_COL;
  const wedge =
    o >= 0.999
      ? `<circle cx="${cx}" cy="${cy}" r="${ri}" fill="${col}" fill-opacity="0.8"/>`
      : o > 0
        ? `<path d="M${cx} ${cy}L${cx} ${cy - ri}A${ri} ${ri} 0 ${o > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" fill="${col}" fill-opacity="0.8"/>`
        : '';
  let spokes = '';
  for (let k = 0; k < 3; k++) {
    const th = o * Math.PI + (k * 2 * Math.PI) / 3;
    const dx = Math.sin(th) * r * 0.85;
    const dy = Math.cos(th) * r * 0.85;
    spokes += `<path d="M${(cx - dx).toFixed(2)} ${(cy + dy).toFixed(2)}L${(cx + dx).toFixed(2)} ${(cy - dy).toFixed(2)}" stroke="${BRASS}" stroke-opacity="0.85" stroke-width="${(r * 0.09).toFixed(2)}"/>`;
  }
  return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#121821"/>${wedge}${spokes}<circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="none" stroke="${BRASS}" stroke-width="${(r * 0.2).toFixed(2)}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.17}" fill="${BRASS}"/></g>`;
}
