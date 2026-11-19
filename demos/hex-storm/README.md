# Hex Storm

Saturn's north-polar hexagon, emerging from two-dimensional fluid dynamics on a rotating
polar cap. Everything — the vorticity solver, the FFT Poisson solve, the cloud tracer and
the rendering — runs in WebGPU compute and fragment shaders.

Nothing in the code draws a hexagon. An eastward jet is forced at the latitude of the real
one, it is barotropically unstable, and the fastest-growing wave around the ring has six
crests. Widen the jet and you get a pentagon or a square; narrow it and you get seven or
eight sides — the same ladder Aguiar, Read et al. climbed in a rotating water tank in 2010.

## Model

    ∂ζ/∂t + J(ψ, ζ) = 2γ r u_r + ν∇²ζ − α(ζ − ζ_jet(r)) − σ(r) ζ,    ∇²ψ = ζ

Arakawa Jacobian, FFT Poisson solve using the discrete-Laplacian eigenvalues, SSP-RK3.
See `docs/plan.md` and `docs/adr/` for the decisions and their alternatives.

## Run

    npm install
    npm run dev          # http://localhost:5173/demos/hex-storm/
    npm run build        # tsc --noEmit && vite build
    npm run reference -- 256 24 jetWidth=0.07 relax=1.2   # CPU reference, prints the mode spectrum over time

The page exposes `window.__hexStorm` (`run(frames, stepsPerFrame)`, `setParams`, `reset`,
`snapshot()`) for scripted experiments and screenshots.
