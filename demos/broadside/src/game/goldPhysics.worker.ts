import { exposedGold } from "./goldSurface";
import { coinFloor } from "./coinFloor";
import { CoinRestWindow } from "./coinRest";
import RAPIER from "@dimforge/rapier3d-compat";
import { GOLD_AREAS, COIN_RADIUS, COIN_THICKNESS, COIN_POSE_STRIDE } from "./goldAreas";
import { caveFloor } from "../input/caveLayout";
import { settledGoldPatches } from "./goldCollision";
import { pourTilt, carriedCoin, chestExit, CHEST_EXIT_SECONDS, type ChestPhysicsPose } from "./coinPour";

let beginPour: ((duration: number) => void) | undefined;
let carryPose: ChestPhysicsPose | undefined;

/** Only the new chest is dynamic. The earned hoard is permanent collision geometry. */
self.onmessage = async (event: MessageEvent<{ world: number; previous: Float32Array; surfacePrevious?: Float32Array; chest: Float32Array; floorY?: number; chestY: number; pose?: ChestPhysicsPose; area?: {x:number;z:number;radius:number}; obstacles?: {x:number;z:number;rx:number;rz:number;top:number}[] } | { start: true; duration: number } | { pose: ChestPhysicsPose }>) => {
  if ('start' in event.data) { beginPour?.(event.data.duration); return; }
  if (!('world' in event.data)) { carryPose=event.data.pose;return; }
  let physics: InstanceType<typeof RAPIER.World> | undefined;
  let events: RAPIER.EventQueue | undefined;
  try {
    await RAPIER.init();
    const surfacePrevious = event.data.surfacePrevious;
    const { world, previous, chest, floorY, chestY } = event.data, area = event.data.area ?? GOLD_AREAS[world]!;
    carryPose ??= event.data.pose ?? {position:{x:0,y:chestY,z:0},rotation:{x:0,y:0,z:0,w:1},lid:0};
    const floor = (x:number,z:number) => floorY ?? caveFloor(x + area.x, z + area.z);
    events = new RAPIER.EventQueue(true);
    physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // CCD still catches the thin coins, without four sweeps at 120 Hz.
    physics.timestep = 1 / 60;
    physics.numSolverIterations = 4;
    physics.integrationParameters.maxCcdSubsteps = 1;
    const ground=coinFloor(area,floorY);
    physics.createCollider(RAPIER.ColliderDesc.trimesh(ground.vertices,ground.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES|RAPIER.TriMeshFlags.MERGE_DUPLICATE_VERTICES).setFriction(.8));
    // Only visible rocks and timber restrict coins. No box around a gold bank.
    for(const o of event.data.obstacles??[]) {
      const y=floor(o.x-area.x,o.z-area.z),half=Math.max(.05,(o.top-y)/2);
      physics.createCollider(RAPIER.ColliderDesc.cuboid(o.rx,half,o.rz).setTranslation(o.x-area.x,y+half,o.z-area.z).setFriction(.85));
    }
    if(floorY!==undefined)for(const sign of [-1,1]) {
      physics.createCollider(RAPIER.ColliderDesc.cuboid(.1,2.8,7.5).setTranslation(sign*4.7,floorY+2.8,0));
      physics.createCollider(RAPIER.ColliderDesc.cuboid(4.7,2.8,.1).setTranslation(0,floorY+2.8,sign*7.5));
    }
    const collider = () => RAPIER.ColliderDesc.roundCylinder(COIN_THICKNESS / 2 - .006, COIN_RADIUS - .006, .006)
      .setFriction(.35).setRestitution(.025).setDensity(8)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1);
    const patches=settledGoldPatches(previous);
    const staticTriangles=patches.reduce((n,p)=>n+p.indices.length/3,0);
    for(const {vertices,indices} of patches)
      physics.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES|RAPIER.TriMeshFlags.MERGE_DUPLICATE_VERTICES).setFriction(.7));
    // Real moving floor and walls of the open chest. Coins can contact its rim
    // while it tips, rather than appearing beneath an already inverted box.
    const hull=physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(carryPose.position.x,carryPose.position.y,carryPose.position.z).setRotation(carryPose.rotation));
    const wall=(hx:number,hy:number,hz:number,x:number,y:number,z:number)=>
      physics!.createCollider(RAPIER.ColliderDesc.roundCuboid(hx-.025,hy-.025,hz-.025,.025).setTranslation(x,y,z).setFriction(.15),hull);
    wall(1.75,.09,.95,0,.16,0);
    for(const sign of [-1,1]){wall(1.75,.625,.085,0,.82,sign*.88);wall(.09,.625,.9,sign*1.7,.82,0);}
    const bodies: RAPIER.RigidBody[] = [];
    const moving = new Map<RAPIER.RigidBody, number>();
    const removed = new Set<RAPIER.RigidBody>();
    const coinBodies = new Map<number, RAPIER.RigidBody>();
    const speeds = new Map<number, number>(), lastImpact = new Map<number, number>();
    const settledPoses = new Float32Array(1000 * COIN_POSE_STRIDE);
    let duration=0, started=false, turnFrame=0, withdrawFrame:number|null=null;
    const withdrawal=()=>withdrawFrame===null?0:Math.min(1,(frame-withdrawFrame)/(60*CHEST_EXIT_SECONDS));
    const progress=()=>!started?0:duration>0?Math.min(1,(frame-turnFrame)/60/duration):1;
    const chestPose=():ChestPhysicsPose=>{
      if(!started)return carryPose!;
      const angle=pourTilt(progress());
      const exit=chestExit(withdrawal());
      return {position:{x:exit.x,y:chestY+exit.y,z:exit.z},rotation:{x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)},lid:1};
    };
    const spawn = () => {
      // Start from the same baked, irregular packing seen inside the chest.
      // Gravity and contacts alone determine release, not launch velocities.
      const pose=carriedCoin(chest,bodies.length,chestPose());
      const b = physics!.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pose.position.x,pose.position.y,pose.position.z)
        .setRotation(pose.rotation)
        .setLinearDamping(.15).setAngularDamping(.6).setCcdEnabled(true));
      coinBodies.set(physics!.createCollider(collider(), b).handle, b);
      moving.set(b, bodies.length); bodies.push(b);
    };
    let frame = 0, ticks=0, totalMs=0, maxMs=0;
    let polishing = false, empty = false;
    const restWindows = new Map<RAPIER.RigidBody,CoinRestWindow>();
    const tick = () => {
      const start = performance.now(), impacts: number[] = [];
      if (!polishing && progress() === 1 && moving.size < 24) {
        polishing = true;
        // Only a handful of contacts remain. Extra solver accuracy and damping
        // stop a rim trapped between permanent coins from rattling forever.
        physics!.numSolverIterations = 12;
        for (const b of moving.keys()) { b.setLinearDamping(8); b.setAngularDamping(16); }
      }
      // Advance in real time throughout the spill, including after all coins exist.
      const steps = 2;
      for (let n = 0; n < steps; n++, frame++) {
        // Once only a few coins remain, put the chest away instead of leaving
        // a rim collider supporting one coin forever. The last coins then fall
        // onto the bank and settle through the same physics as all the others.
        if(withdrawFrame===null&&progress()===1&&(empty||moving.size<24)&&frame-turnFrame>=duration*60+30)withdrawFrame=frame;
        if(withdrawal()>=.3){empty=true;hull.setEnabled(false);}
        const pose=chestPose();
        hull.setNextKinematicTranslation(pose.position);hull.setNextKinematicRotation(pose.rotation);
        // Every coin exists from the moment tipping starts. There is no emission
        // timer, burst size or population cap controlling the flow.
        for(const b of moving.keys()){
          const v=b.linvel();speeds.set(b.handle,Math.hypot(v.x,v.y,v.z));
        }
        physics!.step(events);
        events!.drainContactForceEvents(event=>{
          const a=coinBodies.get(event.collider1()), b=coinBodies.get(event.collider2());
          const hit=[a,b].find(body=>body&&moving.has(body)&&(speeds.get(body.handle)??0)>.35&&frame-(lastImpact.get(body.handle)??-100)>6);
          if(!hit)return;
          lastImpact.set(hit.handle,frame);
          impacts.push(Math.min(1,Math.sqrt(event.totalForceMagnitude()/20)));
        });
        // Discard rare floor tunnelling rather than teleporting a coin back.
        // Coins scattered across the cave remain untouched.
        for (const [b, index] of moving) {
          const p = b.translation();
          if (p.y < floor(p.x,p.z) - .15) {
            coinBodies.delete(b.collider(0).handle);
            speeds.delete(b.handle); lastImpact.delete(b.handle);
            settledPoses.fill(0, index * COIN_POSE_STRIDE, (index + 1) * COIN_POSE_STRIDE);
            moving.delete(b); restWindows.delete(b); removed.add(b);
            physics!.removeRigidBody(b);
          }
        }
        if (!empty && progress() === 1) {
          const q=pose.rotation;
          empty=bodies.every(b=>{
            if (removed.has(b)) return true;
            const p=b.translation(),x=p.x-pose.position.x,y=p.y-pose.position.y,z=p.z-pose.position.z;
            const tx=2*(-q.y*z+q.z*y),ty=2*(-q.z*x+q.x*z),tz=2*(-q.x*y+q.y*x);
            const lx=x+q.w*tx-q.y*tz+q.z*ty,ly=y+q.w*ty-q.z*tx+q.x*tz,lz=z+q.w*tz-q.x*ty+q.y*tx;
            return Math.abs(lx)>1.9 || Math.abs(lz)>1.1 || ly<-.1 || ly>1.6;
          });
          if(empty)hull.setEnabled(false);
        }
        for (const [b, index] of moving) {
          const p = b.translation(), q = b.rotation();
          // Sum actual travel over a half-second window: jitter cannot endlessly
          // reset a single anchor, and opposite movements cannot cancel out.
          let window=restWindows.get(b);
          if(!window){window=new CoinRestWindow();restWindows.set(b,window);}
          // Rotation about a round coin's own normal does not change its contacts.
          const nx=2*(q.x*q.y-q.z*q.w),ny=1-2*(q.x*q.x+q.z*q.z),nz=2*(q.y*q.z+q.x*q.w);
          const still=window.sample({x:p.x,y:p.y,z:p.z,nx:polishing?0:nx,ny:polishing?1:ny,nz:polishing?0:nz},polishing?COIN_RADIUS*3:COIN_RADIUS*1.1,polishing?COIN_RADIUS*.75:COIN_RADIUS*.35);
          // Never freeze a coin resting on the overturned chest itself.
          if (progress() === 1 && p.y < chestY-1.5 && (b.isSleeping() || still)) {
            b.setBodyType(RAPIER.RigidBodyType.Fixed, false);
            settledPoses.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w], index * COIN_POSE_STRIDE);
            moving.delete(b); restWindows.delete(b);
          }
        }
      }
      const poses = settledPoses.slice(0, bodies.length * COIN_POSE_STRIDE);
      moving.forEach((i, b) => { const p = b.translation(), q = b.rotation(); poses.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w], i * COIN_POSE_STRIDE); });
      const done = moving.size === 0;
      if(done)empty=true;
      const physicsMs=performance.now()-start;totalMs+=physicsMs;ticks++;maxMs=Math.max(maxMs,physicsMs);
      let surface: number[] | undefined;
      if (done && surfacePrevious) {
        const all = new Float32Array(surfacePrevious.length + poses.length);
        all.set(surfacePrevious); all.set(poses, surfacePrevious.length);
        // Build once in the existing worker, never stall the render thread as
        // the last coins stop. Physics retains every pose and collider.
        surface = exposedGold(all);
      }
      self.postMessage({ surface, physicsMs, physicsMeanMs:totalMs/ticks, physicsMaxMs:maxMs, staticTriangles, poses, done, spawned: bodies.length, resting: bodies.length - moving.size, empty, withdraw:withdrawal(), time: frame / 60, turn: progress(), impacts: impacts.sort((a,b)=>b-a).slice(0,3) }, { transfer: [poses.buffer] });
      if (done) { events!.free(); events=undefined; physics!.free(); physics = undefined; }
      else setTimeout(tick, Math.max(0, 1000 / 30 - (performance.now() - start)));
    };
    beginPour=(seconds)=>{
      if(started)return;
      started=true;duration=Math.max(0,seconds);turnFrame=frame;
      const pose=chestPose();
      hull.setTranslation(pose.position,true);hull.setRotation(pose.rotation,true);
      for(let i=0;i<1000;i++)spawn();
      tick();
    };
    self.postMessage({ready:true});
    // Warm WASM/collision geometry, but do not step or emit impacts while closed.
  } catch (error) {
    try { events?.free(); physics?.free(); } catch { /* A failed WASM step may invalidate its handles. */ }
    self.postMessage({ error: String(error) });
  }
};
