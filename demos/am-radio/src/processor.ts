import { RadioEngine, CA, RA, HEFF, PORT, ANTENNA } from "./physics.ts";
import { LAYOUT } from "./propagation.ts";
declare const sampleRate: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
  port: MessagePort;
}
class RadioProcessor extends AudioWorkletProcessor {
  engine = new RadioEngine(sampleRate);
  blocks = 0;
  busy = 0;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data.settings) this.engine.configure(data.settings);
      if (data.track) this.engine.tracks[data.track.index] = data.track.samples;
    };
    const e = this.engine;
    this.port.postMessage({
      port: {
        capacitance: CA,
        resistance: RA,
        radiation: PORT.radiationResistance,
        ohmic: PORT.ohmicResistance,
        effectiveHeight: HEFF,
        heightSpread: PORT.heightSpread,
        capacitanceSpread: PORT.capacitanceSpread,
        wire: ANTENNA,
        cells: LAYOUT.cells,
        dx: e.grid.dx,
        courant: e.grid.courant,
        distances: LAYOUT.sources.map((_, j) => e.grid.distance(j)),
        receiver: LAYOUT.receiver,
        sources: LAYOUT.sources,
        rfRate: e.rfRate,
      },
    });
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0][0];
    if (!out) return true;
    const t0 = Date.now();
    for (let n = 0; n < out.length; n++)
      out[n] =
        this.engine.sample(n === out.length - 1 && this.blocks % 16 === 15) / 3;
    this.busy += Date.now() - t0;
    this.blocks++;
    if (this.blocks % 16 === 0) {
      const e = this.engine;
      let sq = 0;
      for (const v of e.audio) sq += v * v;
      // Millisecond timer resolution averages out over 16 blocks (≈43 ms).
      const load = this.busy / ((16 * out.length * 1000) / sampleRate);
      this.busy = 0;
      this.port.postMessage({
        rfE: e.rfE,
        rfGrid: e.rfGrid,
        rfTank: e.rfTank,
        rfDiode: e.rfDiode,
        rfCharge: e.rfCharge,
        rfCurrent: e.rfCurrent,
        spaceTime: e.spaceTime,
        spaceTimeH: e.spaceTimeH,
        deviation: e.deviation,
        audio: e.audio,
        env: e.env,
        source: e.source,
        power: e.power,
        rms: Math.sqrt(sq / e.audio.length),
        v: e.circuit.v,
        i: e.circuit.i,
        envelope: e.circuit.envelope,
        rfRate: e.rfRate,
        rate: sampleRate,
        time: e.index / sampleRate,
        load,
      });
    }
    return true;
  }
}
registerProcessor("physical-am-radio", RadioProcessor);
