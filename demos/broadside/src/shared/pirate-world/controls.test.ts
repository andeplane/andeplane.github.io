// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const native=vi.hoisted(()=>({callback:null as null|((s:{isActive:boolean})=>void),remove:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true}}));
vi.mock('@capacitor/app',()=>({App:{addListener:vi.fn(async (_name,fn)=>{native.callback=fn;return {remove:native.remove};})}}));
import { bindWorldControls } from './controls';
import { CaveWalkControls } from './input/caveWalk';
import type { PirateWorld } from './experience';
beforeEach(()=>{native.callback=null;native.remove.mockClear();document.body.innerHTML='<canvas tabindex="0"></canvas>';});
describe('common input listener lifetime',()=>{
  it('dismisses treasure inspection before the host processes Escape', () => {
    const controls = new CaveWalkControls();
    const cave = { inspecting: true, overview: vi.fn() };
    const world = { controls, caveScene: cave, status: 'ready', onReset: () => () => {} } as unknown as PirateWorld;
    const canvas = document.querySelector('canvas')!;
    const escape = vi.fn();
    document.addEventListener('keydown', escape);
    const unbind = bindWorldControls(world, canvas, { active: () => true });
    try {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
      expect(cave.overview).toHaveBeenCalledOnce();
      expect(escape).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(canvas);
    } finally {
      unbind();
      document.removeEventListener('keydown', escape);
    }
  });

  it('clears input on native/DOM interruptions and removes listeners even before native registration finishes',async()=>{
    const controls=new CaveWalkControls(),reset=new Set<()=>void>();
    const world={controls,status:'ready',onReset:(fn:()=>void)=>{reset.add(fn);return ()=>reset.delete(fn);},suspend:vi.fn(()=>controls.clear()),resume:vi.fn()} as unknown as PirateWorld;
    const canvas=document.querySelector('canvas')!,back=vi.fn(),unbind=bindWorldControls(world,canvas,{active:()=>true,back});
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));expect(controls.read().forward).toBe(1);
    native.callback!({isActive:false});expect(world.suspend).toHaveBeenCalled();expect(controls.read().forward).toBe(0);
    native.callback!({isActive:true});expect(world.resume).toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));expect(back).toHaveBeenCalledOnce();
    unbind();await Promise.resolve();expect(native.remove).toHaveBeenCalled();expect(reset.size).toBe(0);
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));expect(controls.read().forward).toBe(0);
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));expect(back).toHaveBeenCalledOnce();
  });
});
