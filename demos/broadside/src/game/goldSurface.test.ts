import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exposedGold } from './goldSurface';

const coin = (x: number, y: number, z: number, tilt = 0) => [x, y, z, Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)];
describe('frozen pile surface', () => {
  it('keeps isolated coins, including their vertical edges and negative coordinates', () => {
    const poses = new Float32Array([...coin(-4, .5, 3), ...coin(2, 1, -5, Math.PI / 2), ...coin(0, .8, 0, .6)]);
    expect(exposedGold(poses)).toEqual([0, 1, 2]);
    expect(exposedGold(new Float32Array())).toEqual([]);
    expect(exposedGold(poses, 1)).toEqual([0]);
  });
  it('removes a buried coin but preserves the outside on top and on every side', () => {
    const values = coin(0, 1, 0);
    // A densely filled stack encloses its centre. Coins on the edges remain
    // visible from an eye-level camera, rather than just a top-down view.
    for (let iy = 0; iy <= 12; iy++) for (let ix = -4; ix <= 4; ix++) for (let iz = -4; iz <= 4; iz++) values.push(...coin(ix * .1, .7 + iy * .05, iz * .1));
    const poses = new Float32Array(values), before = poses.slice(), visible = exposedGold(poses);
    expect(visible).not.toContain(0);
    const outer = visible.map(i => Array.from(poses.subarray(i * 7, i * 7 + 3)));
    for (const axis of [0, 2]) {
      expect(outer.some(p => p[axis]! < -.3)).toBe(true);
      expect(outer.some(p => p[axis]! > .3)).toBe(true);
    }
    expect(outer.some(p => p[1]! > 1.2)).toBe(true);
    expect(outer.some(p => p[1]! < .8)).toBe(true);
    expect(exposedGold(poses)).toEqual(visible);
    expect(poses).toEqual(before);
  });
  it('reduces a real 8,000-coin hoard without changing any saved pose', () => {
    const bytes = readFileSync(new URL('../../public/assets/hoard/world-0/8000.bin', import.meta.url));
    const poses = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), before = poses.slice();
    const visible = exposedGold(poses);
    expect(visible.length).toBeGreaterThan(500);
    expect(visible.length).toBeLessThan(4000);
    expect(new Set(visible).size).toBe(visible.length);
    expect(poses).toEqual(before);
  });
});
