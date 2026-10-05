import {afterEach,describe,expect,it,vi} from 'vitest';
import {CoinSounds} from './coinSounds';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture() {
  const recording={duration:4.584,numberOfChannels:2} as AudioBuffer;
  const bytes=new ArrayBuffer(4);
  const voices: {buffer:AudioBuffer|null;playbackRate:{value:number};onended:null|((event:Event)=>void);connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>}[]=[];
  const gains:{gain:{setValueAtTime:ReturnType<typeof vi.fn>;linearRampToValueAtTime:ReturnType<typeof vi.fn>};connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]=[];
  const context={currentTime:0,state:'running',destination:{},
    resume:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined),
    decodeAudioData:vi.fn().mockResolvedValue(recording),
    createBufferSource:()=>{const s={buffer:null,playbackRate:{value:1},onended:null,connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};voices.push(s);return s;},
    createGain:()=>{const g={gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};gains.push(g);return g;},
  };
  const create=vi.fn(()=>context as unknown as AudioContext),load=vi.fn().mockResolvedValue(bytes);
  return {audio:new CoinSounds(create,load),create,load,context,voices,gains,bytes,recording};
}
afterEach(()=>vi.unstubAllGlobals());
describe('recorded coin impact audio',()=>{
  it('has no startup playback, and URL mute prevents creating a context or loading sound',async()=>{
    const f=fixture();f.audio.impacts([1]);expect(f.create).not.toHaveBeenCalled();
    f.audio.configure(new URLSearchParams('mute=true'));f.audio.unlock();f.audio.setEnabled(true);f.audio.unlock();f.audio.impacts([1]);
    expect(f.audio.enabled).toBe(false);expect(f.create).not.toHaveBeenCalled();expect(f.load).not.toHaveBeenCalled();
    f.audio.configure(new URLSearchParams('mute=false'));f.audio.unlock();f.audio.impacts([1]);
    expect(f.voices).toHaveLength(0);await flush();expect(f.voices).toHaveLength(0);
    f.audio.impacts([1]);expect(f.voices).toHaveLength(1);expect(f.context.decodeAudioData).toHaveBeenCalledWith(f.bytes);
  });
  it('uses the supplied stereo recording at original pitch, with fades and bounded voices',async()=>{
    const f=fixture();f.audio.unlock();await flush();f.audio.impacts([NaN,-1,0]);expect(f.voices).toHaveLength(0);
    for(let i=0;i<1000;i++)f.audio.impacts([1,.5,.2]);expect(f.voices).toHaveLength(1);
    f.context.currentTime=.2;f.audio.impacts([.5]);f.context.currentTime=.4;f.audio.impacts([.2]);
    expect(f.voices.map(s=>s.start.mock.calls[0])).toEqual([[0,0,.36],[.2,.38,.36],[.4,.8,.36]]);
    expect(f.voices.every(s=>s.buffer===f.recording&&s.playbackRate.value===1)).toBe(true);
    expect(f.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(.28,.003);
    expect(f.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0,.36);
    f.context.currentTime=1;f.audio.impacts([1]);expect(f.voices).toHaveLength(3);
    f.voices[0]!.onended!(new Event('ended'));f.audio.impacts([1]);expect(f.voices).toHaveLength(4);
    expect(f.voices[0]!.disconnect).toHaveBeenCalled();
  });
  it('stops playback on mute/background and reuses decoded audio only after a new gesture',async()=>{
    const f=fixture();f.audio.unlock();await flush();f.audio.impacts([1]);f.audio.setEnabled(false);
    expect(f.voices[0]!.stop).toHaveBeenCalledOnce();expect(f.gains[0]!.disconnect).toHaveBeenCalledOnce();
    f.audio.setEnabled(true);f.audio.impacts([1]);expect(f.voices).toHaveLength(1);
    f.audio.unlock();f.audio.impacts([1]);expect(f.voices).toHaveLength(2);expect(f.load).toHaveBeenCalledOnce();
    f.audio.pause();expect(f.context.close).toHaveBeenCalledTimes(2);
  });
  it('ignores a recording that finishes loading after mute',async()=>{
    const f=fixture();let finish!:(bytes:ArrayBuffer)=>void;
    f.load.mockImplementation(()=>new Promise<ArrayBuffer>(resolve=>{finish=resolve;}));
    f.audio.unlock();f.audio.setEnabled(false);finish(f.bytes);await flush();f.audio.impacts([1]);
    expect(f.voices).toHaveLength(0);f.audio.setEnabled(true);f.audio.unlock();expect(f.load).toHaveBeenCalledTimes(2);
  });
  it('fetches the actual asset and stays silent when loading fails, with no synthetic fallback',async()=>{
    const f=fixture(),fetch=vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>f.bytes});vi.stubGlobal('fetch',fetch);
    const audio=new CoinSounds(f.create);audio.unlock();await flush();audio.impacts([1]);
    expect(fetch.mock.calls[0]![0]).toMatch(/assets\/audio\/coins-drop\.mp3$/);expect(f.voices[0]!.buffer).toBe(f.recording);
    audio.pause();fetch.mockResolvedValue({ok:false});audio.unlock();await flush(); // Already cached recording remains available.
    const missing=new CoinSounds(f.create);missing.unlock();await flush();missing.impacts([1]);expect(f.voices).toHaveLength(1);
    const broken=fixture();broken.context.decodeAudioData.mockRejectedValue(new Error('invalid mp3'));
    broken.audio.unlock();await flush();broken.audio.impacts([1]);expect(broken.voices).toHaveLength(0);
  });
  it('handles unavailable audio and suspended autoplay without emitting sound',async()=>{
    const broken=new CoinSounds(()=>{throw new Error('unavailable');});expect(()=>broken.unlock()).not.toThrow();
    const f=fixture();f.context.state='suspended';f.context.resume.mockRejectedValue(new Error('autoplay'));
    f.audio.unlock();await flush();f.audio.impacts([1]);expect(f.voices).toHaveLength(0);expect(f.context.close).toHaveBeenCalled();
  });
});
