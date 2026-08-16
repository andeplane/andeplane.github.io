// Air at ~20°C, sea level.
export const C_SOUND = 343; // m/s
export const RHO_AIR = 1.2; // kg/m^3

// CFL safety factor for the 2D leapfrog FDTD scheme. The scheme is stable for
// c*dt/h <= 1/sqrt(2); we run well under that so the sponge damping (added on
// top of the leapfrog update) can't push it over.
export const CFL_SAFETY = 0.5;
export const CFL_LIMIT = 1 / Math.SQRT2;
