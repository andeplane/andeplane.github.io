import { RadioEngine } from "./physics";
declare const sampleRate: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
  port: MessagePort;
}
class RadioProcessor extends AudioWorkletProcessor {
  engine = new RadioEngine(sampleRate);
  blocks = 0;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data.settings) this.engine.configure(data.settings);
      if (data.track) this.engine.tracks[data.track.index] = data.track.samples;
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0][0];
    if (!out) return true;
    for (let n = 0; n < out.length; n++)
      out[n] =
        this.engine.sample(n === out.length - 1 && this.blocks % 16 === 15) / 3;
    this.blocks++;
    if (this.blocks % 16 === 0) {
      const e = this.engine;
      let sq = 0;
      for (const v of e.audio) sq += v * v;
      this.port.postMessage({
        rfIn: e.rfIn,
        rfTank: e.rfTank,
        rfDiode: e.rfDiode,
        audio: e.audio,
        env: e.env,
        source: e.source,
        rms: Math.sqrt(sq / e.audio.length),
        v: e.circuit.v,
        i: e.circuit.i,
        envelope: e.circuit.envelope,
        rfRate: e.rfRate,
        rate: sampleRate,
        time: e.index / sampleRate,
      });
    }
    return true;
  }
}
registerProcessor("physical-am-radio", RadioProcessor);
