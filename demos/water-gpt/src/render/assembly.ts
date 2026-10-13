/**
 * An "assembly" is what the stage draws for one operation: one or more physical crossbar
 * tiles laid out on a common grid of valves, with the reservoir head of every row, the flow in
 * every pipe segment and valve, and the outflow into every collector.
 *
 *  - a weight matrix is drawn as its tiles in place (tile (r0, c0) at physical row r0·(1|2),
 *    column 2·c0), so the whole matrix appears as one big grid with tile seams;
 *  - several independent crossbars working at once (the four attention heads) are drawn block
 *    diagonally, since each has its own reservoirs and collectors.
 */
import type { Crossbar } from '../crossbar/matrix.ts';
import type { CrossbarTile, TileDetail } from '../crossbar/tile.ts';

export interface Block {
  rowOff: number;
  colOff: number;
  tile: CrossbarTile;
  detail: TileDetail;
  /** Logical scale of this tile's collector flows: head scale × w_max. */
  gain: number;
}

export interface Assembly {
  title: string;
  subtitle: string;
  rows: number;
  cols: number;
  blocks: Block[];
  /** Per valve: opening (−1 where there is no valve), valve flow, row-segment flow, column-segment flow; all normalised to [0, 1]. */
  cells: Float32Array;
  /** Reservoir head of each physical row, 0..1, and whether the row is an x⁻ row. */
  heads: Float32Array;
  negRow: Uint8Array;
  /** Logical outflow per physical column (signed by the column's ±), normalised to |max| = 1. */
  collect: Float32Array;
  /** Max |collect| before normalising (for labels). */
  collectScale: number;
  /** Logical inputs and outputs. */
  x: Float32Array[];
  y: Float32Array;
  yExact: Float32Array | null;
  /** Total valve count (for the caption). */
  valves: number;
}

export function emptyAssembly(): Assembly {
  return {
    title: '',
    subtitle: '',
    rows: 1,
    cols: 1,
    blocks: [],
    cells: new Float32Array([-1, 0, 0, 0]),
    heads: new Float32Array(1),
    negRow: new Uint8Array(1),
    collect: new Float32Array(1),
    collectScale: 1,
    x: [],
    y: new Float32Array(0),
    yExact: null,
    valves: 0,
  };
}

function build(title: string, subtitle: string, rows: number, cols: number, blocks: Block[], x: Float32Array[], y: Float32Array, yExact: Float32Array | null): Assembly {
  const cells = new Float32Array(rows * cols * 4);
  for (let i = 0; i < rows * cols; i++) cells[i * 4] = -1;
  const heads = new Float32Array(rows);
  const negRow = new Uint8Array(rows);
  const collect = new Float32Array(cols);
  let maxValve = 1e-12;
  let maxRow = 1e-12;
  let maxCol = 1e-12;
  let valves = 0;
  for (const b of blocks) {
    const { R, C } = b.tile;
    const f = b.detail.flows;
    for (let i = 0; i < R * C; i++) {
      maxValve = Math.max(maxValve, Math.abs(f.valve[i]));
      maxRow = Math.max(maxRow, Math.abs(f.row[i]));
      maxCol = Math.max(maxCol, Math.abs(f.col[i]));
    }
  }
  for (const b of blocks) {
    const { R, C } = b.tile;
    const g = b.tile.net.g;
    const f = b.detail.flows;
    valves += R * C;
    for (let i = 0; i < R; i++) {
      heads[b.rowOff + i] = b.detail.heads[i];
      negRow[b.rowOff + i] = b.tile.signedInputs && i % 2 === 1 ? 1 : 0;
      for (let j = 0; j < C; j++) {
        const o = ((b.rowOff + i) * cols + b.colOff + j) * 4;
        cells[o] = Math.min(1, g[i * C + j]);
        cells[o + 1] = Math.max(0, f.valve[i * C + j]) / maxValve;
        cells[o + 2] = Math.max(0, f.row[i * C + j]) / maxRow;
        cells[o + 3] = Math.max(0, f.col[i * C + j]) / maxCol;
      }
    }
    for (let j = 0; j < C; j++) collect[b.colOff + j] += b.gain * b.detail.sol.q[j] * (j % 2 === 0 ? 1 : -1);
  }
  let cs = 1e-12;
  for (const v of collect) cs = Math.max(cs, Math.abs(v));
  for (let j = 0; j < cols; j++) collect[j] /= cs;
  return { title, subtitle, rows, cols, blocks, cells, heads, negRow, collect, collectScale: cs, x, y, yExact, valves };
}

/** One weight matrix, all tiles in place. */
export function matrixAssembly(title: string, subtitle: string, cb: Crossbar, x: Float32Array, y: Float32Array, yExact: Float32Array | null): Assembly {
  const rs = cb.signedInputs ? 2 : 1;
  const blocks: Block[] = cb.tiles.map((p, t) => {
    const detail = cb.detail(t, x);
    return { rowOff: p.r0 * rs, colOff: 2 * p.c0, tile: p.tile, detail, gain: detail.headScale * p.tile.wmax };
  });
  return build(title, subtitle, cb.K * rs, cb.N * 2, blocks, [x], y, yExact);
}

/** Several single-tile crossbars working at once, drawn block-diagonally. */
export function parallelAssembly(title: string, subtitle: string, parts: { cb: Crossbar; x: Float32Array; y: Float32Array }[], gap = 1): Assembly {
  const blocks: Block[] = [];
  let r = 0;
  let c = 0;
  for (const { cb, x } of parts) {
    const p = cb.tiles[0];
    const detail = cb.detail(0, x);
    blocks.push({ rowOff: r, colOff: c, tile: p.tile, detail, gain: detail.headScale * p.tile.wmax });
    r += p.tile.R + gap;
    c += p.tile.C + gap;
  }
  const y = new Float32Array(parts.reduce((s, p) => s + p.y.length, 0));
  let o = 0;
  for (const p of parts) {
    y.set(p.y, o);
    o += p.y.length;
  }
  return build(title, subtitle, r - gap, c - gap, blocks, parts.map((p) => p.x), y, null);
}
