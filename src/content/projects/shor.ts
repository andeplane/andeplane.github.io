import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'shor',
  title: "Shor's Algorithm, Gate by Gate",
  description:
    'Factor 15, 21 or 91 on a quantum computer simulated on your GPU. Step through Shor’s circuit, open any box down to single phase gates, watch the period appear in the amplitudes, and measure your way to the factors.',
  tags: ['TypeScript', 'WebGPU', 'React', 'Quantum Computing', 'Simulation'],
  liveUrl: '/demos/shor/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/shor',
  screenshot: '/projects/shor/preview.png',
  longDescription: `
Shor's algorithm factors a number by finding a period: the smallest $r$ with
$a^r \\equiv 1 \\pmod N$. This lab runs the whole circuit, not a cartoon of it. A
counting register in superposition controls multiplications by $a^{2^k} \\bmod N$, so
the work register ends up holding $a^j \\bmod N$ for every $j$ at once, and an inverse
quantum Fourier transform turns that repetition into peaks at multiples of $2^t/r$.
Measure, run continued fractions on the result, and $\\gcd(a^{r/2} \\pm 1, N)$ hands
you the factors.

## What you can do

Pick $N$ and a base $a$, choose how many counting qubits to spend, and step through
the algorithm one controlled multiplication at a time. An amplitude map shows every
amplitude of the counting and work registers, coloured by phase, so you can see the
period form and then collapse into a comb of peaks. Every box in the circuit opens:
a modular multiplication contains modular adders, which contain Fourier-space adders,
which are just phase rotations, all the way down to the 6,575 gates that factor 15.

## Two kinds of arithmetic

With **gates**, every modular multiplication is built from phase rotations following
Beauregard's 2003 circuit, as it would be on hardware. Factoring 15 takes 18 qubits,
21 takes 22 and 35 takes 26. With **black box**, each multiplication is one
permutation of the work register, the shortcut most simulators take, which brings
numbers like 91, 143 and 221 within reach.

## Under the hood

The simulator is a small general-purpose engine in \`packages/quantum\`: a circuit
tree of named blocks over primitive ops, and a statevector backend in WGSL where each
gate is one compute dispatch. Thousands of gates go out in a single compute pass, with
per-gate parameters in one uniform buffer addressed by dynamic offsets. A CPU backend
with the same interface is the fallback and the reference: the modular arithmetic is
tested exhaustively on it, and a headless-browser suite checks the GPU kernels
against it amplitude by amplitude.
  `.trim(),
}

export default project
