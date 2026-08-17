import { C_SOUND, RHO_AIR } from '../physics/constants';
import { buildGridLayout, buildSolidMask } from './geometry';
import type { ExcitationParams, GridLayout, TubeParams } from './types';

const REFLECTION_TARGET = 1e-3;
export const PISTON_MAX_VELOCITY = 3; // m/s peak, at strength = 1
export const PULSE_MIN_DURATION = 0.05e-3; // s
export const PULSE_MAX_DURATION = 1.2e-3; // s

/**
 * 2D acoustic FDTD solver on a MAC (staggered) grid — pressure at cell
 * centers, velocity components on cell faces. Leapfrog time-stepping:
 *
 *   du/dt = -(1/rho) grad(p)      (velocity faces, half-step offset from p)
 *   dp/dt = -rho*c^2 div(u)
 *
 * Rigid walls are enforced by zeroing any velocity face touching a solid
 * cell (no normal flow). The domain's outer edge is a Cerjan-style
 * exponential damping sponge so waves leave the visible domain instead of
 * bouncing off the canvas edge.
 */
export class Solver {
  readonly layout: GridLayout;
  readonly solid: Uint8Array;
  readonly p: Float32Array;
  private readonly ux: Float32Array; // (nx+1) wide, ny tall
  private readonly uy: Float32Array; // nx wide, (ny+1) tall
  private readonly dampP: Float32Array;
  private readonly dampUx: Float32Array;
  private readonly dampUy: Float32Array;

  simTime = 0;
  private strikeStart = -Infinity;
  private strikeDuration = 0;
  private strikeAmplitude = 0;

  constructor(tube: TubeParams) {
    this.layout = buildGridLayout(tube);
    this.solid = buildSolidMask(this.layout);
    const { nx, ny } = this.layout;
    this.p = new Float32Array(nx * ny);
    this.ux = new Float32Array((nx + 1) * ny);
    this.uy = new Float32Array(nx * (ny + 1));
    const { spongeWidth, h: cellSize, dt } = this.layout;
    this.dampP = precomputeDamping(nx, ny, spongeWidth, cellSize, dt);
    this.dampUx = precomputeDamping(nx + 1, ny, spongeWidth, cellSize, dt);
    this.dampUy = precomputeDamping(nx, ny + 1, spongeWidth, cellSize, dt);
  }

  /**
   * Starts a fresh strike. The field is cleared first: a second hit landing on
   * top of the reverberant tail of the first one is a mess to look at, and the
   * thing worth watching here is one clean pulse making one clean trip.
   */
  strike(excitation: ExcitationParams): void {
    this.reset();
    this.strikeStart = this.simTime;
    this.strikeDuration =
      PULSE_MIN_DURATION + excitation.pulseWidth * (PULSE_MAX_DURATION - PULSE_MIN_DURATION);
    this.strikeAmplitude = excitation.strength * PISTON_MAX_VELOCITY;
  }

  reset(): void {
    this.p.fill(0);
    this.ux.fill(0);
    this.uy.fill(0);
    this.simTime = 0;
    this.strikeStart = -Infinity;
  }

  /** Advances the simulation by exactly one stable FDTD step. */
  step(): void {
    const { nx, ny, h, dt } = this.layout;
    const { solid, p, ux, uy, dampUx, dampUy, dampP } = this;
    const velCoeff = dt / (RHO_AIR * h);

    // Velocity update: interior x-faces (i = 0 and i = nx are the rigid outer
    // boundary and stay at 0).
    for (let j = 0; j < ny; j++) {
      const rowP = j * nx;
      const rowUx = j * (nx + 1);
      for (let i = 1; i < nx; i++) {
        const idx = rowUx + i;
        if (solid[rowP + i - 1] || solid[rowP + i]) {
          ux[idx] = 0;
          continue;
        }
        ux[idx] = (ux[idx] - velCoeff * (p[rowP + i] - p[rowP + i - 1])) * dampUx[idx];
      }
    }

    // Velocity update: interior y-faces (j = 0 and j = ny are the rigid outer
    // boundary and stay at 0).
    for (let j = 1; j < ny; j++) {
      const rowAbove = (j - 1) * nx;
      const rowBelow = j * nx;
      const rowUy = j * nx;
      for (let i = 0; i < nx; i++) {
        const idx = rowUy + i;
        if (solid[rowAbove + i] || solid[rowBelow + i]) {
          uy[idx] = 0;
          continue;
        }
        uy[idx] = (uy[idx] - velCoeff * (p[rowBelow + i] - p[rowAbove + i])) * dampUy[idx];
      }
    }

    this.applyStrikeSource();

    // Pressure update from the velocity divergence.
    const pCoeff = dt * RHO_AIR * C_SOUND * C_SOUND;
    for (let j = 0; j < ny; j++) {
      const rowP = j * nx;
      const rowUxL = j * (nx + 1);
      const rowUyTop = j * nx;
      const rowUyBot = (j + 1) * nx;
      for (let i = 0; i < nx; i++) {
        const idx = rowP + i;
        if (solid[idx]) {
          p[idx] = 0;
          continue;
        }
        const divU =
          (ux[rowUxL + i + 1] - ux[rowUxL + i] + (uy[rowUyBot + i] - uy[rowUyTop + i])) / h;
        p[idx] = (p[idx] - pCoeff * divU) * dampP[idx];
      }
    }

    this.simTime += dt;
  }

  /** Overrides the source face with a prescribed piston velocity while a strike is active. */
  private applyStrikeSource(): void {
    const t = this.simTime - this.strikeStart;
    if (t < 0 || t > this.strikeDuration || this.strikeAmplitude === 0) return;
    const { nx, sourceX, sourceY0, sourceY1 } = this.layout;
    const v = this.strikeAmplitude * Math.sin((Math.PI * t) / this.strikeDuration);
    for (let j = sourceY0; j <= sourceY1; j++) {
      this.ux[j * (nx + 1) + sourceX] = v;
    }
  }

  /** Acoustic energy density integrated over the tube's interior, arbitrary units. */
  tubeEnergy(): number {
    const { nx, tubeX0, tubeX1, tubeY0, tubeY1, h } = this.layout;
    const { p, ux, uy } = this;
    let e = 0;
    for (let j = tubeY0; j <= tubeY1; j++) {
      for (let i = tubeX0; i <= tubeX1; i++) {
        const idx = j * nx + i;
        const pot = (p[idx] * p[idx]) / (RHO_AIR * C_SOUND * C_SOUND);
        const uxAvg = (ux[j * (nx + 1) + i] + ux[j * (nx + 1) + i + 1]) / 2;
        const uyAvg = (uy[j * nx + i] + uy[(j + 1) * nx + i]) / 2;
        const kin = RHO_AIR * (uxAvg * uxAvg + uyAvg * uyAvg);
        e += 0.5 * (pot + kin) * h * h;
      }
    }
    return e;
  }

  pressureAt(xCell: number, yCell: number): number {
    const { nx, ny } = this.layout;
    if (xCell < 0 || xCell >= nx || yCell < 0 || yCell >= ny) return 0;
    return this.p[yCell * nx + xCell];
  }

  /**
   * Cell-centered air velocity (m/s), averaged from the two staggered faces on
   * each axis. Used by the drifting-particle overlay; the solver itself always
   * works on the faces directly.
   */
  velocityAt(xCell: number, yCell: number, out: { vx: number; vy: number }): void {
    const { nx, ny } = this.layout;
    out.vx = 0;
    out.vy = 0;
    if (xCell < 0 || xCell >= nx || yCell < 0 || yCell >= ny) return;
    if (this.solid[yCell * nx + xCell]) return;
    const rowUx = yCell * (nx + 1) + xCell;
    out.vx = (this.ux[rowUx] + this.ux[rowUx + 1]) / 2;
    out.vy = (this.uy[yCell * nx + xCell] + this.uy[(yCell + 1) * nx + xCell]) / 2;
  }
}

function precomputeDamping(
  gridW: number,
  gridH: number,
  spongeWidth: number,
  cellSize: number,
  dt: number,
): Float32Array {
  const spongeCrossTime = (spongeWidth * cellSize) / C_SOUND;
  const sigmaMax = -Math.log(REFLECTION_TARGET) / spongeCrossTime;
  const out = new Float32Array(gridW * gridH);
  for (let j = 0; j < gridH; j++) {
    for (let i = 0; i < gridW; i++) {
      const distEdge = Math.min(i, gridW - 1 - i, j, gridH - 1 - j);
      if (distEdge >= spongeWidth) {
        out[j * gridW + i] = 1;
        continue;
      }
      const x = (spongeWidth - distEdge) / spongeWidth;
      const sigma = sigmaMax * x * x;
      out[j * gridW + i] = Math.exp(-sigma * dt);
    }
  }
  return out;
}
