import { describe, expect, it } from "vitest";
import { touchSteeringTurn } from "./touchSteering";

describe("touch wheel sensitivity", () => {
  it("ignores thumb jitter and gives small drags fine control rather than full rudder", () => {
    for (const distance of [-8, -4, 0, 4, 8]) expect(touchSteeringTurn(distance)).toBe(0);
    expect(touchSteeringTurn(12)).toBeGreaterThan(0);
    expect(touchSteeringTurn(12)).toBeLessThan(0.01);
    expect(touchSteeringTurn(24)).toBeLessThan(0.1);
    expect(touchSteeringTurn(40)).toBeGreaterThan(touchSteeringTurn(24));
  });

  it("turns symmetrically and caps even a drag far beyond the wheel", () => {
    for (const distance of [12, 24, 40, 60, 1000]) {
      expect(touchSteeringTurn(-distance)).toBe(-touchSteeringTurn(distance));
      expect(touchSteeringTurn(distance)).toBeLessThanOrEqual(0.75);
    }
    expect(touchSteeringTurn(60)).toBe(0.75);
  });
});
