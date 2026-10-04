import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Ship } from '../sim/ships';
import { SINK_DURATION } from '../sim/ships';

const smooth = (t:number) => {const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export const reefDepth = (length:number) => Math.max(32,length*1.2+7);

/** A loss follows the wreck below the waves, without changing the chosen sailing camera. */
export class SinkingCamera {
  private origin:Vector3|null=null;
  private target:Vector3|null=null;
  reset():void {this.origin=this.target=null;}
  start(camera:FreeCamera):void {this.origin=camera.position.clone();this.target=camera.getTarget().clone();}
  apply(camera:FreeCamera,ship:Ship):void {
    this.origin??=camera.position.clone();this.target??=camera.getTarget().clone();
    const f=new Vector3(Math.sin(ship.heading),0,Math.cos(ship.heading));
    const r=new Vector3(f.z,0,-f.x),centre=new Vector3(ship.pos.x,0,ship.pos.z);
    const depth=reefDepth(ship.spec.length),dive=smooth((ship.sinkTime-.9)/(SINK_DURATION-.9));
    const close=centre.add(r.scale(-ship.spec.length*.8)).add(f.scale(-ship.spec.length*.75));
    close.y=5-dive*(5+depth*.58);
    const look=centre.add(f.scale(ship.spec.length*.12));look.y=1-dive*(1+depth*.74);
    const approach=smooth(ship.sinkTime/1.5);
    camera.position.copyFrom(Vector3.Lerp(this.origin,close,approach));
    camera.setTarget(Vector3.Lerp(this.target,look,approach));
    camera.rotation.z=0;camera.minZ=.07;
    const portrait=innerWidth<600;
    camera.fovMode=portrait?Camera.FOVMODE_HORIZONTAL_FIXED:Camera.FOVMODE_VERTICAL_FIXED;
    camera.fov=portrait?1.08:.95;
  }
}
