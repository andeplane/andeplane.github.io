# Reading routes

The catalog is deliberately broader than a first reading list. Use one route at a time; follow graph connections when a question arises. All recommendations below are editorial judgments, not claims that the papers establish a complete thesis method.

## Fast orientation

1. [Principled architectures](notes/principled-2026.md): retain the function/measurement/discretization distinction.
2. [Short theory tour](notes/theory-tour-2026.md): learn what expressivity and statistical guarantees do and do not say.
3. [KNO](notes/kno-2024.md): examine an architecture where quadrature is an explicit design choice.
4. [DeepVIVONet](notes/deepvivonet-2025.md): inspect a concrete sparse industrial-sensing application.
5. [PNO](notes/pno-2024.md): inspect a direct robotics application with a different learned map.
6. [V-JEPA 2](notes/vjepa2-2025.md): compare against the action-conditioned world-model paradigm.

## Faster inference through smart integration

[EIM](notes/eim-2004.md) → [DEIM](notes/deim-2009.md) → [empirical cubature](notes/ecm-2017.md) → [continuous cubature](notes/cecm-2023.md) → [KNO](notes/kno-2024.md) → [FNO discretization error](notes/fno-discretization-2024.md).

Then inspect [LearnQuad](notes/learnable-quadrature-2025.md), [quadrature-aware acoustics](notes/acoustic-quadrature-2026.md), and the early [adaptive-weight cubature preprint](notes/adaptive-cubature-2026.md). Ask which integral each paper actually approximates, whether points may move, and whether selection cost is paid offline or per prediction.

## Fewer training examples or cheaper fitting

[Stable compressed sensing](notes/stable-cs-2005.md) → [sparse operator identification](notes/sparse-operators-2012.md) → [2017 polynomial seed](notes/cs-polynomials-2017.md) → [optimal sampling](notes/optimal-sampling-2024.md) → [nonlinear sampling framework](notes/nonlinear-sampling-2024.md) → [operator sample complexity](notes/operator-sampling-2024.md).

Keep ordinary/ridge regression, sparse regression, and neural fitting separate. [SINDy](notes/sindy-2015.md) and [multiscale frame kernels](notes/frame-kernel-2026.md) broaden the comparator set, but their targets and assumptions differ.

## Industrial sensing and time histories

[DeepVIVONet](notes/deepvivonet-2025.md) → [Neural Fourier Modelling](notes/nfm-2024.md) → [manufacturing distortion](notes/manufacturing-2025.md) → [U-FNO](notes/u-fno-2021.md).

Record what is measured, what is simulated, which operating conditions are held out, and whether transfer requires refitting. For data access, ask for complete experimental runs and sensor coordinates rather than just a large timestamp count.

## Robotics and world models

[PNO](notes/pno-2024.md) and [soft-robot shape control](notes/soft-robot-2026.md) show direct operator applications. Compare them with [Graph Network Simulator](notes/gns-2020.md), [World Models](notes/world-models-2018.md), [DreamerV3](notes/dreamerv3-2023.md), and [V-JEPA 2](notes/vjepa2-2025.md).

Classify each learned object: value function, shape map, physical transition, latent transition, or policy. These are not interchangeable. Read [V-JEPA 2.1](notes/vjepa21-2026.md) as a recent representation-learning continuation, not as a neural-operator successor.

## Broader application and foundation-model landscape

[FourCastNet](notes/fourcastnet-2022.md) → [SFNO](notes/sfno-2023.md) → [FourCastNet 3](notes/fourcastnet3-2025.md); then [GINO](notes/gino-2023.md), [electromagnetic design](notes/em-design-2023.md), [NIO](notes/nio-2023.md), [Poseidon](notes/poseidon-2024.md), and [LatentDDM](notes/composition-2026.md).

For implementation/data orientation use [NeuralOperator](notes/neuralop-library-2024.md), [PDEBench](notes/pdebench-2022.md), and [The Well](notes/well-2024.md). Start with a subset rather than treating a complete large benchmark or pretraining pipeline as the thesis.
