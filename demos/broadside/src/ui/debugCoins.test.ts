// @vitest-environment happy-dom
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Engine} from '@babylonjs/core/Engines/engine.js';
const fake=vi.hoisted(()=>({views:[] as {calls:number[][];depositComplete:boolean;dispose:ReturnType<typeof vi.fn>}[]}));
vi.mock('../render/cave',()=>({TreasureCave:class {
  calls:number[][]=[];depositComplete=false;coinError=null;coinCounts=[0,0,0,0];restingCoinCounts=[0,0,0,0];
  coinPhysicsMetrics={lastMs:1,meanMs:2,maxMs:3,staticTriangles:42};
  dispose=vi.fn();scene={dispose:this.dispose};
  constructor(){fake.views.push(this);}
  debugCoinBank(world:number,add=false){this.calls.push([world,Number(add)]);this.depositComplete=false;}
  render(){}
}}));
vi.mock('../render/shipHold',()=>({ShipHold:class {
  calls:number[][]=[];depositComplete=false;coinError=null;coinCounts=[0];restingCoinCounts=[0];
  coinPhysicsMetrics={lastMs:1,meanMs:2,maxMs:3,staticTriangles:42};
  dispose=vi.fn();scene={dispose:this.dispose};
  constructor(){fake.views.push(this);}
  debugCoinBank(world:number,add=false){this.calls.push([world,Number(add)]);this.depositComplete=false;}
  render(){}
}}));
vi.mock('@babylonjs/core/Instrumentation/sceneInstrumentation.js',()=>({SceneInstrumentation:class{drawCallsCounter={current:12};dispose(){}}}));
vi.mock('./fullscreen',()=>({installFullscreen:vi.fn()}));
import {startCoinDebug} from './debugCoins';
afterEach(()=>{window.dispatchEvent(new Event('pagehide'));document.body.innerHTML='';fake.views.length=0;vi.restoreAllMocks();});
describe('coin lab controls',()=>{
  it('queues repeated clicks, preserves each place and resets only the selected sandbox',()=>{
    document.body.innerHTML='<canvas id="game"></canvas><div id="loading"></div>';
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    let render=()=>{};
    const engine={runRenderLoop:(fn:()=>void)=>{render=fn;},stopRenderLoop:vi.fn(),dispose:vi.fn(),resize:vi.fn(),getRenderWidth:()=>600,getRenderHeight:()=>1000} as unknown as Engine;
    startCoinDebug(engine,'cave',vi.fn());
    const button=document.querySelector<HTMLButtonElement>('#coin-debug-add')!;
    const place=document.querySelector<HTMLSelectElement>('#coin-debug-place')!;
    button.click();button.click();button.click();expect(place.disabled).toBe(true);
    render();expect(fake.views[0]!.calls).toEqual([[0,0],[0,1]]);
    render();expect(fake.views[0]!.calls).toHaveLength(2);
    for(let i=0;i<3;i++){fake.views[0]!.depositComplete=true;render();if(i<2)render();}
    expect(fake.views[0]!.calls).toEqual([[0,0],[0,1],[0,1],[0,1]]);
    expect(place.disabled).toBe(false);
    expect(document.querySelector('#coin-debug-stats')!.textContent).toContain('2.0 ms mean physics tick');
    expect(document.querySelector('#coin-debug-history')!.textContent).toContain('3,000 coins');
    place.value='ship';place.dispatchEvent(new Event('change'));
    expect(fake.views).toHaveLength(2);button.click();render();fake.views[1]!.depositComplete=true;render();
    expect(document.querySelector('#coin-debug-history')!.textContent).toContain('ship / 0: 1,000 coins');
    place.value='cave';place.dispatchEvent(new Event('change'));expect(fake.views).toHaveLength(2);
    document.querySelector<HTMLButtonElement>('#coin-debug-reset')!.click();
    expect(fake.views[0]!.dispose).toHaveBeenCalledOnce();expect(fake.views[1]!.dispose).not.toHaveBeenCalled();
    expect(fake.views).toHaveLength(3);expect(document.querySelector('#loading')).toBeNull();
  });
});
