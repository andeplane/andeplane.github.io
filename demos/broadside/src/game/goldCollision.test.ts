import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { settledGoldCollision } from "./goldCollision";
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
