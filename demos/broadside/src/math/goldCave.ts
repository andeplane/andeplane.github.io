import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Capacitor } from "@capacitor/core";
import { PirateWorld } from "../shared/pirate-world";
import { bindWorldControls } from "../shared/pirate-world";
import { configurePhoneRendering, configureTextureQuality, displayRenderScale, isPhoneRendering } from "../shared/pirate-world/render/quality";
import { generateVoyage } from "../game/voyage";
import { shipPresentation } from "../game/pirateAdapter";
import { calculusAdapter } from "./pirateAdapter";
import { OPERATORS, type MathProgress } from "./academy";

/** Calculus host: save adapter and UI labels; scenes, input and cargo belong to PirateWorld. */
export class GoldCave {
  private engine: Engine;
  private world: PirateWorld | null = null;
  private unbind: (()=>void) | null = null;
  private abort = new AbortController();
  private active = false;
  private progress: MathProgress | null = null;
  constructor(private canvas: HTMLCanvasElement, private onReady:()=>void, private persistent=true, private onChange:()=>void=()=>{}, private commit:(next:MathProgress)=>boolean=()=>true, private onError:(error:string)=>void=()=>{}) {
    this.engine=new Engine(canvas,true,{stencil:true,preserveDrawingBuffer:false});
    configurePhoneRendering(this.engine,Capacitor.isNativePlatform()||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    configureTextureQuality(this.engine);this.resize();
    window.addEventListener("resize",()=>this.resize(),{signal:this.abort.signal});
    window.visualViewport?.addEventListener("resize",()=>this.resize(),{signal:this.abort.signal});
    this.engine.runRenderLoop(()=>{
      const world=this.world;
      if(!this.active||document.hidden||!world)return;
      world.render(this.engine.getDeltaTime()/1000,matchMedia("(prefers-reduced-motion: reduce)").matches);
      if(world.mode==='walk')this.updateHud();
      const cave=world.caveScene;
      canvas.dataset.cavePosition=cave?[cave.walker.x,cave.walker.eyeY,cave.walker.z].map(n=>n.toFixed(2)).join(','):'';
      canvas.dataset.caveYaw=cave?.walker.yaw.toFixed(2)??'';
      canvas.dataset.coinCounts=cave?.coinCounts.join(',')??'0,0,0,0';
      canvas.dataset.restingCoins=cave?.restingCoinCounts.join(',')??'0,0,0,0';
      canvas.dataset.gemStatus=cave?.gemStatus??'';canvas.dataset.goldReserve=cave?.reserveCounts.join(',')??'';
      canvas.dataset.gemCounts=cave?.gemCounts.join(',')??'';canvas.dataset.goldPhysics=String(cave?.goldPhysicsActive??false);
      canvas.dataset.audio='disabled';canvas.dataset.cargoCount=String(world.adapter.snapshot().pending.length);
      canvas.dataset.cargoMode=world.mode;canvas.dataset.activeScenes=String(this.engine.scenes.length);
      canvas.dataset.presentationStatus=world.status;
    });
  }
  private use(progress:MathProgress):PirateWorld {
    this.active=true;this.resize();
    if(this.progress!==progress){
      this.unbind?.();this.world?.dispose();this.progress=progress;
      this.world=new PirateWorld(this.engine,calculusAdapter(progress,this.persistent,this.commit),this.persistent,{ready:this.onReady,changed:this.onChange,error:this.onError});
      this.unbind=bindWorldControls(this.world,this.canvas,{active:()=>this.active&&this.world?.mode==='walk',pad:'#math-cave-pad',thumb:'#math-cave-thumb',jump:'#math-cave-jump',inspect:()=>this.inspect()});
    }
    return this.world!;
  }
  showShip(progress:MathProgress,reveal=true):void {
    this.use(progress).showShip(shipPresentation(generateVoyage(OPERATORS.findIndex(o=>o.id===progress.operator)*10)),reveal);
  }
  show(progress:MathProgress,unload:boolean):void {
    const world=this.use(progress);if(unload)world.beginUnload();else world.showCave();
  }
  get unloading(){return this.world?.unloading??{total:0,delivered:0,done:true,active:null};}
  pause():void {this.active=false;this.world?.cancel();}
  dispose():void {this.pause();this.unbind?.();this.abort.abort();this.world?.dispose();this.engine.stopRenderLoop();this.engine.dispose();}
  resetCamera():void {this.world?.cave.enter();}
  inspect():void {
    const cave=this.world?.cave;if(!cave)return;
    if(cave.inspecting)cave.overview();else if(cave.nearby!==null)cave.select(cave.nearby);
    this.updateHud();
  }
  private resize():void {
    const scale=displayRenderScale(innerWidth,innerHeight,devicePixelRatio,this.engine.getCaps().maxRenderTextureSize,isPhoneRendering(this.engine));
    this.engine.setHardwareScalingLevel(scale);this.canvas.dataset.renderPixelRatio=(1/scale).toFixed(2);this.engine.resize();this.world?.caveScene?.resize();
  }
  private updateHud():void {
    const cave=this.world!.cave,root=document.querySelector<HTMLElement>('#academy');
    if(root)root.dataset.caveView=cave.inspecting?'inspect':'walk';
    const reserve=document.querySelector<HTMLElement>('#math-cave-reserve');
    if(reserve){const amount=cave.reserveCounts.reduce((sum,n)=>sum+n,0);reserve.hidden=amount===0;reserve.textContent=`${amount.toLocaleString()} gold in secured reserve bars`;}
    const footer=document.querySelector<HTMLElement>('.walking-view .cave-bottom');
    if(footer){const bounds=footer.getBoundingClientRect();for(const id of ['math-cave-pad','math-cave-jump']){
      const control=document.getElementById(id);if(!control)continue;const r=control.getBoundingClientRect();
      control.style.bottom=r.width>0&&r.right>bounds.left&&r.left<bounds.right?`${Math.ceil(innerHeight-bounds.top+12)}px`:'calc(32px + var(--safe-bottom) + var(--math-notice-space))';
    }}
    const room=document.querySelector<HTMLElement>('#math-cave-room');if(room)room.textContent=cave.room;
    const button=document.querySelector<HTMLButtonElement>('#math-cave-inspect');
    if(button){button.disabled=!cave.inspecting&&cave.nearby===null;button.textContent=cave.inspecting?'Back to exploring':'Inspect treasure';}
  }
}
