import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'grover',
  title: "Grover's Algorithm Is Two Mirrors",
  description:
    'An interactive essay on quantum search: run Grover live, watch amplitudes reflect about the mean and rotate toward the answer, and see exactly where √N comes from — on a ~200-line statevector simulator written for the page.',
  tags: ['TypeScript', 'React', 'Quantum Computing', 'Interactive Essay', 'Simulation'],
  liveUrl: '/demos/grover/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/grover',
  screenshot: '/projects/grover/preview.png',
  longDescription: `
Grover's algorithm is the cleanest demonstration of how quantum computation actually
works — not "trying every answer at once," but hiding an answer in a *sign* and then
using interference to convert that hidden phase into probability you can measure. The
whole algorithm is two reflections: an oracle that flips the marked amplitude's sign,
and a "diffusion" step that reflects every amplitude about the mean. Reflection ∘
reflection = rotation, by exactly $2\\theta$ per step with $\\sin\\theta = 1/\\sqrt{N}$
— and that one triangle explains everything: why $\\sqrt{N}$ iterations suffice, and
why iterating *past* the optimum makes the success probability fall again.

The essay teaches this at three altitudes, each with a live widget driven by the same
engine:

- **Bar chart:** N amplitudes as signed bars. The oracle's invisible sign flip, then
  inversion about the mean animated as an actual reflection through the mean line.
- **Rotation plane:** the state as one arrow between "the marked one" and "everything
  else," with both mirrors drawn — and a synced view proving bars and arrow are the
  same state.
- **Circuit:** real gates (H, X, CCZ) on three qubits, stepped column by column, with
  a live norm readout and an honest footnote about the global phase the textbook
  decomposition introduces.

Then the reader gets to break it: hand Grover an oracle that marks nothing (it spins
forever) or the wrong box (it amplifies the wrong box to near-certainty — garbage in,
loud garbage out), and dial in $k$ marked items to find the $N{=}16,\\,k{=}4$ party
trick where one iteration succeeds with certainty.

## Engineering

No quantum libraries: the statevector simulator is ~200 lines of TypeScript on
\`Float64Array\`s — H, X, Z and multi-controlled-Z as bitmask pair loops — and the
essay displays the entire source, which is the same code every widget runs. Oracle and
diffusion are each implemented twice (geometric form and gate form), with unit tests
asserting the two agree — up to the global phase, deliberately. The test suite also
checks the simulator against the closed form $P(t) = \\sin^2((2t+1)\\theta)$ to
$10^{-12}$, and the exact certainties at $N{=}4$ and $N{=}16,k{=}4$; the tests run in
CI as part of every deploy.
  `.trim(),
}

export default project
