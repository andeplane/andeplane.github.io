/** Traveling acoustic pressure waves, with real three-port scattering junctions.
 * Each segment solves the 1D wave equation by delaying its two traveling waves.
 */
export const NOTES = [
  "C6",
  "B5",
  "B♭5",
  "A5",
  "A♭5",
  "G5",
  "F♯5",
  "F5",
  "E5",
  "D5",
];
export const TARGETS = [
  1046.502, 987.767, 932.328, 880, 830.609, 783.991, 739.989, 698.456, 659.255,
  587.33,
];
export const BORE_RATE = 96000;
// Metres; calibrated with tools/calibrate.ts at breath=1. No frequencies are
// selected during playback: these lengths set propagation time in each segment.
export const POSITIONS = [
  0.15800288328037193, 0.16783813869678468, 0.17826566396773702,
  0.18931916972568533, 0.201035836447906, 0.2134561389978663,
  0.22662237993562562, 0.24057775851516763, 0.2554819083489425,
  0.28781193076691225,
];
export const LENGTH = 0.3241132112215746;
class Delay {
  buffer = new Float64Array(1024);
  index = 0;
  constructor(public length: number) {}
  readAt(distance: number) {
    const position = (this.index - Math.max(1, distance) + 1024) % 1024,
      lo = Math.floor(position),
      mix = position - lo;
    return this.buffer[lo] * (1 - mix) + this.buffer[(lo + 1) % 1024] * mix;
  }
  read() {
    return this.readAt(this.length);
  }
  write(v: number) {
    this.buffer[this.index] = v;
    this.index = (this.index + 1) % 1024;
  }
  clear() {
    this.buffer.fill(0);
    this.index = 0;
  }
}
export class Bore {
  open = Array<boolean>(10).fill(false);
  breath = 1;
  feedback = true;
  jetGain = 24;
  // Geometry includes the calibrated boundary/filter phase correction.
  positions = [...POSITIONS];
  length = LENGTH;
  left: Delay[] = [];
  right: Delay[] = [];
  incomingL = new Float64Array(11);
  incomingR = new Float64Array(11);
  radiation = new Float64Array(12);
  pressure = new Float64Array(12);
  mean = 0;
  filtered = 0;
  jet = 0;
  envelope = 0;
  seed = 1729;
  constructor(positions?: number[], length?: number) {
    if (positions) this.positions = positions;
    if (length) this.length = length;
    let last = 0;
    for (const x of [...this.positions, this.length]) {
      const delay = Math.max(0.1, ((x - last) * BORE_RATE) / 343);
      this.left.push(new Delay(delay));
      this.right.push(new Delay(delay));
      last = x;
    }
  }
  sample(x: number) {
    let segment = 0,
      previous = 0;
    while (segment < 10 && x > this.positions[segment]) {
      previous = this.positions[segment];
      segment++;
    }
    const distance = ((x - previous) * BORE_RATE) / 343;
    return (
      this.right[segment].readAt(distance) +
      this.left[segment].readAt(this.left[segment].length - distance)
    );
  }
  reset() {
    for (const d of [...this.left, ...this.right]) d.clear();
    this.radiation.fill(0);
    this.pressure.fill(0);
    this.mean = this.filtered = this.jet = this.envelope = 0;
    this.seed = 1729;
  }
  step() {
    for (let i = 0; i < 11; i++) {
      this.incomingL[i] = this.right[i].read();
      this.incomingR[i] = this.left[i].read();
    }
    const returned = this.incomingR[0];
    this.mean += 0.003 * (returned - this.mean);
    this.filtered += 0.2 * (returned - this.mean - this.filtered);
    this.envelope += 0.002 * (this.breath - this.envelope);
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    const noise = ((this.envelope * this.seed) / 2147483648) * 0.00001;
    // Nonlinear active reflection at the labium: steady breath replenishes losses.
    // A memoryless saturating negative resistance is used, not a pitch oscillator.
    this.jet =
      (-(this.feedback
        ? 0.98 + this.envelope * 0.25 * (this.jetGain / 24)
        : 0.98) *
        Math.tanh(this.filtered * 2)) /
        2 +
      noise;
    this.right[0].write(this.jet);
    this.radiation[0] = returned - this.jet;
    this.pressure[0] = this.jet + returned;
    for (let i = 0; i < 10; i++) {
      const a = this.incomingL[i],
        b = this.incomingR[i + 1];
      const shunt = this.open[i] ? 40 : 0;
      const p = (2 * (a + b)) / (2 + shunt);
      this.left[i].write(p - a);
      this.right[i + 1].write(p - b);
      this.radiation[i + 1] = shunt * p;
      this.pressure[i + 1] = p;
    }
    const incident = this.incomingL[10];
    this.left[10].write(-0.98 * incident);
    this.radiation[11] = 1.98 * incident;
    return this.radiation[11];
  }
}
