import {describe,expect,it,vi} from 'vitest';
import {coinClink,CoinSounds} from './coinSounds';

function fixture() {
  const voices: {buffer:AudioBuffer|null;playbackRate:{value:number};onended:null|((event:Event)=>void);connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>}[]=[];
  const gains:{gain:{value:number};connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]=[];
  const context={currentTime:0,state:'running',sampleRate:44100,destination:{},
    resume:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined),
    createBuffer:(_channels:number,length:number,rate:number)=>({sampleRate:rate,getChannelData:()=>new Float32Array(length)}),
    createBufferSource:()=>{const s={buffer:null,playbackRate:{value:1},onended:null,connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};voices.push(s);return s;},
    createGain:()=>{const g={gain:{value:1},connect:vi.fn(),disconnect:vi.fn()};gains.push(g);return g;},
  };
  const create=vi.fn(()=>context as unknown as AudioContext);
  return {audio:new CoinSounds(create),create,context,voices,gains};
}
describe('coin impact audio',()=>{
  it('has no startup playback, and mute=true prevents even creating an audio context',()=>{
    const f=fixture();f.audio.impacts([1]);expect(f.create).not.toHaveBeenCalled();
    f.audio.configure(new URLSearchParams('mute=true'));f.audio.unlock();f.audio.setEnabled(true);f.audio.unlock();f.audio.impacts([1]);
    expect(f.audio.enabled).toBe(false);expect(f.create).not.toHaveBeenCalled();
    f.audio.configure(new URLSearchParams('mute=false'));f.audio.unlock();
    expect(f.create).toHaveBeenCalledTimes(1);expect(f.voices).toHaveLength(0);
    f.audio.impacts([1]);expect(f.voices).toHaveLength(1);
  });
  it('varies the metal clinks and bounds scheduled audio during thousands of collisions',()=>{
    const f=fixture();f.audio.unlock();f.audio.impacts([NaN,-1,0]);expect(f.voices).toHaveLength(0);
    for(let i=0;i<1000;i++)f.audio.impacts([1,.5,.2]);
    expect(f.voices).toHaveLength(3);
    expect(f.voices.map(s=>s.start.mock.calls[0]![0])).toEqual([0,.055,.11]);
    expect(f.voices[0]!.buffer).not.toBe(f.voices[1]!.buffer);
    expect(f.gains[0]!.gain.value).toBeGreaterThan(f.gains[2]!.gain.value);
    f.context.currentTime=1;for(let i=0;i<10;i++){f.context.currentTime+=1;f.audio.impacts([1,1,1]);}
    expect(f.voices).toHaveLength(8);
    f.voices[0]!.onended!(new Event('ended'));f.context.currentTime+=1;f.audio.impacts([1]);
    expect(f.voices).toHaveLength(9);expect(f.voices[0]!.disconnect).toHaveBeenCalled();
    f.audio.pause();expect(f.context.close).toHaveBeenCalledTimes(1);
  });
  it('stops queued clinks immediately on mute or backgrounding and requires a new gesture',()=>{
    const f=fixture();f.audio.unlock();f.audio.impacts([1,.5]);f.audio.setEnabled(false);
    expect(f.voices.every(s=>s.stop.mock.calls.length===1)).toBe(true);
    expect(f.gains.every(g=>g.disconnect.mock.calls.length===1)).toBe(true);
    f.audio.setEnabled(true);f.audio.impacts([1]);expect(f.voices).toHaveLength(2);
    f.audio.unlock();f.audio.pause();f.audio.impacts([1]);expect(f.voices).toHaveLength(2);
    expect(f.create).toHaveBeenCalledTimes(2);
  });
  it('handles unavailable audio and suspended autoplay without emitting a sound',async()=>{
    const broken=new CoinSounds(()=>{throw new Error('unavailable');});expect(()=>broken.unlock()).not.toThrow();
    const f=fixture();f.context.state='suspended';f.context.resume.mockRejectedValue(new Error('autoplay'));
    f.audio.unlock();f.audio.impacts([1]);await Promise.resolve();
    expect(f.voices).toHaveLength(0);expect(f.context.close).toHaveBeenCalled();
  });
});
describe('metallic clink waveform',()=>{
  it('has a short attack, fading tail, finite headroom, and distinct pitches',()=>{
    const a=new Float32Array(7056),b=new Float32Array(7056);
    coinClink(a,44100,0);coinClink(b,44100,7);
    expect(a[0]).toBe(0);expect(a.at(-1)).toBe(0);expect(a.every(Number.isFinite)).toBe(true);
    expect(Math.max(...a.map(Math.abs))).toBeLessThan(1);
    const energy=(start:number,end:number)=>a.slice(start,end).reduce((sum,x)=>sum+x*x,0);
    expect(energy(6000,7000)).toBeLessThan(energy(100,1100)*.001);
    expect(a).not.toEqual(b);
  });
});
