/**
 * One-dimensional Maxwell solver for the last stretch of the broadcast path.
 *
 * Plane waves travelling along x with E_y and H_z on a Yee grid, advanced at
 * the receiver circuit's radio-frequency step. The Courant number is 0.99:
 * close enough to the one-dimensional "magic" value that numerical dispersion
 * is below 1e-4 across the broadcast band (see tests), but strictly below it,
 * because at exactly S = 1 the Nyquist mode of the Yee scheme is a defective
 * eigenmode whose amplitude grows linearly and would let rounding noise
 * accumulate over a long listening session. Both ends carry first-order Mur
 * absorbing boundaries, which are exact for the continuous one-dimensional
 * wave equation and leave only a dispersion-sized residual on the grid.
 *
 * Each transmitter is a current sheet J_y(t) at its own cell. The magnetic
 * field is stored as η₀H so both fields are in V/m. SI units.
 */
import { C0, ETA0 } from "./antenna.ts";
export type Layout = {
  cells: number;
  sources: number[];
  receiver: number;
};
export const LAYOUT: Layout = {
  cells: 32,
  sources: [2, 4, 6, 8, 10],
  receiver: 27,
};
export const COURANT_1D = 0.99;
export class Propagation {
  e: Float64Array;
  h: Float64Array;
  dt: number;
  dx: number;
  layout: Layout;
  courant: number;
  private s: number;
  private mur: number;
  /**
   * `courant` = 1 gives the exact "magic" step (integer-cell retardation, exact
   * boundaries) and is safe for short replays; the 0.99 default is for
   * open-ended runs, where the defective Nyquist mode at S = 1 would let
   * rounding noise grow linearly.
   */
  constructor(dt: number, layout: Layout = LAYOUT, courant = COURANT_1D) {
    this.dt = dt;
    this.courant = courant;
    this.s = courant;
    this.mur = (courant - 1) / (courant + 1);
    this.dx = (C0 * dt) / courant;
    this.layout = layout;
    this.e = new Float64Array(layout.cells);
    this.h = new Float64Array(layout.cells - 1);
  }
  /** Distance from source s to the receiver, in metres. */
  distance(s: number) {
    return (this.layout.receiver - this.layout.sources[s]) * this.dx;
  }
  /**
   * Advance one time step. `sheets` holds the surface current density (A/m)
   * of each transmitter at this step; a sheet J radiates plane waves of
   * amplitude η₀J/2 in both directions. Returns E at the receiver cell.
   */
  step(sheets: ArrayLike<number>) {
    const e = this.e,
      h = this.h,
      n = e.length,
      s = this.s;
    // η₀H_z^{n+1/2} = η₀H_z^{n-1/2} - S (E_y[i+1] - E_y[i])
    for (let i = 0; i < n - 1; i++) h[i] -= s * (e[i + 1] - e[i]);
    const e1 = e[1],
      e0 = e[0],
      eR1 = e[n - 2],
      eR0 = e[n - 1];
    // E_y^{n+1} = E_y^n - S (η₀H_z[i+1/2] - η₀H_z[i-1/2]) - S η₀ J_s
    for (let i = 1; i < n - 1; i++) e[i] -= s * (h[i] - h[i - 1]);
    const src = this.layout.sources;
    for (let k = 0; k < src.length; k++) e[src[k]] -= s * ETA0 * sheets[k];
    // First-order Mur absorbing boundaries.
    e[0] = e1 + this.mur * (e[1] - e0);
    e[n - 1] = eR1 + this.mur * (e[n - 2] - eR0);
    return e[this.layout.receiver];
  }
  reset() {
    this.e.fill(0);
    this.h.fill(0);
  }
  /** Electromagnetic energy per unit area stored on the grid (J/m²). */
  energy() {
    let sum = 0;
    for (let i = 0; i < this.e.length; i++) sum += this.e[i] ** 2;
    for (let i = 0; i < this.h.length; i++) sum += this.h[i] ** 2;
    // u = ½ε₀E² + ½μ₀H² = ½ε₀(E² + (η₀H)²), ε₀ = 1/(η₀c)
    return (sum * this.dx) / (2 * ETA0 * C0);
  }
}
