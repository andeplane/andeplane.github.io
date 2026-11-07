# Hex Storm — plan

**Goal.** A browser simulation in which Saturn's north-polar hexagon *emerges* from fluid
dynamics — nothing in the code draws a hexagon — running entirely on WebGPU, with an
onboarding tour that explains what is on screen. Published as a demo on andeplane.github.io
with a companion blog post.

## Model (see ADR 0001)

Two-dimensional incompressible flow on a polar cap, written in vorticity–streamfunction
form on a "γ-plane" (Coriolis parameter f = f₀ − γr², the polar analogue of the β-plane):

    ∂ζ/∂t + J(ψ, ζ) = 2γ r u_r + ν∇²ζ − α(ζ − ζ_jet(r)) − σ(r) ζ,   ∇²ψ = ζ

- `J` — advection of vorticity by its own flow (Arakawa Jacobian, conserves energy and
  enstrophy so long-lived structures survive).
- `2γ r u_r` — the planetary-vorticity gradient: parcels moving away from the pole gain
  relative vorticity. This is what makes Rossby waves.
- `α(ζ − ζ_jet)` — Rayleigh relaxation toward an eastward Gaussian jet at radius R0 plus a
  small polar vortex. Stands in for whatever deep process on Saturn drives the jet.
- `σ(r)` — a sponge at the edge of the cap.

The jet is barotropically unstable (Rayleigh–Kuo: β − ū'' changes sign on its flanks).
The fastest-growing sinuous mode has wavelength ≈ 2π × jet width / 0.9, so the azimuthal
wavenumber m ≈ 0.9 R0 / L. The jet width slider therefore selects the polygon — exactly the
knob Aguiar et al. (2010) turned in the rotating tank.

## Numerics (see ADR 0002)

- Uniform N×N grid on [−1,1]², periodic; the physical cap is the disc r < 0.9 and the
  sponge kills everything outside it.
- Poisson solve by FFT, using the discrete-Laplacian eigenvalues so that ∇²_FD ψ = ζ to
  round-off. Each 1D FFT of length N runs in one workgroup's shared memory, so a whole
  solve is four dispatches.
- SSP-RK3 in time, CFL 0.4.
- A CPU reference (`tools/reference.ts`) implements the same discretisation in plain
  TypeScript for validation and tuning.

## Visuals (see ADR 0003)

- Cassini mode: a passive cloud tracer, continuously re-seeded with fine noise and
  advected semi-Lagrangian, so streaks form along streamlines like the real cloud
  decks. Shaded with the local vorticity and a fake relief light.
- Vorticity and speed colour maps, streamline (ψ-contour) overlay.
- A live azimuthal spectrum of vorticity around the jet, read back from the GPU, gives
  the number of sides as a number rather than something the eye has to decide.
- Mouse: drag to stir in a storm.

## Delivery

- `demos/hex-storm/` (this directory), `src/content/projects/hex-storm.ts`,
  `public/projects/hex-storm/preview.png`, `src/content/blog/…hex-storm….md`.
- Branch + PR; the site auto-deploys from `main`.
