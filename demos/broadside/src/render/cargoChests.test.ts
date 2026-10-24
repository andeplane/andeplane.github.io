import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { CargoChests, entranceCargoPosition } from './cargoChests';

describe('visible waiting cargo', () => {
  it('batches forty open chests with visible gold and releases previous geometry when the queue advances', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    const display = new CargoChests(scene, 'entrance cargo test');
    const positions = Array.from({ length: 40 }, (_, i) => entranceCargoPosition(i));
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
