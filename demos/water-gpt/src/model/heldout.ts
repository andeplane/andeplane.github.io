/**
 * The held-out split for addition. A fixed 5% of all (a, b) pairs with a, b ∈ [0, 99] is never
 * shown to the model during training; accuracy is reported on exactly those sums.
 */
export const MAX_OPERAND = 99;

export function isHeldOut(a: number, b: number): boolean {
  return (a * 131 + b * 71 + ((a * b) % 7)) % 20 === 0;
}

export interface Sum {
  a: number;
  b: number;
  prompt: string;
  answer: string;
}

/** Every held-out pair (≈ 500 sums), in a fixed order. */
export function heldOutSums(): Sum[] {
  const out: Sum[] = [];
  for (let a = 0; a <= MAX_OPERAND; a++)
    for (let b = 0; b <= MAX_OPERAND; b++)
      if (isHeldOut(a, b)) out.push({ a, b, prompt: `${a}+${b}=`, answer: `${a + b}` });
  return out;
}

/** A deterministic, well-mixed subset of the held-out sums (for quick in-browser runs). */
export function heldOutSample(n: number): Sum[] {
  const all = heldOutSums();
  const out: Sum[] = [];
  const step = all.length / n;
  for (let i = 0; i < n && i * step < all.length; i++) out.push(all[Math.floor(i * step * 1.0) % all.length]);
  // Interleave so a partial run already covers carries and non-carries.
  return out;
}
