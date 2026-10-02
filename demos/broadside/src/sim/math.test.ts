import { describe, expect, it } from "vitest";
import {
  angleDiff, approach, clamp, distance, forward, headingTo, lerp, length, piecewise,
  starboard, toLocal, vec2, wrapAngle,
} from "./math";

describe("math", () => {
  it("clamps and lerps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it("approaches without overshooting", () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
    expect(approach(1, 0, 4)).toBe(0);
  });

  it("wraps angles into (-PI, PI]", () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
  });

  it("finds the shortest signed angle difference", () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });

  it("uses heading 0 = +Z and PI/2 = +X, starboard to the right", () => {
    expect(forward(0).z).toBeCloseTo(1);
    expect(forward(Math.PI / 2).x).toBeCloseTo(1);
    expect(starboard(0).x).toBeCloseTo(1);
    expect(starboard(Math.PI / 2).z).toBeCloseTo(-1);
  });

  it("measures vectors and bearings", () => {
    expect(length(vec2(3, 4))).toBe(5);
    expect(distance(vec2(1, 1), vec2(4, 5))).toBe(5);
    expect(headingTo(vec2(0, 0), vec2(10, 0))).toBeCloseTo(Math.PI / 2);
    expect(headingTo(vec2(0, 0), vec2(0, -10))).toBeCloseTo(Math.PI);
  });

  it("converts world points into a ship's local frame", () => {
    const ship = vec2(10, 10);
    // Ship facing east: a point further east is dead ahead.
    const ahead = toLocal(vec2(20, 10), ship, Math.PI / 2);
    expect(ahead.z).toBeCloseTo(10);
    expect(ahead.x).toBeCloseTo(0);
    // ...and a point to the south is off the starboard side.
    const right = toLocal(vec2(10, 0), ship, Math.PI / 2);
    expect(right.x).toBeCloseTo(10);
  });

  it("interpolates piecewise curves and clamps the ends", () => {
    const pts = [[0, 0], [1, 10], [2, 0]] as const;
    expect(piecewise(pts, -1)).toBe(0);
    expect(piecewise(pts, 0.5)).toBe(5);
    expect(piecewise(pts, 1.5)).toBe(5);
    expect(piecewise(pts, 3)).toBe(0);
    expect(() => piecewise([], 1)).toThrow();
  });
});
