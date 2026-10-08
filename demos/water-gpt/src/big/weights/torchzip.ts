import { ByteReader, dtypeSize, streamTensorData, type StreamHandlers, type TensorMeta } from './bytereader.ts'

/**
 * Streaming reader for PyTorch's zip checkpoint format (`torch.save`, e.g.
 * pytorch_model.bin), with no torch anywhere: a tiny zip walker plus a tiny unpickler
 * that only understands what a state_dict pickle uses.
 *
 * Layout written by PyTorch: `<archive>/data.pkl` first (the pickled dict mapping names
 * to `_rebuild_tensor_v2(storage, offset, size, stride, ...)`, where each storage is a
 * persistent id ('storage', FloatStorage, key, device, numel)), then one stored
 * (uncompressed) entry `<archive>/data/<key>` per storage, then the central directory.
 * PyTorch sets the "data descriptor" flag, so local headers carry no sizes: we find the
 * end of data.pkl by its trailing descriptor and size each storage from the pickle.
 */

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_DESCRIPTOR = 0x08074b50
const SIG_END = 0x06054b50
const SIG_END64 = 0x06064b50

interface StorageRef {
  kind: 'storage'
  dtype: string
  key: string
  numel: number
}

interface TensorView {
  name: string
  storage: StorageRef
  offset: number
  shape: number[]
  stride: number[]
}

const STORAGE_DTYPES: Record<string, string> = {
  FloatStorage: 'F32',
  HalfStorage: 'F16',
  BFloat16Storage: 'BF16',
  DoubleStorage: 'F64',
  LongStorage: 'I64',
  IntStorage: 'I32',
  ByteStorage: 'U8',
  CharStorage: 'I8',
  BoolStorage: 'BOOL',
}

class Global {
  readonly module: string
  readonly name: string
  constructor(module: string, name: string) {
    this.module = module
    this.name = name
  }
}

const MARK = Symbol('mark')

/** Minimal unpickler for PyTorch state_dict pickles (protocol 2). */
export function unpickleStateDict(bytes: Uint8Array): Map<string, TensorView> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const td = new TextDecoder()
  const stack: unknown[] = []
  const memo = new Map<number, unknown>()
  let p = 0
  const popMark = (): unknown[] => {
    const items: unknown[] = []
    for (;;) {
      const v = stack.pop()
      if (v === MARK) break
      if (stack.length === 0 && v === undefined) throw new Error('pickle: missing mark')
      items.push(v)
    }
    return items.reverse()
  }
  const call = (fn: unknown, args: unknown[]): unknown => {
    if (!(fn instanceof Global)) throw new Error('pickle: REDUCE on non-global')
    const id = `${fn.module}.${fn.name}`
    if (id === 'collections.OrderedDict') return new Map()
    if (id === 'torch._utils._rebuild_tensor_v2' || id === 'torch._utils._rebuild_tensor') {
      const [storage, offset, size, stride] = args as [StorageRef, number, number[], number[]]
      return { kind: 'tensor', storage, offset, shape: size, stride }
    }
    if (id === 'torch._utils._rebuild_parameter') return args[0]
    throw new Error(`pickle: unsupported callable ${id}`)
  }
  for (;;) {
    const op = bytes[p++]
    switch (op) {
      case 0x80: // PROTO
        p++
        break
      case 0x95: // FRAME
        p += 8
        break
      case 0x7d: // EMPTY_DICT
        stack.push(new Map())
        break
      case 0x5d: // EMPTY_LIST
        stack.push([])
        break
      case 0x29: // EMPTY_TUPLE
        stack.push([])
        break
      case 0x28: // MARK
        stack.push(MARK)
        break
      case 0x71: // BINPUT
        memo.set(bytes[p++], stack[stack.length - 1])
        break
      case 0x72: // LONG_BINPUT
        memo.set(dv.getUint32(p, true), stack[stack.length - 1])
        p += 4
        break
      case 0x94: // MEMOIZE
        memo.set(memo.size, stack[stack.length - 1])
        break
      case 0x68: // BINGET
        stack.push(memo.get(bytes[p++]))
        break
      case 0x6a: // LONG_BINGET
        stack.push(memo.get(dv.getUint32(p, true)))
        p += 4
        break
      case 0x58: {
        // BINUNICODE
        const n = dv.getUint32(p, true)
        p += 4
        stack.push(td.decode(bytes.subarray(p, p + n)))
        p += n
        break
      }
      case 0x8c: {
        // SHORT_BINUNICODE
        const n = bytes[p++]
        stack.push(td.decode(bytes.subarray(p, p + n)))
        p += n
        break
      }
      case 0x55: {
        // SHORT_BINSTRING
        const n = bytes[p++]
        stack.push(td.decode(bytes.subarray(p, p + n)))
        p += n
        break
      }
      case 0x63: {
        // GLOBAL "module\nname\n"
        let e = bytes.indexOf(10, p)
        const mod = td.decode(bytes.subarray(p, e))
        p = e + 1
        e = bytes.indexOf(10, p)
        const name = td.decode(bytes.subarray(p, e))
        p = e + 1
        stack.push(new Global(mod, name))
        break
      }
      case 0x93: {
        // STACK_GLOBAL
        const name = stack.pop() as string
        const mod = stack.pop() as string
        stack.push(new Global(mod, name))
        break
      }
      case 0x4b: // BININT1
        stack.push(bytes[p++])
        break
      case 0x4d: // BININT2
        stack.push(dv.getUint16(p, true))
        p += 2
        break
      case 0x4a: // BININT
        stack.push(dv.getInt32(p, true))
        p += 4
        break
      case 0x8a: {
        // LONG1
        const n = bytes[p++]
        let v = 0
        for (let i = n - 1; i >= 0; i--) v = v * 256 + bytes[p + i]
        if (n > 0 && bytes[p + n - 1] & 0x80) v -= 2 ** (8 * n)
        p += n
        stack.push(v)
        break
      }
      case 0x47: // BINFLOAT
        stack.push(dv.getFloat64(p, false))
        p += 8
        break
      case 0x4e: // NONE
        stack.push(null)
        break
      case 0x88: // NEWTRUE
        stack.push(true)
        break
      case 0x89: // NEWFALSE
        stack.push(false)
        break
      case 0x74: // TUPLE
        stack.push(popMark())
        break
      case 0x85: // TUPLE1
        stack.push([stack.pop()])
        break
      case 0x86: {
        // TUPLE2
        const b = stack.pop()
        const a = stack.pop()
        stack.push([a, b])
        break
      }
      case 0x87: {
        // TUPLE3
        const c = stack.pop()
        const b = stack.pop()
        const a = stack.pop()
        stack.push([a, b, c])
        break
      }
      case 0x61: {
        // APPEND
        const v = stack.pop()
        ;(stack[stack.length - 1] as unknown[]).push(v)
        break
      }
      case 0x65: {
        // APPENDS
        const items = popMark()
        ;(stack[stack.length - 1] as unknown[]).push(...items)
        break
      }
      case 0x73: {
        // SETITEM
        const v = stack.pop()
        const k = stack.pop()
        ;(stack[stack.length - 1] as Map<unknown, unknown>).set(k, v)
        break
      }
      case 0x75: {
        // SETITEMS
        const items = popMark()
        const d = stack[stack.length - 1] as Map<unknown, unknown>
        for (let i = 0; i < items.length; i += 2) d.set(items[i], items[i + 1])
        break
      }
      case 0x52: {
        // REDUCE
        const args = stack.pop() as unknown[]
        const fn = stack.pop()
        stack.push(call(fn, args))
        break
      }
      case 0x51: {
        // BINPERSID
        const pid = stack.pop() as unknown[]
        const [tag, type, key, , numel] = pid as [string, Global, string, string, number]
        if (tag !== 'storage') throw new Error(`pickle: unknown persistent id ${tag}`)
        const dtype = STORAGE_DTYPES[type.name]
        if (!dtype) throw new Error(`pickle: unsupported storage ${type.name}`)
        stack.push({ kind: 'storage', dtype, key, numel } satisfies StorageRef)
        break
      }
      case 0x62: {
        // BUILD (state on objects we do not model: drop it)
        stack.pop()
        break
      }
      case 0x2e: {
        // STOP
        const root = stack.pop()
        if (!(root instanceof Map)) throw new Error('pickle: root is not a dict')
        const out = new Map<string, TensorView>()
        for (const [k, v] of root) {
          const t = v as { kind?: string; storage: StorageRef; offset: number; shape: number[]; stride: number[] }
          if (t && t.kind === 'tensor') out.set(k as string, { name: k as string, ...t })
        }
        return out
      }
      default:
        throw new Error(`pickle: unsupported opcode 0x${op?.toString(16)} at ${p - 1}`)
    }
  }
}

/**
 * Walk a PyTorch zip checkpoint from a stream, delivering every wanted tensor in bands.
 */
export async function readTorchZip(r: ByteReader, h: StreamHandlers): Promise<TensorMeta[]> {
  let views: Map<string, TensorView> | null = null
  const byStorage = new Map<string, TensorView[]>()
  const metas: TensorMeta[] = []
  for (;;) {
    const sigBytes = await r.peek(4)
    if (sigBytes.length < 4) break
    const sig = new DataView(sigBytes.buffer, sigBytes.byteOffset, 4).getUint32(0, true)
    if (sig === SIG_CENTRAL || sig === SIG_END || sig === SIG_END64) break
    if (sig !== SIG_LOCAL) throw new Error(`zip: bad signature 0x${sig.toString(16)} at ${r.pos}`)
    const hdr = await r.read(30)
    const hv = new DataView(hdr.buffer)
    const flags = hv.getUint16(6, true)
    const method = hv.getUint16(8, true)
    let csize = hv.getUint32(18, true)
    const nameLen = hv.getUint16(26, true)
    const extraLen = hv.getUint16(28, true)
    const name = new TextDecoder().decode(await r.read(nameLen))
    await r.skip(extraLen)
    if (method !== 0) throw new Error(`zip: entry ${name} is compressed (method ${method})`)
    const hasDescriptor = (flags & 8) !== 0
    const leaf = name.slice(name.indexOf('/') + 1)

    if (leaf === 'data.pkl') {
      let pkl: Uint8Array
      if (!hasDescriptor && csize > 0) pkl = await r.read(csize)
      else pkl = await readUntilDescriptor(r)
      views = unpickleStateDict(pkl)
      for (const v of views.values()) {
        const list = byStorage.get(v.storage.key) ?? []
        list.push(v)
        byStorage.set(v.storage.key, list)
      }
      if (hasDescriptor && csize === 0) continue // descriptor already consumed
    } else if (leaf.startsWith('data/') && views) {
      const key = leaf.slice(5)
      const list = byStorage.get(key) ?? []
      const storage = list[0]?.storage
      if (!storage) {
        if (!csize) throw new Error(`zip: storage ${key} not referenced by pickle and has no size`)
        await r.skip(csize)
      } else {
        csize = storage.numel * dtypeSize(storage.dtype)
        await readStorage(r, storage, list, h, metas)
      }
    } else {
      if (hasDescriptor && csize === 0) {
        await readUntilDescriptor(r)
        continue
      }
      await r.skip(csize)
    }
    if (hasDescriptor) await skipDescriptor(r)
  }
  if (!views) throw new Error('zip: no data.pkl found')
  return metas
}

async function readStorage(
  r: ByteReader,
  storage: StorageRef,
  list: TensorView[],
  h: StreamHandlers,
  metas: TensorMeta[],
): Promise<void> {
  const elem = dtypeSize(storage.dtype)
  const total = storage.numel * elem
  const wanted = list.filter((v) => h.want({ name: v.name, dtype: storage.dtype, shape: v.shape }))
  for (const v of list) metas.push({ name: v.name, dtype: storage.dtype, shape: v.shape })
  if (wanted.length === 0) {
    await r.skip(total)
    return
  }
  const numel = (v: TensorView) => v.shape.reduce((a, b) => a * b, 1)
  const contiguous = (v: TensorView) => {
    let s = 1
    for (let i = v.shape.length - 1; i >= 0; i--) {
      if (v.shape[i] !== 1 && v.stride[i] !== s) return false
      s *= v.shape[i]
    }
    return true
  }
  // Common case: one contiguous tensor filling its whole storage -> stream it in bands.
  if (wanted.length === 1 && list.length === 1 && wanted[0].offset === 0 && numel(wanted[0]) === storage.numel && contiguous(wanted[0])) {
    const v = wanted[0]
    await streamTensorData(r, { name: v.name, dtype: storage.dtype, shape: v.shape }, h)
    return
  }
  // General case (shared storage, offsets): read the storage, then emit each view.
  const raw = await r.read(total)
  const sub = new ByteReaderFromBytes(raw)
  for (const v of wanted) {
    if (!contiguous(v)) throw new Error(`zip: non-contiguous tensor ${v.name}`)
    const bytes = raw.subarray(v.offset * elem, (v.offset + numel(v)) * elem)
    sub.reset(bytes)
    await streamTensorData(sub.reader, { name: v.name, dtype: storage.dtype, shape: v.shape }, h)
  }
}

class ByteReaderFromBytes {
  reader: ByteReader
  constructor(bytes: Uint8Array) {
    this.reader = new ByteReader(single(bytes))
  }
  reset(bytes: Uint8Array): void {
    this.reader = new ByteReader(single(bytes))
  }
}

async function* single(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes
}

/** Read an entry of unknown length: stop at a data descriptor whose size matches. */
async function readUntilDescriptor(r: ByteReader): Promise<Uint8Array> {
  const parts: number[] = []
  for (;;) {
    const look = await r.peek(16)
    if (look.length >= 16) {
      const dv = new DataView(look.buffer, look.byteOffset, 16)
      if (dv.getUint32(0, true) === SIG_DESCRIPTOR && dv.getUint32(8, true) === parts.length) {
        await skipDescriptor(r)
        return new Uint8Array(parts)
      }
    }
    const b = await r.read(1)
    parts.push(b[0])
    if (parts.length > 64 * 1024 * 1024) throw new Error('zip: runaway entry without descriptor')
  }
}

/** Skip a data descriptor (16 bytes, or 24 for zip64) if one is present. */
async function skipDescriptor(r: ByteReader): Promise<void> {
  const look = await r.peek(28)
  if (look.length < 4) return
  const dv = new DataView(look.buffer, look.byteOffset, look.length)
  if (dv.getUint32(0, true) !== SIG_DESCRIPTOR) return
  const isSig = (o: number) => {
    if (look.length < o + 4) return true
    const s = dv.getUint32(o, true)
    return s === SIG_LOCAL || s === SIG_CENTRAL || s === SIG_END || s === SIG_END64
  }
  await r.skip(isSig(16) ? 16 : 24)
}
