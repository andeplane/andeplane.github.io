import { describe, expect, it } from "vitest";
import { CaveWalker, CaveWalkControls, type WalkIntent } from "./caveWalk";
import { caveWalkable, caveRoom, caveFloor } from "./caveLayout";
const idle: WalkIntent = {
  forward: 0,
  right: 0,
  jump: false,
  sprint: false,
  crouch: false,
};
const run = (w: CaveWalker, intent: Partial<WalkIntent>, seconds = 1) => {
  for (let n = 0; n < seconds * 120; n++)
    w.step({ ...idle, ...intent }, 1 / 120);
};
describe("Minecraft cave controls", () => {
  it("combines keyboard and touch, releases movement and consumes jumps once", () => {
    const c = new CaveWalkControls();
    expect(c.keyDown("KeyE", 0)).toBe(false);
    c.keyDown("KeyW", 0);
    c.keyDown("Space", 0);
    c.keyDown("Space", 10);
    c.move(3, 4);
    expect(c.read()).toMatchObject({ forward: 1.8, right: 0.6, jump: true });
    expect(c.read().jump).toBe(false);
    c.keyUp("Space");
    c.keyDown("Space", 20);
    expect(c.read().jump).toBe(true);
    c.keyUp("KeyW");
    c.jump();
    expect(c.read().jump).toBe(true);
    c.clear();
    expect(c.read()).toEqual(idle);
  });
  it("supports arrows, opposite keys, crouching and sprinting with ctrl or double-tap W", () => {
    const c = new CaveWalkControls();
    for (const key of [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftRight",
      "ControlLeft",
    ])
      c.keyDown(key, 0);
    expect(c.read()).toMatchObject({
      forward: 0,
      right: 0,
      crouch: true,
      sprint: true,
    });
    expect(c.readLook()).toEqual({ right: 0, down: 0 });
    c.clear();
    c.keyDown("KeyW", 0);
    expect(c.read().sprint).toBe(false);
    c.keyUp("KeyW");
    c.keyDown("KeyW", 150);
    expect(c.read().sprint).toBe(true);
    c.keyUp("KeyW");
    expect(c.read().sprint).toBe(false);
    c.keyDown("KeyW", 1000);
    expect(c.read().sprint).toBe(false);
    c.keyDown("KeyA", 1000);
    c.keyDown("ShiftLeft", 1000);
    c.keyDown("ControlRight", 1000);
    expect(c.read()).toMatchObject({ right: -1, crouch: true, sprint: true });
  });
  it("holds arrows to look without walking and releases them independently of WASD", () => {
    const c = new CaveWalkControls();
    c.keyDown("ArrowRight", 0);
    c.keyDown("ArrowUp", 0);
    expect(c.read()).toEqual(idle);
    expect(c.readLook()).toEqual({ right: 1, down: -1 });
    expect(c.readLook()).toEqual({ right: 1, down: -1 });
    c.keyDown("KeyW", 0);
    expect(c.read().forward).toBe(1);
    c.keyUp("ArrowRight");
    c.keyUp("ArrowUp");
    c.keyDown("ArrowLeft", 100);
    c.keyDown("ArrowDown", 100);
    expect(c.readLook()).toEqual({ right: -1, down: 1 });
    expect(c.read().forward).toBe(1);
    c.clear();
    expect(c.readLook()).toEqual({ right: 0, down: 0 });
    expect(c.read()).toEqual(idle);
  });
});
describe("grounded cave walking", () => {
  it("walks relative to the camera, normalizes diagonals, and limits pitch", () => {
    const w = new CaveWalker([], () => 0);
    expect(w.eyeY).toBeCloseTo(2.25);
    run(w, { forward: 1 });
    expect(w.z).toBeCloseTo(-6.4);
    w.reset();
    run(w, { right: 1, forward: 1 });
    expect(Math.hypot(w.x, w.z + 10)).toBeCloseTo(3.6);
    w.reset();
    w.look(Math.PI / 2 / 0.003, 0);
    run(w, { forward: 1 });
    expect(w.x).toBeCloseTo(3.6);
    expect(w.z).toBeCloseTo(-10);
    w.look(100000, 100000);
    expect(w.pitch).toBe(1.35);
    expect(Math.abs(w.yaw)).toBeLessThanOrEqual(Math.PI);
    w.look(0, -100000);
    expect(w.pitch).toBe(-1.35);
  });
  it("blocks rocks without tunneling at sprint speed and slides along them", () => {
    const w = new CaveWalker(
      [{ x: 0, z: -7, rx: 1, rz: 0.2, top: 2 }],
      () => 0,
    );
    run(w, { forward: 1, sprint: true }, 2);
    expect(w.z).toBeLessThan(-7.5);
    run(w, { forward: 1, right: 1 }, 1);
    expect(w.x).toBeGreaterThan(1.5);
    expect(w.z).toBeGreaterThan(-7);
    w.x = 0;
    w.z = -7;
    w.step(idle, 0.01);
    expect(w.x).toBeGreaterThan(1);
  });
  it("jumps, lands on raised rock, crouches and falls after leaving a shelf", () => {
    const w = new CaveWalker(
      [{ x: 0, z: -6.8, rx: 1, rz: 1, top: 0.8 }],
      () => 0,
    );
    run(w, { forward: 1 }, 0.4);
    expect(w.z).toBeLessThan(-8);
    w.step({ ...idle, jump: true }, 1 / 120);
    expect(w.grounded).toBe(false);
    run(w, { forward: 1 }, 0.55);
    run(w, {}, 0.3);
    expect(w.feet).toBeCloseTo(0.8);
    run(w, { crouch: true }, 0.5);
    expect(w.eyeY).toBeCloseTo(1.98, 2);
    run(w, { forward: 1 }, 1);
    run(w, {}, 1);
    expect(w.feet).toBe(0);
    expect(w.grounded).toBe(true);
    w.step(idle, 0);
    run(w, { sprint: true, right: 1 }, 0.2);
    expect(w.bob).not.toBe(0);
  });
  it("steps over rubble and follows the rough floor without flying", () => {
    const w = new CaveWalker(
      [{ x: 0, z: -8, rx: 1, rz: 1, top: 0.2 }],
      () => 0,
    );
    run(w, { forward: 1 }, 0.5);
    expect(w.feet).toBeCloseTo(0.2);
    run(w, { forward: 1 }, 1);
    expect(w.feet).toBeCloseTo(0);
    const slope = new CaveWalker([], (x, z) => z * 0.01);
    run(slope, { forward: 1 });
    expect(slope.feet).toBeCloseTo(slope.z * 0.01);
    slope.step({ ...idle, jump: true }, 10);
    expect(slope.eyeY).toBeLessThan(3);
  });
  it("connects all chambers while keeping the walker out of canal banks and solid walls", () => {
    const w = new CaveWalker([], () => 0);
    run(w, { forward: 1 }, 12);
    expect(w.z).toBeGreaterThan(30);
    run(w, { forward: 1 }, 6);
    expect(w.z).toBeLessThanOrEqual(47);
    w.x = 5;
    w.z = 36.9;
    run(w, { forward: 1 }, 1);
    expect(w.z).toBeLessThan(37);
    w.x = 0;
    w.z = 36.9;
    run(w, { forward: 1 }, 1);
    expect(w.z).toBeGreaterThan(40);
    w.x = 9;
    w.z = 34.5;
    run(w, { right: 1 }, 6);
    expect(w.x).toBeGreaterThan(25);
    expect(caveFloor(5, 38)).toBe(-1.1);
    expect(caveFloor(0, 38)).toBe(0);
    expect(caveFloor(29, 38)).toBeGreaterThan(-0.35);
    expect(caveWalkable(29, 39)).toBe(true);
    expect(caveWalkable(5, 38)).toBe(false);
    expect(caveWalkable(0, -16)).toBe(true);
    expect(caveWalkable(10, 24)).toBe(false);
    expect(caveRoom(0, 0)).toBe("The treasure cave");
    expect(caveRoom(0, 24)).toBe("The lantern passage");
    expect(caveRoom(0, 40)).toBe("The king’s vault");
    expect(caveRoom(16, 34)).toBe("Smuggler’s passage");
    expect(caveRoom(29, 39)).toBe("The glowing grotto");
  });
});
