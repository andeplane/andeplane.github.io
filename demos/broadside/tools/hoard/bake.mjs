import RAPIER from '@dimforge/rapier3d-compat';
import { mkdir, writeFile } from 'node:fs/promises';
import { GOLD_AREAS, COIN_RADIUS, COIN_THICKNESS } from '../../src/game/goldAreas.ts';
import { caveFloor } from '../../src/input/caveLayout.ts';

await RAPIER.init();
const area = GOLD_AREAS[Number(process.argv[2] ?? 0)];
const stages = Number(process.argv[3] ?? 10);
if (!area) throw new Error('Unknown gold bank');
let state = 8031 + area.world * 913;
const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
const world = new RAPIER.World({x:0,y:-9.81,z:0});
world.timestep = 1 / 60;
world.numSolverIterations = 6;
const poses = [];
const dir = new URL(`../../public/assets/hoard/world-${area.world}/`, import.meta.url);
await mkdir(dir, {recursive:true});
// Overlapping solid tiles match the rendered rough floor; a backing slab seals it.
const tiles = 24, extent = area.radius + 0.9, width = extent * 2 / tiles;
world.createCollider(RAPIER.ColliderDesc.cuboid(extent, .7, extent).setTranslation(0, -.9, 0).setFriction(.8));
for(let j=0;j<tiles;j++) for(let i=0;i<tiles;i++) {
 const x=-extent+(i+.5)*width, z=-extent+(j+.5)*width;
 world.createCollider(RAPIER.ColliderDesc.cuboid(width/2+.002,.4,width/2+.002)
  .setTranslation(x,caveFloor(x+area.x,z+area.z)-.4,z).setFriction(.8));
}
// Rocky retaining banks keep gold beside the route, never in the canal or walls.
for(let i=0;i<20;i++) {
 const a=i*Math.PI*2/20, r=area.radius+0.15;
 world.createCollider(RAPIER.ColliderDesc.ball(0.6).setTranslation(Math.sin(a)*r,0.3,Math.cos(a)*r).setFriction(0.85));
}
for (const sign of [-1,1]) {
 world.createCollider(RAPIER.ColliderDesc.cuboid(.1,6,extent).setTranslation(sign*extent,5,0));
 world.createCollider(RAPIER.ColliderDesc.cuboid(extent,6,.1).setTranslation(0,5,sign*extent));
}
let peak=0;
for(let stage=1;stage<=stages;stage++) {
 const bodies=[], start=Date.now();
 let batchX=0, batchZ=0;
 const spawn = (i) => {
  const offset=i%20;
  const x=(offset%5-2)*.34+batchX, z=(Math.floor(offset/5)-1.5)*.34+batchZ;
  const yaw=random()*Math.PI*2, tilt=(random()-.5)*1.5;
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
   .setTranslation(x,peak+3.3,z)
   .setRotation({x:Math.sin(tilt/2)*Math.cos(yaw/2),y:Math.cos(tilt/2)*Math.sin(yaw/2),z:-Math.sin(tilt/2)*Math.sin(yaw/2),w:Math.cos(tilt/2)*Math.cos(yaw/2)})
   .setLinvel((random()-.5)*1.5,-1,(random()-.5)*1.5)
   .setAngvel({x:(random()-.5)*6,y:(random()-.5)*6,z:(random()-.5)*6})
   .setLinearDamping(0.4).setAngularDamping(1.2).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.roundCylinder(COIN_THICKNESS/2-0.006,COIN_RADIUS-0.006,0.006)
   .setFriction(0.7).setRestitution(0.025).setDensity(8),body);
  bodies.push(body);
 };
 for(let frame=0;frame<660;frame++) {
  if(frame<400 && frame%8===0) {
   const a=random()*Math.PI*2,r=random()*.7;batchX=Math.cos(a)*r;batchZ=Math.sin(a)*r;
   for(let i=0;i<20;i++) spawn(bodies.length);
  }
  world.step();
 }
 // Let contacts settle; only newly poured coins remain dynamic between deposits.
 for(let frame=0;frame<180;frame++) world.step();
 // Rescue any solver tunnelling through the fine floor with another physical drop.
 for(let pass=0;pass<4;pass++) {
  const escaped=bodies.filter(b => {const p=b.translation();return p.y<caveFloor(p.x+area.x,p.z+area.z)-.15;});
  if(!escaped.length) break;
  const top=Math.max(...bodies.map(b=>b.translation().y),peak);
  escaped.forEach((b,i)=>{
   b.setTranslation({x:(i%5-2)*.34,y:top+2+Math.floor(i/20)*.35,z:(Math.floor(i/5)%4-1.5)*.34},true);
   b.setLinvel({x:0,y:0,z:0},true);b.setAngvel({x:0,y:0,z:0},true);
  });
  for(let frame=0;frame<360;frame++) world.step();
 }
 for(const body of bodies){
  const p=body.translation(),q=body.rotation();
  if(p.y < caveFloor(p.x+area.x,p.z+area.z)-.15 || !Number.isFinite(p.y)) throw new Error(`Escaped coin ${JSON.stringify(p)}`);
  poses.push(p.x,p.y,p.z,q.x,q.y,q.z,q.w);
  peak=Math.max(peak,p.y);
  body.setBodyType(RAPIER.RigidBodyType.Fixed,false);
 }
 const bytes=new Float32Array(poses);
 await writeFile(new URL(`${stage*1000}.bin`,dir),Buffer.from(bytes.buffer));
 console.log(JSON.stringify({world:area.world,coins:stage*1000,peak:+peak.toFixed(2),seconds:+((Date.now()-start)/1000).toFixed(2)}));
}
world.free();
