import { describe, expect, it } from 'vitest';
import { coastDistance, coastPhase, coastRadius } from './islandShape';

describe('terrain and surf coastline', () => {
  it('puts the wet edge on the rendered coast, with water outside and land inside', () => {
    for (const island of [{ pos: { x: 80, z: -30 }, radius: 24 }, { pos: { x: -880, z: 1000 }, radius: 9 }]) {
      for (let i = 0; i < 112; i++) {
        const a = i / 112 * Math.PI * 2;
        const r = island.radius * coastRadius(a, coastPhase(island));
        const sample = (offset: number) => coastDistance(island, island.pos.x + Math.sin(a) * (r + offset), island.pos.z + Math.cos(a) * (r + offset));
        expect(sample(0)).toBeCloseTo(0, 10);
        expect(sample(2)).toBeCloseTo(2, 10);
        expect(sample(-2)).toBeCloseTo(-2, 10);
        expect(r / island.radius).toBeGreaterThanOrEqual(.785);
        expect(r / island.radius).toBeLessThanOrEqual(1.215);
      }
    }
  });
  it('keeps the same coast at a wrapped render position', () => {
    const island = { pos: { x: -980, z: 160 }, radius: 30 };
    const phase = coastPhase(island);
    // Wrapped copies carry the original phase in their fourth uniform component.
    const d = 32, a = .8;
    expect(d - island.radius * coastRadius(a, phase)).toBeCloseTo(coastDistance(island,
      island.pos.x + Math.sin(a) * d, island.pos.z + Math.cos(a) * d), 10);
  });
});
