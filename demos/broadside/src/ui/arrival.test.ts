import { describe, expect, it } from "vitest";
import { arrivalPose } from "./arrival";

describe("sea to cave arrival", () => {
  it("covers the sea completely before changing scenes", () => {
    expect(arrivalPose(0)).toEqual({ opacity: 0, inCave: false, ready: false });
    expect(arrivalPose(0.325).opacity).toBeCloseTo(0.5);
    expect(arrivalPose(0.7)).toEqual({
      opacity: 1,
      inCave: false,
      ready: false,
    });
    expect(arrivalPose(0.77)).toEqual({
      opacity: 1,
      inCave: true,
      ready: false,
    });
  });
  it("lets the reveal begin only after the cave is fully visible", () => {
    expect(arrivalPose(1.195).opacity).toBeCloseTo(0.5);
    expect(arrivalPose(1.7)).toEqual({ opacity: 0, inCave: true, ready: true });
    expect(arrivalPose(100).opacity).toBe(0);
    expect(arrivalPose(-1).opacity).toBe(0);
  });
  it("uses a brief crossfade for reduced motion", () => {
    expect(arrivalPose(0.24, true)).toEqual({
      opacity: 1,
      inCave: true,
      ready: false,
    });
    expect(arrivalPose(0.37, true)).toEqual({
      opacity: 0,
      inCave: true,
      ready: true,
    });
    expect(arrivalPose(0.37).ready).toBe(false);
  });
});
