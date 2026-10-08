import { ByteReader, streamTensorData, type StreamHandlers, type TensorMeta } from './bytereader.ts'

/**
 * Streaming safetensors reader: an 8-byte little-endian header length, a JSON header
 * of {name: {dtype, shape, data_offsets}}, then the raw tensor bytes. Tensors are not
 * stored in name order (GPT-2's file starts with h.3.attn.c_proj.bias), so they are
 * visited in byte order and the reservoirs fill in whatever order the file dictates.
 */
export async function readSafetensors(r: ByteReader, h: StreamHandlers): Promise<TensorMeta[]> {
  const lenBytes = await r.read(8)
  const dv = new DataView(lenBytes.buffer)
  const headerLen = Number(dv.getBigUint64(0, true))
  if (headerLen > 100_000_000) throw new Error('not a safetensors file (header too large)')
  const header = JSON.parse(new TextDecoder().decode(await r.read(headerLen))) as Record<
    string,
    { dtype: string; shape: number[]; data_offsets: [number, number] }
  >
  const base = 8 + headerLen
  const entries = Object.entries(header)
    .filter(([k]) => k !== '__metadata__')
    .map(([name, v]) => ({ name, dtype: v.dtype, shape: v.shape, start: v.data_offsets[0], end: v.data_offsets[1] }))
    .sort((a, b) => a.start - b.start)
  const metas: TensorMeta[] = []
  for (const e of entries) {
    const at = base + e.start
    if (r.pos > at) throw new Error(`overlapping tensor ${e.name}`)
    if (r.pos < at) await r.skip(at - r.pos)
    const meta = { name: e.name, dtype: e.dtype, shape: e.shape }
    metas.push(meta)
    await streamTensorData(r, meta, h)
  }
  return metas
}
