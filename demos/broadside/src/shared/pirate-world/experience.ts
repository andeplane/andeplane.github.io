import type { Engine } from "@babylonjs/core/Engines/engine.js";
import "@babylonjs/core/Culling/ray.js";
import { TreasureCave } from "./render/cave";
import { ShipHold } from "./render/shipHold";
import { Delivery } from "./delivery";
import { CaveWalkControls } from "./input/caveWalk";
import { coinSounds } from "./game/coinSounds";
import type { PirateAdapter, ShipPresentation } from "./types";

export interface ExperienceEvents {
  ready?(): void;
  changed?(): void;
  error?(message: string): void;
}
/** One scene owner and cargo lifecycle for every pirate game; the host owns its UI/engine. */
export class PirateWorld {
  caveScene: TreasureCave | null = null;
  hold: ShipHold | null = null;
  readonly controls = new CaveWalkControls();
  readonly delivery: Delivery;
  mode: "idle" | "walk" | "ship" | "unload" = "idle";
  status: "idle" | "loading" | "ready" | "paused" | "error" | "disposed" = "idle";
  error: string | null = null;
  private reported = false;
  private disposed = false;
  private resetListeners = new Set<()=>void>();
  onReset(listener:()=>void):()=>void { this.resetListeners.add(listener); return ()=>{this.resetListeners.delete(listener);}; }
  private resetInput():void { this.controls.clear(); for(const listener of this.resetListeners)listener(); }
  constructor(private engine: Engine, readonly adapter: PirateAdapter, private persistent = true, private events: ExperienceEvents = {}) {
    this.delivery = new Delivery(adapter);
  }
  private buildScene<T>(build:()=>T):T {
    const existing=new Set(this.engine.scenes);
    try{return build();}catch(error){
      for(const scene of [...this.engine.scenes])if(!existing.has(scene))scene.dispose();
      throw error;
    }
  }
  get cave(): TreasureCave {
    if (this.disposed) throw new Error("Pirate world is disposed");
    if (!this.caveScene) {
      const c = this.adapter.config;
      this.caveScene = this.buildScene(()=>new TreasureCave(this.engine, this.persistent, true, c.poses.namespace, c.bankLabels, c));
      this.caveScene.refresh(this.adapter.snapshot());
    }
    return this.caveScene;
  }
  releaseCave(): void { this.caveScene?.endReveal(); this.caveScene?.scene.dispose(); this.caveScene = null; }
  closeHold(): void { this.hold?.scene.dispose(); this.hold = null; }
  private start(mode: typeof this.mode): void {
    if (this.disposed) throw new Error("Pirate world is disposed");
    this.resetInput(); this.delivery.cancel(); this.error = null; this.reported = false;
    this.mode = mode; this.status = "loading";
  }
  showShip(ship: ShipPresentation, reveal = true, special: number | null = null): ShipHold {
    this.start("ship"); this.releaseCave(); this.closeHold();
    this.hold = this.buildScene(()=>new ShipHold(this.engine, ship));
    const pending = this.adapter.snapshot().pending;
    this.hold.openCargo(pending.length, pending.at(-1)?.gold ?? 0, reveal, special);
    return this.hold;
  }
  showCave(): void {
    this.start("walk"); this.closeHold(); this.releaseCave();
    this.cave.showCargo([]); this.cave.enter(); this.status = "ready";
  }
  beginUnload(): void {
    this.start("unload"); this.closeHold(); this.releaseCave();
    this.delivery.start();
    if (this.delivery.current) this.prepareChest(true);
    else { this.mode = "walk"; this.cave.enter(); this.readyLater(); }
  }
  private readyLater(): void {
    const token = this.delivery.token;
    queueMicrotask(() => { if (!this.disposed && this.status !== "paused" && this.delivery.token === token) this.ready(); });
  }
  private ready(): void { this.status = "ready"; if (!this.reported) { this.reported = true; this.events.ready?.(); } }
  private prepareChest(reset: boolean): void {
    const chest = this.delivery.current!;
    this.cave.showCargo(this.delivery.queue.pending.map(c => c.id), chest.id, reset);
    this.cave.refresh(this.delivery.preview(), chest.area, chest.gold);
    this.cave.beginUnload(chest.area, chest.id);
  }
  get unloading() { return { total:this.delivery.queue.total, delivered:this.delivery.queue.completed, done:!this.delivery.current, active:this.delivery.current?.id ?? null }; }
  /** Freeze visual time during backgrounding. No elapsed wall time or hidden completion. */
  suspend(): void { if(this.status === "disposed") return; this.status = "paused"; this.resetInput(); coinSounds.pause(); }
  resume(): void { if(this.status === "paused") this.status = this.error ? "error" : "loading"; }
  cancel(): void {
    this.delivery.cancel(); this.resetInput(); this.releaseCave(); this.closeHold();
    this.mode = "idle"; if (!this.disposed) this.status = "idle"; coinSounds.pause();
  }
  render(dt: number, reduced: boolean, walk = true): void {
    if (this.disposed || this.status === "paused" || this.status === "error" || this.mode === "idle") return;
    try {
      dt = Math.max(0, Math.min(.1, dt));
      if (this.mode === "ship") {
        this.hold!.render(dt, reduced);
        if(this.hold!.presentationError)throw new Error(this.hold!.presentationError);
        if (this.hold!.pose.discovered && this.hold!.presentationReady !== false) this.ready();
        return;
      }
      if (this.mode === "walk" && walk) {
        const look = this.controls.readLook();
        this.cave.look(look.right * 500 * dt, look.down * 450 * dt);
        this.cave.walk(this.controls.read(), dt);
      }
      this.cave.render(dt, this.mode === "unload");
      if(this.mode === "walk" && this.cave.presentationReady) this.status = "ready";
      if (this.cave.presentationError) throw new Error(this.cave.presentationError);
      if (this.mode === "unload" && this.delivery.current && this.cave.depositComplete) {
        const chest = this.delivery.current;
        if (!this.delivery.complete(this.delivery.token, chest.id)) return;
        if (this.delivery.current) this.prepareChest(false);
        else { this.cave.refresh(this.adapter.snapshot()); this.cave.showCargo([]); this.ready(); }
        this.events.changed?.();
      }
    } catch (error) {
      this.error = String(error); this.status = "error"; this.controls.clear(); coinSounds.pause();
      this.events.error?.(this.error);
    }
  }
  dispose(): void { if(this.disposed) return; this.cancel(); this.disposed = true; this.status = "disposed"; }
}
