import {readFileSync} from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { settledGoldCollision,settledGoldPatches } from "./goldCollision";
import { COIN_THICKNESS } from "./goldAreas";

beforeAll(async () => { await RAPIER.init(); });

describe("permanent gold collision mesh", () => {
  it("keeps the top and rim solid at saved positions and rotations", () => {
    // A flat coin and another standing on its edge, away from the origin.
    const s = Math.SQRT1_2;
    const poses = new Float32Array([2, 1, 3, 0, 0, 0, 1, -2, 1, -3, 0, 0, s, s]);
    const before = poses.slice();
    const mesh = settledGoldCollision(poses);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices));
      world.step();
      const top = world.castRay(new RAPIER.Ray({ x: 2, y: 2, z: 3 }, { x: 0, y: -1, z: 0 }), 2, true);
      const rim = world.castRay(new RAPIER.Ray({ x: 2.3, y: 1, z: 3 }, { x: -1, y: 0, z: 0 }), 1, true);
      const rotated = world.castRay(new RAPIER.Ray({ x: -1, y: 1, z: -3 }, { x: -1, y: 0, z: 0 }), 2, true);
      expect(top?.timeOfImpact).toBeCloseTo(1 - COIN_THICKNESS / 2, 4);
      expect(rim?.timeOfImpact).toBeCloseTo(.16, 4);
      expect(rotated?.timeOfImpact).toBeCloseTo(1 - COIN_THICKNESS / 2, 4);
      expect(poses).toEqual(before);
    } finally { world.free(); }
  });

  it("supports a new dynamic coin landing on a permanent one", () => {
    const mesh = settledGoldCollision(new Float32Array([0, 1, 0, 0, 0, 0, 1]));
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      world.timestep = 1 / 60;
      world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices).setFriction(.7));
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.5, 0).setCcdEnabled(true));
      world.createCollider(RAPIER.ColliderDesc.roundCylinder(COIN_THICKNESS / 2 - .006, .134, .006).setFriction(.7), body);
      for (let i = 0; i < 180; i++) world.step();
      expect(body.translation().y).toBeCloseTo(1 + COIN_THICKNESS, 2);
      expect(Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z)).toBeLessThan(.02);
    } finally { world.free(); }
  });
});

describe('exposed hoard collision patches',()=>{
  it('removes buried surfaces, bounds each patch, and supports the full visible pile',()=>{
    const bytes=readFileSync(new URL('../../public/assets/hoard/world-0/8000.bin',import.meta.url));
    const poses=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),before=poses.slice();
    const patches=settledGoldPatches(poses),world=new RAPIER.World({x:0,y:-9.81,z:0});
    expect(patches.reduce((n,p)=>n+p.indices.length/3,0)).toBeLessThan(8000);
    try {
      for(const p of patches){
        const xs=p.vertices.filter((_,i)=>i%3===0),zs=p.vertices.filter((_,i)=>i%3===2);
        expect(Math.max(...xs)-Math.min(...xs)).toBeLessThan(2.3);
        expect(Math.max(...zs)-Math.min(...zs)).toBeLessThan(2.3);
        world.createCollider(RAPIER.ColliderDesc.trimesh(p.vertices,p.indices));
      }
      world.step();
      for(let i=0;i<poses.length;i+=7*157) {
        const x=poses[i]!,y=poses[i+1]!,z=poses[i+2]!;
        const hit=world.castRay(new RAPIER.Ray({x,y:20,z},{x:0,y:-1,z:0}),30,true);
        expect(hit).not.toBeNull();expect(20-hit!.timeOfImpact).toBeGreaterThanOrEqual(y);
      }
      expect(world.castRay(new RAPIER.Ray({x:20,y:20,z:20},{x:0,y:-1,z:0}),30,true)).toBeNull();
      const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,6,0).setCcdEnabled(true));
      world.createCollider(RAPIER.ColliderDesc.ball(.1).setFriction(.8),body);
      for(let i=0;i<360;i++)world.step();
      expect(body.translation().y).toBeGreaterThan(0);expect(body.translation().y).toBeLessThan(6);
      expect(poses).toEqual(before);
    }finally{world.free();}
  });
  it('keeps isolated coins exact and produces no geometry for an empty bank',()=>{
    expect(settledGoldPatches(new Float32Array())).toEqual([]);
    const poses=new Float32Array([2,1,3,0,0,0,1]);
    expect(settledGoldPatches(poses)).toEqual([settledGoldCollision(poses)]);
  });
});

it('never recreates discarded coins as collision geometry',()=>{
  const live=new Float32Array([2,1,3,0,0,0,1]);
  const mixed=new Float32Array([...new Float32Array(7),...live]);
  expect(settledGoldCollision(mixed)).toEqual(settledGoldCollision(live));
  expect(settledGoldPatches(mixed)).toEqual(settledGoldPatches(live));
  const large=new Float32Array(7000);large.set(live,7);
  const baseline=new Float32Array(7000);baseline.set(live);
  expect(settledGoldPatches(large)).toEqual(settledGoldPatches(baseline));
  expect(settledGoldCollision(new Float32Array(7)).indices.length).toBe(0);
  expect(settledGoldPatches(new Float32Array(7))).toEqual([]);
  expect(settledGoldPatches(new Float32Array(7000))).toEqual([]);
});
