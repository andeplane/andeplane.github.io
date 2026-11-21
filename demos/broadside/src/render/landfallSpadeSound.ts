import { Rng } from "../sim/rng";

/** Three short layers recorded into reusable PCM buffers: bite, falling grit and
 * the struck chest fitting. The AudioContext is created by the dig gesture. */
export class SpadeSound {
  private context?: AudioContext;
  private output?: GainNode;
  private earth?: AudioBuffer;
  private metal?: AudioBuffer;
  private muted = false;

  unlock(): void {
    if (this.muted || typeof AudioContext === "undefined") return;
    try {
      if (!this.context) {
        const ctx = new AudioContext({ latencyHint: "interactive" });
        this.context = ctx;
        this.output = ctx.createGain();
        this.output.gain.value = 0.68;
        this.output.connect(ctx.destination);
        this.earth = this.makeBuffer(false);
        this.metal = this.makeBuffer(true);
      }
      if (this.context.state !== "running") void this.context.resume().catch(() => {});
    } catch {
      /* Audio can be unavailable in embedded/suspended WebViews. */
    }
  }

  private makeBuffer(metal: boolean): AudioBuffer {
    const ctx = this.context!,
      rate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.ceil(rate * (metal ? 0.46 : 0.35)), rate);
    const data = buf.getChannelData(0),
      rng = new Rng(metal ? 621 : 157);
    let low = 0,
      previous = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate,
        noise = rng.range(-1, 1);
      low += (1 - Math.exp((-2 * Math.PI * 950) / rate)) * (noise - low);
      const attack = Math.min(1, t / 0.003);
      if (metal) {
        // An iron strap rings at inharmonic frequencies and decays quickly in the soil.
        data[i] =
          attack *
          (0.16 * Math.sin(2 * Math.PI * 1137 * t) * Math.exp(-13 * t) +
            0.082 * Math.sin(2 * Math.PI * 2059 * t) * Math.exp(-23 * t) +
            0.04 * Math.sin(2 * Math.PI * 3271 * t) * Math.exp(-37 * t));
      } else {
        const body = Math.sin(2 * Math.PI * (62 * t + 1.4 * (1 - Math.exp(-26 * t)))) * 0.4 * Math.exp(-35 * t);
        const bite = (low * 0.73 + (noise - previous) * 0.13) * Math.exp(-38 * t);
        const gritTime = t - 0.068;
        const grit = gritTime > 0 ? low * 0.58 * Math.min(1, gritTime * 28) * Math.exp(-13 * gritTime) : 0;
        data[i] = attack * (body + bite + grit);
      }
      previous = noise;
    }
    return buf;
  }

  impact(clink: boolean, variation: number): void {
    const ctx = this.context;
    if (this.muted || !ctx || !this.output || ctx.state === "closed") return;
    const play = (buffer: AudioBuffer | undefined, delay: number) => {
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 0.95 + variation * 0.11;
      source.connect(this.output!);
      source.onended = () => source.disconnect();
      source.start(ctx.currentTime + delay);
    };
    play(this.earth, 0);
    if (clink) play(this.metal, 0.013);
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.output && this.context)
      this.output.gain.setTargetAtTime(value ? 0 : 0.68, this.context.currentTime, 0.008);
  }
  dispose(): void {
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = undefined;
    this.output = undefined;
  }
}
