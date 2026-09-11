# Which papers actually join the fields?

The useful answer is **yes, but the combination matters**. These are direct method/application combinations supported by the papers. None establishes a general compressed-sensing shortcut for training arbitrary neural operators.

| Paper | Fields joined | What the bridge actually does |
|---|---|---|
| [DeepVIVONet](https://arxiv.org/abs/2501.04105) | Operator learning + sensor placement + industrial time series | Learns marine-riser vibration reconstruction/forecasting from field data and optimizes sensor placement. Choosing sensors differs from subsampling an already measured integrand. |
| [Kernel Neural Operators](https://arxiv.org/abs/2407.00809) | Operator learning + numerical quadrature | Separates kernel representation from numerical integration, including irregular geometries. This makes integration-rule experiments natural; it does not itself prove compressed-sensing acceleration. |
| [Quadrature-aware complex-linear acoustics](https://arxiv.org/abs/2607.04407) | Operator learning + quadrature + acoustics | Learns a boundary-to-field map with explicit integration weights and complex linearity. Node minimization is a further question. Recent preprint. |
| [Planning Neural Operators](https://arxiv.org/abs/2410.17547) | Operator learning + robotics + planning | Maps spatial costs to value functions, including manipulator planning. The output is a planning object, not a physical dynamics simulator. |
| [Soft-robot actuation-to-shape operators](https://arxiv.org/abs/2602.18655) | Operator learning + continuum robotics + inverse kinematics | Predicts an entire shape and differentiates through it for task objectives. The inspected demonstrations are model-based. Recent preprint. |
| [Neural Inverse Operators](https://arxiv.org/abs/2301.11167) | Operator learning + inverse problems | Combines operator architectures to learn inverse mappings. Inverse accuracy still depends on the data and problem conditioning. |
| [FourCastNet](https://arxiv.org/abs/2202.11214) | Spectral operator methods + global weather | Reuses a trained forecast map; the advantage concerns inference and ensemble generation, with substantial training/data costs upfront. |
| [Learning with nonlinear model classes](https://proceedings.mlr.press/v235/adcock24a.html) | Sampling theory + nonlinear learning + compressed sensing | Unifies several model/measurement settings; provides theory to investigate learning efficiency, not an off-the-shelf accelerated operator trainer. |

The **Fourier neural operators** field highlights the original FNO, spherical FNO, U-FNO, GINO, AFNO-based FourCastNet, seismic and electromagnetic applications, inverse operators and FNO numerical analysis. It includes related Fourier-operator variants; a generic frequency-domain model is not automatically an FNO. FourCastNet 3 and Neural Fourier Modelling remain separate unless their specific relationship is selected.

The map has no directly established neural-operator–VLA bridge in this collection. [V-JEPA 2](https://arxiv.org/abs/2506.09985) connects video representation learning and action-conditioned robot planning, while [Dreamer](https://arxiv.org/abs/2301.04104) connects learned latent dynamics with control. A continuous-field operator could supply physical predictions inside such a system; that is an architectural research proposal, not a demonstrated equivalence.

The closest proposed bridge to your integration idea is **KNO + empirical cubature**. [CECM](https://arxiv.org/abs/2308.03877) selects weights and locations for reduced integral evaluation; [manifold-adaptive cubature](https://arxiv.org/abs/2609.03068) makes weights state-dependent. Applying those techniques to a learned kernel's integrand family is worth testing. The graph labels this connection as an analyst hypothesis, separately from bibliography citations.

For that experiment, compare fixed weighted subsampling, empirical cubature and appropriate classical quadrature against a dense evaluation of the same frozen operator. Count rule-selection overhead, test unseen fields and sensor grids, and report physical-reference error separately. The initial question is whether the integration cost can be reduced without materially changing the learned model's answer.
