import type { Circuit } from '../circuit.ts'

/**
 * Quantum Fourier transform on `reg` (reg[0] least significant):
 * |x⟩ → 2^{-m/2} Σ_y e^{2πi·xy/2^m} |y⟩, swaps included.
 */
export function qft(c: Circuit, reg: readonly number[], name = 'QFT'): void {
  c.block(name, () => qftBody(c, reg))
}

/** QFT†, the one phase estimation ends with. */
export function inverseQft(c: Circuit, reg: readonly number[], name = 'QFT†'): void {
  c.inverse(name, () => qftBody(c, reg))
}

function qftBody(c: Circuit, reg: readonly number[]): void {
  const m = reg.length
  for (let j = m - 1; j >= 0; j--) {
    c.h(reg[j])
    for (let k = j - 1; k >= 0; k--) c.cp(Math.PI / 2 ** (j - k), reg[k], reg[j])
  }
  for (let i = 0; i < m >> 1; i++) c.swap(reg[i], reg[m - 1 - i])
}
