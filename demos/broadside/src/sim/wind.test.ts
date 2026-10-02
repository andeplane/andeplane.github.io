import { describe, expect, it } from "vitest";
import { sailEfficiency, shiftWind, type Wind } from "./wind";

const wind: Wind = { direction: 0, strength: 1 };

describe("wind", () => {
  it("is fastest on a beam reach", () => {
    const beam = sailEfficiency(Math.PI / 2, wind);
    expect(beam).toBeGreaterThan(sailEfficiency(0, wind));
    expect(beam).toBeGreaterThan(sailEfficiency(Math.PI, wind));
    expect(beam).toBeCloseTo(1);
  });

  it("is symmetric on port and starboard tacks", () => {
    expect(sailEfficiency(1.1, wind)).toBeCloseTo(sailEfficiency(-1.1, wind));
  });

  it("never stops a ship dead, even sailing into the wind", () => {
    expect(sailEfficiency(Math.PI, wind)).toBeGreaterThan(0.2);
    expect(sailEfficiency(Math.PI, { direction: 0, strength: 0 })).toBeGreaterThan(0.1);
  });

  it("weaker wind means slower sailing", () => {
    expect(sailEfficiency(1, { direction: 0, strength: 0.2 })).toBeLessThan(sailEfficiency(1, wind));
  });

  it("shifts gently around its base direction", () => {
    for (let t = 0; t < 2000; t += 37) {
      const w = shiftWind(wind, t, 0.5);
      expect(Math.abs(w.direction - 0.5)).toBeLessThan(0.5);
      expect(w.strength).toBe(1);
    }
  });
});
