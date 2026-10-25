/** One tilt curve shared by the visible chest and its kinematic physics hull. */
export function pourTilt(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  // Tip slightly beyond vertical so coins cannot balance on a horizontal rim.
  return -Math.PI * 1.08 * t * t * (3 - 2 * t);
}
export function canSpill(progress: number): boolean { return pourTilt(progress) <= -Math.PI / 3; }
export interface ChestPhysicsPose {
  position: {x:number;y:number;z:number};
  rotation: {x:number;y:number;z:number;w:number};
  lid: number;
}

export function carriedCoin(poses:Float32Array,coin:number,pose:ChestPhysicsPose) {
  const i=coin*7,x=poses[i]!,y=poses[i+1]!,z=poses[i+2]!,q=pose.rotation;
  const tx=2*(q.y*z-q.z*y),ty=2*(q.z*x-q.x*z),tz=2*(q.x*y-q.y*x);
  const cx=poses[i+3]!,cy=poses[i+4]!,cz=poses[i+5]!,cw=poses[i+6]!;
  return {position:{x:pose.position.x+x+q.w*tx+q.y*tz-q.z*ty,
    y:pose.position.y+y+q.w*ty+q.z*tx-q.x*tz,z:pose.position.z+z+q.w*tz+q.x*ty-q.y*tx},
    rotation:{x:q.w*cx+q.x*cw+q.y*cz-q.z*cy,y:q.w*cy-q.x*cz+q.y*cw+q.z*cx,
      z:q.w*cz+q.x*cy-q.y*cx+q.z*cw,w:q.w*cw-q.x*cx-q.y*cy-q.z*cz}};
}

/** Rotate a saved chest coin into the current pouring pose, including orientation. */
export function tiltedCoin(poses: Float32Array, coin: number, chestY: number, progress: number) {
  const a=pourTilt(progress);
  return carriedCoin(poses,coin,{position:{x:0,y:chestY,z:0},rotation:{x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)},lid:1});
}

/** First lift the rim clear, then carry the empty chest towards the camera and
 * out of view. Shared by render and physics, with no opacity changes. */
export const CHEST_EXIT_SECONDS = 2.2;
export function chestExit(progress:number) {
  const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  return {x:0,y:.8*smooth(progress/.3),z:0-14*smooth((progress-.3)/.7)};
}
/** Raise in the clear aisle before crossing the existing fortune. */
export function chestCarry(elapsed:number,from:{x:number;y:number;z:number},to:{x:number;y:number;z:number},reduced=false) {
  const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const lift=reduced?1:smooth(elapsed/1.2),travel=reduced?1:smooth((elapsed-1.2)/2.6);
  return {x:from.x+(to.x-from.x)*travel,y:from.y+(to.y-from.y)*lift,z:from.z+(to.z-from.z)*travel};
}
