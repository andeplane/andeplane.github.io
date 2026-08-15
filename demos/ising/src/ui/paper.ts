/**
 * The "How does it work?" text. One HTML template string; $…$ and $$…$$ spans are
 * typeset with KaTeX by explainer.ts on first open.
 */

export const PAPER = `
<h1>Millions of coin flips, one knob, and a genuine phase transition</h1>
<p class="byline">On the Ising model, the Metropolis algorithm, and what your GPU is doing right now.</p>

<section>
  <h2>Abstract</h2>
  <p class="abstract">
    Every spin on screen is a tiny magnet that can point up or down. Each one talks only
    to its nearest neighbors, by one rule you can write on a napkin — and yet the whole
    lattice organizes itself, fights itself, and at one sharp temperature undergoes a
    real phase transition. Every number in the charts is measured live from the lattice
    you are looking at, and one of them lands on a curve Lars Onsager computed exactly,
    by hand, in 1944.
  </p>
</section>

<section>
  <h2>The model</h2>
  <p>
    The Ising model assigns each lattice site a spin $s_i = \\pm 1$ and the whole
    configuration an energy
  </p>
  $$H = -J \\sum_{\\langle ij \\rangle} s_i s_j \\; - \\; h \\sum_i s_i,$$
  <p>
    where the first sum runs over neighboring pairs. With $J > 0$ a pair of aligned
    neighbors lowers the energy — spins <em>want</em> to agree — and the external field
    $h$ nudges everyone toward its own sign. Temperature is the counterweight: thermal
    noise flips spins against their preference, with probability governed by the
    Boltzmann factor $e^{-\\Delta E / k_B T}$. Everything in this lab is measured in
    units where $J = k_B = 1$.
  </p>
  <p>
    Low $T$: agreement wins, and the lattice orders into large domains. High $T$: noise
    wins, and the lattice is a static-filled coin toss. The remarkable part is what
    happens in between — not a gradual crossover but a sharp transition at a critical
    temperature $T_c$, where the system can't decide and fluctuates at every length
    scale at once.
  </p>
</section>

<section>
  <h2>The algorithm</h2>
  <p>
    The lattice evolves by the Metropolis rule: pick a spin, compute the energy change
    $\\Delta E = 2 s_i \\, (\\textstyle\\sum_{j} s_j + h)$ of flipping it, and flip with
    probability $\\min(1, e^{-\\Delta E / T})$. A flip that lowers the energy always
    happens; a flip that raises it happens with the Boltzmann probability. This
    satisfies detailed balance, so the long-run statistics are exactly those of the
    equilibrium distribution — the algorithm is a way of <em>sampling physics</em>, not
    an approximation to it. The Glauber option changes the acceptance to
    $1/(1 + e^{\\Delta E/T})$: different dynamics, same equilibrium.
  </p>
  <p>
    The GPU trick is the update schedule. Flipping all spins at once is wrong — a spin
    and its neighbor would each decide based on the other's old value. But spins that
    are not neighbors can flip simultaneously. On the square lattice the two
    checkerboard colors do it; the triangular lattice is not two-colorable (its
    triangles are odd loops), so it updates in three sublattices, $(x+y) \\bmod 3$.
    Each pass updates millions of spins in parallel, several full sweeps per frame.
  </p>
  <p>
    The <strong>acceptance rate</strong> readout is the fraction of attempted flips
    that succeed: near 1 in the hot noise, near 0 in the frozen order — it is the
    lattice's pulse.
  </p>
</section>

<section>
  <h2>The phase transition</h2>
  <p>
    The order parameter is the magnetization per spin, $m = \\frac{1}{N}\\sum_i s_i$.
    Above $T_c$ it averages to zero. Below $T_c$ the lattice must choose all-up or
    all-down — nothing in the Hamiltonian prefers either, but a choice gets made. That
    is spontaneous symmetry breaking, the same structural idea that gives particles
    mass in the Standard Model, happening in your browser tab.
  </p>
  <p>
    For the square lattice, Onsager's exact solution puts the transition at
    $T_c = 2/\\ln(1+\\sqrt{2}) \\approx 2.269$, and the spontaneous magnetization on
  </p>
  $$m(T) = \\left(1 - \\sinh^{-4}(2/T)\\right)^{1/8},$$
  <p>
    the reference curve drawn in the $|M|(T)$ chart. Your dots are measured from your
    lattice; the curve was computed with pen and paper eighty years ago. They meet.
  </p>
  <p>
    The susceptibility $\\chi = N(\\langle m^2\\rangle - \\langle |m|\\rangle^2)/T$ and
    heat capacity $C_v = N(\\langle e^2\\rangle - \\langle e\\rangle^2)/T^2$ are measured
    from <em>fluctuations</em> — how much the lattice trembles — and both spike at
    $T_c$. On an infinite lattice they would diverge; on a finite one the peak is
    rounded and slightly shifted. That rounding in your chart is a finite-size effect,
    and it is honest: real magnets are finite too.
  </p>
</section>

<section>
  <h2>Universality</h2>
  <p>
    Switch the lattice. The triangular lattice (six neighbors) orders at
    $T_c = 4/\\ln 3 \\approx 3.641$; the honeycomb (three neighbors) at
    $T_c = 2/\\ln(2+\\sqrt{3}) \\approx 1.519$. More neighbors, more encouragement to
    align, higher critical temperature — the <em>location</em> of the transition is
    geometry.
  </p>
  <p>
    But the <em>shape</em> of the transition is not. Near $T_c$ the magnetization
    vanishes as $m \\sim (T_c - T)^{\\beta}$ with $\\beta = 1/8$ on all three lattices —
    the same critical exponent, exactly. Microscopic details wash out at the critical
    point; only dimensionality and symmetry survive. This is universality, one of the
    deepest facts in statistical physics, and you can verify it here by eye: the curves
    sit at different temperatures but bend the same way.
  </p>
</section>

<section>
  <h2>Dynamics: quench, droplets, hysteresis</h2>
  <p>
    Equilibrium is only half the show. <strong>Quench</strong> the lattice — drop $T$
    from hot to cold instantly — and it cannot order all at once: up-domains and
    down-domains nucleate everywhere and then coarsen, with the typical domain size
    growing as $L \\sim t^{1/2}$. The pattern is statistically self-similar: zoom out
    by 2 and wait 4× longer, and it looks the same.
  </p>
  <p>
    The engine of coarsening is curvature. A domain wall costs energy per unit length,
    so walls straighten and curved droplets shrink — paint a disc of down-spins in an
    up sea below $T_c$ and watch its area decrease at a steady rate, a discrete cousin
    of motion by mean curvature.
  </p>
  <p>
    Below $T_c$ with a field, the magnet <em>remembers</em>. Sweep $h$ up and down and
    $m$ lags behind, tracing a hysteresis loop: flipping a magnetized lattice requires
    nucleating and growing droplets of the other phase, and that takes time the sweep
    doesn't give. Cool further and the loop fattens. This memory is exactly what makes
    hard disks store data.
  </p>
</section>

<section>
  <h2>Honest caveats</h2>
  <p>
    Near $T_c$, single-spin-flip dynamics suffers <em>critical slowing down</em>: the
    correlated regions are huge, and flipping one spin at a time takes ever longer to
    produce an independent configuration — the autocorrelation time grows like a power
    of the correlation length. The lab measures every few sweeps and discards a window
    after every disturbance, but the $\\chi$ peak you accumulate near $T_c$ is still a
    lower bound. Cluster algorithms (Wolff, Swendsen–Wang) cure this by flipping whole
    correlated clusters at once — deliberately out of scope here, because they replace
    the <em>dynamics</em>, and the dynamics is half of what this lab is about.
  </p>
  <p>
    Relatedly: the checkerboard sweep is a modeling choice. It samples the same
    equilibrium as random-site updates (detailed balance holds pass by pass), but the
    <em>kinetics</em> differ: every interface site gets an update chance every sweep,
    so at low temperature the near-deterministic majority updates move domain walls
    much faster than random-site dynamics would — quenches coarsen noticeably quicker
    here than in a textbook single-flip simulation. Equilibrium answers — $T_c$,
    $m(T)$, $\\chi$ — do not care. Movies do.
  </p>
</section>
`;
