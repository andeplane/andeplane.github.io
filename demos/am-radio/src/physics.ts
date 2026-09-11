/** SI units throughout. Coupled implicit-midpoint RLC + piecewise-linear diode. */
export const EPSILON = 8.8541878128e-12;
export const L = 250e-6;
export const AREA = 0.01; // 10 cm by 10 cm, ideal air plates
export const RS = 100_000,
  RP = 100_000,
  RD = 100_000,
  RON = 2000,
  VF = 0.15;
export const CARRIERS = [600_000, 750_000, 900_000, 1_050_000, 1_200_000];
export type Settings = {
  gap: number;
  depth: number;
  angle: number;
  field: number;
  tau: number;
  gain: number;
  diode: boolean;
  direct: boolean;
  stations: boolean[];
};
export const defaults: Settings = {
  gap: 0.708,
  depth: 0.65,
  angle: 0,
  field: 1,
  tau: 80,
  gain: 5,
  diode: true,
  direct: false,
  stations: [true, true, true, true, true],
};
export const capacitance = (gap: number) => (EPSILON * AREA) / (gap * 1e-3);
export const resonance = (gap: number) =>
  1 / (2 * Math.PI * Math.sqrt(L * capacitance(gap)));
export const gapForFrequency = (f: number) =>
  EPSILON * AREA * (2 * Math.PI * f) ** 2 * L * 1000;
export function response(f: number, gap: number) {
  const w = 2 * Math.PI * f;
  return (
    1 / RS / Math.hypot(1 / RS + 1 / RP, w * capacitance(gap) - 1 / (w * L))
  );
}
export class Circuit {
  v = 0;
  i = 0;
  envelope = 0;
  diodeCurrent = 0;
  private cv = 0;
  private ce = 0;
  private b = 0;
  private e = 0;
  private il = 0;
  enabled = true;
  dt: number;
  constructor(dt: number, gap = defaults.gap, tau = defaults.tau) {
    this.dt = dt;
    this.configure(gap, tau, true);
  }
  configure(gap: number, tau: number, enabled: boolean) {
    // When C changes, conserve stored charge, rather than resetting the tank.
    const next = (2 * capacitance(gap)) / this.dt;
    if (this.cv) this.v *= this.cv / next;
    this.cv = next;
    this.ce = (2 * ((tau * 1e-6) / RD)) / this.dt;
    this.il = this.dt / L;
    this.b = this.cv + 1 / RS + 1 / RP + this.il / 2;
    this.e = this.ce + 1 / RD;
    this.enabled = enabled;
  }
  step(source: number) {
    const a = this.cv * this.v + source / RS - this.i;
    const c = this.ce * this.envelope;
    // Solve the conducting and nonconducting branches at the midpoint.
    const d = this.enabled
      ? Math.max(
          0,
          (a / this.b - c / this.e - VF) / (RON + 1 / this.b + 1 / this.e),
        )
      : 0;
    const vm = (a - d) / this.b,
      um = (c + d) / this.e;
    this.v = 2 * vm - this.v;
    this.i += this.il * vm;
    this.envelope = 2 * um - this.envelope;
    this.diodeCurrent = d;
    return this.envelope;
  }
  energy() {
    return (
      ((this.cv * this.dt) / 4) * this.v * this.v + (L * this.i * this.i) / 2
    );
  }
}
/** Audio-rate capacitor coupling and powered voltage amplifier with 1 ohm output resistance. */
export class OutputStage {
  dc = 0;
  voltage = 0;
  rate: number;
  private couplingAlpha: number;
  constructor(rate: number) {
    this.rate = rate;
    this.couplingAlpha = 1 - Math.exp((-2 * Math.PI * 30) / rate);
  }
  step(envelope: number, gain: number) {
    // Four RC anti-alias poles are integrated at RF rate by the engine; this is AC coupling.
    this.dc += this.couplingAlpha * (envelope - this.dc);
    this.voltage =
      (Math.max(-3, Math.min(3, gain * (envelope - this.dc))) * 8) / 9;
    return this.voltage;
  }
}
export class RadioEngine {
  circuit: Circuit;
  output: OutputStage;
  settings = { ...defaults, stations: [...defaults.stations] };
  over: number;
  rfRate: number;
  index = 0;
  tracks: Float32Array[] = CARRIERS.map(() => new Float32Array(0));
  sin = new Float64Array(5);
  cos = new Float64Array([1, 1, 1, 1, 1]);
  ds = new Float64Array(5);
  dc = new Float64Array(5);
  filters = new Float64Array(4);
  amplitudes = new Float64Array(5);
  alpha: number;
  rfIn = new Float32Array(512);
  rfTank = new Float32Array(512);
  rfDiode = new Float32Array(512);
  audio = new Float32Array(2048);
  env = new Float32Array(2048);
  source = new Float32Array(2048);
  lastMessage = 0;
  rate: number;
  constructor(rate = 48000, over = 512) {
    this.rate = rate;
    this.over = over;
    this.rfRate = rate * over;
    this.circuit = new Circuit(1 / this.rfRate);
    this.output = new OutputStage(rate);
    this.alpha = 1 - Math.exp((-2 * Math.PI * 5000) / this.rfRate);
    for (let j = 0; j < 5; j++) {
      const p = (2 * Math.PI * CARRIERS[j]) / this.rfRate;
      this.ds[j] = Math.sin(p);
      this.dc[j] = Math.cos(p);
      this.sin[j] = -Math.sin(p / 2);
      this.cos[j] = Math.cos(p / 2);
    }
  }
  configure(s: Settings) {
    this.settings = { ...s, stations: [...s.stations] };
    this.circuit.configure(s.gap, s.tau, s.diode);
  }
  message(j: number, t: number) {
    const track = this.tracks[j];
    if (track.length)
      return (
        track[
          Math.floor(t * this.rate) % (track.length + (j === 3 ? this.rate : 0))
        ] || 0
      );
    if (j === 0) {
      const notes = [
        261.626, 329.628, 391.995, 523.251, 440, 391.995, 329.628, 293.665,
      ];
      const beat = t * 3;
      const f = notes[Math.floor(beat) % 8];
      const e = Math.min(1, (beat % 1) * 35) * Math.exp(-3 * (beat % 1));
      return (
        e *
        (0.7 * Math.sin(2 * Math.PI * f * t) +
          0.2 * Math.sin(4 * Math.PI * f * t) +
          0.1 * Math.sin(6 * Math.PI * f * t))
      );
    }
    // An unloaded recording station is silent; the UI reports any download failure.
    if (j < 4) return 0;
    return Math.sin(2 * Math.PI * 1000 * t);
  }
  sample(capture = false) {
    const s = this.settings,
      t = this.index / this.rate;
    const coupling = s.direct
      ? 2
      : 2 * s.field * Math.cos((s.angle * Math.PI) / 180);
    const amp = this.amplitudes;
    for (let j = 0; j < CARRIERS.length; j++)
      amp[j] = s.stations[j]
        ? coupling * (1 + s.depth * this.message(j, t))
        : 0;
    this.lastMessage = this.message(2, t);
    for (let k = 0; k < this.over; k++) {
      let input = 0;
      for (let j = 0; j < 5; j++) {
        const sn = this.sin[j] * this.dc[j] + this.cos[j] * this.ds[j];
        this.cos[j] = this.cos[j] * this.dc[j] - this.sin[j] * this.ds[j];
        this.sin[j] = sn;
        input += amp[j] * sn;
      }
      let e = this.circuit.step(input);
      for (let p = 0; p < 4; p++) {
        this.filters[p] += this.alpha * (e - this.filters[p]);
        e = this.filters[p];
      }
      if (capture && k >= this.over - 512) {
        const x = k - (this.over - 512);
        this.rfIn[x] = input;
        this.rfTank[x] = this.circuit.v;
        this.rfDiode[x] = this.circuit.diodeCurrent * 1e6;
      }
    }
    const out = this.output.step(this.filters[3], s.gain);
    const x = this.index % 2048;
    this.audio[x] = out;
    this.env[x] = this.circuit.envelope;
    this.source[x] = this.lastMessage;
    this.index++;
    if (this.index % 4096 === 0)
      for (let j = 0; j < 5; j++) {
        const n = Math.hypot(this.sin[j], this.cos[j]);
        this.sin[j] /= n;
        this.cos[j] /= n;
      }
    return out;
  }
}
