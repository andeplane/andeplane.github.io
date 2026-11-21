import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { CargoChests, bankCargoPosition } from '../shared/pirate-world/render/cargoChests';
import { GOLD_AREAS } from '../shared/pirate-world/game/goldAreas';
import { caveWalkable } from '../shared/pirate-world/input/caveLayout';

describe('visible waiting cargo', () => {
  it('keeps all staging slots on the cave floor beyond the bank retaining stones', () => {
    for (const area of GOLD_AREAS) {
      for (const count of [1, 3, 6, 20, 40]) {
        for (let slot = 0; slot < count; slot++) {
          const p = bankCargoPosition(slot, count, area);
          expect(caveWalkable(p.x, p.z), JSON.stringify({area, p, slot, count})).toBe(true);
          expect(Math.hypot(p.x - area.x, p.z - area.z), JSON.stringify({area, p, slot, count})).toBeGreaterThan(area.radius + .4);
        }
      }
    }
  });
  it('batches forty open chests with visible gold and releases previous geometry when the queue advances', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    const display = new CargoChests(scene, 'bank cargo test');
    const positions = Array.from({ length: 40 }, (_, i) => bankCargoPosition(i, 40, GOLD_AREAS[0]));
    display.show(positions);
    expect(scene.meshes).toHaveLength(2);
    expect(scene.transformNodes).toHaveLength(0);
    const vertices = scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
    expect(vertices).toBeGreaterThan(1000);
    const preceding = [...scene.meshes];
    display.show(positions.slice(1));
    expect(preceding.every(mesh => mesh.isDisposed())).toBe(true);
    expect(scene.meshes).toHaveLength(2);
    expect(scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0)).toBeCloseTo(vertices * 39 / 40, 0);
    display.show([]); expect(scene.meshes).toHaveLength(0);
    scene.dispose(); engine.dispose();
  });
});
