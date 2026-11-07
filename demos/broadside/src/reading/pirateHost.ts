import { Engine } from "@babylonjs/core/Engines/engine.js";
import { PirateWorld, bindWorldControls } from "../shared/pirate-world";
import { configurePhoneRendering, configureTextureQuality, displayRenderScale, isPhoneRendering } from "../shared/pirate-world/render/quality";
import { readingAdapter } from "./pirateAdapter";
import type { ReadingProgress } from "./progress";
/** Reading owns its UI and ledger. All scenes, gestures and animations belong to PirateWorld. */
export class ReadingPirateHost {
 private engine:Engine;private world:PirateWorld;private unbind:()=>void;private abort=new AbortController();
 constructor(canvas:HTMLCanvasElement,p:ReadingProgress,commit:(next:ReadingProgress)=>boolean,changed:()=>void,ready:()=>void,error:(message:string)=>void,persistent=true){
  this.engine=new Engine(canvas,true,{stencil:true});configurePhoneRendering(this.engine,true);configureTextureQuality(this.engine);
  this.world=new PirateWorld(this.engine,readingAdapter(p,commit,persistent),persistent,{changed,ready,error});
  this.unbind=bindWorldControls(this.world,canvas,{active:()=>this.world.mode==="walk",pad:"#reader-pad",thumb:"#reader-thumb",jump:"#reader-jump",inspect:()=>this.inspect()});
  const resize=()=>{this.engine.setHardwareScalingLevel(displayRenderScale(innerWidth,innerHeight,devicePixelRatio,this.engine.getCaps().maxRenderTextureSize,isPhoneRendering(this.engine)));this.engine.resize();this.world.caveScene?.resize();};
  window.addEventListener("resize",resize,{signal:this.abort.signal});window.visualViewport?.addEventListener("resize",resize,{signal:this.abort.signal});resize();
  this.engine.runRenderLoop(()=>{if(document.hidden)return;this.world.render(this.engine.getDeltaTime()/1000,matchMedia("(prefers-reduced-motion: reduce)").matches);canvas.dataset.presentationStatus=this.world.status;canvas.dataset.cargoMode=this.world.mode;canvas.dataset.coinCounts=this.world.caveScene?.coinCounts.join(",")??"";const walker=this.world.caveScene?.walker;canvas.dataset.cavePosition=walker?[walker.x,walker.eyeY,walker.z].map(n=>n.toFixed(2)).join(","):"";canvas.dataset.caveYaw=walker?.yaw.toFixed(3)??"";const cave=this.world.caveScene;const inspect=document.querySelector<HTMLButtonElement>('[data-action="inspect"]');if(inspect&&cave){inspect.disabled=!cave.inspecting&&cave.nearby===null;inspect.textContent=cave.inspecting?(p.ui==="nb"?"Tilbake til utforsking":"Back to exploring"):cave.nearby!==null?(p.ui==="nb"?"Se nærmere på skatten":"Inspect treasure"):(p.ui==="nb"?"Kom nærmere skatten":"Walk closer to treasure");}const room=document.querySelector("#reader-room");if(room&&this.world.caveScene)room.textContent=this.world.caveScene.room;});
 }
 show(mode:"ship"|"cave"|"unload",language:number):void{if(mode==="ship")this.world.showShip({chapter:language,seed:1729+language},false);else if(mode==="unload")this.world.beginUnload();else this.world.showCave();}
 get unloading(){return this.world.unloading;}
 inspect():void{const cave=this.world.caveScene;if(!cave)return;if(cave.inspecting)cave.overview();else if(cave.nearby!==null)cave.select(cave.nearby);}
 dispose():void{this.unbind();this.abort.abort();this.world.dispose();this.engine.stopRenderLoop();this.engine.dispose();}
}
