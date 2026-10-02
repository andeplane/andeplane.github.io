import { describe, expect, it } from "vitest";
import { DEFAULT_WAVES, sampleWaves } from "./waves";

describe("waves", () => {
  it("stays within a sensible height band", () => {
    let max = 0;
    for (let i = 0; i < 500; i++) {
      const s = sampleWaves(i * 3.7, i * -1.3, i * 0.21);
      max = Math.max(max, Math.abs(s.height));
    }
    expect(max).toBeGreaterThan(0.2);
    expect(max).toBeLessThan(3);
  });

  it("moves over time", () => {
    expect(sampleWaves(5, 5, 0).height).not.toBeCloseTo(sampleWaves(5, 5, 1).height, 3);
  });

  it("slopes match finite differences of height", () => {
    const e = 0.001;
    const s = sampleWaves(12, -7, 3);
    const dx = (sampleWaves(12 + e, -7, 3).height - sampleWaves(12 - e, -7, 3).height) / (2 * e);
    const dz = (sampleWaves(12, -7 + e, 3).height - sampleWaves(12, -7 - e, 3).height) / (2 * e);
    expect(s.slopeX).toBeCloseTo(dx, 3);
    expect(s.slopeZ).toBeCloseTo(dz, 3);
  });

  it("scales with amplitude and is flat with no waves", () => {
    expect(sampleWaves(1, 2, 3, DEFAULT_WAVES, 0).height).toBe(0);
    expect(sampleWaves(1, 2, 3, []).height).toBe(0);
    const full = sampleWaves(1, 2, 3).height;
    expect(sampleWaves(1, 2, 3, DEFAULT_WAVES, 2).height).toBeCloseTo(full * 2);
  });
});
