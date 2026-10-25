import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { CaveGesture } from "./input/caveGesture";
import type { PirateWorld } from "./experience";

export interface WorldControls {
  active(): boolean;
  pad?: string; thumb?: string; jump?: string;
  select?(index: number): void;
  overview?(): void;
  inspect?(): void;
  back?(): void;
}
/** Mount once per host. Every DOM/native listener and captured pointer has one disposer. */
export function bindWorldControls(world: PirateWorld, canvas: HTMLCanvasElement, options: WorldControls): () => void {
  const abort = new AbortController(), signal = abort.signal, gesture = new CaveGesture();
  let padPointer: number | null = null, disposed = false;
  const captured = new Map<number,HTMLElement>();
  const active = () => options.active() && world.status !== "paused" && world.status !== "error";
  const draw = (x=0,y=0) => { const el=options.thumb ? document.querySelector<HTMLElement>(options.thumb) : null; if(el)el.style.transform=`translate(${x*30}px, ${y*30}px)`; };
  const clear = () => {
    world.controls.clear(); gesture.clear(); padPointer=null; draw();
    for(const [id,target] of captured) { try { target.releasePointerCapture(id); } catch {} }
    captured.clear();
    if(document.pointerLockElement===canvas)document.exitPointerLock();
  };
  const move = (x:number,y:number) => {
    const pad=options.pad ? document.querySelector<HTMLElement>(options.pad) : null;if(!pad)return;
    const r=pad.getBoundingClientRect(),radius=r.width*.38;
    const right=(x-r.left-r.width/2)/radius,forward=(r.top+r.height/2-y)/radius,length=Math.max(1,Math.hypot(right,forward));
    world.controls.move(right,forward);draw(right/length,-forward/length);
  };
  document.addEventListener("keydown",e=>{
    if(!active()||e.metaKey||e.altKey||e.ctrlKey||(e.target instanceof Element && e.target.closest("input,textarea,select,[role=dialog]")))return;
    if(world.controls.keyDown(e.code,performance.now()))e.preventDefault();
    if(e.code==="KeyE"&&!e.repeat) options.inspect?.();
    if(e.code==="Escape")options.back?.();
  },{signal});
  document.addEventListener("keyup",e=>world.controls.keyUp(e.code),{signal});
  canvas.addEventListener("pointerdown",e=>{
    if(!active())return;
    canvas.focus();
    if(document.pointerLockElement===canvas){options.inspect?.();return;}
    gesture.down(e.pointerId,e.clientX,e.clientY);canvas.setPointerCapture(e.pointerId);captured.set(e.pointerId,canvas);
  },{signal});
  canvas.addEventListener("pointermove",e=>{
    if(!active())return;
    if(document.pointerLockElement===canvas){world.cave.look(e.movementX,e.movementY);return;}
    const action=gesture.move(e.pointerId,e.clientX,e.clientY);
    if(action?.type==="look")world.cave.look(action.dx,action.dy);
    if(action?.type==="pinch"&&world.cave.pinch(action.ratio))options.overview?.();
  },{signal});
  canvas.addEventListener("pointerup",e=>{
    captured.delete(e.pointerId);
    const action=gesture.up(e.pointerId,e.clientX,e.clientY);
    if(!active()||document.pointerLockElement===canvas||action?.type!=="tap")return;
    const rect=canvas.getBoundingClientRect(),selected=world.cave.pick(action.x-rect.left,action.y-rect.top);
    if(selected!==null) { if(options.select)options.select(selected);else world.cave.select(selected); }
    else if(e.pointerType==="mouse"&&!world.cave.inspecting){try{void canvas.requestPointerLock()?.catch(()=>{});}catch{}}
  },{signal});
  for(const name of ["pointercancel","lostpointercapture"] as const)canvas.addEventListener(name,e=>{captured.delete(e.pointerId);gesture.cancel(e.pointerId);},{signal});
  canvas.addEventListener("wheel",e=>{if(!active())return;e.preventDefault();if(world.cave.zoom(e.deltaY))options.overview?.();},{signal,passive:false});
  document.addEventListener("pointerdown",e=>{
    if(!active())return;
    if(!(e.target instanceof Element))return;
    const target=e.target;
    if(options.jump&&target.closest(options.jump)){world.controls.jump();e.preventDefault();}
    const pad=options.pad?target.closest<HTMLElement>(options.pad):null;
    if(pad){padPointer=e.pointerId;pad.setPointerCapture(e.pointerId);captured.set(e.pointerId,pad);move(e.clientX,e.clientY);e.preventDefault();}
  },{signal});
  document.addEventListener("pointermove",e=>{if(active()&&e.pointerId===padPointer)move(e.clientX,e.clientY);},{signal});
  const release=(e:PointerEvent)=>{captured.delete(e.pointerId);if(e.pointerId===padPointer){padPointer=null;world.controls.move(0,0);draw();}};
  document.addEventListener("pointerup",release,{signal});document.addEventListener("pointercancel",release,{signal});
  document.addEventListener("pointerlockchange",()=>{gesture.clear();world.controls.clear();},{signal});
  const suspend=()=>{clear();world.suspend();};
  window.addEventListener("blur",suspend,{signal});window.addEventListener("focus",()=>world.resume(),{signal});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)suspend();else world.resume();},{signal});
  window.addEventListener("pagehide",suspend,{signal});
  window.addEventListener("pageshow",()=>world.resume(),{signal});
  const removeReset=world.onReset(clear);
  let nativeHandle:{remove:()=>Promise<void>}|null=null;
  const native = Capacitor.isNativePlatform() ? App.addListener("appStateChange",({isActive})=>{if(isActive)world.resume();else suspend();}) : null;
  void native?.then(handle=>{if(disposed)void handle.remove();else nativeHandle=handle;});
  return ()=>{disposed=true;removeReset();clear();abort.abort();void nativeHandle?.remove();nativeHandle=null;};
}
