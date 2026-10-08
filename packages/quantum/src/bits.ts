// Bit plumbing shared by every backend. Qubit q is bit q of a basis index.

/** Mask with a 1 at every listed qubit. */
export function maskOf(qubits: readonly number[]): number {
  let m = 0
  for (const q of qubits) m |= 1 << q
  return m >>> 0
}

/** Read bits `qubits` of i into a compact integer (qubits[0] → bit 0). */
export function extract(i: number, qubits: readonly number[]): number {
  let v = 0
  for (let k = 0; k < qubits.length; k++) v |= ((i >>> qubits[k]) & 1) << k
  return v
}

/** Spread the bits of v onto positions `qubits` (inverse of extract). */
export function deposit(v: number, qubits: readonly number[]): number {
  let i = 0
  for (let k = 0; k < qubits.length; k++) i |= ((v >>> k) & 1) << qubits[k]
  return i >>> 0
}

/** Every qubit in 0…n−1 not in `qubits`, ascending. */
export function complement(n: number, qubits: readonly number[]): number[] {
  const used = new Set(qubits)
  const out: number[] = []
  for (let q = 0; q < n; q++) if (!used.has(q)) out.push(q)
  return out
}
