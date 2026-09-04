---
title: "A brick wall, from the weak form up"
date: "2026-09-04"
description: "Is the blast wall demo really doing finite element analysis? Yes — and here is the whole chain, from momentum balance to the weak form to the choice of element to the quadrature, together with an honest list of everything it is not."
tags: ["Physics", "Simulation", "Finite Elements", "Masonry", "WebGPU", "TypeScript"]
---

Someone looked at [the blast wall lab](/demos/blast-wall/) and asked the right question: *is this actually doing finite element analysis, or is it a pile of springs with good lighting?*

It is the former, and the way to show that is not to say so but to write the chain out — governing equation, weak form, discretisation, quadrature, time integration — and then be equally explicit about where it departs from a research code. Both halves matter. A simulation that only tells you what it does well is a sales pitch.

**[Open the lab](/demos/blast-wall/)** if you want to watch while you read.

## What is actually being solved

Each brick is a continuum body $\Omega_b$ obeying momentum balance:

$$
\rho\,\ddot{\mathbf{u}} = \nabla\cdot\boldsymbol{\sigma} + \rho\,\mathbf{b}
$$

with the Cauchy stress $\boldsymbol{\sigma}$, density $\rho$, and body force $\mathbf{b}$ — here gravity. On exposed faces the blast supplies a traction $\bar{\mathbf{t}} = -p(t)\,\mathbf{n}$. Some nodes are held by supports.

None of that is specific to masonry. What makes it masonry is the last condition. Between two bricks there is a surface $\Gamma_j$ — a mortar joint — across which the displacement is allowed to be *discontinuous*, and which carries a traction $\mathbf{T}$ that depends on how far the two faces have separated or slid:

$$
\mathbf{T} = \mathbf{T}\!\left(\Delta\mathbf{u}\right), \qquad \Delta\mathbf{u} = \mathbf{u}^{+} - \mathbf{u}^{-}
$$

A wall is not a continuum with some bricks drawn on it. It is a few hundred continua stitched together by a few tens of thousands of these surfaces, and essentially everything interesting — the crack path, the failure mode, the reason bond patterns exist at all — lives in $\mathbf{T}(\Delta\mathbf{u})$ rather than in $\boldsymbol{\sigma}$.

## The weak form

Multiply by an admissible variation $\delta\mathbf{u}$, integrate over each brick, and integrate the divergence term by parts. The boundary term splits into the exposed surfaces, which carry the applied traction, and the joints, which carry the interface traction:

$$
\sum_b \int_{\Omega_b} \rho\,\delta\mathbf{u}\cdot\ddot{\mathbf{u}}\,d\Omega
\;+\; \sum_b \int_{\Omega_b} \delta\boldsymbol{\varepsilon} : \boldsymbol{\sigma}\,d\Omega
\;+\; \sum_j \int_{\Gamma_j} \Delta(\delta\mathbf{u})\cdot\mathbf{T}\,d\Gamma
$$

$$
= \; \sum_b \int_{\Gamma_t} \delta\mathbf{u}\cdot\bar{\mathbf{t}}\,d\Gamma
\;+\; \sum_b \int_{\Omega_b} \rho\,\delta\mathbf{u}\cdot\mathbf{b}\,d\Omega
$$

Four integrals: inertia, internal work, interface work, external work. Everything below is a decision about how to evaluate one of them.

## Choosing the element

Inside a brick, interpolate the displacement from nodal values with trilinear hexahedral (H8) shape functions:

$$
N_a(\xi,\eta,\zeta) = \tfrac{1}{8}\,(1+\xi_a\xi)(1+\eta_a\eta)(1+\zeta_a\zeta), \qquad a = 1\ldots 8
$$

where $(\xi_a,\eta_a,\zeta_a)$ are the corner's $\pm 1$ coordinates. Strains follow as $\boldsymbol{\varepsilon} = \mathbf{B}\,\mathbf{u}_e$, with $\mathbf{B}$ the $6\times 24$ strain–displacement operator built from the shape function derivatives.

Four reasons that element and not another:

**The geometry is boxes.** Every unit sits on a lattice and is subdivided uniformly, so hexahedra tile it exactly. There is no mesh generation step at all — no tetrahedralisation, no quality metrics, no slivers.

**Linear tetrahedra would be a poor trade.** A four-node tet is constant-strain and notoriously over-stiff in bending; matching an H8 mesh takes many times more elements, and each one shortens the stable time step.

**Quadratic elements would be worse here, not better.** They are more accurate per degree of freedom, but the explicit time step scales with the smallest element dimension, and lumping mass onto mid-side nodes is awkward and produces negative masses for some geometries. Explicit codes overwhelmingly use H8 for exactly this reason.

**Full $2\times2\times2$ integration, not one-point reduced.** Reduced integration is about four times cheaper and is what most explicit codes reach for — but it admits zero-energy *hourglass* modes that deform the element while producing no strain at the single Gauss point, so it needs an artificial stabilisation stiffness with a coefficient somebody has to pick. Since every element in this model is the same box, the stiffness matrix is integrated exactly once for the entire wall, so reduced integration would save nothing and cost a fudge factor.

## The integrals

The element stiffness is the internal-work integral with the isotropic elasticity matrix $\mathbf{D}$:

$$
\mathbf{K}_e \;=\; \int_{\Omega_e}\mathbf{B}^{\mathsf{T}}\mathbf{D}\,\mathbf{B}\;d\Omega
\;=\; \sum_{g=1}^{8} w_g\,\mathbf{B}^{\mathsf{T}}(\boldsymbol{\xi}_g)\,\mathbf{D}\,\mathbf{B}(\boldsymbol{\xi}_g)\,\det\mathbf{J}
$$

For an axis-aligned box of side lengths $a\times b\times c$ the Jacobian is constant and diagonal,

$$
\mathbf{J} = \mathrm{diag}\!\left(\tfrac{a}{2},\,\tfrac{b}{2},\,\tfrac{c}{2}\right), \qquad \det\mathbf{J} = \tfrac{abc}{8}
$$

so the mapping never varies across the element, and physical derivatives are just $\partial N_a/\partial x = (2/a)\,\partial N_a/\partial\xi$. The eight Gauss points at $\xi,\eta,\zeta = \pm 1/\sqrt{3}$ with unit weights integrate the integrand exactly — it is at most cubic in each variable, and two-point Gauss is exact to degree three.

$\mathbf{D}$ is the usual isotropic matrix built from

$$
\lambda = \frac{E\nu}{(1+\nu)(1-2\nu)}, \qquad \mu = \frac{E}{2(1+\nu)}
$$

The consistent mass matrix would be $\mathbf{M}_e = \int_{\Omega_e}\rho\,\mathbf{N}^{\mathsf{T}}\mathbf{N}\,d\Omega$. It is row-summed to a diagonal instead, which for H8 gives exactly

$$
M_{aa} = \frac{\rho\,V_e}{8}
$$

Lumping is not laziness: it turns the explicit update into a division rather than a linear solve, and a lumped mass has a slightly *higher* critical time step than a consistent one.

And then the economy that shapes the entire codebase. Because every unit is on one lattice and subdivided uniformly, **every $\Omega_e$ in the model is the same box** — so $\mathbf{K}_e$ is 576 numbers computed once at startup and shared by every element in the wall. The internal force is then one $24\times24$ matrix–vector product per element, which is what makes it cheap enough for a GPU to do tens of millions of times a second.

## Large rotations without large-strain theory

Linear elasticity is only valid for small displacement *gradients*, and a brick tumbling through the air has a small strain but an enormous rotation. Feed that rotation into a linear element and it reads as strain: the brick appears to stretch violently and tears itself apart.

The fix is the corotational formulation — extract the rotation, measure strain in the element's own frame. The deformation gradient at the element centre is

$$
\mathbf{F} = \sum_{a=1}^{8} (\mathbf{x}_a - \bar{\mathbf{x}}) \otimes \nabla_X N_a\big|_{\boldsymbol{\xi}=0},
\qquad
\nabla_X N_a\big|_{\boldsymbol{\xi}=0} = \left(\frac{\xi_a}{4a},\ \frac{\eta_a}{4b},\ \frac{\zeta_a}{4c}\right)
$$

Polar-decompose $\mathbf{F} = \mathbf{R}\,\mathbf{U}$ and keep $\mathbf{R}$. The internal force becomes

$$
\mathbf{f}^{\,e}_{\text{int}} = -\,\mathbf{R}\,\mathbf{K}_e\Big(\mathbf{R}^{\mathsf{T}}(\mathbf{x}_e - \bar{\mathbf{x}}) - (\mathbf{X}_e - \bar{\mathbf{X}})\Big)
$$

which is exactly zero for any rigid motion and reduces to linear elasticity when $\mathbf{R} = \mathbf{I}$.

$\mathbf{R}$ comes from Müller's iterative quaternion method rather than an SVD. With $\mathbf{r}_c$ and $\mathbf{f}_c$ the columns of the current $\mathbf{R}$ and of $\mathbf{F}$, each iteration computes an axis-angle correction

$$
\boldsymbol{\omega} = \frac{\sum_c \mathbf{r}_c \times \mathbf{f}_c}{\left|\sum_c \mathbf{r}_c\cdot\mathbf{f}_c\right| + \epsilon}
$$

and rotates the quaternion by it. Warm-started from the previous step's rotation it converges in one or two iterations, because a brick barely turns in ten microseconds. That warm start is the entire reason this is affordable inside a per-element GPU kernel.

This is a corotational *linear* material: exact for arbitrary rotation, first-order in strain. It is not a large-strain hyperelastic formulation, and it does not need to be — the bricks stay near-elastic, and all the large motion is rigid-body.

## The joints

Zero-thickness interface, with the jump split into normal and tangential parts:

$$
\Delta_n = \Delta\mathbf{u}\cdot\mathbf{n}, \qquad \Delta_s = \Delta\mathbf{u} - \Delta_n\,\mathbf{n}
$$

The elastic stiffnesses come from smearing the real mortar layer over its thickness $t_m$:

$$
k_n = \frac{E_u E_m}{t_m\,(E_u - E_m)}, \qquad k_s = \frac{G_u G_m}{t_m\,(G_u - G_m)}
$$

For 1 GPa mortar in a 12 mm joint that lands around 80 N/mm³, and the value Lourenço and Rots calibrate against the TU Delft shear walls is 82. It is pleasant when a derivation and an experiment agree to two significant figures.

**Mode I** is a bilinear cohesive law driven by $\kappa$, the largest opening the joint has ever reached:

$$
\sigma(\kappa) =
\begin{cases}
k_n\,\kappa, & \kappa \le \delta_0 \\[4pt]
f_t\,\dfrac{\delta_f - \kappa}{\delta_f - \delta_0}, & \delta_0 < \kappa < \delta_f \\[4pt]
0, & \kappa \ge \delta_f
\end{cases}
\qquad
\delta_0 = \frac{f_t}{k_n}, \quad \delta_f = \frac{2\,G_f^{\,I}}{f_t}
$$

$\delta_f$ is chosen so the area under the curve is the fracture energy exactly:

$$
\int_0^{\delta_f}\sigma\,d\kappa = \tfrac12\,f_t\,\delta_f = G_f^{\,I}
$$

Damage is expressed as a loss of secant stiffness, $D = 1 - k_{\text{sec}}/k_n$, which makes unloading run back to the origin instead of retracing the envelope — the difference between a joint that has cracked and a joint that is merely open at this instant.

**Mode II** is Coulomb friction with the cohesion carried away by that same damage:

$$
\left|\boldsymbol{\tau}\right| \;\le\; c\,(1 - D) \;+\; \max(0,\,-\sigma)\,\tan\varphi
$$

evaluated by return mapping: whatever the elastic spring cannot hold becomes permanent slip. **The cap** limits compression to $\sigma \ge -f_c$ and stores the excess closure, so a crushed joint does not spring back to its original thickness.

That cap looks like a formality — reflected blast pressures are 0.1 to 1 MPa and masonry crushes near 10 — and it is not. A wall held top and bottom does not resist by bending, it arches, and an arch concentrates its thrust onto a sliver of joint at each hinge, multiplying the stress by an order of magnitude. Built without the cap, such a wall turned out to be literally unbreakable. It just rang.

### How the interface integral is actually evaluated

This is the honest departure from a textbook interface element, so it deserves saying clearly.

A proper cohesive element interpolates the jump with its own shape functions and evaluates $\int_{\Gamma_j}\Delta\mathbf{u}\cdot\mathbf{T}\,d\Gamma$ by Gauss quadrature over the interface. Here the integral is evaluated *nodally*, with a tributary area $A_p$ at each node pair:

$$
\int_{\Gamma_j} \Delta\mathbf{u}\cdot\mathbf{T}\,d\Gamma \;\approx\; \sum_{p} A_p\;\Delta\mathbf{u}_p\cdot\mathbf{T}_p
$$

That is a Lobatto-type rule whose points sit exactly on the nodes. It diagonalises the interface the same way row-summing diagonalises the mass, and it is what lets a joint be nothing but a list of node pairs with no surface search, no projection and no master–slave pairing. The price is that the traction is piecewise constant around each node rather than interpolated — the same accuracy trade as lumped mass, made for the same reason.

The tributary areas take half weight on a node sitting at its own unit's edge, and the smaller of the two sides is used, so that the areas meeting at a four-brick corner sum to the true joint area rather than double-counting it.

## Time integration

The semi-discrete system is

$$
\mathbf{M}\,\ddot{\mathbf{u}} + \mathbf{f}_{\text{int}}(\mathbf{u}) = \mathbf{f}_{\text{ext}}(t)
$$

integrated by central differences with velocities on half steps:

$$
\mathbf{v}^{\,n+1/2} = \mathbf{v}^{\,n-1/2} + \Delta t\;\mathbf{M}^{-1}\!\left(\mathbf{f}^{\,n}_{\text{ext}} - \mathbf{f}^{\,n}_{\text{int}}\right)
$$

$$
\mathbf{u}^{\,n+1} = \mathbf{u}^{\,n} + \Delta t\;\mathbf{v}^{\,n+1/2}
$$

Because $\mathbf{M}$ is diagonal there is no solve anywhere in the loop — and, more importantly for this problem, the scheme keeps running when elements lose all their stiffness. That is the reason blast and crash codes are explicit: an implicit solver needs a tangent stiffness matrix that stays invertible, and a wall coming apart does not oblige.

The scheme is conditionally stable:

$$
\Delta t \;\le\; \frac{2}{\omega_{\max}}
$$

and $\omega_{\max}$ is measured rather than guessed. The code power-iterates $\mathbf{M}^{-1}\mathbf{K}_e$ for the element's highest natural frequency, and separately bounds the joint springs by $\omega = \sqrt{k\,(1/m_1 + 1/m_2)}$ and the ground penalty by its own frequency; the smallest of the three time steps wins, with a safety factor of 0.7. The familiar Courant reading,

$$
\Delta t \lesssim \frac{L_e}{c_d}, \qquad c_d = \sqrt{\frac{\lambda + 2\mu}{\rho}}
$$

— the time a dilatational wave takes to cross the smallest element — is the same statement, but it is only approximate for a hexahedron, and *which* mechanism governs changes the moment somebody drags the joint-stiffness slider. Getting this wrong does not degrade gracefully; it detonates.

A small mass-proportional damping term $-\alpha\mathbf{M}\mathbf{v}$ uses the half-step velocity, which formally drops that term to first-order accuracy. It is standard practice in explicit codes and the damping is deliberately small — it exists to kill the highest-frequency ringing that lumping the mass introduces, not to model anything.

## The load

The pressure is prescribed rather than solved for. Peak overpressure and positive-phase duration come from the Kinney and Graham closed-form fits in scaled distance $Z = R/W^{1/3}$, the reflected peak from Rankine–Hugoniot, and the history from the modified Friedlander form

$$
p(t) = P_r\left(1 - \frac{t - t_a}{t_d}\right)e^{-b\,(t-t_a)/t_d}
$$

The CONWEP blend gives each face its own pressure by incidence angle, so a face pointing away feels nothing, and arrival times come from integrating $dR/U(R)$ so the front leaves the charge at several times the speed of sound and decays toward it. The drawn shock sphere reads the same table, which is why the picture and the load cannot disagree.

Solving the air instead would be a second solver of comparable size, and the wall's response is the question being asked, not the air's. Every parametric blast study in the literature, and LS-DYNA's own CONWEP loading, does the same thing.

## So — is it really finite element analysis?

Yes, in the way that matters. A Galerkin discretisation of the weak form, isoparametric elements, a Gauss-integrated stiffness, a mass matrix, an interface constitutive law, and a time integrator whose stability limit is derived from the discrete operator rather than assumed. It is the same formulation an explicit blast or crash code uses, and it is checked against closed-form answers rather than asserted.

And here is what it is **not**, stated as plainly:

- **Explicit only.** There is no tangent stiffness assembly, no Newton iteration, no equation solving. None of this would work for a static problem.
- **Corotational linear, not large-strain.** Valid for small strain with arbitrary rotation. There is no hyperelastic material model, no objective stress rate.
- **The interface is integrated nodally**, not by Gauss quadrature with interface shape functions.
- **H8 with full integration locks in bending.** With one or two elements through the thickness, a brick is far too stiff in flexure. It matters less here than it sounds, because a masonry wall's bending compliance comes from joints opening rather than bricks bending — which is physically true — but it is a real limitation, not an absent one.
- **One damage variable couples mode I and mode II**, so the mode II fracture energy is not independently controllable.
- **No fragment-to-fragment contact.** Node-pair contact handles a joint closing back up, which covers the wall's own behaviour; two pieces that fly into each other pass through.
- **The blast is prescribed.** No fluid domain, no clearing, no diffraction around the edges.
- **Bricks are unbreakable.** All damage is in the joints. Real bricks do crack, especially close in.

## Verification, not plausibility

Every one of those claims is only worth as much as the checking behind it, so the demo ships a self-test suite that runs in plain Node with no browser and no GPU. It is a patch test and then some:

- the element's six rigid-body modes produce **no force at all**, and a uniaxial stretch and a simple shear return $(\lambda + 2\mu)\varepsilon$ and $\mu\gamma$ to five decimal places;
- pulling a joint apart peaks at exactly $f_t$ and dissipates exactly $G_f$, then carries no tension and still bears in compression;
- a **simulated triplet shear test** at four confining pressures recovers the cohesion and $\tan\varphi$ it was given, from the fitted failure envelope — the actual laboratory test, run inside the solver;
- linear momentum is conserved to a part in a million over two thousand steps, which is the check that catches an internal force that is not equal and opposite;
- the measured critical time step really is critical: 0.9× is stable and 1.25× diverges;
- and the two claims the demo exists to make get tests rather than screenshots — that the same charge cracks a stack-bonded wall's *head joints* preferentially, 28% of them against 15%, because a cracked stussfuge with another one directly above it has somewhere to run; and that four walls bonded at the corners hold the ends of a façade that a lone wall cannot, 29 mm of end movement against 117 mm.

The first of those is worth dwelling on, because the metric had to be replaced. The obvious measure — how many separate pieces the wall falls into — turned out not to discriminate at all: both bonds shed a couple of stragglers and land on the same number. What the bond decides is not how *much* cracks but *where*, and a test that had been quietly passing on a proxy is not the same as a test that passes on the claim.

That last pair is the point. A simulation that has not been asked to predict something it could have got wrong has not been tested, only run.
