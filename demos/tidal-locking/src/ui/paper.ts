/**
 * The written account of what the simulation does, laid out as a short paper.
 *
 * Kept as one template string rather than markup scattered through the app: it reads as
 * prose here, which is the only way to notice when the argument stops making sense.
 * Maths is written between dollars and rendered by KaTeX at open time.
 */
export const PAPER = /* html */ `
<h1>Tidal locking from Newtonian gravity and internal friction</h1>
<p class="byline">A note on the model behind this simulation.</p>

<section>
<h2>Abstract</h2>
<p class="abstract">
A moon represented as a few hundred point masses joined by damped springs, orbiting a
point-mass planet under ordinary inverse-square gravity, spontaneously evolves toward
synchronous rotation. No tidal-force term, no torque term, and no test for
synchronicity appears anywhere in the equations of motion. Starting at
$\\Omega_{\\text{spin}} = 1.4\\,\\Omega_{\\text{orb}}$, the body reaches synchronous rotation
after roughly one thousand orbits while conserving total angular momentum to one part in
$10^{14}$, dissipating $0.4\\%$ of its initial kinetic energy as heat, and receding
$0.7\\%$ from the planet.
</p>
</section>

<section>
<h2>1. Introduction</h2>
<p>
The Moon keeps one face toward the Earth. The standard explanation is that the Earth
raises a tidal bulge on the Moon, that internal friction makes the bulge lag the
Earth&ndash;Moon line, and that gravity acting on the misaligned bulge exerts a braking
torque. The explanation is correct, but stated that way it can feel as though the
conclusion has been assumed: the bulge, the lag and the torque are all asserted.
</p>
<p>
It is worth noting first why the effect cannot be avoided by simplifying. A point mass
cannot lock at all. Gravity acting on a point exerts no torque about that point, so
</p>
$$\\frac{d\\mathbf{L}}{dt} = \\mathbf{r}\\times\\mathbf{F} = \\mathbf{r}\\times\\left(-\\frac{GMm}{r^{3}}\\mathbf{r}\\right) = \\mathbf{0},$$
<p>
and a point-mass moon spins forever at whatever rate it began with. Extent is not a
detail of the problem; it is the whole of it.
</p>
<p>
This simulation therefore implements only three things &mdash; gravity, an extended
deformable body, and dissipation &mdash; and then simply watches. The bulge, the lag, the
torque, the despinning and the recession are all outputs.
</p>
</section>

<section>
<h2>2. Model</h2>

<h3>2.1 Equations of motion</h3>
<p>
The planet is a single point mass $M$ at $\\mathbf{R}$. The moon is $N$ point masses
$m_i$ at $\\mathbf{x}_i$, with $N = 200$ and $\\textstyle\\sum_i m_i = m \\ll M$. Every
particle is attracted to the planet, and the planet feels every reaction:
</p>
$$m_i\\ddot{\\mathbf{x}}_i = -\\frac{GMm_i}{\\lVert\\mathbf{x}_i-\\mathbf{R}\\rVert^{3}}(\\mathbf{x}_i-\\mathbf{R}) \\;+\\; \\sum_{j\\in\\mathcal{N}(i)}\\mathbf{f}_{ij},$$
$$M\\ddot{\\mathbf{R}} = \\sum_i \\frac{GMm_i}{\\lVert\\mathbf{x}_i-\\mathbf{R}\\rVert^{3}}(\\mathbf{x}_i-\\mathbf{R}).$$
<p>
The planet moves. That matters: it is what makes the barycentre real and lets the orbit
expand as the spin decays.
</p>

<h3>2.2 The spring&ndash;dashpot solid</h3>
<p>
Each particle is bonded to the neighbours within a cutoff of $1.6$ mean spacings, giving
about twelve bonds each and some $1{,}200$ in total &mdash; comfortably above the six per
particle a central-force network needs to resist shear, so the body behaves as a solid
rather than a fluid. Writing $\\mathbf{d}=\\mathbf{x}_j-\\mathbf{x}_i$ and
$\\hat{\\mathbf{d}}=\\mathbf{d}/\\lVert\\mathbf{d}\\rVert$, each bond pulls with
</p>
$$\\mathbf{f}_{ij} = \\Big[\\,k\\big(\\lVert\\mathbf{d}\\rVert - \\ell_{ij}\\big) \\;+\\; c\\,\\big(\\dot{\\mathbf{d}}\\cdot\\hat{\\mathbf{d}}\\big)\\Big]\\,\\hat{\\mathbf{d}}.$$
<p>
The rest length $\\ell_{ij}$ is the initial separation, so the moon begins unstressed. The
first term is Hooke's law; the second is a dashpot acting on the rate of change of bond
length. This is a Kelvin&ndash;Voigt solid, and $c$ is the only irreversibility in the
entire model.
</p>

<h3>2.3 Why the dashpot must act along the bond</h3>
<p>
This is the point on which the honesty of the whole simulation rests. Because
$\\mathbf{f}_{ij}$ is parallel to $\\hat{\\mathbf{d}}$ and $\\mathbf{f}_{ji}=-\\mathbf{f}_{ij}$,
the pair contributes no net force and no net torque:
</p>
$$\\mathbf{x}_i\\times\\mathbf{f}_{ij} + \\mathbf{x}_j\\times\\mathbf{f}_{ji} = (\\mathbf{x}_i-\\mathbf{x}_j)\\times\\mathbf{f}_{ij} = -\\mathbf{d}\\times\\hat{\\mathbf{d}}\\,(\\cdots) = \\mathbf{0}.$$
<p>
Internal forces therefore cannot change the body's angular momentum; only the planet's
gravity can. Had the damping carried any component perpendicular to the bond it would
have been friction against an absolute frame &mdash; it would have slowed the moon's
rotation directly, and the simulation would have &ldquo;demonstrated&rdquo; tidal locking
by quietly applying a brake. The measured drift in total angular momentum, of order
$10^{-14}$ relative over tens of millions of steps, is the evidence that this has not
happened.
</p>
</section>

<section>
<h2>3. Numerical method</h2>
<p>
Integration is velocity Verlet, with one modification. Plain Verlet assumes forces depend
only on position, which the dashpot violates. Evaluating the forces at the half-step
velocity restores second-order accuracy:
</p>
$$\\mathbf{v}^{n+1/2} = \\mathbf{v}^{n} + \\tfrac{1}{2}\\,\\mathbf{a}^{n}\\,\\Delta t,\\qquad
\\mathbf{x}^{n+1} = \\mathbf{x}^{n} + \\mathbf{v}^{n+1/2}\\Delta t,$$
$$\\mathbf{a}^{n+1} = \\mathbf{A}\\!\\left(\\mathbf{x}^{n+1},\\,\\mathbf{v}^{n+1/2}\\right),\\qquad
\\mathbf{v}^{n+1} = \\mathbf{v}^{n+1/2} + \\tfrac{1}{2}\\,\\mathbf{a}^{n+1}\\Delta t.$$
<p>
Two separate conditions bound the step. The elastic one is set by the stiffest lattice
mode, $\\Delta t \\lesssim 2/\\omega_{\\max}$ with
$\\omega_{\\max}\\simeq\\sqrt{z\\,k/m_p}$ for coordination number $z$; the dissipative one
by $\\Delta t \\lesssim 2 m_p/(c\\,z)$. Omitting $z$ from the second is a good way to
detonate the moon during setup, which is how it was found.
</p>
</section>

<section>
<h2>4. Construction of the body</h2>

<h3>4.1 Sampling</h3>
<p>
Particles are placed by blue-noise relaxation inside a ball. A cubic lattice would give
the moon preferred crystal directions and the tidal bulge would visibly snap to them;
uniform random points clump instead.
</p>

<h3>4.2 Isotropisation</h3>
<p>
This detail mattered far more than expected. A cloud of $N$ random points carries an
intrinsic quadrupole asymmetry of order $N^{-1/2}$ &mdash; about $7\\%$ at $N=200$, which
is several times larger than the $0.25\\%$ tidal bulge it is supposed to reveal. Left
alone, the moon locks because gravity has caught hold of a <em>permanent</em> lump, the
way a lopsided asteroid does, and the locking time stops responding to $k$ and $c$
altogether.
</p>
<p>
The rest shape is therefore squashed by the affine map that makes its second-moment
tensor isotropic,
</p>
$$\\mathbf{q}_i \\;\\mapsto\\; \\mathbf{S}^{-1/2}\\,\\mathbf{q}_i,\\qquad \\mathbf{S}=\\sum_i \\mathbf{q}_i\\otimes\\mathbf{q}_i,$$
<p>
computed by Newton&ndash;Schulz iteration. This removes the $\\ell=2$ term of the rest
shape and leaves the tidal bulge as the only handle gravity has.
</p>

<h3>4.3 Relaxation of the initial state</h3>
<p>
Released as an unstressed sphere into a tidal field, the moon must grow a tidal bulge and
a centrifugal bulge simultaneously, and it overshoots. The opening orbits are then
dominated by a ring-down that has nothing to do with tidal locking and looks precisely
like it. The body is therefore settled under heavy damping first, after which its
velocity field is projected onto the rigid-body motion carrying the same linear and
angular momentum,
</p>
$$\\mathbf{v}_i \\;\\mapsto\\; \\mathbf{V} + \\boldsymbol{\\omega}\\times(\\mathbf{x}_i-\\mathbf{X}),\\qquad \\boldsymbol{\\omega}=\\mathbf{I}^{-1}\\mathbf{L},$$
<p>
which removes all vibrational kinetic energy while conserving both momenta exactly. Only
then does the clock start.
</p>
</section>

<section>
<h2>5. Diagnostics</h2>

<h3>5.1 The spin of a deformable body</h3>
<p>
A body that is actively deforming has no rigid rotation matrix to differentiate, so
&ldquo;how fast is it spinning&rdquo; needs a definition. The honest one is the angular
velocity that carries its angular momentum, computed in its own centre-of-mass frame:
</p>
$$\\boldsymbol{\\omega}_{\\text{spin}} = \\mathbf{I}^{-1}\\mathbf{L},\\qquad
\\mathbf{L}=\\sum_i m_i\\,\\mathbf{r}_i\\times\\mathbf{v}_i,\\qquad
\\mathbf{I}=\\sum_i m_i\\big(r_i^{2}\\boldsymbol{\\delta}-\\mathbf{r}_i\\otimes\\mathbf{r}_i\\big).$$
<p>
The orbital rate is $\\Omega_{\\text{orb}} = \\lVert\\mathbf{r}\\times\\mathbf{v}\\rVert/r^{2}$
for the centre of mass relative to the planet. Locking is the statement
$\\omega_{\\text{spin}}\\to\\Omega_{\\text{orb}}$.
</p>

<h3>5.2 The bulge</h3>
<p>
The deformation is measured against the body's own rest shape by a least-squares affine
fit, which cancels the cloud's intrinsic lumpiness exactly:
</p>
$$\\mathbf{F} = \\Big(\\sum_i \\mathbf{p}_i\\otimes\\mathbf{q}_i\\Big)\\Big(\\sum_i \\mathbf{q}_i\\otimes\\mathbf{q}_i\\Big)^{-1}.$$
<p>
Principal stretches come from the left Cauchy&ndash;Green tensor $\\mathbf{B}=\\mathbf{F}\\mathbf{F}^{\\mathsf{T}}$,
which is positive semi-definite by construction and therefore cannot produce the
degenerate or negative stretches that a two-dimensional polar decomposition does the
moment the spin axis tips. The angle between the long axis of $\\mathbf{B}$ and the
planet direction is the bulge lead $\\delta$.
</p>
<p>
The same matrix $\\mathbf{F}$ is sent to the vertex shader. The $\\ell=2$ tidal response is
affine to good accuracy, so one $3\\times 3$ matrix reproduces the entire deformation of
the rendered surface, with normals following from $\\mathbf{F}^{-\\mathsf{T}}$.
</p>
</section>

<section>
<h2>6. Results</h2>
<p>
With the shipped parameters the spin ratio falls from $1.40$ to $1.00$ by orbit $1{,}000$
and then holds, librating. The bulge lead is positive throughout the despinning phase and
crosses zero at synchronicity &mdash; the mechanism doing exactly what the argument in
&sect;1 says it should.
</p>
<table>
<thead><tr><th>Quantity</th><th>Start</th><th>Orbit 2,600</th></tr></thead>
<tbody>
<tr><td>Spin ÷ orbit</td><td>1.40</td><td>1.004</td></tr>
<tr><td>Spin angular momentum</td><td>$5.609\\times10^{-4}$</td><td>$3.603\\times10^{-4}$</td></tr>
<tr><td>Orbital angular momentum</td><td>$5.4232\\times10^{-2}$</td><td>$5.4432\\times10^{-2}$</td></tr>
<tr><td><strong>Total</strong></td><td>$5.4792\\times10^{-2}$</td><td>$5.4792\\times10^{-2}$</td></tr>
<tr><td>Separation</td><td>7.500</td><td>7.543</td></tr>
<tr><td>Heat</td><td>0</td><td>$5.87\\times10^{-6}$</td></tr>
</tbody>
</table>
<p>
The spin loses $2.006\\times10^{-4}$; the orbit gains $2.006\\times10^{-4}$. The total moves
by $8\\times10^{-16}$, which is round-off. Energy, by contrast, is <em>not</em> conserved:
$0.4\\%$ of the initial kinetic energy has become heat inside the moon. That asymmetry is
the whole phenomenon &mdash; angular momentum is redistributed, energy is destroyed, and
the moon climbs away from the planet as a consequence.
</p>
<p>
Setting $c=0$ is the control experiment. The moon still bulges and the bulge still tracks
the planet, but the despinning very nearly stops: over $2{,}500$ orbits the spin ratio
falls by $6\\%$, against reaching synchronous with friction on. What remains is the
integrator's own energy leak rather than physics.
</p>
</section>

<section>
<h2>7. Scaling, and what is not to scale</h2>
<p>
The classical estimate for the locking time of a satellite of radius $R$, mass $m_s$ and
moment of inertia $I\\simeq 0.4\\,m_sR^2$ about a planet of mass $m_p$ is
</p>
$$t_{\\text{lock}} \\;\\approx\\; \\frac{\\omega\\,a^{6}\\,I\\,Q}{3\\,G\\,m_p^{2}\\,k_2\\,R^{5}},$$
<p>
with $Q$ the dissipation function and $k_2$ the tidal Love number. The sixth power of the
semi-major axis is why the real Moon took of order $10^{7}$ years, and why nothing about
this simulation's numbers is to scale. Here the moon orbits at $7.5$ of its own radii
&mdash; the real one sits at about $221$ &mdash; and is far softer and far more lossy than
rock. Only the constants that set the rate have been changed; the mechanism is untouched.
</p>
<p>
Two further stylisations are worth stating plainly. The planet is drawn at about $2.5$
moon radii rather than the true $3.67$, for composition. And the sun is held at a fixed
angle to the planet&ndash;moon line rather than fixed against the stars, because at
thousands of orbits per minute an inertial sun cycles the moon through its phases several
times a second.
</p>
</section>

<section>
<h2>8. What to try</h2>
<ul>
<li><strong>Set the internal friction to zero.</strong> The bulge remains; the locking
stops. This is the control experiment above, run live.</li>
<li><strong>Set the initial spin below $1\\times$.</strong> The moon now turns too slowly,
the bulge lags rather than leads, and the torque reverses sign: it <em>speeds up</em> to
synchronous.</li>
<li><strong>Show the particles and springs.</strong> The smooth ellipsoid is a few hundred
masses on springs, and nothing else.</li>
<li><strong>Raise the bulge exaggeration.</strong> The real deformation here is about
$0.25\\%$ of the moon's radius. The control scales it for the eye and changes nothing in
the physics.</li>
</ul>
</section>
`;
