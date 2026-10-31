# Thesis shortlist — 14 September 2026

Scope: 15 ECTS autumn introduction, followed by 30 ECTS spring thesis. These are candidate questions, not verified claims that no one has tried them. The focused search found substantial prior work on sparse field reconstruction, motor thermal operators and structural sensing.

## Recommended: thermal monitoring with changing sensor layouts

**Question:** Can one coordinate-aware operator reconstruct a two-dimensional temperature field and locate hotspots when sensor count, locations and availability change, with better accuracy/cost than simpler baselines?

**Autumn:** Use one fixed two-dimensional plate geometry motivated by a stator surface or component wall. Generate conventional transient heat-conduction simulations with variable source position/strength and cooling conditions. Input is a set of coordinates, temperatures and, if needed, a short time history; output is temperature at requested coordinates. Include operating inputs if they materially affect identifiability. Hold out complete simulated trajectories, source configurations and sensor layouts; never split adjacent frames randomly across training/test. Compare interpolation, POD/gappy-POD or a sparse hotspot dictionary, a masked CNN, and one variable-input operator. Measure field error, maximum-temperature error, hotspot location, performance versus sensor count, noise and sensor dropout, parameter count and actual inference latency. A denser output grid is not additional observed information. Random input sets require a meaningful sensor encoding; arbitrary points are not directly interchangeable with an FFT grid.

**Deliverable:** Reproducible simulator, one operating-condition dataset, baseline comparison and a go/no-go decision about the operator. A negative result is useful. Avoid full three-dimensional motor multiphysics, control, adaptive sensor design and edge deployment simultaneously.

**Spring:** Choose one main extension: (a) stator sector/cylindrical geometry plus a small physical thermal rig and model mismatch; (b) adaptive selection of the next sensor to improve hotspot estimation; or (c) uncertainty-aware estimation and a small control demonstration. Match claims to independently validated data. An industrial partner is helpful for spring, not a dependency for autumn.

**Prior art:** [RecFNO](notes/recfno-2023.md) already reconstructs sparse thermal fields; [Li's motor thesis](notes/motor-thermal-li-2026.md) already predicts 2D motor temperatures with an FNO; [Bazzo et al.](notes/stator-sparse-2016.md) supplies a particularly relevant sparse-recovery baseline and physical stator motivation. The proposed gap is the carefully scoped changing-sensor and operational task, not first neural thermal monitoring.

## Alternative: mobile sensing of a 2D tracer field

Use a simple advection–diffusion simulator for concentration in a harbour-like domain, with one moving virtual sensor or a fleet. Coordinates and timestamps of observations matter: measurements along a trajectory are not a simultaneous snapshot. Autumn should reconstruct the present field from known sparse histories; spring could choose sampling trajectories or couple estimation to a controller. Compare to an appropriate interpolation/GP or reduced-order assimilation baseline. [Asefi et al.](notes/lagrangian-assimilation-2025.md) shows neural operators with diffusion models for sparse Lagrangian ocean assimilation, so novelty must be narrower. NTNU AWAS is an institutional example of adaptive water sampling, not evidence of guaranteed supervision or data access.

## Alternative: structural-panel virtual sensing

Reconstruct a 2D displacement/velocity or frequency-response field from a changing set of accelerometers. Start with a simple plate and known excitation, retaining complex phase when working in frequency space. Measure reconstruction near resonance, spatial blind spots and dropout sensitivity. [Learning to Predict Structural Vibrations](notes/vibrating-plates-2023.md) provides an established forward benchmark and public code/data links, but the published data are large. [Gan et al.](notes/structures-distributed-2025.md) already addresses sparse structural force identification. A narrow layout-generalization study is plausible, not a verified first application.

## Resources and access

- RecFNO code and heat-data links: https://github.com/zhaoxiaoyu1995/RecFNO . External data download access not tested.
- Vibrating plates benchmark: https://github.com/ecker-lab/Learning_Vibrating_Plates . Dataset links documented; full dataset not downloaded.
- Simple heat/advection-diffusion simulations can be generated with a verified finite-difference/finite-volume implementation; check mesh and timestep convergence before treating it as ground truth.
- [Ventilation operator control](notes/ventilation-control-2025.md) is relevant prior art, so generic first-use ventilation claims would be incorrect.

All literature changes are local. No publication or deployment is implied.
