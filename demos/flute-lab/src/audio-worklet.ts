import { Flute, RATE, NX, NY } from "./physics";
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor,
): void;
class FluteProcessor extends AudioWorkletProcessor {
  sim = new Flute();
  speed = 1;
  paused = false;
  phase = 0;
  previous = 0;
  next = 0;
  dc = 0;
  frame = 0;
  trace = new Float32Array(16384);
  traceIndex = 0;
  constructor() {
    super();
    this.sim.breath = 0; // Stay silent until the latest UI breath state arrives.
    this.port.onmessage = ({ data }) => {
      if (data.type === "controls") {
        this.speed = Math.max(0.0001, Math.min(1, Number(data.speed) || 1));
        this.sim.breath = data.breath;
        this.sim.jetGain = data.jetGain;
        this.sim.open = data.open;
        this.sim.geometry();
        this.paused = data.paused;
      }
      if (data.type === "reset") {
        this.sim.reset();
        this.phase = 0;
        this.previous = 0;
        this.next = 0;
        this.dc = 0;
        this.trace.fill(0);
      }
      if (data.type === "pulse") this.sim.pulse();
      if (data.type === "mic") {
        const x = Math.max(8, Math.min(NX - 9, data.x | 0));
        const y = Math.max(8, Math.min(NY - 9, data.y | 0));
        if (!this.sim.solid[y * NX + x]) {
          this.sim.mic = y * NX + x;
          this.dc = 0;
        }
      }
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (this.paused) {
        out[i] = 0;
        continue;
      }
      this.phase += (RATE * this.speed) / sampleRate;
      while (this.phase >= 1) {
        this.previous = this.next;
        this.next = this.sim.step();
        this.phase--;
      }
      const pressure = this.previous + (this.next - this.previous) * this.phase;
      this.dc +=
        (1 - Math.exp((-2 * Math.PI * 8) / sampleRate)) * (pressure - this.dc);
      out[i] = Math.tanh((pressure - this.dc) * 0.45) * 0.6;
      this.trace[this.traceIndex++ % 16384] = pressure;
    }
    this.frame += out.length;
    if (this.frame >= sampleRate / 30) {
      this.frame = 0;
      this.port.postMessage({
        p: this.sim.p.slice(),
        solid: this.sim.solid.slice(),
        time: this.sim.time,
        bore: Float32Array.from(
          { length: 128 },
          (_, i) => this.sim.bore.sample((i / 127) * this.sim.bore.length) * 20,
        ),
        jet: this.sim.jet,
        mic: this.sim.mic,
        trace: this.trace.slice(),
        traceIndex: this.traceIndex,
        sampleRate,
      });
    }
    return true;
  }
}
registerProcessor("flute-physics", FluteProcessor);
