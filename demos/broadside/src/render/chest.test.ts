import { describe, expect, it } from "vitest";
import { revealPose } from "./chest";

describe("treasure chest choreography", () => {
  it("keeps the treasure concealed until the lid has opened", () => {
    expect(revealPose(0)).toMatchObject({ lid: 0, rise: 0, ready: false });
    expect(revealPose(1)).toMatchObject({ lid: 0, rise: 0, discovered: false });
    const emerging = revealPose(2.65);
    expect(emerging.lid).toBe(1);
    expect(emerging.rise).toBeGreaterThan(0);
    expect(emerging.discovered).toBe(true);
    expect(emerging.ready).toBe(false);
  });
  it("finishes once, with bounded transforms even after a long pause", () => {
    expect(revealPose(4.7)).toMatchObject({ lid: 1, rise: 1, ready: true });
    expect(revealPose(300)).toMatchObject({ lid: 1, rise: 1, ready: true });
    expect(revealPose(-1)).toMatchObject({ lid: 0, rise: 0, glow: 0 });
  });
  it("shortens the reveal when the player requests reduced motion", () => {
    expect(revealPose(1.2, true)).toMatchObject({ lid: 1, rise: 1, ready: true });
    expect(revealPose(1.2).ready).toBe(false);
  });
});
