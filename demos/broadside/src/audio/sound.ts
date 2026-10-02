import type { GameEvent } from "../game/session";
import type { SimEvent } from "../sim/world";

/** Original, synthesized effects. No downloads, autoplay, music, or audio libraries. */
export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private surf: AudioBufferSourceNode | null = null;
  muted = false;
  voice = true;
  private suspended = false;
  private surfGain: GainNode | null = null;
  private ambienceClock = 0;
  private lastThunder = -1;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  get state(): string {
    return this.context?.state ?? "locked";
  }
  async unlock(): Promise<void> {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.48;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -14;
        limiter.ratio.value = 8;
        this.master.connect(limiter).connect(this.context.destination);
        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate * 2,
          this.context.sampleRate,
        );
        const data = this.noise.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          last = (last + (Math.random() * 2 - 1) * 0.035) / 1.035;
          data[i] = last * 4;
        }
        this.surf = this.context.createBufferSource();
        this.surf.buffer = this.noise;
        this.surf.loop = true;
        const filter = this.context.createBiquadFilter();
        filter.frequency.value = 620;
        const gain = (this.surfGain = this.context.createGain());
        gain.gain.value = 0.13;
        this.surf.connect(filter).connect(gain).connect(this.master);
        this.surf.start();
      }
      if (!this.suspended) await this.context.resume();
    } catch {
      /* Sailing still works if a browser or device cannot create audio. */
    }
  }
  say(text: string): void {
    if (
      !this.voice ||
      this.muted ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    )
      return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-GB";
      utterance.rate = 0.95;
      utterance.pitch = 1.15;
      utterance.volume = 0.65;
      const localEnglish = speechSynthesis
        .getVoices()
        .find((v) => v.localService && v.lang.startsWith("en"));
      if (localEnglish) utterance.voice = localEnglish;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch {
      /* Optional spoken hints never block the game. */
    }
  }
  toggle(): boolean {
    this.muted = !this.muted;
    if (this.muted && "speechSynthesis" in window) speechSynthesis.cancel();
    this.master?.gain.setTargetAtTime(
      this.muted ? 0 : 0.48,
      this.context!.currentTime,
      0.05,
    );
    return this.muted;
  }
  pause(paused: boolean): void {
    this.suspended = paused;
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    // Let the treasure chime finish before suspending the audio device.
    if (paused)
      this.pauseTimer = setTimeout(() => {
        if (this.suspended) void this.context?.suspend();
      }, 1300);
    else void this.unlock();
  }
  private tone(
    freq: number,
    duration: number,
    volume = 0.15,
    delay = 0,
    end = freq,
    type: OscillatorType = "sine",
  ): void {
    const c = this.context,
      m = this.master;
    if (!c || !m || c.state !== "running" || this.muted) return;
    const at = c.currentTime + delay,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + duration);
    o.connect(g).connect(m);
    o.start(at);
    o.stop(at + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  private puff(duration: number, freq: number, volume: number): void {
    const c = this.context;
    if (
      !c ||
      !this.noise ||
      !this.master ||
      c.state !== "running" ||
      this.muted
    )
      return;
    const source = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    source.buffer = this.noise;
    f.type = "lowpass";
    f.frequency.value = freq;
    g.gain.setValueAtTime(volume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(f).connect(g).connect(this.master);
    source.start();
    source.stop(c.currentTime + duration);
    source.onended = () => {
      source.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }
  storm(chapter: number, elapsed: number): void {
    if (chapter < 2) return;
    const n = Math.floor(elapsed / 14);
    if (elapsed % 14 > 10.7 && n !== this.lastThunder) {
      this.lastThunder = n;
      this.puff(1.6, 180, 0.13);
      this.tone(45, 1.2, 0.07, 0, 25, "triangle");
    }
  }
  resetStorm(): void {
    this.lastThunder = -1;
  }
  ambience(
    place: "menu" | "cave" | "play" | "result" | "loading",
    dt: number,
  ): void {
    const c = this.context;
    if (!c || c.state !== "running" || this.muted || this.suspended) return;
    this.surfGain?.gain.setTargetAtTime(
      place === "cave" || place === "result"
        ? 0.04
        : place === "menu"
          ? 0.07
          : 0.13,
      c.currentTime,
      0.8,
    );
    this.ambienceClock += dt;
    if (this.ambienceClock > 7) {
      this.ambienceClock = 0;
      if (place === "cave") {
        this.tone(1850, 0.19, 0.035, 0, 900);
        this.tone(1850, 0.23, 0.015, 0.17, 900);
      } else if (place === "play") this.tone(75, 0.4, 0.025, 0, 55, "triangle");
    }
  }
  click(): void {
    this.tone(540, 0.12, 0.11, 0, 880);
  }
  chest(): void {
    this.tone(180, 0.8, 0.12, 0, 420, "triangle");
    [440, 554, 659].forEach((f, i) => this.tone(f, 1.2, 0.07, 0.25 + i * 0.18));
  }
  chestOpen(): void {
    this.puff(0.6, 700, 0.1);
    this.tone(160, 0.55, 0.12, 0, 400, "triangle");
    [784, 1047, 1319, 1568].forEach((f, i) =>
      this.tone(f, 1.4, 0.09, i * 0.13),
    );
  }
  cheer(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.7, 0.14, i * 0.1));
  }
  handle(
    sim: readonly SimEvent[],
    events: readonly GameEvent[],
    playerId: number,
  ): void {
    // One voice per category per step, even when a volley has six hits.
    if (sim.some((e) => e.type === "fire")) {
      this.tone(140, 0.32, 0.4, 0, 35, "triangle");
      this.puff(0.3, 1200, 0.5);
    }
    if (sim.some((e) => e.type === "bump" && e.shipId === playerId)) {
      this.puff(0.3, 480, 0.22);
      this.tone(95, 0.28, 0.18, 0, 35, "triangle");
    }
    if (sim.some((e) => e.type === "hit")) {
      this.puff(0.14, 2300, 0.2);
      this.tone(220, 0.12, 0.08, 0, 90);
    }
    if (sim.some((e) => e.type === "splash")) this.puff(0.24, 1500, 0.12);
    if (sim.some((e) => e.type === "sunk" && e.shipId !== playerId)) {
      this.puff(0.8, 900, 0.28);
      this.tone(340, 0.8, 0.1, 0, 100);
    }
    for (const e of events) {
      if (e.type === "reward") this.cheer();
      if (e.type === "reward")
        this.say(
          "Well done, Captain! Your ship got an upgrade. Your next adventure is waiting.",
        );
      if (e.type === "banner" && e.title !== "Sunset Cove")
        this.say(`${e.title} ${e.subtitle}`);
      if (e.type === "rescue") {
        this.tone(1300, 0.18, 0.08, 0, 2000);
        this.tone(1600, 0.2, 0.08, 0.2, 1100);
      }
      if (e.type === "gold") {
        this.tone(1200, 0.28, 0.1);
        this.tone(1800, 0.35, 0.08, 0.07);
      }
    }
  }
}
