/**
 * Sequential reader over a stream of byte chunks (a fetch body, a Cache API body or a
 * Node file stream). Weight files are parsed strictly front-to-back so a 548 MB
 * checkpoint never has to sit in memory: each tensor is consumed in bands as its bytes
 * arrive, which is also what drives the "filling the reservoirs" animation.
 */
export type ChunkSource = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>

async function* iterate(src: ChunkSource): AsyncGenerator<Uint8Array> {
  if (Symbol.asyncIterator in (src as object)) {
    for await (const c of src as AsyncIterable<Uint8Array>) yield c
    return
  }
  const reader = (src as ReadableStream<Uint8Array>).getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      if (value) yield value
    }
  } finally {
    reader.releaseLock()
  }
}

export class ByteReader {
  /** Absolute position in the file of the next unread byte. */
  pos = 0
  private it: AsyncGenerator<Uint8Array>
  private chunk: Uint8Array = new Uint8Array(0)
  private off = 0
  private ended = false
  onBytes: ((pos: number) => void) | null = null

  constructor(src: ChunkSource) {
    this.it = iterate(src)
  }

  private async fill(): Promise<boolean> {
    while (this.off >= this.chunk.length) {
      if (this.ended) return false
      const r = await this.it.next()
      if (r.done) {
        this.ended = true
        return false
      }
      this.chunk = r.value
      this.off = 0
    }
    return true
  }

  /** Copy exactly dest.length bytes into dest. */
  async readInto(dest: Uint8Array): Promise<void> {
    let w = 0
    while (w < dest.length) {
      if (!(await this.fill())) throw new Error(`unexpected end of stream at byte ${this.pos}`)
      const n = Math.min(dest.length - w, this.chunk.length - this.off)
      dest.set(this.chunk.subarray(this.off, this.off + n), w)
      this.off += n
      w += n
      this.pos += n
      this.onBytes?.(this.pos)
    }
  }

  async read(n: number): Promise<Uint8Array> {
    const out = new Uint8Array(n)
    await this.readInto(out)
    return out
  }

  /** Peek up to n bytes without consuming (may return fewer at end of stream). */
  async peek(n: number): Promise<Uint8Array> {
    const out = new Uint8Array(n)
    let have = 0
    // Pull chunks into a temporary concatenation without advancing pos.
    if (!(await this.fill())) return out.subarray(0, 0)
    let local = this.chunk.subarray(this.off)
    while (local.length < n) {
      const r = await this.it.next()
      if (r.done) {
        this.ended = true
        break
      }
      const merged = new Uint8Array(local.length + r.value.length)
      merged.set(local)
      merged.set(r.value, local.length)
      local = merged
    }
    this.chunk = local
    this.off = 0
    have = Math.min(n, local.length)
    out.set(local.subarray(0, have))
    return out.subarray(0, have)
  }

  async skip(n: number): Promise<void> {
    let left = n
    while (left > 0) {
      if (!(await this.fill())) throw new Error(`unexpected end of stream skipping at ${this.pos}`)
      const k = Math.min(left, this.chunk.length - this.off)
      this.off += k
      left -= k
      this.pos += k
      this.onBytes?.(this.pos)
    }
  }

  async atEnd(): Promise<boolean> {
    return !(await this.fill())
  }

  async cancel(): Promise<void> {
    await this.it.return(undefined)
  }
}

/** A tensor's data, delivered in bands of whole rows of its first dimension. */
export interface TensorBand {
  name: string
  shape: number[]
  /** First row (index along dim 0) contained in `data`. */
  rowStart: number
  rows: number
  data: Float32Array
}

export interface TensorMeta {
  name: string
  dtype: string
  shape: number[]
}

export interface StreamHandlers {
  /** Return false to skip a tensor (its bytes are read past without decoding). */
  want(meta: TensorMeta): boolean
  /** Rows per band for a tensor (bands always hold whole rows). */
  bandRows(meta: TensorMeta): number
  band(b: TensorBand): void | Promise<void>
}

/**
 * Read `numel` little-endian values of `dtype` from the reader and hand them out in
 * row bands. `views` lets several tensor names share one storage (tied weights).
 */
export async function streamTensorData(
  r: ByteReader,
  meta: TensorMeta,
  h: StreamHandlers,
): Promise<void> {
  const numel = meta.shape.reduce((a, b) => a * b, 1)
  const elem = dtypeSize(meta.dtype)
  if (!h.want(meta)) {
    await r.skip(numel * elem)
    return
  }
  const rowsTotal = meta.shape.length > 1 ? meta.shape[0] : 1
  const rowLen = rowsTotal > 0 ? numel / rowsTotal : 0
  const bandRows = Math.max(1, Math.min(rowsTotal, h.bandRows(meta)))
  const raw = new Uint8Array(bandRows * rowLen * elem)
  for (let row = 0; row < rowsTotal; row += bandRows) {
    const rows = Math.min(bandRows, rowsTotal - row)
    const bytes = raw.subarray(0, rows * rowLen * elem)
    await r.readInto(bytes)
    const data = decode(bytes, meta.dtype, rows * rowLen)
    await h.band({ name: meta.name, shape: meta.shape, rowStart: row, rows, data })
  }
}

export function dtypeSize(dtype: string): number {
  switch (dtype) {
    case 'F32':
      return 4
    case 'F16':
    case 'BF16':
      return 2
    case 'U8':
    case 'I8':
    case 'BOOL':
      return 1
    case 'I64':
    case 'F64':
      return 8
    case 'I32':
      return 4
    default:
      throw new Error(`unsupported dtype ${dtype}`)
  }
}

function decode(bytes: Uint8Array, dtype: string, n: number): Float32Array {
  const out = new Float32Array(n)
  if (dtype === 'F32') {
    new Uint8Array(out.buffer).set(bytes)
    return out
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dtype === 'F16') {
    for (let i = 0; i < n; i++) out[i] = halfToFloat(dv.getUint16(i * 2, true))
    return out
  }
  if (dtype === 'BF16') {
    const u = new Uint32Array(out.buffer)
    for (let i = 0; i < n; i++) u[i] = dv.getUint16(i * 2, true) << 16
    return out
  }
  throw new Error(`cannot decode ${dtype} weights`)
}

function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1
  const e = (h >> 10) & 0x1f
  const f = h & 0x3ff
  if (e === 0) return s * 2 ** -14 * (f / 1024)
  if (e === 31) return f ? NaN : s * Infinity
  return s * 2 ** (e - 15) * (1 + f / 1024)
}
