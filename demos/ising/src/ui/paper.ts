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
    lattice organizes itself, fights itself, and near a critical temperature shows the finite-size signature of a
    phase transition that becomes sharp in the infinite-lattice limit. Every number in the charts is measured live from the lattice
    you are looking at, and the charts compare sampled measurements with infinite-lattice equilibrium references.
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
    reduced units: the slider T means physical temperature times Boltzmann’s constant
    divided by the neighbor coupling J. It is not a temperature in kelvin.
  </p>
  <p>
    Low $T$: agreement wins, and the lattice orders into large domains. High $T$: noise
    wins, and the lattice is a static-filled coin toss. The remarkable part is what
    happens in between — a sharp transition at a critical temperature $T_c$ in an infinite, zero-field
    lattice. A finite screen rounds it off and limits the largest fluctuations.
  </p>
</section>

<section>
  <h2>The algorithm</h2>
  <p>
    The lattice evolves by the Metropolis rule: pick a spin, compute the energy change
    $\\Delta E = 2 s_i \\, (\\textstyle\\sum_{j} s_j + h)$ of flipping it, and flip with
    probability $\\min(1, e^{-\\Delta E / T})$. A flip that lowers the energy always
    happens; a flip that raises it happens with the Boltzmann probability. This
    has the desired equilibrium distribution as a stationary distribution. Reaching it
    and estimating its averages still requires equilibration and enough independent samples. The Glauber option changes the acceptance to
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
    It measures the excess of up over down spins: m = 1 is all up and m = 0 is balanced.
    Below $T_c$, an ordered phase has a preferred sign, but thermal defects remain
    at nonzero temperature. At zero field, a finite system’s fully sampled equilibrium
    still has average m = 0 because both signs are equally likely. We plot |m| to
    reveal ordering without cancellation. Spontaneous symmetry breaking strictly
    concerns the infinite-system limit with a sign selected.
  </p>
  <p>
    For the square lattice, Onsager's exact solution puts the zero-field transition at
    $T_c = 2/\\ln(1+\\sqrt{2}) \\approx 2.269$. Yang’s 1952 spontaneous magnetization formula below that temperature is
  </p>
  $$m(T) = \\left(1 - \\sinh^{-4}(2/T)\\right)^{1/8},$$
  <p>
    Above $T_c$ this reference is zero. Your finite-lattice |m| measurements should
    approach it away from the transition after equilibration; finite size, nonzero
    field and correlated samples prevent exact agreement.
  </p>
  <p>
    The chart’s absolute-magnetization fluctuation proxy $\\chi = N(\\langle m^2\\rangle - \\langle |m|\\rangle^2)/T$ and
    heat capacity $C_v = N(\\langle e^2\\rangle - \\langle e\\rangle^2)/T^2$ are measured
    from <em>fluctuations</em> — how much the lattice trembles — and both spike at
    $T_c$. On an infinite lattice they would diverge; on a finite one the peak is
    rounded and slightly shifted. That rounding in your chart is a finite-size effect,
    while incomplete equilibration and correlated sampling also affect the measured peak.
    The ordinary zero-field susceptibility uses ⟨m⟩² instead of ⟨|m|⟩². These conventions
    differ when the finite lattice switches sign; the plotted proxy is not the full
    response derivative. Here e is energy per spin, N the spin count, and brackets are sample averages.
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
    The leading critical exponent is shared; the entire curves need not be identical. Near $T_c$ the magnetization
    vanishes as $m \\sim (T_c - T)^{\\beta}$ with $\\beta = 1/8$ on all three lattices —
    the same critical exponent, exactly. Microscopic details wash out at the critical
    point; only dimensionality and symmetry survive. This is universality, one of the
    deepest facts in statistical physics. The pictures suggest that shared behavior. Measuring the exponent requires
    finite-size scaling, equilibration and uncertainty estimates, not just matching shapes.
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
    after every disturbance, but the $\\chi$ peak you accumulate near $T_c$ can be biased and noisy; it is not a rigorous
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
    here than in a textbook single-flip simulation. A sweep is one update opportunity per spin, not a calibrated number of seconds.
    Equilibrium answers — $T_c$,
    $m(T)$, $\\chi$ — do not care. Movies do.
  </p>
</section>
`;
