import R from '@dimforge/rapier3d-compat';
import { writeFile } from 'node:fs/promises';
await R.init();
const world = new R.World({x:0,y:-9.81,z:0});
world.timestep=1/60; world.numSolverIterations=6;
world.createCollider(R.ColliderDesc.cuboid(1.64,.09,.79).setTranslation(0,.18,0).setFriction(.8));
for(const sign of [-1,1]) {
 world.createCollider(R.ColliderDesc.cuboid(.09,3,.88).setTranslation(sign*1.7,3,0));
 world.createCollider(R.ColliderDesc.cuboid(1.8,3,.09).setTranslation(0,3,sign*.88));
}
let seed=72199;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const bodies=[];
for(let frame=0;frame<1800;frame++) {
 if(frame<750 && frame%6===0) for(let j=0;j<8;j++) {
  const yaw=random()*Math.PI*2, tilt=(random()-.5)*1.7;
  const b=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation((j%4-1.5)*.83+(random()-.5)*.08,2.8+random()*.2,(Math.floor(j/4)-.5)*1.14)
   .setRotation({x:Math.sin(tilt/2)*Math.cos(yaw/2),y:Math.cos(tilt/2)*Math.sin(yaw/2),z:-Math.sin(tilt/2)*Math.sin(yaw/2),w:Math.cos(tilt/2)*Math.cos(yaw/2)})
   .setLinvel((random()-.5)*.3,-.3,(random()-.5)*.3).setAngvel({x:random()-.5,y:(random()-.5)*3,z:random()-.5})
   .setLinearDamping(.5).setAngularDamping(2).setCcdEnabled(true));
  world.createCollider(R.ColliderDesc.roundCylinder(.0215,.134,.006).setFriction(.8).setRestitution(.015),b);bodies.push(b);
 }
 // Close the curved lid after pouring, letting any proud coins settle into
 // its actual interior. The saved pile fits the closed chest as well as the open one.
 if(frame===850) for(let j=0;j<32;j++) {
  const a=j*Math.PI/32,b=(j+1)*Math.PI/32;
  const z0=-Math.cos(a)*.97,z1=-Math.cos(b)*.97,y0=1.45+Math.sin(a)*.78,y1=1.45+Math.sin(b)*.78;
  const angle=-Math.atan2(y1-y0,z1-z0);
  world.createCollider(R.ColliderDesc.cuboid(1.78,.035,Math.hypot(z1-z0,y1-y0)/2+.006)
   .setTranslation(0,(y0+y1)/2+Math.cos(angle)*.045,(z0+z1)/2-Math.sin(angle)*.045)
   .setRotation({x:Math.sin(angle/2),y:0,z:0,w:Math.cos(angle/2)}));
 }
 world.step();
 
}
const poses=bodies.map(b=>{const p=b.translation(),q=b.rotation();return[p.x,p.y,p.z,q.x,q.y,q.z,q.w];}).sort((a,b)=>a[1]-b[1]);
const top=Math.max(...poses.map(p=>p[1]));
if(poses.length!==1000 || poses.some(p=>!p.every(Number.isFinite)||Math.abs(p[0])>1.62||Math.abs(p[2])>.8||p[1]<.26||p[1]>2.18)) throw new Error(`Invalid chest pile (top ${top})`);
await writeFile(new URL('../../public/assets/hoard/chest.bin',import.meta.url),Buffer.from(new Float32Array(poses.flat()).buffer));
console.log(JSON.stringify({coins:poses.length,top}));world.free();
