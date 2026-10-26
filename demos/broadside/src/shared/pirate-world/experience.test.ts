// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
const fake=vi.hoisted(()=>({caves:[] as any[],holds:[] as any[],fail:false}));
const scene=(engine:any)=>{const s={dispose:vi.fn(()=>engine.scenes.splice(engine.scenes.indexOf(s),1))};engine.scenes.push(s);return s;};
vi.mock('./render/cave',()=>({TreasureCave:class{
  scene:any;depositComplete=false;presentationError:string|null=null;presentationReady=true;
  refresh=vi.fn();showCargo=vi.fn();beginUnload=vi.fn(()=>this.depositComplete=false);endReveal=vi.fn();enter=vi.fn();render=vi.fn();look=vi.fn();walk=vi.fn();
  constructor(engine:any){this.scene=scene(engine);fake.caves.push(this);if(fake.fail)throw new Error('setup failed');}
}}));
vi.mock('./render/shipHold',()=>({ShipHold:class{
  scene:any;pose={discovered:false};presentationReady=true;presentationError=null;openCargo=vi.fn();render=vi.fn();
  constructor(engine:any){this.scene=scene(engine);fake.holds.push(this);}
}}));
import { PirateWorld } from './experience';
import { calculusAdapter } from '../../math/pirateAdapter';
import { freshProgress } from '../../math/academy';
const fixture=()=>{
  const progress=freshProgress();progress.cargo=[{id:7,operator:'add',gold:100,delivered:false},{id:8,operator:'multiply',gold:900,delivered:false}];
  const engine={scenes:[]} as unknown as Engine,events={ready:vi.fn(),changed:vi.fn(),error:vi.fn()};
  return {world:new PirateWorld(engine,calculusAdapter(progress,false),false,events),progress,engine,events};
};
beforeEach(()=>{fake.caves.length=fake.holds.length=0;fake.fail=false;});
describe('common presentation lifecycle',()=>{
  it('keeps the ship loading until its actual chest asset is ready, including non-reveal visits',async()=>{
    const {world,events}=fixture();world.showShip({chapter:0,seed:1},false);await Promise.resolve();
    expect(events.ready).not.toHaveBeenCalled();expect(world.status).toBe('loading');
    const hold=fake.holds[0];hold.pose.discovered=true;hold.presentationReady=false;world.render(.1,false);
    expect(events.ready).not.toHaveBeenCalled();hold.presentationReady=true;world.render(.1,false);world.render(.1,false);
    expect(events.ready).toHaveBeenCalledOnce();expect(world.status).toBe('ready');world.dispose();
  });
  it('cancels stale readiness, keeps one scene and restarts pending cargo with the same ID',async()=>{
    const {world,engine,progress,events}=fixture();world.showShip({chapter:0,seed:1},false);world.cancel();await Promise.resolve();
    expect(events.ready).not.toHaveBeenCalled();expect(engine.scenes).toHaveLength(0);
    world.beginUnload();expect(engine.scenes).toHaveLength(1);expect(fake.caves[0].beginUnload).toHaveBeenCalledWith(0,7);
    fake.caves[0].depositComplete=true;world.cancel();world.render(.1,false);expect(progress.banks.add).toBe(0);
    world.beginUnload();expect(fake.caves[1].beginUnload).toHaveBeenCalledWith(0,7);
    fake.caves[1].depositComplete=true;world.render(.1,false);expect(progress.banks.add).toBe(100);
    fake.caves[1].depositComplete=true;world.render(.1,true);world.render(.1,true);
    expect(progress.banks.multiply).toBe(900);expect(events.changed).toHaveBeenCalledTimes(2);
    expect(events.ready).toHaveBeenCalledOnce();world.dispose();expect(engine.scenes).toHaveLength(0);
  });
  it('freezes completion and controls while backgrounded, then resumes once',()=>{
    const {world,progress}=fixture();world.beginUnload();world.controls.move(1,1);world.suspend();
    fake.caves[0].depositComplete=true;world.render(100,false);expect(progress.banks.add).toBe(0);
    expect(world.controls.read().right).toBe(0);world.resume();world.render(100,false);expect(progress.banks.add).toBe(100);
    expect(fake.caves[0].render).toHaveBeenLastCalledWith(.1,true);world.dispose();
  });
  it('reports loading/physics errors once, keeps cargo, and retries after cancellation',()=>{
    const {world,progress,events}=fixture();world.beginUnload();fake.caves[0].presentationError='Missing physics';
    world.render(.1,false);world.render(.1,false);expect(world.status).toBe('error');expect(events.error).toHaveBeenCalledOnce();
    expect(progress.cargo.every(c=>!c.delivered)).toBe(true);world.cancel();world.beginUnload();expect(world.error).toBeNull();world.dispose();
  });
  it('cleans a partially constructed scene and leaves a failed cargo pending',()=>{
    const {world,engine,progress}=fixture();fake.fail=true;
    expect(()=>world.beginUnload()).toThrow('setup failed');expect(engine.scenes).toHaveLength(0);
    expect(progress.cargo.every(c=>!c.delivered)).toBe(true);
    fake.fail=false;world.beginUnload();expect(engine.scenes).toHaveLength(1);world.dispose();
  });
  it('disposes once and rejects scene creation after disposal',()=>{
    const {world}=fixture();world.showCave();const s=fake.caves[0].scene;world.dispose();world.dispose();
    expect(s.dispose).toHaveBeenCalledOnce();expect(()=>world.showCave()).toThrow('disposed');
  });
});
