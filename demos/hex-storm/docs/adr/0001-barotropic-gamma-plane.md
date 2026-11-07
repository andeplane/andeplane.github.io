# ADR 0001 — 2D barotropic vorticity on a polar γ-plane

**Status:** accepted

## Context

Saturn's hexagon is thought to be a stationary Rossby-wave meander of the ~100 m/s
eastward jet at 78°N, born from the jet's own shear instability. Full explanations
(Morales-Juberías et al. 2015) need a stratified, three-dimensional atmosphere, but the
polygon itself was reproduced in a rotating water tank by Aguiar et al. (2010) with nothing
but a differentially-rotating shear layer — a barotropic mechanism.

## Decision

Simulate the tank, not the atmosphere: 2D incompressible flow, vorticity–streamfunction
form, Coriolis parameter f = f₀ − γr² (the constant f₀ has no effect in 2D barotropic flow
and is dropped), an eastward jet maintained by Rayleigh relaxation, a sponge at the cap
edge. Saturn's numbers give γ ≈ 5.3 in the model's units, which turns out to be a
modest correction: the polygon count is set by the jet width.

## Alternatives

- Shallow-water on the sphere — closer to the planet, but the free surface adds gravity
  waves that force a much smaller time step and a spherical grid needs pole treatment.
  The extra physics does not change what the user sees.
- Velocity–pressure "stable fluids" with Jacobi projection — easy, but Jacobi never
  converges on the long wavelengths that Rossby dynamics live on, and semi-Lagrangian
  advection smears the instability.
- Lattice-Boltzmann — attractive on GPU, but the Coriolis term and the low-Mach limit are
  awkward, and it is a worse fit for a vorticity readout.

## Consequences

The model cannot say anything about the vertical structure or why the real hexagon is
stationary rather than drifting; the blog post states this. In exchange every term in the
equation is one line of WGSL and the whole system can be verified against a CPU reference.
