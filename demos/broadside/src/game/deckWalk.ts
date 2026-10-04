import type { ShipIntent } from '../sim/ships';
import { CaveWalker, type WalkIntent } from '../input/caveWalk';

export interface DeckGeometry {
  length: number; beam: number;
  helm: { x: number; y: number; z: number };
  floor: (x: number, z: number) => number;
}
/** Coordinates stay on the ship, so waves and sailing never slide the player off it. */
export class DeckWalk {
  active = false;
  readonly walker: CaveWalker;
  constructor(readonly geometry: DeckGeometry) {
    const { length: l, beam: b } = geometry;
    this.walker = new CaveWalker(
      [-.17, .13, .32].map(z => ({ x: 0, z: z*l, rx: .38, rz: .38, top: l })),
      geometry.floor,
      (x, z) => {
        if (Math.abs(z) > l*.43) return false;
        const width = b*.46*(1-.58*(Math.abs(z)/(l*.5))**4);
        return Math.abs(x) < width-.22;
      },
    );
    this.reset();
  }
  reset(): void {
    this.active = false;
    this.walker.x = this.geometry.helm.x; this.walker.z = this.geometry.helm.z;
    this.walker.feet = this.geometry.helm.y; this.walker.verticalSpeed = 0;
    this.walker.grounded = true;
  }
  leave(yaw = 0, pitch = .03): void {
    this.reset(); this.active = true;
    this.walker.yaw = yaw; this.walker.pitch = pitch;
  }
  get nearHelm(): boolean {
    const h = this.geometry.helm, w = this.walker;
    return Math.hypot(w.x-h.x,w.z-h.z) < 1.9 && Math.abs(w.feet-h.y) < .7;
  }
  helmIntent(intent: ShipIntent): ShipIntent {
    return this.active ? {...intent,turn:0,sailUp:false,sailDown:false} : intent;
  }
  takeHelm(): boolean {
    if (!this.active || !this.nearHelm) return false;
    this.active = false; return true;
  }
  get atRail(): boolean {
    return this.active && Math.abs(this.walker.x) > this.geometry.beam*.29;
  }
  step(intent: WalkIntent,dt: number): void { if (this.active) this.walker.step(intent,dt); }
  look(dx:number,dy:number): void { if(this.active) this.walker.look(dx,dy); }
  get eye() {
    const w=this.walker;
    return { x:w.x, y:w.feet+(w.eyeY-w.feet)*.74+w.bob, z:w.z };
  }
}
