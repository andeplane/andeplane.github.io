import { describe, expect, it } from 'vitest';
import { cargoCarry } from '../shared/pirate-world/game/cargoCarry';
import { caveWalkable } from '../shared/pirate-world/input/caveLayout';
import { GOLD_AREAS } from '../shared/pirate-world/game/goldAreas';

describe('cargo carried from the cave entrance', () => {
  const from = { x: -2.8, y: .2, z: -8.8 };
  it('lifts a chest from its real waiting position before carrying it across the cave', () => {
    const to = { x: -8, y: 3.8, z: 6 };
    expect(cargoCarry(0, from, to, 0)).toEqual(from);
    const lifted = cargoCarry(1.2, from, to, 0);
    expect(lifted).toEqual({ ...from, y: to.y });
    expect(cargoCarry(6.8, from, to, 0)).toEqual(to);
    expect(cargoCarry(0, from, to, 0, true)).toEqual(to);
  });
  it('carries every world chest through connected aisles, including the deep vault and side passage', () => {
    for (const area of GOLD_AREAS) {
      const to = { x: area.x, y: 3.8, z: area.z };
      for (let step = 0; step <= 680; step++) {
        const position = cargoCarry(step / 100, from, to, area.world);
        expect(caveWalkable(position.x, position.z), `world ${area.world} at ${step / 100}s: ${JSON.stringify(position)}`).toBe(true);
      }
    }
  });
});
