/**
 * The "Theory" text. One HTML template string; $…$ and $$…$$ spans are typeset with
 * KaTeX by explainer.ts on first open.
 *
 * Backslashes are doubled throughout because this is a template literal: a bare \r or
 * \t in LaTeX would become a carriage return or a tab before KaTeX ever saw it.
 */

export const PAPER = `
<h1>A brick wall, from the weak form up</h1>
<p class="byline">On what this solver actually solves, the choices behind it, and what it leaves out.</p>

<section>
  <h2>Abstract</h2>
  <p class="abstract">
    Every brick on screen is a mesh of hexahedral finite elements, and every mortar joint
    between them is a surface with a traction that depends on how far its two faces have
    opened or slid. Nothing about the crack path is drawn — it is wherever joints exceeded
    their strength. This is the chain from momentum balance to the pixels, and then an
    equally explicit list of everything the model does not do.
  </p>
</section>

<section>
  <h2>What is being solved</h2>
  <p>
    Each brick is a continuum body $\\Omega_b$ obeying momentum balance,
  </p>
  $$\\rho\\,\\ddot{\\mathbf{u}} = \\nabla\\cdot\\boldsymbol{\\sigma} + \\rho\\,\\mathbf{b},$$
  <p>
    with Cauchy stress $\\boldsymbol{\\sigma}$, density $\\rho$ and body force $\\mathbf{b}$.
    On exposed faces the blast supplies a traction. None of that is specific to masonry.
    What makes it masonry is the last condition: between two bricks lies a surface
    $\\Gamma_j$ across which displacement may be <em>discontinuous</em>, carrying a
    traction that depends on the jump,
  </p>
  $$\\mathbf{T} = \\mathbf{T}(\\Delta\\mathbf{u}), \\qquad \\Delta\\mathbf{u} = \\mathbf{u}^{+} - \\mathbf{u}^{-}.$$
  <p>
    A wall is not a continuum with bricks drawn on it. It is a few hundred continua
    stitched together by tens of thousands of these surfaces, and essentially everything
    interesting — the crack path, the failure mode, the reason bond patterns exist —
    lives in $\\mathbf{T}(\\Delta\\mathbf{u})$ rather than in $\\boldsymbol{\\sigma}$.
  </p>
</section>

<section>
  <h2>The weak form</h2>
  <p>
    Multiply by an admissible variation $\\delta\\mathbf{u}$, integrate over each brick and
    integrate the divergence term by parts. The boundary term splits into the exposed
    surfaces, which carry the applied traction, and the joints, which carry the interface
    traction:
  </p>
  $$\\sum_b \\int_{\\Omega_b} \\rho\\,\\delta\\mathbf{u}\\cdot\\ddot{\\mathbf{u}}\\,d\\Omega
   + \\sum_b \\int_{\\Omega_b} \\delta\\boldsymbol{\\varepsilon} : \\boldsymbol{\\sigma}\\,d\\Omega
   + \\sum_j \\int_{\\Gamma_j} \\Delta(\\delta\\mathbf{u})\\cdot\\mathbf{T}\\,d\\Gamma
   = \\sum_b \\int_{\\Gamma_t} \\delta\\mathbf{u}\\cdot\\bar{\\mathbf{t}}\\,d\\Gamma
   + \\sum_b \\int_{\\Omega_b} \\rho\\,\\delta\\mathbf{u}\\cdot\\mathbf{b}\\,d\\Omega$$
  <p>
    Four integrals — inertia, internal work, interface work, external work. Everything
    below is a decision about how to evaluate one of them.
  </p>
</section>

<section>
  <h2>Choosing the element</h2>
  <p>
    Inside a brick the displacement is interpolated from nodal values with trilinear
    hexahedral shape functions,
  </p>
  $$N_a(\\xi,\\eta,\\zeta) = \\tfrac{1}{8}(1+\\xi_a\\xi)(1+\\eta_a\\eta)(1+\\zeta_a\\zeta),$$
  <p>
    where $(\\xi_a,\\eta_a,\\zeta_a)$ are the corner's $\\pm 1$ coordinates, and strains
    follow as $\\boldsymbol{\\varepsilon} = \\mathbf{B}\\,\\mathbf{u}_e$ with $\\mathbf{B}$
    the $6\\times 24$ strain–displacement operator. Four reasons for that element and not
    another:
  </p>
  <ul>
    <li>
      <strong>The geometry is boxes.</strong> Every unit sits on a lattice and is
      subdivided uniformly, so hexahedra tile it exactly. There is no meshing step at all.
    </li>
    <li>
      <strong>Linear tetrahedra would be a poor trade.</strong> A four-node tet is
      constant-strain and badly over-stiff in bending; matching this takes many times more
      elements, each one shortening the stable time step.
    </li>
    <li>
      <strong>Quadratic elements would be worse here, not better.</strong> More accurate
      per degree of freedom, but the explicit time step scales with the smallest element
      dimension and lumping mass onto mid-side nodes is awkward. Explicit codes
      overwhelmingly use eight-node hexes for exactly this reason.
    </li>
    <li>
      <strong>Full $2\\times2\\times2$ Gauss, not one-point reduced.</strong> Reduced
      integration is four times cheaper but admits zero-energy hourglass modes needing an
      artificial stabilising stiffness with a coefficient somebody has to choose. Since
      every element here is the same box, the stiffness is integrated once for the whole
      model, so reduced integration would save nothing and cost a fudge factor.
    </li>
  </ul>
</section>

<section>
  <h2>The integrals</h2>
  <p>The element stiffness is the internal-work integral with the isotropic matrix $\\mathbf{D}$:</p>
  $$\\mathbf{K}_e = \\int_{\\Omega_e}\\mathbf{B}^{\\mathsf{T}}\\mathbf{D}\\,\\mathbf{B}\\;d\\Omega
    = \\sum_{g=1}^{8} w_g\\,\\mathbf{B}^{\\mathsf{T}}(\\boldsymbol{\\xi}_g)\\,\\mathbf{D}\\,\\mathbf{B}(\\boldsymbol{\\xi}_g)\\,\\det\\mathbf{J}$$
  <p>
    For an axis-aligned box of sides $a\\times b\\times c$ the Jacobian is constant and
    diagonal, $\\mathbf{J} = \\mathrm{diag}(a/2, b/2, c/2)$ with
    $\\det\\mathbf{J} = abc/8$, so the mapping never varies across the element and physical
    derivatives are simply $\\partial N_a/\\partial x = (2/a)\\,\\partial N_a/\\partial\\xi$.
    The eight Gauss points at $\\pm 1/\\sqrt{3}$ integrate the integrand exactly — it is at
    most cubic in each variable, and two-point Gauss is exact to degree three.
  </p>
  <p>
    The consistent mass $\\int_{\\Omega_e}\\rho\\,\\mathbf{N}^{\\mathsf{T}}\\mathbf{N}\\,d\\Omega$
    is row-summed to a diagonal, which for this element gives exactly
    $M_{aa} = \\rho V_e/8$. Lumping is not laziness: it turns the update into a division
    rather than a linear solve, and a lumped mass has a slightly <em>higher</em> critical
    time step than a consistent one.
  </p>
  <p>
    And then the economy that shapes the whole codebase. Because every unit is on one
    lattice and subdivided uniformly, <strong>every $\\Omega_e$ in the model is the same
    box</strong> — so $\\mathbf{K}_e$ is 576 numbers computed once and shared by all 28 000
    elements. The internal force is one $24\\times24$ matrix–vector product per element,
    which is what makes it cheap enough for a GPU to do tens of millions of times a second.
  </p>
</section>

<section>
  <h2>Large rotations without large-strain theory</h2>
  <p>
    Linear elasticity is valid only for small displacement <em>gradients</em>, and a brick
    tumbling through the air has small strain with an enormous rotation. Feed that rotation
    into a linear element and it reads as strain: the brick appears to stretch violently
    and tears itself apart.
  </p>
  <p>
    So the rotation is extracted and the strain measured in the element's own frame. The
    deformation gradient at the element centre is
  </p>
  $$\\mathbf{F} = \\sum_{a=1}^{8}(\\mathbf{x}_a - \\bar{\\mathbf{x}}) \\otimes \\nabla_X N_a\\big|_{\\boldsymbol{\\xi}=0},
    \\qquad \\nabla_X N_a\\big|_{0} = \\left(\\frac{\\xi_a}{4a},\\ \\frac{\\eta_a}{4b},\\ \\frac{\\zeta_a}{4c}\\right),$$
  <p>
    polar-decomposed as $\\mathbf{F} = \\mathbf{R}\\,\\mathbf{U}$, and the internal force
    becomes
  </p>
  $$\\mathbf{f}^{\\,e}_{\\text{int}} = -\\,\\mathbf{R}\\,\\mathbf{K}_e\\Big(\\mathbf{R}^{\\mathsf{T}}(\\mathbf{x}_e - \\bar{\\mathbf{x}}) - (\\mathbf{X}_e - \\bar{\\mathbf{X}})\\Big),$$
  <p>
    which is exactly zero for any rigid motion and reduces to linear elasticity when
    $\\mathbf{R} = \\mathbf{I}$. $\\mathbf{R}$ comes from Müller's iterative quaternion
    method rather than an SVD: with $\\mathbf{r}_c$ and $\\mathbf{f}_c$ the columns of the
    current $\\mathbf{R}$ and of $\\mathbf{F}$, each iteration applies the axis-angle
    correction
  </p>
  $$\\boldsymbol{\\omega} = \\frac{\\sum_c \\mathbf{r}_c \\times \\mathbf{f}_c}{\\left|\\sum_c \\mathbf{r}_c\\cdot\\mathbf{f}_c\\right| + \\epsilon}.$$
  <p>
    Warm-started from the previous step it converges in one or two iterations, because a
    brick barely turns in ten microseconds. That warm start is the entire reason this is
    affordable inside a per-element GPU kernel. It is a corotational <em>linear</em>
    material: exact for arbitrary rotation, first-order in strain.
  </p>
</section>

<section>
  <h2>The joints</h2>
  <p>
    Zero-thickness interface, with the jump split into normal and tangential parts,
    $\\Delta_n = \\Delta\\mathbf{u}\\cdot\\mathbf{n}$ and
    $\\Delta_s = \\Delta\\mathbf{u} - \\Delta_n\\mathbf{n}$. The elastic stiffnesses come
    from smearing the real mortar layer over its thickness $t_m$,
  </p>
  $$k_n = \\frac{E_u E_m}{t_m (E_u - E_m)}, \\qquad k_s = \\frac{G_u G_m}{t_m (G_u - G_m)},$$
  <p>
    which for 1 GPa mortar in a 12 mm joint lands near 80 N/mm³ — and the value Lourenço
    and Rots calibrate against the TU Delft shear walls is 82. Mode I is a bilinear
    cohesive law driven by $\\kappa$, the largest opening the joint has ever reached:
  </p>
  $$\\sigma(\\kappa) = \\begin{cases}
      k_n\\,\\kappa, & \\kappa \\le \\delta_0 \\\\
      f_t\\,\\dfrac{\\delta_f - \\kappa}{\\delta_f - \\delta_0}, & \\delta_0 < \\kappa < \\delta_f \\\\
      0, & \\kappa \\ge \\delta_f
    \\end{cases}
    \\qquad \\delta_0 = \\frac{f_t}{k_n}, \\quad \\delta_f = \\frac{2G_f^{\\,I}}{f_t}$$
  <p>
    $\\delta_f$ is chosen so the area under the curve is the fracture energy exactly,
    $\\int_0^{\\delta_f}\\sigma\\,d\\kappa = \\tfrac12 f_t\\delta_f = G_f^{\\,I}$. Damage is
    expressed as a loss of secant stiffness, $D = 1 - k_{\\text{sec}}/k_n$, which makes
    unloading run back to the origin instead of retracing the envelope — the difference
    between a joint that has cracked and one that is merely open at this instant.
    Sliding is Coulomb, with the cohesion carried away by that same damage,
  </p>
  $$|\\boldsymbol{\\tau}| \\;\\le\\; c\\,(1-D) \\;+\\; \\max(0,\\,-\\sigma)\\,\\tan\\varphi,$$
  <p>
    evaluated by return mapping. Compression is capped at $\\sigma \\ge -f_c$ with the
    excess closure stored, so a crushed joint does not spring back. That cap looks like a
    formality — reflected pressures are 0.1 to 1 MPa and masonry crushes near 10 — and it
    is not. A wall held top and bottom does not resist by bending, it arches, and an arch
    concentrates its thrust onto a sliver of joint at each hinge. Built without the cap,
    such a wall turned out to be literally unbreakable. It just rang.
  </p>
  <p>
    One honest departure from a textbook cohesive element: the interface integral is
    evaluated <em>nodally</em>, with a tributary area $A_p$ at each node pair,
    $\\int_{\\Gamma_j}\\Delta\\mathbf{u}\\cdot\\mathbf{T}\\,d\\Gamma \\approx \\sum_p A_p\\,\\Delta\\mathbf{u}_p\\cdot\\mathbf{T}_p$.
    That is a Lobatto-type rule whose points sit exactly on the nodes. It diagonalises the
    interface the same way row-summing diagonalises the mass, and it is what lets a joint
    be nothing but a list of node pairs — no surface search, no projection, no
    master–slave pairing. The price is a traction that is piecewise constant around each
    node rather than interpolated.
  </p>
</section>

<section>
  <h2>Standing the wall up first</h2>
  <p>
    The undeformed mesh is not equilibrium. Switch gravity on at $t = 0$ and the wall
    begins oscillating about its settled position — and the blast arrives a few
    milliseconds later, comparable to the wall's own fundamental period, so it would meet
    a wall still ringing from being stood up. It matters for strength too, because joint
    shear capacity is $c + \\sigma\\tan\\varphi$ and the $\\sigma$ there is self-weight:
    about 50 kPa at the base of a 2.7 m wall, worth roughly a tenth of the shear capacity,
    which ought to be present and steady rather than vibrating.
  </p>
  <p>
    So the wall is relaxed into equilibrium before the clock starts: the same explicit
    kernels, heavily damped, with the load switched off, until the motion dies. Dynamic
    relaxation reaches the same static state an implicit solve would, and it does so with
    machinery that already exists — at self-weight every joint is in compression and
    elastic, so there is no softening in the problem yet and nothing for a Newton method
    to earn its keep on. The self-test checks the result as a force balance: what the
    supports hold must equal the weight of everything free to fall, and it does to within
    a third of a percent.
  </p>

  <h2>Time integration</h2>
  <p>The semi-discrete system is integrated by central differences on half-step velocities:</p>
  $$\\mathbf{v}^{\\,n+1/2} = \\mathbf{v}^{\\,n-1/2} + \\Delta t\\,\\mathbf{M}^{-1}\\!\\left(\\mathbf{f}^{\\,n}_{\\text{ext}} - \\mathbf{f}^{\\,n}_{\\text{int}}\\right),
    \\qquad \\mathbf{u}^{\\,n+1} = \\mathbf{u}^{\\,n} + \\Delta t\\,\\mathbf{v}^{\\,n+1/2}$$
  <p>
    Because $\\mathbf{M}$ is diagonal there is no solve anywhere in the loop — and, more
    importantly here, the scheme keeps running when elements lose all their stiffness. That
    is why blast and crash codes are explicit: an implicit solver needs a tangent stiffness
    that stays invertible, and a wall coming apart does not oblige. The scheme is
    conditionally stable at $\\Delta t \\le 2/\\omega_{\\max}$, and $\\omega_{\\max}$ is
    measured rather than guessed — power iteration on $\\mathbf{M}^{-1}\\mathbf{K}_e$ for
    the element, then compared against the joint springs at
    $\\omega = \\sqrt{k\\,(1/m_1 + 1/m_2)}$ and the ground penalty, smallest wins, with a
    safety factor of 0.7. The familiar Courant reading,
    $\\Delta t \\lesssim L_e/c_d$ with $c_d = \\sqrt{(\\lambda + 2\\mu)/\\rho}$, is the same
    statement, but only approximate for a hexahedron — and which mechanism governs changes
    the moment you drag a stiffness slider.
  </p>
</section>

<section>
  <h2>The load</h2>
  <p>
    The pressure is prescribed rather than solved for. Peak overpressure and positive-phase
    duration come from the Kinney and Graham fits in scaled distance
    $Z = R/W^{1/3}$, the reflected peak from Rankine–Hugoniot, and the history from the
    modified Friedlander form
  </p>
  $$p(t) = P_r\\left(1 - \\frac{t - t_a}{t_d}\\right)e^{-b\\,(t-t_a)/t_d}.$$
  <p>
    A CONWEP blend gives each face its own pressure by incidence angle, so a face pointing
    away feels nothing; arrival times integrate $dR/U(R)$, so the front leaves at several
    times the speed of sound and decays toward it; and the drawn shock sphere reads the
    same table, so the picture and the load cannot disagree. Faces that cannot see the
    charge are found by a line-of-sight march over the lattice and are not loaded at all.
  </p>
</section>

<section>
  <h2>The limits of this model</h2>
  <ul>
    <li><strong>The integration is explicit, and only explicit.</strong> There is no tangent stiffness assembly, no Newton iteration and no equation solving anywhere — which is what makes it robust through fracture, and also means it cannot be asked for a static answer directly. Self-weight is reached by relaxing dynamically into it rather than by solving for it.</li>
    <li><strong>Corotational linear, not large-strain.</strong> No hyperelastic material, no objective stress rate.</li>
    <li><strong>The interface is integrated nodally</strong>, not by Gauss quadrature with interface shape functions.</li>
    <li><strong>Full integration locks in bending.</strong> With one or two elements through the thickness a brick is far too stiff in flexure. It matters less than it sounds, because a masonry wall's compliance comes from joints opening rather than bricks bending — but it is a real limitation.</li>
    <li><strong>One damage variable</strong> couples mode I and mode II, so $G_f^{\\,II}$ is not independently controllable.</li>
    <li><strong>No fragment-to-fragment contact.</strong> A joint can close back up; two pieces that fly into each other pass through.</li>
    <li><strong>The blast is prescribed.</strong> No fluid domain, no clearing, no diffraction into shadow.</li>
    <li><strong>Bricks cannot break.</strong> All damage is in the joints. Real bricks do crack, especially close in.</li>
  </ul>
</section>

<section>
  <h2>Verification, not plausibility</h2>
  <p>
    Every claim above is worth what the checking behind it is worth, so the demo ships a
    self-test suite that runs in plain Node with no browser and no GPU. The element's six
    rigid-body modes produce no force at all, and a uniaxial stretch and a simple shear
    return $(\\lambda + 2\\mu)\\varepsilon$ and $\\mu\\gamma$ to five decimals. Pulling a
    joint apart peaks at exactly $f_t$ and dissipates exactly $G_f$. A simulated
    <em>triplet shear test</em> at four confining pressures recovers the cohesion and
    $\\tan\\varphi$ it was given from the fitted failure envelope — the actual laboratory
    test, run inside the solver. Linear momentum is conserved to a part in a million over
    two thousand steps, which is the check that catches an internal force that is not equal
    and opposite. And the measured critical time step really is critical: 0.9× is stable
    and 1.25× diverges.
  </p>
  <p>
    The two claims the demo exists to make get tests rather than screenshots: that the same
    charge cracks a stack-bonded wall's head joints preferentially — 28 % of them against
    15 % — because a cracked stussfuge with another directly above it has somewhere to run;
    and that four walls bonded at the corners hold the ends of a façade that a lone wall
    cannot, 29 mm of end movement against 117 mm. A simulation that has not been asked to
    predict something it could have got wrong has not been tested, only run.
  </p>
</section>
`;
