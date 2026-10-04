import type { Engine } from '@babylonjs/core/Engines/engine.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { TreasureCave } from '../render/cave';
import { ShipHold } from '../render/shipHold';
import { generateVoyage } from '../game/voyage';
import { CoinDebugQueue, CoinFrameSamples } from '../game/debugCoins';
import { GOLD_AREAS } from '../game/goldAreas';
import { installFullscreen } from './fullscreen';
import './debugCoins.css';

type Location = 'cave' | 'ship';
type View = TreasureCave | ShipHold;
interface Sandbox { view: View; queue: CoinDebugQueue; meter: SceneInstrumentation; frames: CoinFrameSamples; }

/** Deliberately entered before any player storage or normal game state is created. */
export function startCoinDebug(engine: Engine, initial: Location, quality: () => void): void {
  let location=initial, world=0, previous=0, lastUi=0, disposed=false;
  const sandboxes: Partial<Record<Location,Sandbox>> = {};
  const history: string[] = ['location,area,coins,pour_seconds,fps,frame_p95_ms,cpu_render_ms,draw_calls,width,height'];
  const get = (): Sandbox => sandboxes[location] ??= (()=>{
    const view=location==='cave'?new TreasureCave(engine,false,true):new ShipHold(engine,generateVoyage(0));
    view.debugCoinBank(location==='cave'?world:0);
    return {view,queue:new CoinDebugQueue(),meter:new SceneInstrumentation(view.scene),frames:new CoinFrameSamples()};
  })();
  const root=document.createElement('section');root.id='coin-debug';
  root.innerHTML=`<header><b>Coin dropping lab</b><span>Temporary piles · saves untouched · silent</span></header>
    <div class="coin-debug-controls"><label>Place <select id="coin-debug-place"><option value="cave">Cave</option><option value="ship">Ship hold</option></select></label>
    <label id="coin-debug-area-label">Area <select id="coin-debug-area">${GOLD_AREAS.map((a,i)=>`<option value="${i}">${a.name}</option>`).join('')}</select></label>
    <button id="coin-debug-add" class="primary">Add 1,000 coins</button>
    <button id="coin-debug-reset">Reset cave</button><button id="coin-debug-export">Export measurements</button></div>
    <output id="coin-debug-stats" aria-label="Live coin performance"></output><p id="coin-debug-status" role="status"></p>
    <details><summary>Completed pours</summary><pre id="coin-debug-history">No pours yet.</pre></details>`;
  document.body.append(root);
  const find=<T extends HTMLElement>(id:string)=>root.querySelector<T>(`#coin-debug-${id}`)!;
  const place=find<HTMLSelectElement>('place'), area=find<HTMLSelectElement>('area'), add=find<HTMLButtonElement>('add');
  const reset=find<HTMLButtonElement>('reset'), stats=find<HTMLOutputElement>('stats'), status=find<HTMLParagraphElement>('status');
  place.value=location;
  const update = () => {
    const s=get(), bank=location==='cave'?world:0, values=s.frames.values;
    const shown=s.view.coinCounts[bank]??0, resting=s.view.restingCoinCounts[bank]??0;
    stats.textContent=`${shown.toLocaleString()} visible · ${resting.toLocaleString()} resting · ${Math.max(0,shown-resting).toLocaleString()} moving\n`+
      `${values.fps.toFixed(0)} FPS · ${values.p95.toFixed(1)} ms frame p95 · ${values.render.toFixed(1)} ms CPU render\n`+
      `${s.meter.drawCallsCounter.current} draw calls · ${engine.getRenderWidth()} × ${engine.getRenderHeight()} pixels`;
    status.textContent=s.queue.error??(s.queue.active?`Pouring chest · ${s.queue.pending} more queued · ${((performance.now()-s.queue.active.started)/1000).toFixed(1)} s`:
      s.queue.pending?`${s.queue.pending} chests queued`:'Tap Add repeatedly to build up the hoard.');
    place.disabled=area.disabled=s.queue.busy;
    add.disabled=!!s.queue.error||s.queue.totals[bank]!+(s.queue.pending+(s.queue.active?1:0)+1)*1000>100_000;
    find('area-label').hidden=location==='ship'; reset.textContent=`Reset ${location==='ship'?'ship hold':'cave'}`;
  };
  add.onclick=()=>{ get().queue.enqueue(location==='cave'?world:0); update(); };
  place.onchange=()=>{location=place.value as Location;previous=0;get();update();};
  area.onchange=()=>{world=Number(area.value);get().view.debugCoinBank(world);previous=0;update();};
  reset.onclick=()=>{const s=get();s.meter.dispose();s.view.scene.dispose();delete sandboxes[location];previous=0;get();update();};
  find('export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([history.join('\n')+'\n'],{type:'text/csv'}));
    const link=document.createElement('a');link.href=url;link.download='broadside-coins.csv';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const resize=()=>{quality();engine.resize();previous=0;};
  window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{previous=0;});
  installFullscreen(root,resize);
  const render=()=>{
    if(disposed||document.hidden){previous=0;return;}
    const now=performance.now(), interval=previous?now-previous:0;previous=now;
    const s=get(), bank=location==='cave'?world:0;
    if(s.queue.start(bank,now)) s.view.debugCoinBank(bank,true);
    const start=performance.now();
    s.view.render(Math.min(.1,(interval||16.67)/1000),s.view instanceof TreasureCave);
    s.frames.add(interval,performance.now()-start);
    if(s.view.coinError) s.queue.fail(s.view.coinError);
    if(s.queue.active&&s.view.depositComplete){
      const result=s.queue.complete(performance.now())!, v=s.frames.values;
      history.push([location,result.world,result.coins,result.seconds.toFixed(2),v.fps.toFixed(1),v.p95.toFixed(2),v.render.toFixed(2),s.meter.drawCallsCounter.current,engine.getRenderWidth(),engine.getRenderHeight()].join(','));
      find('history').textContent=history.slice(1).slice(-12).map(row=>{const c=row.split(',');return `${c[0]} / ${c[1]}: ${Number(c[2]).toLocaleString()} coins · ${c[3]} s · ${c[4]} FPS · p95 ${c[5]} ms`;}).join('\n');
      update();
    }
    if(now-lastUi>250){lastUi=now;update();}
  };
  window.addEventListener('pagehide',(event)=>{
    if(event.persisted) return;
    disposed=true;engine.stopRenderLoop(render);
    for(const s of Object.values(sandboxes)){s.meter.dispose();s.view.scene.dispose();}
    engine.dispose();
  },{once:true});
  get();update();document.querySelector('#loading')?.remove();engine.runRenderLoop(render);
}
