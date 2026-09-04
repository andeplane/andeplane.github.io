// Seeded RNG with named sub-streams (sunken's pattern): every consumer draws
// from its own stream, so adding a new consumer never shifts an existing
// stream's sequence. GPU kernels are RNG-free by design — all randomness is
// CPU-side and therefore replayable.

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rng {
  /** Uniform [0, 1). */
  next(): number
  /** Uniform [min, max). */
  range(min: number, max: number): number
  /** Integer in [0, n). */
  int(n: number): number
  /** Pick a uniformly random element. */
  pick<T>(arr: readonly T[]): T
}

export class SeededRng {
  private readonly seed: number
  private readonly streams = new Map<string, Rng>()

  constructor(seed: number) {
    this.seed = seed >>> 0
  }

  /** Get (or create) the named sub-stream. Same seed + name → same sequence, always. */
  stream(name: string): Rng {
    let s = this.streams.get(name)
    if (!s) {
      const next = mulberry32(this.seed ^ hashString(name))
      s = {
        next,
        range: (min, max) => min + next() * (max - min),
        int: (n) => Math.floor(next() * n),
        pick: (arr) => arr[Math.floor(next() * arr.length)],
      }
      this.streams.set(name, s)
    }
    return s
  }
}
