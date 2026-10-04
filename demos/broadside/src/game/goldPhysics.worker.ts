import RAPIER from "@dimforge/rapier3d-compat";
import { GOLD_AREAS, COIN_RADIUS, COIN_THICKNESS, COIN_POSE_STRIDE } from "./goldAreas";
import { caveFloor } from "../input/caveLayout";
import { settledGoldCollision } from "./goldCollision";

/** Only the new chest is dynamic. The earned hoard is permanent collision geometry. */
self.onmessage = async (event: MessageEvent<{ world: number; previous: Float32Array; chest: Float32Array }>) => {
  let physics: InstanceType<typeof RAPIER.World> | undefined;
  try {
    await RAPIER.init();
    const { world, previous, chest } = event.data, area = GOLD_AREAS[world]!;
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
        .setTranslation(x, caveFloor(x + area.x, z + area.z) - .4, z).setFriction(.8));
    }
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI * 2 / 20, r = area.radius + .15;
      physics.createCollider(RAPIER.ColliderDesc.ball(.6).setTranslation(Math.sin(a) * r, .3, Math.cos(a) * r).setFriction(.85));
    }
    for (const sign of [-1, 1]) {
      physics.createCollider(RAPIER.ColliderDesc.cuboid(.1, 6, extent).setTranslation(sign * extent, 5, 0));
      physics.createCollider(RAPIER.ColliderDesc.cuboid(extent, 6, .1).setTranslation(0, 5, sign * extent));
    }
    const collider = () => RAPIER.ColliderDesc.roundCylinder(COIN_THICKNESS / 2 - .006, COIN_RADIUS - .006, .006)
      .setFriction(.7).setRestitution(.025).setDensity(8);
    let peak = .1;
    for (let i = 1; i < previous.length; i += COIN_POSE_STRIDE) peak = Math.max(peak, previous[i]!);
    if (previous.length) {
      const { vertices, indices } = settledGoldCollision(previous);
      physics.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(.7));
    }
    let seed = 38071 + world * 173 + previous.length;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const bodies: RAPIER.RigidBody[] = [];
    const moving = new Map<RAPIER.RigidBody, number>();
    const settledPoses = new Float32Array(1000 * COIN_POSE_STRIDE);
    const spawn = () => {
      // The same saved chestful seen during the reveal, emptied from the top
      // first. Rotate its poses with the now inverted wooden chest.
      const i = (999 - bodies.length) * COIN_POSE_STRIDE, scale = 1;
      const b = physics!.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-chest[i]! * scale, peak + 3.8 - chest[i + 1]! * scale, chest[i + 2]! * scale)
        .setRotation({x:chest[i + 4]!,y:-chest[i + 3]!,z:-chest[i + 6]!,w:chest[i + 5]!})
        .setLinvel((random() - .5) * .8, -.8, (random() - .5) * .8)
        .setAngvel({x:(random()-.5)*5,y:(random()-.5)*5,z:(random()-.5)*5})
        .setLinearDamping(.4).setAngularDamping(2).setCcdEnabled(true));
      physics!.createCollider(collider(), b);
      moving.set(b, bodies.length); bodies.push(b);
    };
    let frame = 0;
    let polishing = false;
    const anchors = new Map<RAPIER.RigidBody, {x:number;y:number;z:number;nx:number;ny:number;nz:number;frames:number}>();
    const tick = () => {
      const start = performance.now();
      if (!polishing && bodies.length === 1000 && moving.size < 24) {
        polishing = true;
        // Only a handful of contacts remain. Extra solver accuracy and damping
        // stop a rim trapped between permanent coins from rattling forever.
        physics!.numSolverIterations = 12;
        for (const b of moving.keys()) { b.setLinearDamping(2); b.setAngularDamping(12); }
      }
      const steps = bodies.length === 1000 ? 12 : 2;
      for (let n = 0; n < steps; n++, frame++) {
        // Backpressure keeps a large deposit from becoming 1,000 simultaneous
        // rigid bodies on a phone. Every earned coin is still poured and saved.
        if (bodies.length < 1000 && frame % 8 === 0 && moving.size <= 300) for (let i = 0; i < 20; i++) spawn();
        physics!.step();
        // A rare solver escape is dropped again; no lost coins or invented final poses.
        for (const b of moving.keys()) {
          const p = b.translation();
          if (p.y < caveFloor(p.x + area.x, p.z + area.z) - .15) {
            b.setTranslation({ x: 0, y: peak + 2, z: 0 }, true);
            b.setLinvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
        // After the chest empties, settle the remaining contacts faster, within
        // a worker time budget. The saved final poses still come from physics.
        if (n >= 1 && performance.now() - start >= 12) { frame++; break; }
        for (const [b, index] of moving) {
          const p = b.translation(), q = b.rotation(), a = anchors.get(b);
          // Sleep by actual pose stability, so microscopic contact jitter cannot
          // keep a visually stationary doubloon simulating forever.
          // A last coin can rattle indefinitely between two frozen neighbours.
          // After the pour, use a centimetre-sized settling window over a full
          // second rather than keeping imperceptible contact jitter alive.
          const finishedPour = bodies.length === 1000;
          // A round coin can spin about its own normal without changing any
          // contacts. Judge its tilt, not quaternion yaw, when it comes to rest.
          const nx=2*(q.x*q.y-q.z*q.w),ny=1-2*(q.x*q.x+q.z*q.z),nz=2*(q.y*q.z+q.x*q.w);
          const still = a && Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z) < (finishedPour ? .03 : .005) && (polishing || 1-Math.abs(nx*a.nx+ny*a.ny+nz*a.nz) < (finishedPour ? .007 : .0006));
          if (!still) anchors.set(b,{x:p.x,y:p.y,z:p.z,nx,ny,nz,frames:0});
          else a.frames++;
          if (b.isSleeping() || (still && a.frames >= (finishedPour ? 60 : 90))) {
            b.setBodyType(RAPIER.RigidBodyType.Fixed, false);
            settledPoses.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w], index * COIN_POSE_STRIDE);
            moving.delete(b); anchors.delete(b);
          }
        }
      }
      const poses = settledPoses.slice(0, bodies.length * COIN_POSE_STRIDE);
      moving.forEach((i, b) => { const p = b.translation(), q = b.rotation(); poses.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w], i * COIN_POSE_STRIDE); });
      const done = bodies.length === 1000 && moving.size === 0;
      self.postMessage({ poses, done, spawned: bodies.length, resting: bodies.length - moving.size, time: frame / 60 }, { transfer: [poses.buffer] });
      if (done) { physics!.free(); physics = undefined; }
      else setTimeout(tick, Math.max(0, 1000 / 30 - (performance.now() - start)));
    };
    tick();
  } catch (error) {
    physics?.free(); self.postMessage({ error: String(error) });
  }
};
