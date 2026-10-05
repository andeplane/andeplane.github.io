/** Short, inharmonic metal resonances. No looping track or noise generator. */
export function coinClink(samples: Float32Array, rate: number, variant: number): void {
  const pitch = 2350 + variant * 117;
  const partials = [1, 1.47, 2.31, 3.08, 4.17];
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, attack = Math.min(1, t / .0015);
    let value = 0;
    for (let p = 0; p < partials.length; p++)
      value += Math.sin(2 * Math.PI * pitch * partials[p]! * t + p * .31) *
        Math.exp(-t * (48 + p * 23)) / (p + 1);
    samples[i] = i === samples.length - 1 ? 0 : value * attack * .35 * Math.min(1, (samples.length - 1 - i) / (rate * .006));
  }
}

/** One shared, bounded audio bank for cave and ship impacts. Unlock is a gesture. */
export class CoinSounds {
  private context: AudioContext | null = null;
  private buffers: AudioBuffer[] = [];
  private voices = new Set<AudioBufferSourceNode>();
  private next = 0;
  private variant = 0;
  private chosen = true;
  private paused = true;
  locked = false;
  constructor(private createContext = () => new AudioContext()) {}
  get enabled(): boolean { return this.chosen && !this.locked; }
  configure(params: URLSearchParams): void {
    this.locked = /^(true|1)$/i.test(params.get('mute') ?? '');
    if (!this.enabled) this.pause();
  }
  setEnabled(enabled: boolean): void {
    this.chosen = enabled;
    if (!this.enabled) this.pause();
  }
  unlock(): void {
    if (!this.enabled) return;
    this.paused = false;
    try {
      if (!this.context) {
        this.context = this.createContext();
        this.buffers = Array.from({length: 8}, (_, i) => {
          const b = this.context!.createBuffer(1, Math.ceil(this.context!.sampleRate * .16), this.context!.sampleRate);
          coinClink(b.getChannelData(0), b.sampleRate, i);
          return b;
        });
        this.next = this.context.currentTime;
      }
      const c=this.context;
      if(c.state==='suspended')void c.resume().catch(() => {if(this.context===c)this.pause();});
    } catch { this.pause(); }
  }
  impacts(strengths: readonly number[]): void {
    const c = this.context;
    if (!c || this.paused || !this.enabled || c.state !== 'running') return;
    for (const strength of strengths.slice(0, 3)) {
      if (!Number.isFinite(strength) || strength <= 0) continue;
      // At most ~18 clinks/second, eight voices and 120 ms of queued sound.
      const time = Math.max(c.currentTime, this.next);
      if (time > c.currentTime + .12 || this.voices.size >= 8) break;
      const source = c.createBufferSource(), gain = c.createGain();
      source.buffer = this.buffers[this.variant++ % this.buffers.length]!;
      source.playbackRate.value = .93 + Math.random() * .14;
      gain.gain.value = .08 + Math.min(1, strength) * .14;
      source.connect(gain); gain.connect(c.destination);
      this.voices.add(source);
      source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
      source.start(time); this.next = time + .055;
    }
  }
  pause(): void {
    this.paused = true;
    for (const source of this.voices) { source.stop(); source.onended?.(new Event('ended')); }
    this.voices.clear();
    const c = this.context; this.context = null; this.buffers = [];
    if (c) void c.close().catch(() => {});
  }
}
export const coinSounds = new CoinSounds();

export function installCoinSounds(params: URLSearchParams): void {
  coinSounds.configure(params);
  const unlock = (event: Event) => { if (event.isTrusted && !document.hidden) coinSounds.unlock(); };
  document.addEventListener('pointerdown', unlock, {capture: true});
  document.addEventListener('keydown', unlock, {capture: true});
  document.addEventListener('click', unlock, {capture: true});
  document.addEventListener('visibilitychange', () => { if (document.hidden) coinSounds.pause(); });
  window.addEventListener('blur', () => coinSounds.pause());
  window.addEventListener('pagehide', () => coinSounds.pause());
}
