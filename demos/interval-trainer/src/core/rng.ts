/**
 * A seedable RNG so question generation can be tested deterministically. The app itself
 * passes `Math.random`.
 */
export type Rng = () => number;

/** xorshift32 — same generator the Grover demo uses for its seeded tests. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
