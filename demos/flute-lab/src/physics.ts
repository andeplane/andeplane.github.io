import { Bore, POSITIONS, LENGTH } from "./bore";
/** Hybrid 1D bore / 2D exterior acoustics. SI units except the calibrated jet gain. */
export const NX = 96,
  NY = 40,
  DX = 0.012,
  RATE = 48000,
  C = 343,
  RHO = 1.2;
export const X0 = 14,
  X1 = Math.ceil(X0 + LENGTH / DX),
  TOP = 19,
  BOTTOM = 23;
export const HOLES = POSITIONS.map((x) => X0 + x / DX);
export const KEYS = "qwertyuiop";
// No radiation source at the mouth inlet. The labium window is on top,
// beyond the sealed windway; only it, open tone holes, and the bell radiate.
export const RADIATION_CELLS = [X0 + 1, ...HOLES, X1 + 1].map(
  (x, j) => (j === 11 ? 21 : TOP - 1) * NX + Math.round(x),
);
export class Flute {
  p = new Float32Array(NX * NY);
  u = new Float32Array(NX * NY);
  v = new Float32Array(NX * NY);
  solid = new Uint8Array(NX * NY);
  damp = new Float32Array(NX * NY);
  open = Array<boolean>(10).fill(false);
  mic = 21 * NX + 79;
  breath = 1;
  jetGain = 24;
  feedback = true;
  time = 0;
  jet = 0;
  bore = new Bore();
  private flux = new Float64Array(12);
  constructor() {
    for (let y = 0; y < NY; y++)
      for (let x = 0; x < NX; x++) {
        const edge = Math.min(x, y, NX - 1 - x, NY - 1 - y);
        this.damp[y * NX + x] = Math.exp(
          -0.16 * Math.max(0, (7 - edge) / 7) ** 2 - 0.00006,
        );
      }
    this.geometry();
  }
  geometry() {
    this.solid.fill(0);
    // The narrow instrument is a separate waveguide domain; only exterior
    // air is evolved on the 2D grid. Holes radiate through volume-flow sources.
    for (let x = X0; x <= X1; x++)
      for (let y = TOP; y <= BOTTOM; y++) this.solid[y * NX + x] = 1;
    // Block + sealed mouthpiece. Mean inlet flow is represented by the reduced
    // jet boundary, not by an acoustic opening to the exterior at the inlet.
    for (let x = X0 - 6; x < X0; x++)
      for (let y = TOP; y <= BOTTOM; y++) this.solid[y * NX + x] = 1;
    this.bore.open = [...this.open];
    for (let i = 0; i < this.p.length; i++)
      if (this.solid[i]) this.p[i] = this.u[i] = this.v[i] = 0;
  }
  reset() {
    this.p.fill(0);
    this.u.fill(0);
    this.v.fill(0);
    this.bore.reset();
    this.flux.fill(0);
    this.time = 0;
    this.jet = 0;
  }
  pulse() {
    this.p[15 * NX + 18] += 50;
  }
  step() {
    const { p, u, v, solid, damp } = this;
    const a = 1 / (RATE * RHO * DX),
      b = (RHO * C * C) / (RATE * DX);
    for (let y = 1; y < NY - 1; y++) {
      for (let x = 1, i = y * NX + 1; x < NX - 1; x++, i++) {
        u[i] =
          solid[i] || solid[i - 1]
            ? 0
            : (u[i] - a * (p[i] - p[i - 1])) * damp[i];
        v[i] =
          solid[i] || solid[i - NX]
            ? 0
            : (v[i] - a * (p[i] - p[i - NX])) * damp[i];
      }
    }
    this.bore.breath = this.breath;
    this.bore.feedback = this.feedback;
    this.bore.jetGain = this.jetGain;
    // Two 96 kHz bore steps per 48 kHz room step; low-pass the radiated flux
    // before depositing it into the room's pressure continuity equation.
    this.bore.step();
    this.bore.step();
    this.jet = this.bore.jet;
    for (let j = 0; j < 12; j++) {
      this.flux[j] += 0.25 * (this.bore.radiation[j] - this.flux[j]);
      p[RADIATION_CELLS[j]] += this.flux[j] * 8;
    }
    for (let y = 1; y < NY - 1; y++) {
      for (let x = 1, i = y * NX + 1; x < NX - 1; x++, i++) {
        if (!solid[i])
          p[i] = (p[i] - b * (u[i + 1] - u[i] + v[i + NX] - v[i])) * damp[i];
      }
    }
    this.time += 1 / RATE;
    return p[this.mic];
  }
}
