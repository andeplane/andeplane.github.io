import { describe, expect, it } from "vitest";
import { CaveGesture } from "./caveGesture";

describe("cave touch gestures", () => {
  it("taps with small finger jitter but rejects displacement at release", () => {
    const g = new CaveGesture();
    g.down(1, 20, 30);
    expect(g.move(1, 22, 32)).toBeNull();
    expect(g.up(1, 22, 32)).toEqual({ type: "tap", x: 22, y: 32 });
    g.down(1, 20, 30);
    expect(g.up(1, 50, 30)).toBeNull();
  });
  it("measures cumulative slow movement and reports the drag", () => {
    const g = new CaveGesture();
    g.down(1, 0, 0);
    for (let x = 1; x <= 6; x++) expect(g.move(1, x, 0)).toBeNull();
    expect(g.move(1, 7, 0)).toEqual({ type: "look", dx: 1, dy: 0 });
    expect(g.up(1, 7, 0)).toBeNull();
  });
  it("spreading fingers produces pullback ratios and never taps or drags after lifting one finger", () => {
    const g = new CaveGesture();
    g.down(1, 0, 0);
    g.down(2, 100, 0);
    expect(g.move(2, 150, 0)).toEqual({ type: "pinch", ratio: 1.5 });
    expect(g.move(1, -50, 0)).toEqual({ type: "pinch", ratio: 200 / 150 });
    expect(g.up(1, -50, 0)).toBeNull();
    expect(g.move(2, 160, 0)).toBeNull();
    expect(g.up(2, 160, 0)).toBeNull();
    g.down(3, 50, 50);
    expect(g.up(3, 50, 50)?.type).toBe("tap");
  });
  it("supports closing fingers and ignores overlapping or unknown pointers", () => {
    const g = new CaveGesture();
    expect(g.move(8, 1, 1)).toBeNull();
    expect(g.up(8, 1, 1)).toBeNull();
    g.down(1, 0, 0);
    g.down(2, 100, 0);
    expect(g.move(2, 50, 0)).toEqual({ type: "pinch", ratio: 0.5 });
    expect(g.move(2, 5, 0)).toBeNull();
    expect(g.move(2, 40, 0)).toBeNull();
  });
  it("cancellation, a third finger, and clearing cannot trigger a selection", () => {
    const g = new CaveGesture();
    g.down(1, 0, 0);
    g.down(2, 50, 0);
    g.down(3, 100, 0);
    expect(g.move(3, 130, 0)).toBeNull();
    g.cancel(3);
    g.cancel(2);
    expect(g.up(1, 0, 0)).toBeNull();
    g.down(4, 4, 4);
    g.clear();
    expect(g.up(4, 4, 4)).toBeNull();
  });
});
