# ADR 0002 — FFT Poisson solve, Arakawa Jacobian, SSP-RK3

**Status:** accepted

## Decision

- **Poisson by FFT.** ψ = ∇⁻²ζ on a periodic N×N grid, dividing by the eigenvalues of
  the 5-point Laplacian so that ∇²_FD ψ = ζ holds exactly — the identity the Arakawa
  conservation properties rely on.
  Each row/column transform runs in one workgroup with the data in shared memory
  (N ≤ 1024 complex values), so a full solve is four compute dispatches — cheap enough for
  three solves per time step.
- **Arakawa Jacobian** for advection. It conserves energy and enstrophy in the
  semi-discrete limit, which is what lets a wave sit on the jet for hundreds of laps
  instead of numerically bleeding away.
- **SSP-RK3**, CFL 0.4 on the peak speed. Small ν (cell Reynolds number ≈ 20) for
  grid-scale control.
- The **CPU reference** (`tools/reference.ts`) is the same algorithm in TypeScript; the
  GPU is only a faster way to run it.

## Alternatives

- Multigrid — comparable accuracy, far more code; FFT is a better fit for a periodic box.
- Jacobi with warm start — fails on long waves (see ADR 0001).
- Leapfrog + Robert–Asselin — the classic pairing with Arakawa, one solve per step, but
  the filter damps exactly the slow modes we care about.
