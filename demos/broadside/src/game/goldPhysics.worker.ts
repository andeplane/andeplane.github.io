import RAPIER from "@dimforge/rapier3d-compat";
import { GOLD_AREAS, COIN_RADIUS, COIN_THICKNESS, COIN_POSE_STRIDE } from "./goldAreas";
import { caveFloor } from "../input/caveLayout";
import { settledGoldCollision } from "./goldCollision";
import { pourTilt, carriedCoin, type ChestPhysicsPose } from "./coinPour";

let beginPour: ((duration: number) => void) | undefined;
let carryPose: ChestPhysicsPose | undefined;

/** Only the new chest is dynamic. The earned hoard is permanent collision geometry. */
self.onmessage = async (event: MessageEvent<{ world: number; previous: Float32Array; chest: Float32Array; floorY?: number; chestY: number; pose?: ChestPhysicsPose; area?: {x:number;z:number;radius:number} } | { start: true; duration: number } | { pose: ChestPhysicsPose }>) => {
  if ('start' in event.data) { beginPour?.(event.data.duration); return; }
  if (!('world' in event.data)) { carryPose=event.data.pose;return; }
  let physics: InstanceType<typeof RAPIER.World> | undefined;
  let events: RAPIER.EventQueue | undefined;
  try {
    await RAPIER.init();
    const { world, previous, chest, floorY, chestY } = event.data, area = event.data.area ?? GOLD_AREAS[world]!;
    carryPose ??= event.data.pose ?? {position:{x:0,y:chestY,z:0},rotation:{x:0,y:0,z:0,w:1},lid:0};
    const floor = (x:number,z:number) => floorY ?? caveFloor(x + area.x, z + area.z);
    events = new RAPIER.EventQueue(true);
    physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // CCD still catches the thin coins, without four sweeps at 120 Hz.
    physics.timestep = 1 / 60;
    physics.numSolverIterations = 4;
    physics.integrationParameters.maxCcdSubsteps = 1;
    const tiles = 24, extent = area.radius + .9, width = extent * 2 / tiles;
    physics.createCollider(RAPIER.ColliderDesc.cuboid(extent, .7, extent).setTranslation(0, -.9, 0).setFriction(.8));
    for (let j = 0; j < tiles; j++) for (let i = 0; i < tiles; i++) {
      const x = -extent + (i + .5) * width, z = -extent + (j + .5) * width;
      physics.createCollider(RAPIER.ColliderDesc.cuboid(width / 2 + .002, .4, width / 2 + .002)
        .setTranslation(x, floor(x,z) - .4, z).setFriction(.8));
    }
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI * 2 / 20, r = area.radius + .15;
      physics.createCollider(RAPIER.ColliderDesc.ball(.6).setTranslation(Math.sin(a) * r, floorY === undefined ? .3 : floorY - .5, Math.cos(a) * r).setFriction(.85));
    }
    const boundaries: RAPIER.Collider[] = [];
    for (const sign of [-1, 1]) {
      boundaries.push(physics.createCollider(RAPIER.ColliderDesc.cuboid(.1, 6, extent).setTranslation(sign * extent, 5, 0)));
      boundaries.push(physics.createCollider(RAPIER.ColliderDesc.cuboid(extent, 6, .1).setTranslation(0, 5, sign * extent)));
    }
    // The carrying route crosses the bank boundary; invisible retaining walls
    // must only constrain coins after the chest has arrived above the bank.
    for (const boundary of boundaries) boundary.setEnabled(false);
    const collider = () => RAPIER.ColliderDesc.roundCylinder(COIN_THICKNESS / 2 - .006, COIN_RADIUS - .006, .006)
      .setFriction(.35).setRestitution(.025).setDensity(8)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1);
    let peak = Math.max(.1, floorY ?? .1);
    for (let i = 1; i < previous.length; i += COIN_POSE_STRIDE) peak = Math.max(peak, previous[i]!);
    if (previous.length) {
      const { vertices, indices } = settledGoldCollision(previous);
      physics.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(.7));
    }
    // Real moving floor and walls of the open chest. Coins can contact its rim
    // while it tips, rather than appearing beneath an already inverted box.
    const hull=physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(carryPose.position.x,carryPose.position.y,carryPose.position.z).setRotation(carryPose.rotation));
    const wall=(hx:number,hy:number,hz:number,x:number,y:number,z:number)=>
      physics!.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setTranslation(x,y,z).setFriction(.15),hull);
    wall(1.75,.09,.95,0,.16,0);
    for(const sign of [-1,1]){wall(1.75,.625,.085,0,.82,sign*.88);wall(.09,.625,.9,sign*1.7,.82,0);}
    const bodies: RAPIER.RigidBody[] = [];
    const moving = new Map<RAPIER.RigidBody, number>();
    const coinBodies = new Map<number, RAPIER.RigidBody>();
    const speeds = new Map<number, number>(), lastImpact = new Map<number, number>();
    const settledPoses = new Float32Array(1000 * COIN_POSE_STRIDE);
    let duration=0, started=false, turnFrame=0;
    const progress=()=>!started?0:duration>0?Math.min(1,(frame-turnFrame)/60/duration):1;
    const chestPose=():ChestPhysicsPose=>{
      if(!started)return carryPose!;
      const angle=pourTilt(progress());
      return {position:{x:0,y:chestY,z:0},rotation:{x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)},lid:1};
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
    let frame = 0;
    let polishing = false, empty = false;
    const anchors = new Map<RAPIER.RigidBody, {x:number;y:number;z:number;nx:number;ny:number;nz:number;frames:number}>();
    const tick = () => {
      const start = performance.now(), impacts: number[] = [];
      if (!polishing && empty && moving.size < 24) {
        polishing = true;
        // Only a handful of contacts remain. Extra solver accuracy and damping
        // stop a rim trapped between permanent coins from rattling forever.
        physics!.numSolverIterations = 12;
        for (const b of moving.keys()) { b.setLinearDamping(2); b.setAngularDamping(12); }
      }
      // Advance in real time throughout the spill, including after all coins exist.
      const steps = 2;
      for (let n = 0; n < steps; n++, frame++) {
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
        // A rare solver escape is dropped again; no lost coins or invented final poses.
        for (const b of moving.keys()) {
          const p = b.translation();
          if (p.y < floor(p.x,p.z) - .15) {
            b.setTranslation({ x: 0, y: peak + 2, z: 0 }, true);
            b.setLinvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
        if (!empty && progress() === 1) {
          const q=pose.rotation;
          empty=bodies.every(b=>{
            const p=b.translation(),x=p.x-pose.position.x,y=p.y-pose.position.y,z=p.z-pose.position.z;
            const tx=2*(-q.y*z+q.z*y),ty=2*(-q.z*x+q.x*z),tz=2*(-q.x*y+q.y*x);
            const lx=x+q.w*tx-q.y*tz+q.z*ty,ly=y+q.w*ty-q.z*tx+q.x*tz,lz=z+q.w*tz-q.x*ty+q.y*tx;
            return Math.abs(lx)>1.9 || Math.abs(lz)>1.1 || ly<-.1 || ly>2.5;
          });
          if(empty)hull.setEnabled(false);
        }
        for (const [b, index] of moving) {
          const p = b.translation(), q = b.rotation(), a = anchors.get(b);
          // Sleep by actual pose stability, so microscopic contact jitter cannot
          // keep a visually stationary doubloon simulating forever.
          // A last coin can rattle indefinitely between two frozen neighbours.
          // After the pour, use a centimetre-sized settling window over a full
          // second rather than keeping imperceptible contact jitter alive.
          const finishedPour = empty;
          // A round coin can spin about its own normal without changing any
          // contacts. Judge its tilt, not quaternion yaw, when it comes to rest.
          const nx=2*(q.x*q.y-q.z*q.w),ny=1-2*(q.x*q.x+q.z*q.z),nz=2*(q.y*q.z+q.x*q.w);
          const still = a && Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z) < (finishedPour ? .03 : .005) && (polishing || 1-Math.abs(nx*a.nx+ny*a.ny+nz*a.nz) < (finishedPour ? .007 : .0006));
          if (!still) anchors.set(b,{x:p.x,y:p.y,z:p.z,nx,ny,nz,frames:0});
          else a.frames++;
          // Never freeze a coin resting on the overturned chest itself.
          if (progress() === 1 && p.y < chestY-1.5 && (b.isSleeping() || (still && a.frames >= (finishedPour ? 60 : 90)))) {
            b.setBodyType(RAPIER.RigidBodyType.Fixed, false);
            settledPoses.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w], index * COIN_POSE_STRIDE);
            moving.delete(b); anchors.delete(b);
          }
        }
      }
      const poses = settledPoses.slice(0, bodies.length * COIN_POSE_STRIDE);
      moving.forEach((i, b) => { const p = b.translation(), q = b.rotation(); poses.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w], i * COIN_POSE_STRIDE); });
      const done = empty && moving.size === 0;
      self.postMessage({ poses, done, spawned: bodies.length, resting: bodies.length - moving.size, empty, time: frame / 60, turn: progress(), impacts: impacts.sort((a,b)=>b-a).slice(0,3) }, { transfer: [poses.buffer] });
      if (done) { events!.free(); events=undefined; physics!.free(); physics = undefined; }
      else setTimeout(tick, Math.max(0, 1000 / 30 - (performance.now() - start)));
    };
    beginPour=(seconds)=>{
      if(started)return;
      started=true;duration=Math.max(0,seconds);turnFrame=frame;
      for(const boundary of boundaries)boundary.setEnabled(true);
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
