import { describe, expect, it } from "vitest";
import { caveCameraPosition } from "./caveView";

describe("cave camera stays beneath the roof", () => {
  it("keeps a dragged overview and a zoomed-out close-up inside the cave", () => {
    for (const distance of [6, 8, 10, 17, 28, 34])
      for (const x of [-9, 0, 9])
        for (const orbit of [-1.95, -Math.PI / 2, -1.2]) {
          const p = caveCameraPosition(
            { x, y: 3, z: 4 },
            distance,
            orbit,
            0.95,
          );
          expect(p.y).toBeLessThanOrEqual(7.5);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(10);
          expect(p.y).toBeGreaterThanOrEqual(3);
        }
  });
  it("preserves the normal low overview and handles an unusually high focus", () => {
    const p = caveCameraPosition(
      { x: 0, y: 1.2, z: 4 },
      28,
      -Math.PI / 2,
      0.14,
    );
    expect(p.y).toBeCloseTo(1.2 + Math.sin(0.14) * 28);
    expect(p.z).toBeCloseTo(4 - Math.cos(0.14) * 28);
    expect(caveCameraPosition({ x: 0, y: 9, z: 0 }, 6, 0, 1).y).toBe(7.5);
    expect(caveCameraPosition({ x: 0, y: 1, z: 0 }, 6, 0, -1).y).toBe(1);
  });
});
