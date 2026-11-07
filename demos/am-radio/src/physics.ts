/**
 * SI units throughout. End-to-end receiver:
 *
 *   program → current-sheet transmitter → 1D Maxwell grid (exact at S = 1)
 *   → incident E at the antenna → moment-method antenna port (h_eff, C_a, R_a
 *   solved from the wire geometry) → coupled implicit-midpoint RLC tank with
 *   back-action through the port → piecewise-linear diode → RC detector
 *   → buffered low-pass filters → AC coupling → powered amplifier → 8 Ω load.
 */
import { antennaPort, C0, ETA0, type Wire } from "./antenna.ts";
import { Propagation, LAYOUT } from "./propagation.ts";
export { ETA0 };
export const EPSILON = 8.8541878128e-12;
export const L = 250e-6;
export const AREA = 0.01; // 10 cm by 10 cm, ideal air plates
export const RP = 100_000, // coil loss as a parallel resistance (Q_L ≈ 70 at 900 kHz)
  RD = 100_000,
  RON = 2000,
  VF = 0.15;
export const CARRIERS = [600_000, 750_000, 900_000, 1_050_000, 1_200_000];
/** Receiving antenna: a 2 m copper dipole of 1 mm radius, centre fed. */
export const ANTENNA: Wire = { length: 2, radius: 0.001, segments: 41 };
/**
 * Port derived from the thin-wire moment-method solution at the five carriers.
 * The circuit uses the band-centre values; `PORT.rows` records the (sub-0.1 %)
 * variation across the band that this frequency-independent port neglects.
 */
export const PORT = antennaPort(ANTENNA, CARRIERS, 900_000);
export const CA = PORT.capacitance,
  RA = PORT.resistance,
  HEFF = PORT.effectiveHeight;
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
export const capacitance = (gap: number) => (EPSILON * AREA) / (gap * 1e-3);
/** Natural frequency of the tank with the antenna capacitance in parallel (source shorted). */
export const resonance = (gap: number) =>
  1 / (2 * Math.PI * Math.sqrt(L * (capacitance(gap) + CA)));
export const gapForFrequency = (f: number) =>
  (EPSILON * AREA * 1000) / (1 / ((2 * Math.PI * f) ** 2 * L) - CA);
export const defaults: Settings = {
  gap: Number(gapForFrequency(900_000).toFixed(3)),
  depth: 0.65,
  angle: 0,
  field: 1,
  tau: 80,
  gain: 3,
  diode: true,
  direct: false,
  stations: [true, true, true, true, true],
};
/**
 * Detector-disconnected small-signal transfer from incident field to tank
 * voltage, |V/E| in V per V/m: V_oc = h_eff E through the port impedance into
 * the tank admittance.
 */
export function response(f: number, gap: number) {
  const w = 2 * Math.PI * f;
  // Y_a = 1/(R_a + 1/(jωC_a)) = jωC_a/(1 + jωR_aC_a)
  const dr = 1,
    di = w * RA * CA;
  const dd = dr * dr + di * di;
  const yar = (w * CA * di) / dd,
    yai = (w * CA * dr) / dd;
  const tr = yar + 1 / RP,
    ti = yai + w * capacitance(gap) - 1 / (w * L);
  return (HEFF * Math.hypot(yar, yai)) / Math.hypot(tr, ti);
}
export class Circuit {
  v = 0;
  i = 0;
  envelope = 0;
  /**
   * Voltage across the antenna capacitance, v_oc − v; the charge that has
   * moved through the port is C_a·va. Derived from the node solve, not an
   * independent state: the port resistance R_a is six orders of magnitude
   * below the port reactance, so its voltage drop is neglected in the time
   * stepping and its dissipation (re-radiation plus copper loss) is charged
   * to the port current afterwards.
   */
  va = 0;
  /** Port current at the last midpoint (A), positive into the tank. */
  ia = 0;
  diodeCurrent = 0;
  /** Energy accumulators (J) since the last `drain()`, from the midpoint powers. */
  ePort = 0;
  eRad = 0;
  eTank = 0;
  eDiode = 0;
  eDetector = 0;
  eAvailable = 0;
  private cv = 0;
  private ce = 0;
  private b = 0;
  private e = 0;
  private il = 0;
  private ka = 0;
  /** Coil pre-warp factor L_num/L. */
  warp = 1;
  enabled = true;
  /** Accumulate energies this step (the engine samples the accounting on a duty cycle). */
  account = true;
  dt: number;
  constructor(dt: number, gap = defaults.gap, tau = defaults.tau) {
    this.dt = dt;
    this.configure(gap, tau, true);
  }
  configure(gap: number, tau: number, enabled: boolean) {
    // The antenna capacitance sits on the tank node. When C changes, conserve
    // the node charge rather than resetting the tank.
    const next = (2 * (capacitance(gap) + CA)) / this.dt;
    if (this.cv) this.v *= this.cv / next;
    this.cv = next;
    this.ce = (2 * ((tau * 1e-6) / RD)) / this.dt;
    // Implicit midpoint maps a continuous ω to (2/Δt)·atan(ωΔt/2). Pre-warp the
    // coil so the discrete tank resonates exactly at the physical frequency
    // (the bilinear-transform trick); the residual is a 0.4 % change of Q.
    const w0 = 2 * Math.PI * resonance(gap),
      x = (w0 * this.dt) / 2;
    this.warp = (x / Math.tan(x)) ** 2;
    this.il = this.dt / (L * this.warp);
    this.ka = CA / this.dt;
    this.b = this.cv + 1 / RP + this.il / 2;
    this.e = this.ce + 1 / RD;
    this.enabled = enabled;
  }
  /**
   * Advance one RF step. The antenna port injects C_a·dv_oc/dt into the tank
   * node; `prev` and `next` are the open-circuit voltage at the start and end
   * of the step, so the drive is the exact difference over the step.
   */
  step(prev: number, next: number) {
    const drive = this.ka * (next - prev);
    const a = this.cv * this.v + drive - this.i;
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
    // i_a = C_a d(v_oc − v)/dt over the step.
    const ia = drive - 2 * this.ka * (vm - this.v);
    this.ia = ia;
    this.v = 2 * vm - this.v;
    this.i += this.il * vm;
    this.envelope = 2 * um - this.envelope;
    this.diodeCurrent = d;
    this.va = next - this.v;
    if (this.account) {
      const vocm = 0.5 * (prev + next);
      this.ePort += vocm * ia;
      this.eRad += ia * ia;
      this.eTank += vm * vm;
      this.eDiode += d * (vm - um);
      this.eDetector += um * um;
      this.eAvailable += vocm * vocm;
    }
    return this.envelope;
  }
  /** Stored energy in the plates, coil, detector and antenna capacitance (J). */
  energy() {
    return (
      (((this.cv * this.dt) / 4 - CA / 2) * this.v * this.v) +
      (L * this.warp * this.i * this.i) / 2 +
      ((this.ce * this.dt) / 4) * this.envelope * this.envelope +
      (CA * this.va * this.va) / 2
    );
  }
  /** Return and reset the energy accumulators (J). */
  drain() {
    const dt = this.dt;
    const out = {
      port: this.ePort * dt,
      radiated: RA * this.eRad * dt,
      tank: (this.eTank / RP) * dt,
      diode: this.eDiode * dt,
      detector: (this.eDetector / RD) * dt,
      available: (this.eAvailable / (4 * RA)) * dt,
    };
    this.ePort = this.eRad = this.eTank = this.eDiode = this.eDetector = this.eAvailable = 0;
    return out;
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
    // Four RC anti-alias poles are integrated at RF rate by the receiver; this is AC coupling.
    this.dc += this.couplingAlpha * (envelope - this.dc);
    this.voltage =
      (Math.max(-3, Math.min(3, gain * (envelope - this.dc))) * 8) / 9;
    return this.voltage;
  }
}
/**
 * Everything after the antenna port: coupled tank/detector at the RF step,
 * four buffered 5 kHz low-pass sections at the RF step, then the audio-rate
 * output stage. The same chain serves the real-time 1D path and the offline
 * 2D full-wave path, which run at different RF steps.
 */
export class Receiver {
  circuit: Circuit;
  output: OutputStage;
  filters = new Float64Array(4);
  alpha: number;
  constructor(dtRf: number, audioRate: number) {
    this.circuit = new Circuit(dtRf);
    this.output = new OutputStage(audioRate);
    this.alpha = 1 - Math.exp(-2 * Math.PI * 5000 * dtRf);
  }
  stepRf(prev: number, next: number) {
    const e = this.circuit.step(prev, next);
    const f = this.filters,
      a = this.alpha;
    f[0] += a * (e - f[0]);
    f[1] += a * (f[0] - f[1]);
    f[2] += a * (f[1] - f[2]);
    f[3] += a * (f[2] - f[3]);
    return f[3];
  }
  sampleAudio(gain: number) {
    return this.output.step(this.filters[3], gain);
  }
}
/** Sheet current density (A/m) whose plane wave has amplitude `field` V/m: J = 2E/η₀. */
export const sheetForField = (field: number) => (2 * field) / ETA0;
/**
 * Calibration of a one-cell-wide additive source on the Yee grid. The slab
 * launches η₀J/(2cos(k̃Δx/2)) instead of η₀J/2 (up to 1.2 % at 1200 kHz) and
 * lags the sheet by half a step; multiplying each carrier's sheet by this
 * factor removes the amplitude error.
 */
export function sourceCalibration(frequency: number, dt: number, courant = 1) {
  const dx = (C0 * dt) / courant;
  const kt = (2 / dx) * Math.asin(Math.sin(Math.PI * frequency * dt) / courant);
  return Math.cos((kt * dx) / 2);
}
export const CAPTURE = 512;
/**
 * Replay warm-up: the sources ramp up over the first `RAMP` steps (a hard
 * start would excite the grid's Nyquist checkerboard), then run at full
 * amplitude for another 48 steps so that every wave launched during the ramp
 * has crossed the 32-cell grid before the window begins.
 */
const RAMP = 48,
  WARMUP = 96;
export class RadioEngine {
  receiver: Receiver;
  /**
   * Yee grid used to recompute the captured window from the recorded
   * transmitter history (the grid is far too slow to step 24.6 million times
   * per second in JavaScript; the real-time field is the exact retarded
   * solution that the grid converges to, see `deviation`).
   */
  grid: Propagation;
  settings = { ...defaults, stations: [...defaults.stations] };
  over: number;
  rfRate: number;
  index = 0;
  /** Global RF step counter. */
  step = 0;
  tracks: Float32Array[] = CARRIERS.map(() => new Float32Array(0));
  sin = new Float64Array(5);
  cos = new Float64Array([1, 1, 1, 1, 1]);
  ds = new Float64Array(5);
  dc = new Float64Array(5);
  /**
   * Transmitter amplitudes ramp linearly across each audio sample (first-order
   * hold): `a0` at the start of the current sample, slope `da` per RF step, and
   * the previous sample's line for the retarded and replayed waveforms.
   */
  a0 = new Float64Array(5);
  da = new Float64Array(5);
  prevA0 = new Float64Array(5);
  prevDa = new Float64Array(5);
  amplitude = new Float64Array(5);
  sheets = new Float64Array(5);
  /** Retardation of each transmitter in RF steps (distance / cΔt). */
  delaySteps = new Float64Array(5);
  calibration = new Float64Array(5);
  retardCos = new Float64Array(5);
  retardSin = new Float64Array(5);
  halfCos = new Float64Array(5);
  halfSin = new Float64Array(5);
  retarded = new Float64Array(5);
  /** Energy accounting runs on one audio sample in `accountEvery`. */
  accountEvery = 4;
  eRx = 0;
  /** Open-circuit voltage at the last integer step. */
  voc = 0;
  rfE = new Float32Array(CAPTURE);
  rfGrid = new Float32Array(CAPTURE);
  rfTank = new Float32Array(CAPTURE);
  rfDiode = new Float32Array(CAPTURE);
  rfCharge = new Float32Array(CAPTURE);
  rfCurrent = new Float32Array(CAPTURE);
  /** Filtered envelope after the four RF-rate low-pass sections, before decimation. */
  rfFiltered = new Float32Array(CAPTURE);
  spaceTime = new Float32Array(CAPTURE * LAYOUT.cells);
  /** η₀H_z on the replayed grid (cells − 1 per step, at half-cell positions). */
  spaceTimeH = new Float32Array(CAPTURE * (LAYOUT.cells - 1));
  /** Largest difference between the replayed Yee field and the exact retarded field (V/m). */
  deviation = 0;
  audio = new Float32Array(2048);
  env = new Float32Array(2048);
  source = new Float32Array(2048);
  /** Smoothed powers (W) and incident power density (W/m²). */
  power = {
    port: 0,
    radiated: 0,
    tank: 0,
    diode: 0,
    detector: 0,
    available: 0,
    load: 0,
    incident: 0,
  };
  lastMessage = 0;
  rate: number;
  constructor(rate = 48000, over = 512) {
    this.rate = rate;
    this.over = over;
    this.rfRate = rate * over;
    const dt = 1 / this.rfRate;
    this.receiver = new Receiver(dt, rate);
    this.grid = new Propagation(dt, LAYOUT);
    for (let j = 0; j < 5; j++) {
      const p = (2 * Math.PI * CARRIERS[j]) / this.rfRate;
      this.ds[j] = Math.sin(p);
      this.dc[j] = Math.cos(p);
      // The oscillators run at the receiver: transmitter phase minus the
      // retardation ω_j d_j/c, sampled at half steps for the midpoint integrator.
      const theta = (2 * Math.PI * CARRIERS[j] * this.grid.distance(j)) / C0;
      this.sin[j] = Math.sin(-p / 2 - theta);
      this.cos[j] = Math.cos(-p / 2 - theta);
      this.calibration[j] = sourceCalibration(CARRIERS[j], dt, this.grid.courant);
      this.delaySteps[j] = this.grid.distance(j) / C0 / dt;
      this.retardCos[j] = Math.cos(theta);
      this.retardSin[j] = Math.sin(theta);
      this.halfCos[j] = Math.cos(p / 2);
      this.halfSin[j] = Math.sin(p / 2);
    }
  }
  get circuit() {
    return this.receiver.circuit;
  }
  get output() {
    return this.receiver.output;
  }
  configure(s: Settings) {
    this.settings = { ...s, stations: [...s.stations] };
    this.receiver.circuit.configure(s.gap, s.tau, s.diode);
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
  /** Transmitter amplitude of station j at audio sample index i (A/m, or V in direct mode). */
  amplitudeAt(j: number, i: number) {
    const s = this.settings;
    if (!s.stations[j]) return 0;
    return (
      (s.direct ? 2 : sheetForField(s.field)) *
      (1 + s.depth * this.message(j, i / this.rate))
    );
  }
  sample(capture = false) {
    const s = this.settings,
      over = this.over,
      a0 = this.a0,
      da = this.da,
      amp = this.amplitude;
    this.prevA0.set(a0);
    this.prevDa.set(da);
    for (let j = 0; j < 5; j++) {
      a0[j] = this.amplitudeAt(j, this.index);
      da[j] = (this.amplitudeAt(j, this.index + 1) - a0[j]) / over;
      amp[j] = a0[j];
    }
    this.lastMessage = this.message(2, this.index / this.rate);
    const projection = HEFF * Math.cos((s.angle * Math.PI) / 180);
    const receiver = this.receiver,
      circuit = receiver.circuit,
      offset = over - CAPTURE,
      half = -ETA0 / 2,
      retarded = this.retarded,
      delaySteps = this.delaySteps,
      prevA0 = this.prevA0,
      prevDa = this.prevDa,
      sin = this.sin,
      cos = this.cos,
      ds = this.ds,
      dc = this.dc,
      direct = s.direct;
    circuit.account = this.index % this.accountEvery === 0;
    let incident = 0,
      n = this.step;
    for (let k = 0; k < over; k++, n++) {
      // The amplitude that reaches the receiver now left the transmitter d_j/c
      // ago; for the first steps of this audio sample that is on the previous
      // sample's ramp. Direct injection has no retardation.
      if (direct) {
        for (let j = 0; j < 5; j++) retarded[j] = a0[j] + k * da[j];
      } else if (k < 26) {
        for (let j = 0; j < 5; j++) {
          const q = k - delaySteps[j];
          retarded[j] = q >= 0 ? a0[j] + q * da[j] : prevA0[j] + (over + q) * prevDa[j];
        }
      } else {
        for (let j = 0; j < 5; j++) retarded[j] += da[j];
      }
      // E(x_r, t) = -(η₀/2) Σ J_j(t - d_j/c): the oscillators already carry the
      // retardation phase, so the exact plane-wave field is a weighted sum.
      let e = 0;
      for (let j = 0; j < 5; j++) {
        const sn = sin[j] * dc[j] + cos[j] * ds[j];
        cos[j] = cos[j] * dc[j] - sin[j] * ds[j];
        sin[j] = sn;
        e += retarded[j] * sn;
      }
      let voc: number;
      if (direct) {
        // Direct injection: the same waveforms (2 V per station) as the port's
        // open-circuit voltage, bypassing propagation, field strength and orientation.
        voc = e;
        e = 0;
      } else {
        e *= half;
        voc = projection * e;
        incident += e * e;
      }
      this.eRx = e;
      receiver.stepRf(this.voc, voc);
      this.voc = voc;
      if (capture && k >= offset) {
        const x = k - offset;
        this.rfE[x] = e;
        this.rfTank[x] = circuit.v;
        this.rfDiode[x] = circuit.diodeCurrent * 1e6;
        this.rfCharge[x] = CA * circuit.va * 1e12;
        this.rfCurrent[x] = circuit.ia * 1e6;
        this.rfFiltered[x] = receiver.filters[3];
      }
    }
    this.step = n;
    if (capture) this.replay(n - CAPTURE);
    const out = receiver.sampleAudio(s.gain);
    const x = this.index % 2048;
    this.audio[x] = out;
    this.env[x] = circuit.envelope;
    this.source[x] = this.lastMessage;
    this.index++;
    // Power readings: energies over an accounted audio sample become mean powers, smoothed over ~20 ms.
    const p = this.power,
      w = 1 / (0.02 * this.rate);
    if (circuit.account) {
      const en = circuit.drain(),
        wa = w * this.accountEvery;
      p.port += wa * (en.port * this.rate - p.port);
      p.radiated += wa * (en.radiated * this.rate - p.radiated);
      p.tank += wa * (en.tank * this.rate - p.tank);
      p.diode += wa * (en.diode * this.rate - p.diode);
      p.detector += wa * (en.detector * this.rate - p.detector);
      p.available += wa * (en.available * this.rate - p.available);
    }
    p.load += w * ((out * out) / 8 - p.load);
    p.incident += w * (incident / over / ETA0 - p.incident);
    if (this.index % 4096 === 0)
      for (let j = 0; j < 5; j++) {
        const nn = Math.hypot(this.sin[j], this.cos[j]);
        this.sin[j] /= nn;
        this.cos[j] /= nn;
      }
    return out;
  }
  /**
   * Recompute the captured window on the Yee grid from the transmitter
   * waveforms, regenerated exactly from the oscillator phases and the
   * amplitudes of the current and previous audio sample. The grid starts
   * empty `WARMUP` steps before the window with the sources ramped in. The
   * grid field at the receiver cell is compared with the exact retarded
   * field; because an additive source enters the field half a step late, the
   * comparison uses the exact field half a step earlier.
   */
  replay(first: number) {
    const grid = this.grid,
      sheets = this.sheets,
      cells = LAYOUT.cells,
      cal = this.calibration,
      sampleStart = this.step - this.over,
      start = first - WARMUP;
    // Oscillator state at step `start`: rotate the current state backwards.
    const sn = new Float64Array(5),
      cs = new Float64Array(5);
    for (let j = 0; j < 5; j++) {
      let a = this.sin[j],
        b = this.cos[j];
      for (let q = this.step - 1; q > start; q--) {
        const na = a * this.dc[j] - b * this.ds[j];
        b = b * this.dc[j] + a * this.ds[j];
        a = na;
      }
      sn[j] = a;
      cs[j] = b;
    }
    grid.reset();
    let worst = 0;
    for (let m = 0; m < WARMUP + CAPTURE; m++) {
      const q = start + m;
      const ramp = m < RAMP ? 0.5 - 0.5 * Math.cos((Math.PI * m) / RAMP) : 1;
      for (let j = 0; j < 5; j++) {
        if (m > 0) {
          const na = sn[j] * this.dc[j] + cs[j] * this.ds[j];
          cs[j] = cs[j] * this.dc[j] - sn[j] * this.ds[j];
          sn[j] = na;
        }
        // Transmitter-side waveform: undo the retardation phase carried by the oscillator.
        sheets[j] =
          ramp * this.line(j, q, sampleStart) * cal[j] * (sn[j] * this.retardCos[j] + cs[j] * this.retardSin[j]);
      }
      const g = grid.step(sheets);
      const w = m - WARMUP;
      if (w < 0) continue;
      this.spaceTime.set(grid.e, w * cells);
      this.spaceTimeH.set(grid.h, w * (cells - 1));
      this.rfGrid[w] = g;
      // Exact field half a step later than q (the additive source's latency).
      let exact = 0;
      for (let j = 0; j < 5; j++) {
        const a = this.line(j, q + 0.5 - this.delaySteps[j], sampleStart);
        exact += (-ETA0 / 2) * a * (sn[j] * this.halfCos[j] + cs[j] * this.halfSin[j]);
      }
      worst = Math.max(worst, Math.abs(g - exact));
    }
    this.deviation = worst;
  }
  /** Transmitter amplitude of station j at (fractional) RF step q on the current or previous ramp. */
  private line(j: number, q: number, sampleStart: number) {
    const k = q - sampleStart;
    return k >= 0
      ? this.a0[j] + k * this.da[j]
      : this.prevA0[j] + (this.over + k) * this.prevDa[j];
  }
}
