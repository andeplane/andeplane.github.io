import { expect, it } from "vitest";
import { planTown, townGrade, townReserved } from "./landfallTown";

it("keeps every cottage level, apart, and connected by an unobstructed lane", () => {
  for (let seed = 0; seed < 256; seed++) {
    const size = seed % 2 ? "hamlet" : "village";
    const side = seed % 4 < 2 ? -1 : 1;
    const town = planTown(seed, size, side);
    expect(town.houses).toHaveLength(size === "hamlet" ? 3 : 6);
    expect(town).toEqual(planTown(seed, size, side));
    for (const h of town.houses) {
      for (const ax of [-1,1]) for (const az of [-1,1]) {
        const x = h.x + ax*h.depth/2, z = h.z + az*h.frontage/2;
        expect(townGrade(town,x,z)).toBe(1);
        expect(Math.abs(x)).toBeGreaterThan(9);
      }
      expect(town.paths.some(({b}) => Math.abs(b.x - (h.x+h.facing*h.depth/2)) < .001 && b.z === h.z)).toBe(true);
      for (const other of town.houses.filter(other => other !== h)) {
        expect(Math.abs(h.x - other.x) > (h.depth+other.depth)/2+.65 ||
          Math.abs(h.z - other.z) > (h.frontage+other.frontage)/2+.65).toBe(true);
      }
    }
    for (const {a,b} of town.paths) for (let i=0; i<=10; i++) {
      const x = a.x+(b.x-a.x)*i/10, z = a.z+(b.z-a.z)*i/10;
      expect(townReserved(town,x,z)).toBe(true);
      expect(townGrade(town,x,z)).toBe(1);
      for (const h of town.houses) {
        expect(Math.abs(x-h.x) >= h.depth/2-.001 || Math.abs(z-h.z) >= h.frontage/2-.001).toBe(true);
      }
    }
  }
});

it("leaves all terrain untouched when settlement generation is off", () => {
  const town = planTown(42,"none",1);
  expect(town).toEqual({ houses: [], paths: [] });
  expect(townGrade(town,19,0)).toBe(0);
  expect(townReserved(town,19,0)).toBe(false);
});
