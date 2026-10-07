import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { doubloonMesh, DOUBLOON_RENDER_TRIANGLES } from './coin';
import { COIN_RADIUS } from '../game/goldAreas';

describe('round visual doubloons', () => {
  it('retains a circular silhouette with bevels for close-up piles and chest contents', () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    try {
      const mesh = doubloonMesh(scene, 'close-up coin');
      const p = mesh.getVerticesData(VertexBuffer.PositionKind)!, n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
      const angles = new Set<number>(), heights = new Set<number>();
      for (let i = 0; i < p.length; i += 3) {
        const radius = Math.hypot(p[i]!, p[i + 2]!);
        expect(radius).toBeLessThanOrEqual(COIN_RADIUS + 1e-6);
        heights.add(Number(p[i + 1]!.toFixed(6)));
        if (Math.abs(radius - COIN_RADIUS) < 1e-6) angles.add(Number(Math.atan2(p[i + 2]!, p[i]!).toFixed(5)));
      }
      const sorted = [...angles].sort((a,b) => a-b);
      const gaps = sorted.map((a,i) => (i+1<sorted.length ? sorted[i+1]! : sorted[0]!+Math.PI*2)-a);
      // Maximum flat-chord deviation from a circle, including the seam.
      expect(Math.max(...gaps.map(g => 1-Math.cos(g/2)))).toBeLessThan(.005);
      expect(heights.size).toBeGreaterThanOrEqual(4);
      expect(mesh.getTotalIndices()/3).toBe(DOUBLOON_RENDER_TRIANGLES);
      expect(n.every(Number.isFinite)).toBe(true);
      const indices = mesh.getIndices()!;
      for (let i=0;i<indices.length;i+=3) {
        const a=indices[i]!*3,b=indices[i+1]!*3,c=indices[i+2]!*3;
        const u=[p[b]!-p[a]!,p[b+1]!-p[a+1]!,p[b+2]!-p[a+2]!];
        const v=[p[c]!-p[a]!,p[c+1]!-p[a+1]!,p[c+2]!-p[a+2]!];
        expect(Math.hypot(u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!)).toBeGreaterThan(1e-9);
      }
    } finally { scene.dispose(); engine.dispose(); }
  });
});
