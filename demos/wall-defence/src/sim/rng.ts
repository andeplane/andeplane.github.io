// Seeded deterministic RNG. mulberry32 state is a single uint32 that lives in
// GameState (or a local for keyed substreams).

export function fnv1a(str: string, basis = 0x811c9dc5): number {
  let h = basis >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function fnv1aInt(h: number, v: number): number {
  h = (h >>> 0) ^ (v & 0xff)
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (v >>> 8) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (v >>> 16) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (v >>> 24) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  return h
}

// Advance a mulberry32 state; returns [newState, uint32 value].
export function rngNext(state: number): [number, number] {
  let a = (state + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [a, (t ^ (t >>> 14)) >>> 0]
}

// A small helper object for local (non-state) streams.
export class Stream {
  private s: number
  constructor(seed: number) {
    this.s = seed | 0
  }
  next(): number {
    const [s, v] = rngNext(this.s)
    this.s = s
    return v
  }
  int(n: number): number {
    return this.next() % n
  }
}

// Named substream: independent of call order everywhere else.
export function substream(seed: number, label: string, index: number): Stream {
  return new Stream(fnv1aInt(fnv1a(label, seed >>> 0), index))
}
