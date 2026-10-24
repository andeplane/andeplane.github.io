import RAPIER from "@dimforge/rapier3d-compat";
import { CoinRestWindow } from "./coinRest";
import { gemShape } from "./gems";
import { caveFloor } from "../input/caveLayout";
import { coinFloor } from "./coinFloor";
import { settledGoldPatches } from "./goldCollision";

/** One bounded initial settling pass; subsequent chest pours reuse the same hulls. */
self.onmessage = async (event: MessageEvent<{ poses: Float32Array; coins: Float32Array; area: {x:number;z:number}; obstacles: {x:number;z:number;rx:number;rz:number;top:number}[] }>) => {
  let world: RAPIER.World | undefined;
  try {
    await RAPIER.init();
    world = new RAPIER.World({x:0,y:-9.81,z:0});
    world.timestep = 1 / 60; world.numSolverIterations = 8;
    const { poses, coins, area, obstacles } = event.data;
    const ground = coinFloor(area);
    for (const mesh of [ground, ...settledGoldPatches(coins)]) world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices).setFriction(.8));
    for (const o of obstacles) {
      const floor=caveFloor(o.x,o.z),half=Math.max(.05,(o.top-floor)/2);
      world.createCollider(RAPIER.ColliderDesc.cuboid(o.rx,half,o.rz).setTranslation(o.x-area.x,floor+half,o.z-area.z));
    }
    const bodies: RAPIER.RigidBody[] = [];
    for (let p=0;p<poses.length;p+=7) {
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(poses[p]!,poses[p+1]!,poses[p+2]!)
        .setRotation({x:poses[p+3]!,y:poses[p+4]!,z:poses[p+5]!,w:poses[p+6]!}).setCcdEnabled(true).setLinearDamping(.7).setAngularDamping(1.5));
      world.createCollider(RAPIER.ColliderDesc.convexHull(gemShape(bodies.length%4).vertices)!.setDensity(3.5).setFriction(.75).setRestitution(.12),b);
      bodies.push(b);
    }
    let frames=0;
    const rests=bodies.map(()=>new CoinRestWindow());
    const tick=()=>{
      try {
        for(let i=0;i<2;i++)world!.step();frames+=2;
        const result=new Float32Array(poses.length);
        bodies.forEach((b,i)=>{
          const p=b.translation(),q=b.rotation();result.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w],i*7);
          if(!Number.isFinite(p.y)||p.y < -100)throw new Error("A gem escaped the cave collision surface");
          if(b.isDynamic()&&rests[i]!.sample({x:p.x,y:p.y,z:p.z,nx:q.x,ny:q.y,nz:q.z},.08,.025))b.setBodyType(RAPIER.RigidBodyType.Fixed,false);
        });
        const done=bodies.every(b=>!b.isDynamic()||b.isSleeping());
        self.postMessage({poses:result,done,frames,moving:bodies.filter(b=>b.isDynamic()&&!b.isSleeping()).length},{transfer:[result.buffer]});
        if(done){world!.free();world=undefined;}
        else {
          // Damping removes tiny residual contacts, while gravity keeps acting.
          if(frames===600)for(const b of bodies){b.setLinearDamping(8);b.setAngularDamping(16);}
          setTimeout(tick,1000/30);
        }
      }catch(error){world?.free();world=undefined;self.postMessage({error:String(error)});}
    };
    tick();
  }catch(error){world?.free();self.postMessage({error:String(error)});}
};
