import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'ripple-llm',
  title: 'The Ripple LLM',
  description:
    'Matrix multiplication done by water, then a tiny language model built from it. Ripple tanks with inverse-designed floors turn wave-maker amplitudes into probe readings through a chosen matrix; twenty-four of them run every multiply–add of a character-level name generator.',
  tags: ['TypeScript', 'Three.js', 'WebGL2', 'Physics', 'Inverse Design', 'Machine Learning', 'Simulation'],
  liveUrl: '/demos/ripple-llm/',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/demos/ripple-llm',
  screenshot: '/projects/ripple-llm/preview.png',
  screenshotAlt:
    'A 3D ripple tank with a sculpted, contour-lined floor: eight wave-makers on the left drive ripples across it to eight probes on the right, next to a panel of twenty-four small tanks and a bar chart of next-letter probabilities.',
  longDescription: `
Can a tank of water multiply a matrix? It can, and once it can, it can run a (very)
small language model. This exhibit does both in two chapters. In the first, one
tank computes $y = Wx$ for a matrix you pick. In the second, twenty-four tanks hold
every weight of a character-level model that writes first names, one letter per
wave pattern.

## Why waves can multiply

Surface waves in shallow water obey a linear wave equation, so they add: two
wave-makers running together make exactly the sum of the ripples each makes alone.
Drive every wave-maker at the same frequency, wait for the tank to settle, and each
probe bobs at that frequency too, with an amplitude and a phase that are a fixed
linear combination of the wave-makers' amplitudes. In complex notation the probes
read $u = Tx$, where $x$ holds the wave-makers' amplitudes and the transfer matrix
$T$ is set entirely by the tank's geometry.

To get a signed, real answer each probe feeds a lock-in amplifier: the probe height
is multiplied by the wave-makers' own clock and averaged over whole periods. That
in-phase amplitude, $\\mathrm{Re}(Tx)$, is the output. A negative input is simply the
same stroke half a period late. One fixed gain converts readings to numbers, and it
is the same for every tank.

## Programming the floor

In shallow water the wave speed depends on depth, $c^2 = gh$, so a sculpted floor
bends and slows waves like a lens. Each tank is a 112 × 72 grid whose depth can vary
four-fold. The floor is found by inverse design: the steady state of the discretised,
damped wave equation at the drive frequency is a Helmholtz-type linear system
$A(c^2)\\,U = F$, which is complex symmetric and banded, so a direct banded
$LDL^\\top$ solve takes a fraction of a second. The adjoint method gives the
derivative of every entry of $T$ with respect to every cell's depth from one
factorisation and one back-substitution per wave-maker and per probe, and
Levenberg–Marquardt then fits $\\mathrm{Re}\\,T = G\\,W$ (with the shared gain $G$).
With thousands of depth values and only $M \\times N$ targets it converges in about
ten steps: every tank in the exhibit reproduces its matrix to about $10^{-5}$ per
entry. The design runs offline in Node; the browser only simulates.

The Helmholtz system is the exact steady state of the same leapfrog time stepping
the page animates, so the two must agree. They do: the time-domain run you watch
settles to the frequency-domain answer to about $10^{-3}$ after 2 000 steps. The
build checks both.

## Chapter 1: a matrix–vector product

Pick a 2 × 2 rotation by 30°, the cross product with a fixed vector (zeros on the
diagonal mean a wave-maker must not be heard at its own probe) or the 4 × 4
Hadamard transform, set the input vector and send waves. The fronts cross the floor
in slow motion; the tank is then fast-forwarded through its settling with a
stroboscope (each frame two periods and one step later, so the waves appear to crawl),
the lock-ins listen for four periods, and the water's answer appears next to the
exact $Wx$. Typical errors are a few parts in ten thousand.

## Chapter 2: a tiny language model

The model is a character-level MLP in the style of Bengio et al. (2003) and Karpathy's
makemore, trained offline on 32 000 US first names (public-domain Social Security
Administration data). It looks at the previous three letters, embeds each as five
numbers, maps those 15 numbers (and a constant 1 for the bias) to 31 hidden units,
applies tanh, and maps the 31 hidden values (and a 1) to scores for the 27 symbols:
a–z and end-of-name. Its held-out cross-entropy is 2.24 nats per letter, and it writes
names like *kaleigh*, *mailynn* and *jolthina*.

Both weight matrices are cut into 8 × 8 tiles, and every tile is its own sculpted
tank: 8 tanks for the first layer and 16 for the second. The bias is a wave-maker that
always runs at amplitude 1.

**What is water and what is digital.** Every multiply–add of both layers is done by
the tanks. The embedding lookup (a table read), adding the partial sums of tiles in the
same row, tanh, softmax, sampling and the lock-in gain are digital. For speed, the
letter-by-letter computation uses each tank's frequency-domain steady state, solved in
Web Workers from the same sculpted floors when the page loads; one tank at a time is
also run in the time domain in the 3D view with the same inputs, and the page shows how
closely its lock-in reading matches.

Across 2 855 next-letter predictions on 400 names the model never saw, the water's top
choice matches the exact model's every time, and the mean KL divergence between their
distributions is about $3 \\times 10^{-9}$ nats. That is too good to be realistic, so the
page has a probe-noise slider: Gaussian noise on every lock-in reading of $\\sigma = 0.03$
drops top-1 agreement to 95%, $\\sigma = 0.1$ to 81% and $\\sigma = 0.3$ to 51%, a fair
picture of how much precision analogue hardware like this would need.

## Honest caveats

The tanks are two-dimensional and linear (no steepening, surface tension or
turbulence), and the damping is a constant plus absorbing beaches. The floors are
designed against the same discrete equations they are simulated with, so the
agreement shows that the inverse design works, not that a real tank built from these
drawings would match to $10^{-5}$: fabrication errors, temperature and noise would all
eat into it, which is what the noise slider is for. The language model is deliberately
tiny; nothing here scales to a modern LLM without many orders of magnitude more tanks.

## References

- T. W. Hughes, I. A. D. Williamson, M. Minkov and S. Fan, *Wave physics as an analog
  recurrent neural network*, Science Advances 5, eaay6946 (2019).
- C. Fernando and S. Sojakka, *Pattern recognition in a bucket*, ECAL 2003.
- Y. Bengio, R. Ducharme, P. Vincent and C. Jauvin, *A neural probabilistic language
  model*, JMLR 3 (2003).
- A. Karpathy, *makemore* (names dataset), github.com/karpathy/makemore.
  `.trim(),
}

export default project
