/**
 * Physical parameters of the polar-cap model, shared by the GPU solver and the CPU
 * reference in tools/reference.ts.
 *
 * Units: the jet's peak speed is 1 and the box is [-1, 1]². The jet sits at radius R0,
 * which stands for Saturn's 78°N. Time unit = (R0 / 0.55) × 2.2·10⁷ m / 100 m s⁻¹
 * ≈ 61 hours, so one jet lap (2πR0 ≈ 3.5) is about nine Saturn days.
 */
export interface Params {
  /** Jet radius — the latitude of the hexagon. */
  jetRadius: number;
  /** Gaussian half-width of the jet. This is what picks the number of sides. */
  jetWidth: number;
  /** Peak jet speed (eastward = counter-clockwise seen from above the north pole). */
  jetSpeed: number;
  /** Polar-cap γ: f = f₀ − γ r². Saturn ≈ 5.3 in these units. */
  gamma: number;
  /** Polar vortex peak speed at the very centre (the eye in Cassini's images). */
  poleSpeed: number;
  /** Polar vortex radius. */
  poleRadius: number;
  /** Rate at which the flow is nudged back toward the target jet (deep forcing). */
  relax: number;
  /** Kinematic viscosity. */
  nu: number;
  /** Radius beyond which the sponge kills motion (edge of the simulated cap). */
  capRadius: number;
  /** Sponge strength at the box edge. */
  spongeRate: number;
  /** Amplitude of the seed noise added to the initial vorticity. */
  seedNoise: number;
}

export const DEFAULT_PARAMS: Params = {
  jetRadius: 0.55,
  jetWidth: 0.08,
  jetSpeed: 1,
  gamma: 5.3,
  poleSpeed: 0.6,
  poleRadius: 0.12,
  relax: 1.2,
  nu: 2e-4,
  capRadius: 0.9,
  spongeRate: 30,
  seedNoise: 0.02,
};

/** Target azimuthal velocity profile u_θ(r): the jet plus the polar vortex. */
export function targetAzimuthal(r: number, p: Params): number {
  const s = (r - p.jetRadius) / p.jetWidth;
  const jet = p.jetSpeed * Math.exp(-s * s);
  const q = r / p.poleRadius;
  // Solid-body core that rolls off: u = U·(r/Rp)·exp(1/2 − q²/2), peak U at r = Rp.
  const pole = p.poleSpeed * q * Math.exp(0.5 - 0.5 * q * q);
  return jet + pole;
}

/** Vorticity of the target profile: ζ = (1/r) d(r u_θ)/dr, evaluated by central difference. */
export function targetVorticity(r: number, p: Params): number {
  const h = 1e-3;
  const rr = Math.max(r, h);
  const a = (rr + h) * targetAzimuthal(rr + h, p);
  const b = (rr - h) * targetAzimuthal(rr - h, p);
  return (a - b) / (2 * h) / rr;
}

/** Sponge damping rate as a function of radius. */
export function spongeRate(r: number, p: Params): number {
  const t = Math.min(1, Math.max(0, (r - p.capRadius) / (1 - p.capRadius)));
  return p.spongeRate * t * t * (3 - 2 * t);
}

/** Stable time step for the grid: CFL 0.4 against the peak speed. */
export function stableDt(n: number, p: Params): number {
  const dx = 2 / n;
  const umax = Math.max(1, p.jetSpeed + p.poleSpeed * 0.3);
  return 0.4 * dx / umax;
}
