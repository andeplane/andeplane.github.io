# Neural operators, sparse computation, and physical world models

Research snapshot: **10 September 2026**. This is a curated literature overview for later master's-thesis scoping, not an exhaustive systematic review or a claim that the proposed combinations are novel. Primary papers, their public manuscripts, and author/institution pages were used. No experiments or reported speedups were independently reproduced.

**Main assessment:** the most useful intersection for this project is between operator learning and established numerical methods for reducing measurements and computation. Robotics supplies concrete applications, but neural operators and modern video/latent world models are overlapping research interests rather than one established architecture family.

Start with the [interactive knowledge graph](graph/index.html), [complete catalog](CATALOG.md), or [short reading routes](READING-ROUTES.md). Each catalog entry links to a public primary source and an annotated reading note. Public sources may offer a PDF; collected private copies are not hosted here.

## New to these ideas?

Start with the [interactive concepts](concepts.html), then read the [FNO note](notes/fno-2020.md), and only then follow a specialized reading route. Keep one example in mind: a temperature field now → a temperature field after heat has spread.

- A **field** assigns a value to every location; a grid records finitely many samples of it.
- An **operator** maps a whole function or field to another one. A neural operator learns such a map from examples.
- A **PDE** (partial differential equation) relates a field’s changes in space and time. A numerical solver approximates its solution.
- **Quadrature** approximates an integral by a weighted sum; **cubature** usually refers to the multidimensional version.
- **Reduced-order modelling** uses a smaller representation. **Hyper-reduction** also reduces the work needed to evaluate its equations.
- A **surrogate** approximates a more expensive model. A **foundation model** is pretrained for reuse across tasks; transfer must still be tested.

For each note, ask: what is the input, what is predicted, what data or assumptions make that possible, and what evidence supports the claimed improvement? “Abstract screened” means a first-pass reading, not a full technical review.

## 1. What the four seed papers establish

| Seed | Role in the collection | What to read next |
|---|---|---|
| [Adcock, Brugiapaglia, Webster: sparse polynomial approximation](https://arxiv.org/abs/1703.06987) | Structured sparsity makes some high-dimensional approximation problems tractable. | Optimal sampling; nonlinear model-class sampling; operator sample complexity. |
| [Kovachki and colleagues: neural operator foundations](https://arxiv.org/abs/2108.08481) | Function-space architectures, integral interactions, and efficient parameterizations. | FNO discretization error; KNO; geometry-aware and pretrained models. |
| [FourCastNet](https://arxiv.org/abs/2202.11214) | A large-scale weather application and the value of cheap repeated inference. | Spherical FNO and probabilistic FourCastNet 3. |
| [Berner and colleagues: principled architectures](https://www.nature.com/articles/s42256-026-01267-z) | Coordinates, integration, and discretization consistency as architectural design principles. | Quadrature-aware kernels, numerical-error analysis, and empirical cubature. |

The last seed was published in the journal on **3 July 2026**, following a [12 June 2025 preprint](https://arxiv.org/abs/2506.10973). Most 2024–2026 papers below are developments around its subject, not papers demonstrated to descend from it. Its reference list provides several verified citation edges in the graph. The longer foundations paper was first posted in 2021 and published in **JMLR 24(89), 2023**; a stale journal header in the supplied arXiv PDF is not the authoritative publication date. [JMLR record](https://jmlr.org/papers/v24/21-1524.html)

## 2. The historical paths converge, but remain distinct

**Operator approximation:** Chen and Chen's 1995 theorem predates modern deep operator learning. DeepONet (2019 preprint; later journal publication) made a branch/trunk construction practical. Graph Kernel Networks and FNO followed in 2020, then a broader mathematical and architectural framework. These establish ways to represent operators, not automatic guarantees of fast optimization or few-sample generalization. [Chen and Chen](https://pubmed.ncbi.nlm.nih.gov/18263379/), [DeepONet](https://arxiv.org/abs/1910.03193), [Graph Kernel Network](https://arxiv.org/abs/2003.03485), [FNO](https://arxiv.org/abs/2010.08895)

**Sparse recovery and identification:** stable compressed sensing supplies recovery conditions for sparse unknowns under informative measurements. Sparse operator identification applies related reasoning to structured linear operators. SINDy fits sparse candidate evolution laws. The 2017 seed concerns structured sparse polynomial approximation. These are related alternatives to unconstrained neural fitting, but recovering a signal, identifying a linear operator, identifying an evolution law, and learning a finite-horizon solution map are different tasks. [Stable recovery](https://arxiv.org/abs/math/0503066), [Sparse operator identification](https://arxiv.org/abs/1209.5187), [SINDy](https://arxiv.org/abs/1509.03580)

**Reduced evaluation:** empirical interpolation (2004), DEIM (2009 technical report / 2010 journal article), and empirical cubature (2017) address a problem that remains relevant: reducing a model's state dimension does not necessarily reduce the cost of evaluating its nonlinear terms. Carefully chosen samples, bases, and integration weights can remove that bottleneck. This literature should be a baseline for the proposed neural-operator acceleration, not rediscovered under a new neural label. [EIM](https://www.mit.edu/~cuongng/publication/pub1/), [DEIM journal article](https://epubs.siam.org/doi/10.1137/090766498), [Empirical cubature](https://www.sciencedirect.com/science/article/pii/S004578251631355X)

## 3. What happened after the sparse-polynomial seed?

Three particularly useful continuations are:

- **Approximation-space-aware sampling.** Adcock's *Optimal sampling for least-squares approximation* explains Christoffel-based weighted sampling, where sample locations are tailored to the space being fitted. This offers a principled alternative to arbitrary uniform/random sampling. [Paper](https://arxiv.org/abs/2409.02342)
- **More general model and measurement classes.** Adcock, Cardenas and Dexter unify learning with nonlinear model classes from linear measurements, including compressed sensing and active regression. It is a bridge toward learned models, rather than a ready-made neural-operator implementation. [ICML 2024 paper](https://proceedings.mlr.press/v235/adcock24a.html)
- **Limits for operator learning.** Adcock, Griebel and Maier study Lipschitz operators under Gaussian measures. The downloaded September 2026 revision is titled *The Sample Complexity of Learning Lipschitz Operators with respect to Gaussian Measures*, different from older search snippets. It establishes demanding worst-case limits, even allowing adaptive linear measurements. This does not preclude practical gains on a structured physical family; it tells us why such structure must be specified. [Current manuscript](https://arxiv.org/abs/2410.23440)

Brugiapaglia, Franco and Nelsen's short 2026 theory tour connects approximation rates and statistical limitations. It is a useful orientation before choosing a theory-heavy project. [Theory tour](https://arxiv.org/abs/2603.00819)

The practical lesson is to distinguish **sampling different input functions for training** from **sampling spatial points within one input function**. An optimal strategy for the former is not automatically an optimal quadrature rule for the latter.

## 4. What is closest to our smart-integration idea?

**Continuous Empirical Cubature (2023)** optimizes both weights and locations. It directly addresses representing a family of integrals with a small rule. Movable quadrature nodes require the ability to evaluate the integrand there; installed industrial sensors may not permit this. [CECM](https://arxiv.org/abs/2308.03877)

**Kernel Neural Operators (first posted 2024, substantially revised June 2026)** explicitly separate kernel choice from numerical integration and support irregular geometry. This makes them a particularly relevant testbed. The paper's parameter-efficiency results should not be interpreted as measured savings from sparse quadrature. [KNO](https://arxiv.org/abs/2407.00809)

**PINNs with Learnable Quadrature (NeurIPS 2025)** learns rules for evaluating physics-informed training losses. It also considers a family-of-PDEs extension using hypernetworks. It is relevant prior art, but its main target is the loss integral, not the forward integral layer of a frozen neural operator. [LearnQuad](https://papers.neurips.cc/paper_files/paper/2025/hash/382b95a6580cfb0b5ca33c74b4e0e770-Abstract-Conference.html)

**Quadrature-aware complex-linear acoustics (July 2026 preprint)** makes weighted surface integration explicit in a learned boundary-to-field map. It is very close to the coordinate-aware kernel formulation, while exploiting known physical linearity. It does not settle the question of selecting a minimal set of nodes. [Acoustic operator](https://arxiv.org/abs/2607.04407)

**Manifold-adaptive cubature (September 2026 preprint)** allows weights to depend on latent state and reports substantial point reductions in two reduced finite-element examples. The natural research hypothesis is to try related state-dependent rules for neural-operator integrands. That transfer has not been established by the evidence collected here. [Adaptive cubature](https://arxiv.org/abs/2609.03068)

**Multiscale frame kernels (August 2026 preprint)** offer a coefficient-space operator representation and another structured alternative to common architectures. This is worth watching for the sparse-basis branch, but a multiscale representation is not automatically sparse or recoverable from few sensors. [Frame kernel method](https://arxiv.org/abs/2608.25084)

For comparison, classical Gaussian quadrature is designed to integrate polynomial spaces accurately; it applies to the entire integrand, not just the learned kernel. Adaptive rules need an error indicator and a way to obtain additional evaluations. [NIST numerical reference](https://dlmf.nist.gov/3.5)

The following costs should stay separate in future experiments:

| Decision | What becomes cheaper? | Information needed |
|---|---|---|
| Select training functions/experiments | Label generation and possibly fitting | A way to choose informative physical inputs |
| Select physical sensors | Measurement acquisition | Freedom to place or move instruments |
| Select existing samples for integration | Kernel evaluation after acquisition | Already available field samples and coordinates |
| Fit sparse basis coefficients | Representation and optimization | A useful dictionary and recoverability assumptions |
| Adapt quadrature per prediction | Potentially integration itself | A cheap selection/error mechanism; its overhead must be counted |

A decisive evaluation distinguishes error against the **densely evaluated learned model** from error against the **physical reference**. FNO discretization analysis provides a useful theoretical companion: parameter sharing across grids is not freedom from finite-grid error. [Discretization error](https://arxiv.org/abs/2405.02221)

## 5. Applications beyond weather

| Application | Concrete evidence in this collection | Interpretation |
|---|---|---|
| Vehicle aerodynamics | [GINO](https://arxiv.org/abs/2309.00583): geometry-to-flow/pressure prediction | Variable-geometry design surrogate; dataset-specific transfer |
| CO2 storage / porous media | [U-FNO](https://arxiv.org/abs/2109.03697): pressure and saturation during injection | Repeated subsurface simulations; physics represented through training examples |
| Seismology | [Seismic operators](https://arxiv.org/abs/2108.05421): wave propagation and inversion | Fast forward evaluation supports estimation; surrogate error may bias inversions |
| Electromagnetic design | [Free-form inverse design](https://arxiv.org/abs/2302.01934) | Repeated optimization queries; validate final candidates with the original solver |
| Offshore structural monitoring | [DeepVIVONet](https://arxiv.org/abs/2501.04105): marine-riser vibration reconstruction, forecasting and sensor placement | Especially relevant because the study uses field data and compares with POD-based placement |
| Additive manufacturing | [Distortion prediction](https://arxiv.org/abs/2511.13178): thermal history to future deformation | Data are generated by an experimentally validated FEM model; not evidence of autonomous factory deployment |
| Biomedical acoustics | [Focused ultrasound DeepONet](https://arxiv.org/abs/2412.16118): pressure fields in heterogeneous anatomy | Simulation-based research; no inference of clinical readiness |
| Generic time series | [Neural Fourier Modelling](https://arxiv.org/abs/2410.04703): frequency-domain analysis and sampling-rate tests | Adjacent baseline, not proof that operator methods dominate ordinary forecasting |

For industrial time series, operator learning becomes especially motivated when the data describe fields, distributed physical responses, varying sampling rates, or variable geometry. A fixed set of heterogeneous tags does not become a spatial field merely by assigning each channel an index. Strong linear/state-space and sequence-model baselines remain necessary.

## 6. Weather: what changed after FourCastNet?

Spherical FNO changes the geometry of spectral processing and examines long autoregressive behavior. FourCastNet 3 moves toward probabilistic ensembles using spherical convolution and geometric modeling. The latter should not be described as the original AFNO architecture simply scaled up. [SFNO](https://arxiv.org/abs/2306.03838), [FourCastNet 3](https://arxiv.org/abs/2507.12144)

This illustrates a wider direction: moving from a fast one-step predictor to a reusable system whose geometry, uncertainty, long-run statistics, and computational costs are evaluated. Stable spectra after many steps are distinct from accurate deterministic forecasts at that horizon. Inference speedups must be separated from data preparation, training, and complete operational pipelines.

## 7. Robotics and world models: three different connections

**Planning operators are already a concrete robotics application.** PNO learns a map from a spatial cost function to a value function using the Eikonal formulation. Its ICLR 2025 paper includes 4-DOF manipulator planning and uses predicted values as search heuristics. This is a planning map, not a learned model of how manipulated objects physically move. [PNO](https://arxiv.org/abs/2410.17547)

**Physical shape operators are a direct route to soft robotics.** Veil, Flaschel, Kuhl and Della Santina learn a differentiable actuation-to-shape map and compose it with task maps for inverse kinematics. The inspected examples are analytical/model-based. This is useful evidence for a simulation-first soft-robot project, not proof of general hardware transfer. [Soft-robot operator](https://arxiv.org/abs/2602.18655)

**Action-conditioned world models are a related but distinct branch.** Ha and Schmidhuber's World Models and Dreamer learn latent predictive environments for control. V-JEPA 2 combines video pretraining with robot-action-conditioned post-training for planning. V-JEPA 2.1 develops denser visual features and evaluates downstream tasks. These are not FNO models. [World Models](https://arxiv.org/abs/1803.10122), [DreamerV3](https://arxiv.org/abs/2301.04104), [V-JEPA 2](https://arxiv.org/abs/2506.09985), [V-JEPA 2.1](https://arxiv.org/abs/2603.14482)

A neural operator **could be the physical prediction component** of a world model when state and actions describe continuous fields. A useful system would still need state estimation, action conditioning, treatment of uncertainty and partial observation, and a planning/control mechanism. Graph Network Simulators supply a strong adjacent baseline for particles and deformable materials. The proposed combination is a research hypothesis, not an established equivalence. [Graph Network Simulator](https://arxiv.org/abs/2002.09405)

V-JEPA 2 also illustrates why demonstration details matter: its action-conditioned model uses robot interaction data, and its limitations discuss camera position and long-horizon prediction. “Zero-shot deployment” should not be read as “no robot training data.” For any robotics thesis, measure task success and robustness as well as prediction error.

## 8. Where the field appears to be heading

These are **synthesis judgments from the selected papers**, not an exhaustive ranking of current research:

1. **From one PDE family to reusable pretrained models.** Poseidon demonstrates transfer-oriented pretraining. LatentDDM explores a different route: freeze local models and learn their composition for new settings. The latter is a very recent preprint. [Poseidon](https://arxiv.org/abs/2405.19101), [LatentDDM](https://arxiv.org/abs/2609.03069)
2. **From fixed grids to geometry-aware and numerically controlled computation.** GINO, KNO, the principled seed, and FNO error analysis illustrate this direction. Resolution transfer needs an explicit measurement and numerical-error story.
3. **From dense expensive evaluation to structured computation.** Cubature, factorization, local models, and multiscale representations offer complementary savings. Parameter count, sample count, floating-point work, and latency should not be used interchangeably.
4. **From deterministic snapshots to uncertain trajectories and decisions.** Probabilistic weather, inverse problems, and world-model planning all expose the limits of average one-step error.
5. **From familiar synthetic benchmarks to wider physical behavior and real observations.** PDEBench and The Well improve benchmark coverage, while DeepVIVONet supplies a relevant field-data example. Each solves a different validation need. [PDEBench](https://arxiv.org/abs/2210.07182), [The Well](https://arxiv.org/abs/2412.00568)

## 9. What remains uncertain, and what would inform later thesis choices?

The collection supports investigating **accuracy-preserving reduction of integration work**, but not promising a universal speedup. Questions still needing a targeted novelty check and feasibility experiment include:

- Does a rule trained on one integrand family survive changes in input spectrum, sensor layout, or physical regime?
- Can error estimation or adaptive selection be cheaper than the kernel evaluations it saves?
- Are the gains from operator learning, from a low-rank representation, or simply from replacing a poor baseline quadrature rule?
- How do positive weights, stability, and noisy observations interact for nonlinear temperature-conditioned integrands?
- Does a faster learned predictor improve planning/control once state estimation and optimization overhead are included?
- Can a model learn from a few real sensors when complete training labels only exist in simulation?

A sensible first feasibility experiment is a frozen, modest-size integral model with dense-reference predictions, a fixed-sensor branch and a freely-queryable branch, and several classical integration baselines. That does not commit the thesis to this topic; it tests whether the central computational opportunity exists before adding industrial or robotic complexity.

See [people and groups](PEOPLE.md) for research communities to follow. The graph records paper authorship, not inferred current affiliations or a ranking of lab quality. See [research provenance](RESEARCH-LOG.md) for coverage, access limitations, review depth, and version handling.
