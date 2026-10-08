import { describe, expect, it } from 'vitest'
import { Circuit, flatten, invert, opCount } from './circuit.ts'
import { CpuBackend } from './backends/cpu.ts'
import { Simulator } from './simulator.ts'
import { qft, inverseQft } from './algorithms/qft.ts'
import { phiAdd, phiAddMod, cModMul, modInverse, modPow, gcd } from './algorithms/arithmetic.ts'
import { shorCircuit, multiplicativeOrder, interpretMeasurement, convergents, shorQubits } from './algorithms/shor.ts'
import { deposit, extract } from './bits.ts'
import { ry, rz } from './gates.ts'

function run(c: Circuit, prep: (c: Circuit) => void = () => {}) {
  const full = new Circuit()
  for (const r of c.registers) full.addRegister(r.name, r.qubits.length)
  prep(full)
  full.push(c.root)
  const be = new CpuBackend(full.nQubits)
  be.apply(flatten(full.root) as never)
  return be
}

/** The single basis index carrying (almost) all the probability. */
function basisIndex(be: CpuBackend): number {
  let best = -1
  for (let i = 0; i < be.re.length; i++) {
    const p = be.re[i] ** 2 + be.im[i] ** 2
    if (p > 1 - 1e-9) best = i
  }
  if (best < 0) throw new Error('state is not a basis state')
  return best
}

function load(c: Circuit, qubits: readonly number[], value: number) {
  qubits.forEach((q, k) => { if ((value >> k) & 1) c.x(q) })
}

describe('QFT', () => {
  it('maps |x⟩ to the Fourier phases e^{2πi xy/M}/√M', () => {
    const m = 4, M = 16
    for (let x = 0; x < M; x++) {
      const c = new Circuit()
      const reg = c.addRegister('r', m)
      qft(c, reg)
      const be = run(c, (f) => load(f, reg, x))
      for (let y = 0; y < M; y++) {
        const th = (2 * Math.PI * x * y) / M
        expect(be.re[y]).toBeCloseTo(Math.cos(th) / 4, 12)
        expect(be.im[y]).toBeCloseTo(Math.sin(th) / 4, 12)
      }
    }
  })

  it('QFT† undoes QFT', () => {
    const c = new Circuit()
    const reg = c.addRegister('r', 5)
    qft(c, reg)
    inverseQft(c, reg)
    expect(basisIndex(run(c, (f) => load(f, reg, 19)))).toBe(19)
  })
})

describe('Draper adder', () => {
  it('φADD(a) adds a mod 2^m in the Fourier basis', () => {
    const m = 4
    for (const [b, a] of [[0, 0], [3, 5], [9, 9], [15, 1], [7, 12]]) {
      const c = new Circuit()
      const reg = c.addRegister('b', m)
      qft(c, reg)
      phiAdd(c, reg, a)
      inverseQft(c, reg)
      expect(basisIndex(run(c, (f) => load(f, reg, b)))).toBe((a + b) % 16)
    }
  })
})

describe('φADDMOD', () => {
  const N = 7
  it.each([[[1, 1], true], [[1, 0], false], [[0, 0], false]] as const)(
    'controls %j: adds mod N = %s and clears the ancilla',
    (ctl, active) => {
      for (let a = 0; a < N; a++) {
        for (let b = 0; b < N; b++) {
          const c = new Circuit()
          const controls = c.addRegister('c', 2)
          const breg = c.addRegister('b', 4)
          const [anc] = c.addRegister('anc', 1)
          qft(c, breg)
          phiAddMod(c, { b: breg, anc }, a, N, controls)
          inverseQft(c, breg)
          const be = run(c, (f) => { load(f, controls, ctl[0] | (ctl[1] << 1)); load(f, breg, b) })
          const i = basisIndex(be)
          expect(extract(i, breg)).toBe(active ? (a + b) % N : b)
          expect(extract(i, [anc])).toBe(0)
          expect(extract(i, controls)).toBe(ctl[0] | (ctl[1] << 1))
        }
      }
    },
  )
})

describe('controlled modular multiplication', () => {
  it.each([[15, 7], [15, 2], [21, 5], [13, 6]])('N = %i, a = %i: x → a·x mod N, scratch cleared', (N, a) => {
    const n = Math.ceil(Math.log2(N + 1))
    for (const on of [0, 1]) {
      for (let x = 0; x < N; x++) {
        const c = new Circuit()
        const [ctl] = c.addRegister('c', 1)
        const xs = c.addRegister('x', n)
        const b = c.addRegister('b', n + 1)
        const [anc] = c.addRegister('anc', 1)
        cModMul(c, ctl, xs, { b, anc }, a, N)
        const i = basisIndex(run(c, (f) => { if (on) f.x(ctl); load(f, xs, x) }))
        expect(extract(i, xs)).toBe(on ? (a * x) % N : x)
        expect(extract(i, [...b, anc])).toBe(0)
      }
    }
  })
})

describe('circuit model', () => {
  it('a random circuit followed by its inverse is the identity', () => {
    let seed = 1
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const c = new Circuit()
    const q = c.addRegister('q', 6)
    const body = c.block('body', () => {
      for (let k = 0; k < 60; k++) {
        const t = Math.floor(rnd() * 6)
        const ctl = (t + 1 + Math.floor(rnd() * 5)) % 6
        const r = rnd()
        if (r < 0.3) c.gate('RY', ry(rnd() * 6), q[t], [])
        else if (r < 0.5) c.gate('RZ', rz(rnd() * 6), q[t], [ctl])
        else if (r < 0.7) c.h(q[t])
        else if (r < 0.85) c.swap(q[t], q[ctl])
        else c.permute('perm', [q[t], q[ctl]], new Uint32Array([2, 0, 3, 1]))
      }
    })
    c.push(invert(body))
    expect(opCount(c.root)).toBe(120)
    expect(basisIndex(run(c))).toBe(0)
  })

  it('controlled swap and permutation act only where controls are 1', () => {
    const c = new Circuit()
    const q = c.addRegister('q', 4)
    c.swap(q[0], q[1], [q[3]])
    c.permute('+1', [q[0], q[1], q[2]], new Uint32Array([1, 2, 3, 4, 5, 6, 7, 0]), [q[3]])
    for (let x = 0; x < 16; x++) {
      const i = basisIndex(run(c, (f) => load(f, q, x)))
      if (x & 8) {
        const lo = x & 7
        const swapped = (lo & 4) | ((lo & 1) << 1) | ((lo >> 1) & 1)
        expect(i).toBe(8 | ((swapped + 1) & 7))
      } else expect(i).toBe(x)
    }
  })

  it('measurement collapses and renormalizes', async () => {
    const c = new Circuit()
    const q = c.addRegister('q', 2)
    c.addClbits(2)
    c.h(q[0]); c.cx(q[0], q[1]); c.measure(q[0], 0); c.measure(q[1], 1)
    for (const u of [0.1, 0.9]) {
      const sim = new Simulator(new CpuBackend(2), () => u)
      await sim.run(c.root)
      expect(sim.clbits[0]).toBe(sim.clbits[1])
      const p = await sim.backend.probabilities([0, 1])
      expect(p[sim.clbits[0] * 3]).toBeCloseTo(1, 12)
    }
  })

  it('deposit and extract are inverses', () => {
    const qs = [5, 1, 3]
    for (let v = 0; v < 8; v++) expect(extract(deposit(v, qs), qs)).toBe(v)
  })
})

describe('Shor', () => {
  it('classical helpers', () => {
    expect(gcd(21, 6)).toBe(3)
    expect(modInverse(7, 15)).toBe(13)
    expect(modPow(7, 4, 15)).toBe(1)
    expect(multiplicativeOrder(2, 21)).toBe(6)
    expect(convergents(85, 8, 15).map((c) => c.r)).toContain(3)
    expect(shorQubits(15, 8, 'gates')).toBe(18)
    expect(shorQubits(15, 8, 'oracle')).toBe(12)
  })

  it('reads off factors from a good measurement', () => {
    const r = interpretMeasurement(192, 8, 15, 7)
    expect(r.r).toBe(4)
    expect(r.factors).toEqual([3, 5])
    expect(interpretMeasurement(0, 8, 15, 7).factors).toBeNull()
  })

  async function countingDistribution(N: number, a: number, t: number, arithmetic: 'gates' | 'oracle') {
    const s = shorCircuit({ N, a, countingQubits: t, arithmetic })
    const sim = new Simulator(new CpuBackend(s.circuit.nQubits))
    await sim.run(s.circuit.root)
    if (s.scratch.length) {
      const scratch = await sim.backend.probabilities(s.scratch)
      expect(scratch[0]).toBeCloseTo(1, 9)
    }
    return sim.backend.probabilities(s.counting)
  }

  it('gate-level circuit for N = 15, a = 7 gives four exact peaks', async () => {
    const p = await countingDistribution(15, 7, 4, 'gates')
    for (let y = 0; y < 16; y++) expect(p[y]).toBeCloseTo(y % 4 === 0 ? 0.25 : 0, 9)
  })

  it('gate-level and oracle circuits agree (N = 15, a = 2, t = 6)', async () => {
    const g = await countingDistribution(15, 2, 6, 'gates')
    const o = await countingDistribution(15, 2, 6, 'oracle')
    for (let y = 0; y < 64; y++) expect(g[y]).toBeCloseTo(o[y], 9)
  })

  it('oracle circuit for N = 21, a = 2 peaks near multiples of 2^t/6', async () => {
    const t = 10
    const p = await countingDistribution(21, 2, t, 'oracle')
    let nearPeaks = 0
    for (let s = 0; s < 6; s++) {
      const centre = (s * 2 ** t) / 6
      for (let y = Math.floor(centre) - 1; y <= Math.ceil(centre) + 1; y++) nearPeaks += p[(y + 2 ** t) % 2 ** t]
    }
    expect(nearPeaks).toBeGreaterThan(0.9)
  })
})
