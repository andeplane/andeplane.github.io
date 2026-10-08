import { TILE } from '../crossbar/tile.ts'

/**
 * A big model's weight matrix as the water machine stores it: y = x · W with W [rows × cols]
 * (rows = inputs/reservoirs, cols = outputs/collector pairs), cut into the same 64 × 64 tiles
 * as CpuCrossbar. Each tile's valve scale w_max is fixed when the tile is programmed.
 *
 * Storage:
 *  - `half`: weights as IEEE half floats, tile-major (tile (tr, tc) is a contiguous padded
 *    64 × 64 block, row-major inside). This is what goes to the GPU, where the valve
 *    openings, errors and manifold losses are recomputed from it on the fly. Not kept on
 *    the CPU in the browser (each band is handed to the GPU and dropped).
 *  - `f32`: plain float weights [rows × cols], for the CPU path (Node).
 */
export { TILE }

export class TileGrid {
  readonly tilesR: number
  readonly tilesC: number
  /** w_max of each tile (from the half-float values), [tr · tilesC + tc]. */
  readonly wmax: Float32Array
  readonly half: Uint16Array | null
  readonly f32: Float32Array | null

  constructor(
    readonly id: number,
    readonly name: string,
    readonly rows: number,
    readonly cols: number,
    store: { half: boolean; f32: boolean },
  ) {
    this.tilesR = Math.ceil(rows / TILE)
    this.tilesC = Math.ceil(cols / TILE)
    this.wmax = new Float32Array(this.tilesR * this.tilesC)
    this.half = store.half ? new Uint16Array(this.tilesR * this.tilesC * TILE * TILE) : null
    this.f32 = store.f32 ? new Float32Array(rows * cols) : null
  }

  get valves(): number {
    return this.rows * this.cols
  }

  /** Index of (r, c) in tile-major storage. */
  index(r: number, c: number): number {
    const tr = (r / TILE) | 0
    const tc = (c / TILE) | 0
    return ((tr * this.tilesC + tc) * TILE + (r - tr * TILE)) * TILE + (c - tc * TILE)
  }

  tileShape(tr: number, tc: number): { k: number; n: number } {
    return { k: Math.min(TILE, this.rows - tr * TILE), n: Math.min(TILE, this.cols - tc * TILE) }
  }

  /**
   * Program valves from a band of a stored tensor; returns the tiles it completed, each as
   * half floats (4096 per tile, padded with zeros).
   *  - layout 'in_out' (Conv1D, [in, out]): storage row = crossbar row; a band is one tile row.
   *  - layout 'out_in' (nn.Linear / embedding, [out, in]): storage row = crossbar column; a
   *    band is one tile column. `colOffset` places the tensor inside a fused crossbar.
   */
  programBand(data: Float32Array, rowStart: number, rows: number, rowLen: number, layout: 'in_out' | 'out_in', colOffset: number): ProgrammedTile[] {
    if (rowStart % TILE !== 0 || (colOffset % TILE !== 0 && layout === 'out_in')) throw new Error(`${this.name}: band not tile aligned`)
    const out: ProgrammedTile[] = []
    const inOut = layout === 'in_out'
    // Crossbar coordinates covered: in_out rows [rowStart, +rows) × cols [colOffset, +rowLen);
    // out_in rows [0, rowLen) × cols [colOffset + rowStart, +rows).
    const r0 = inOut ? rowStart : 0
    const nr = inOut ? rows : rowLen
    const c0 = inOut ? colOffset : colOffset + rowStart
    const nc = inOut ? rowLen : rows
    const at = (r: number, c: number) => (inOut ? data[(r - r0) * rowLen + (c - colOffset)] : data[(c - c0) * rowLen + r])
    if (this.f32) for (let r = r0; r < r0 + nr; r++) for (let c = c0; c < c0 + nc; c++) this.f32[r * this.cols + c] = at(r, c)
    for (let tr = Math.floor(r0 / TILE); tr * TILE < r0 + nr; tr++)
      for (let tc = Math.floor(c0 / TILE); tc * TILE < c0 + nc; tc++) {
        const h = new Uint16Array(TILE * TILE)
        let m = 0
        const { k, n } = this.tileShape(tr, tc)
        for (let i = 0; i < k; i++)
          for (let j = 0; j < n; j++) {
            const b = toHalf(at(tr * TILE + i, tc * TILE + j))
            h[i * TILE + j] = b
            m = Math.max(m, Math.abs(fromHalf(b)))
          }
        const t = tr * this.tilesC + tc
        this.wmax[t] = m
        this.half?.set(h, t * TILE * TILE)
        out.push({ tr, tc, half: h, wmax: m })
      }
    return out
  }

  /** Plain float weights decoded from the half floats ([rows × cols]). */
  decodeHalf(): Float32Array {
    if (!this.half) throw new Error('no half-float copy')
    const out = new Float32Array(this.rows * this.cols)
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) out[r * this.cols + c] = fromHalf(this.half[this.index(r, c)])
    return out
  }
}

export interface ProgrammedTile {
  tr: number
  tc: number
  half: Uint16Array
  wmax: number
}

const f32buf = new Float32Array(1)
const u32buf = new Uint32Array(f32buf.buffer)

/** float32 → IEEE half bits, round to nearest even (what WGSL's pack2x16float and Float16Array do). */
export function toHalf(v: number): number {
  f32buf[0] = v
  const x = u32buf[0]
  const sign = (x >>> 16) & 0x8000
  const e = (x >>> 23) & 0xff
  let m = x & 0x7fffff
  if (e === 0xff) return sign | 0x7c00 | (m ? 0x200 : 0)
  let exp = e - 127 + 15
  if (exp >= 0x1f) return sign | 0x7c00
  if (exp <= 0) {
    if (exp < -10) return sign
    m |= 0x800000
    const shift = 14 - exp
    let h = m >>> shift
    const rem = m & ((1 << shift) - 1)
    const half = 1 << (shift - 1)
    if (rem > half || (rem === half && h & 1)) h++
    return sign | h
  }
  let h = (exp << 10) | (m >>> 13)
  const rem = m & 0x1fff
  if (rem > 0x1000 || (rem === 0x1000 && h & 1)) h++
  return sign | h
}

export function fromHalf(h: number): number {
  const s = h & 0x8000 ? -1 : 1
  const e = (h >>> 10) & 0x1f
  const m = h & 0x3ff
  if (e === 0) return s * m * 2 ** -24
  if (e === 0x1f) return m ? NaN : s * Infinity
  return s * (1 + m / 1024) * 2 ** (e - 15)
}
