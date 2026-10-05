import { COIN_RADIUS } from './goldAreas';
interface Sample { x:number; y:number; z:number; nx:number; ny:number; nz:number; }
/** Test a complete half-second of travel, rather than waiting for a jittering pose to be identical. */
export class CoinRestWindow {
  private last:Sample|null=null;
  private frames=0;
  private travel=0;
  private origin:Sample|null=null;
  private excursion=0;
  sample(p:Sample):boolean {
    if(this.last){
      this.travel+=Math.hypot(p.x-this.last.x,p.y-this.last.y,p.z-this.last.z)+
        COIN_RADIUS*Math.hypot(p.nx-this.last.nx,p.ny-this.last.ny,p.nz-this.last.nz);
    }
    this.origin??=p;
    this.excursion=Math.max(this.excursion,Math.hypot(p.x-this.origin.x,p.y-this.origin.y,p.z-this.origin.z));
    this.last=p;
    if(++this.frames<30)return false;
    const resting=this.travel<COIN_RADIUS*1.1&&this.excursion<COIN_RADIUS*.35;
    this.frames=0;this.travel=0;this.excursion=0;this.origin=p;
    return resting;
  }
}
