export const TREASURE_CHANCE = .1;
export type FishingPhase = 'idle'|'casting'|'waiting'|'bite'|'reeling'|'caught';
export type Catch = { kind:'fish'|'chest' };
/** One reward roll per successfully reeled bite. Missed bites and cancelled casts pay nothing. */
export class Fishing {
  phase: FishingPhase = 'idle';
  time = 0;
  catch: Catch | null = null;
  private wait = 0;
  private paid = false;
  constructor(private random:()=>number = Math.random) {}
  cast(atRail: boolean): boolean {
    if (!atRail || this.phase !== 'idle') return false;
    this.phase='casting';this.time=0;this.catch=null;this.paid=false;
    this.wait=3+this.random()*3; return true;
  }
  reel(): boolean {
    if(this.phase!=='bite') return false;
    this.catch={kind:this.random()<TREASURE_CHANCE?'chest':'fish'};
    this.phase='reeling';this.time=0;return true;
  }
  step(dt:number): void {
    if(!Number.isFinite(dt)||dt<=0||this.phase==='idle') return;
    this.time+=dt;
    if(this.phase==='caught') return;
    if(this.phase==='casting'&&this.time>=.9){this.phase='waiting';this.time=0;}
    else if(this.phase==='waiting'&&this.time>=this.wait){this.phase='bite';this.time=0;}
    else if(this.phase==='bite'&&this.time>=3){this.cancel();}
    else if(this.phase==='reeling'&&this.time>=1.8){this.phase='caught';this.time=0;}
  }
  collect(): Catch|null {
    if(this.phase!=='caught'||this.paid) return null;
    this.paid=true;return this.catch;
  }
  cancel(): void {this.phase='idle';this.time=0;this.catch=null;this.paid=false;}
}
