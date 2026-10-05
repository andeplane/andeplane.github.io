/** Actual coin-drop recording supplied by the player. Never synthesize a fallback. */
async function loadCoinRecording(): Promise<ArrayBuffer> {
  const response=await fetch(`${import.meta.env.BASE_URL}assets/audio/coins-drop.mp3`);
  if(!response.ok)throw new Error('Coin recording unavailable');
  return response.arrayBuffer();
}
const COIN_OFFSETS=[0,.38,.8,1.23,1.68,2.11,2.57,3.05];

/** One shared recording for cave and ship impacts. Unlock is a gesture. */
export class CoinSounds {
  private context: AudioContext | null = null;
  private recording: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private voices = new Set<AudioBufferSourceNode>();
  private next = 0;
  private variant = 0;
  private chosen = true;
  private paused = true;
  locked = false;
  constructor(private createContext = () => new AudioContext(), private loadRecording = loadCoinRecording) {}
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
        this.next = this.context.currentTime;
      }
      const c=this.context;
      if(!this.recording&&!this.loading){
        this.loading=this.loadRecording().then(bytes=>c.decodeAudioData(bytes)).then(buffer=>{
          if(this.context===c)this.recording=buffer;
        }).catch(()=>{}).finally(()=>{if(this.context===c)this.loading=null;});
      }
      if(c.state==='suspended')void c.resume().catch(() => {if(this.context===c)this.pause();});
    } catch { this.pause(); }
  }
  impacts(strengths: readonly number[]): void {
    const c = this.context;
    if (!c || !this.recording || this.paused || !this.enabled || c.state !== 'running') return;
    for (const strength of strengths.slice(0, 3)) {
      if (!Number.isFinite(strength) || strength <= 0) continue;
      // Recorded clusters contain several coins; cap them at ~6/second and three voices.
      const time = Math.max(c.currentTime, this.next);
      if (time > c.currentTime + .12 || this.voices.size >= 3) break;
      const source = c.createBufferSource(), gain = c.createGain();
      source.buffer = this.recording;
      // Preserve the recording's natural pitch and stereo image.
      const offset=COIN_OFFSETS[this.variant++ % COIN_OFFSETS.length]!, duration=.36;
      const volume=.1+Math.min(1,strength)*.18;
      gain.gain.setValueAtTime(0,time);
      gain.gain.linearRampToValueAtTime(volume,time+.003);
      gain.gain.setValueAtTime(volume,time+duration-.018);
      gain.gain.linearRampToValueAtTime(0,time+duration);
      source.connect(gain); gain.connect(c.destination);
      this.voices.add(source);
      source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
      source.start(time,offset,duration); this.next = time + .16;
    }
  }
  pause(): void {
    this.paused = true;
    for (const source of this.voices) { source.stop(); source.onended?.(new Event('ended')); }
    this.voices.clear();
    const c = this.context; this.context = null; this.loading = null;
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
