import { describe, expect, it } from "vitest";
import { Rng } from "./rng";

describe("Rng", () => {
  it("is deterministic for a seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("differs between seeds", () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it("stays within ranges", () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      expect(Number.isInteger(n)).toBe(true);
      const v = r.range(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(3);
    }
  });

  it("picks every item eventually and rejects empty arrays", () => {
    const r = new Rng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(r.pick(["a", "b", "c"]));
    expect(seen.size).toBe(3);
    expect(() => r.pick([])).toThrow();
  });
});
