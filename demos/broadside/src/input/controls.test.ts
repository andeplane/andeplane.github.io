import { describe, expect, it } from "vitest";
import { Controls, type PadState } from "./controls";

const pad = (axes: number[], pressed: number[] = []): PadState => ({
  axes,
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })),
});

describe("Controls", () => {
  it("is idle with nothing pressed", () => {
    const c = new Controls();
    expect(c.readIntent()).toEqual({ turn: 0, sailUp: false, sailDown: false, firePort: false, fireStarboard: false });
  });

  it("maps WASD and arrows to turning, with opposite keys cancelling", () => {
    const c = new Controls();
    expect(c.keyDown("KeyA")).toBe(true);
    expect(c.readIntent().turn).toBe(-1);
    c.keyDown("ArrowRight");
    expect(c.readIntent().turn).toBe(0);
    c.keyUp("KeyA");
    expect(c.readIntent().turn).toBe(1);
    expect(c.isDown("turnRight")).toBe(true);
  });

  it("reports unknown keys so the page can ignore them", () => {
    expect(new Controls().keyDown("KeyZ")).toBe(false);
  });

  it("triggers sail changes once per press", () => {
    const c = new Controls();
    c.keyDown("KeyW");
    expect(c.readIntent().sailUp).toBe(true);
    expect(c.readIntent().sailUp).toBe(false);
    c.keyDown("KeyW"); // key repeat while held
    expect(c.readIntent().sailUp).toBe(false);
    c.keyUp("KeyW");
    c.keyDown("ArrowDown");
    expect(c.readIntent().sailDown).toBe(true);
  });

  it("fires one side with Q/E and both with Space while held", () => {
    const c = new Controls();
    c.keyDown("KeyQ");
    expect(c.readIntent()).toMatchObject({ firePort: true, fireStarboard: false });
    c.keyUp("KeyQ");
    c.keyDown("Space");
    expect(c.readIntent()).toMatchObject({ firePort: true, fireStarboard: true });
    expect(c.readIntent()).toMatchObject({ firePort: true, fireStarboard: true });
  });

  it("supports on-screen touch buttons", () => {
    const c = new Controls();
    c.setVirtual("fireStarboard", true);
    c.setVirtual("sailUp", true);
    expect(c.readIntent()).toMatchObject({ fireStarboard: true, sailUp: true });
    c.setVirtual("fireStarboard", false);
    expect(c.readIntent().fireStarboard).toBe(false);
  });

  it("reads a gamepad stick with a deadzone, and pad buttons", () => {
    const c = new Controls();
    c.setPad(pad([0.1]));
    expect(c.readIntent().turn).toBe(0);
    c.setPad(pad([-0.7], [5]));
    const i = c.readIntent();
    expect(i.turn).toBeCloseTo(-0.7);
    expect(i.fireStarboard).toBe(true);
    c.setPad(pad([], [12]));
    expect(c.readIntent().sailUp).toBe(true);
    c.setPad(null);
    expect(c.readIntent().turn).toBe(0);
  });

  it("keys override the stick when both are used", () => {
    const c = new Controls();
    c.setPad(pad([0.5]));
    c.keyDown("KeyA");
    expect(c.readIntent().turn).toBe(-1);
  });

  it("releases everything on clear", () => {
    const c = new Controls();
    c.keyDown("KeyQ");
    c.setVirtual("turnLeft", true);
    c.setPad(pad([0.9], [4]));
    c.clear();
    expect(c.readIntent()).toMatchObject({ turn: 0, firePort: false });
  });

  it.each([
    ["keyboard", (c: Controls) => c.keyDown("KeyW")],
    ["touch", (c: Controls) => c.setVirtual("sailUp", true)],
    ["gamepad", (c: Controls) => c.setPad(pad([0.8], [12]))],
  ] as const)("discards queued %s sail commands when paused or switching cameras", (_, press) => {
    const c = new Controls();
    press(c); // The game can pause before its next simulation step consumes this edge.
    c.clear();
    expect(c.readIntent()).toEqual({
      turn: 0, sailUp: false, sailDown: false, firePort: false, fireStarboard: false,
    });
    expect(c.isDown("sailUp")).toBe(false);
    press(c);
    expect(c.readIntent().sailUp).toBe(true);
    expect(c.readIntent().sailUp).toBe(false);
  });
});
