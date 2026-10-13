import { describe, expect, it } from 'vitest';
import { Machine } from './machine.ts';
import { Network, G } from './network.ts';
import { SCENES, sceneById } from './scenes.ts';
import { heightOf, volumeAt } from './vessel.ts';

/** Run a scene to completion with the given inputs; returns the machine. */
function compute(id: string, inputs: Record<string, number>, maxSeconds = 120): Machine {
  const m = new Machine(sceneById(id));
  for (const [k, v] of Object.entries(inputs)) m.setInput(k, v);
  m.run();
  const dt = 1 / 60;
  for (let t = 0; t < maxSeconds && m.state !== 'done'; t += dt) m.advance(dt);
  expect(m.state).toBe('done');
  return m;
}

describe('vessel profiles', () => {
  it('inverts volume to height for rect, wedge and horn', () => {
    for (const p of [
      [1.5, 0, 0],
      [0, 0.9, 0],
      [0.6, 0, 0.5],
      [0.2, 0.3, 0.1],
    ] as const) {
      for (const h of [0.01, 0.5, 1.7, 3]) expect(heightOf(p, volumeAt(p, h))).toBeCloseTo(h, 10);
    }
  });
});

describe('network', () => {
  it('drains a tank by Torricelli in the analytic time and conserves volume', () => {
    const A = 1.5;
    const a = 0.16;
    const net = new Network(
      [
        { id: 'S', label: '', x: 0, y0: 5, height: 4, profile: [A, 0, 0] },
        { id: 'T', label: '', x: 0, y0: 0, height: 4, profile: [3, 0, 0] },
      ],
      [
        {
          id: 'l',
          from: 'S',
          targets: [{ to: 'T', frac: 1 }],
          law: { kind: 'torricelli', area: a },
          spout: { x: 0, y: 4.5, dx: 0, dy: -1, width: a },
          path: [],
        },
      ],
    );
    const h0 = 2;
    net.setVolume('S', A * h0);
    net.open('l');
    // Emptying time for a prismatic tank: T = (A/a)·√(2 h0 / g).
    const T = (A / a) * Math.sqrt((2 * h0) / G);
    let tEmpty = -1;
    for (let i = 0; i < 60 * 30; i++) {
      net.step(1 / 60);
      if (tEmpty < 0 && net.vessel('S').V === 0) tEmpty = net.t;
    }
    expect(Math.abs(tEmpty - T) / T).toBeLessThan(0.01);
    expect(net.vessel('T').V).toBeCloseTo(A * h0, 12);
    expect(net.hasInflight()).toBe(false);
  });
});

describe('the exhibits compute', () => {
  it('3 + 4 = 7', () => {
    const m = compute('add', { a: 3, b: 4 });
    expect(m.reading()).toBeCloseTo(7, 9);
    expect(m.exact()).toBe(7);
  });

  it('0.5 · 6 = 3 and 0.37 · 7.3', () => {
    expect(compute('scale', { x: 6, k: 0.5 }).reading()).toBeCloseTo(3, 9);
    expect(compute('scale', { x: 7.3, k: 0.37 }).reading()).toBeCloseTo(0.37 * 7.3, 9);
  });

  it('√9 = 3 and √2', () => {
    expect(compute('sqrt', { x: 9 }).reading()).toBeCloseTo(3, 6);
    expect(compute('sqrt', { x: 2 }).reading()).toBeCloseTo(Math.SQRT2, 6);
  });

  it('3² = 9', () => {
    expect(compute('square', { x: 3 }).reading()).toBeCloseTo(9, 9);
  });

  it('2 × 3 = 6 by quarter squares, and other products', () => {
    expect(compute('multiply', { x: 2, y: 3 }).reading()).toBeCloseTo(6, 9);
    expect(compute('multiply', { x: 2.7, y: 1.3 }).reading()).toBeCloseTo(3.51, 9);
    expect(compute('multiply', { x: 1.5, y: 1.5 }).reading()).toBeCloseTo(2.25, 9);
    expect(compute('multiply', { x: 0, y: 2.4 }).reading()).toBeCloseTo(0, 9);
  });

  it('integrates a constant flow, and a leaky one close to the analytic curve', () => {
    const m = compute('integrate', { u: 0.6, T: 8, leak: 0 });
    expect(m.exact()).toBeCloseTo(4.8, 9);
    expect(m.reading()).toBeCloseTo(4.8, 9);
    const leaky = compute('integrate', { u: 0.8, T: 10, leak: 1 });
    // Compared against the exact exponential solution for the inflow as it lands.
    expect(Math.abs(leaky.reading() - leaky.exact()) / leaky.exact()).toBeLessThan(0.002);
  });

  it('every scene settles its preparation and keeps its vessels inside the glass', () => {
    for (const s of SCENES) {
      const m = new Machine(s);
      for (const inp of s.inputs) m.setInput(inp.key, inp.max);
      m.run();
      let maxFill = 0;
      for (let t = 0; t < 120 && m.state !== 'done'; t += 1 / 60) {
        m.advance(1 / 60);
        for (const v of m.net.vessels.values()) {
          if (v.spec.infinite) continue;
          maxFill = Math.max(maxFill, heightOf(v.spec.profile, v.V) / v.spec.height);
        }
      }
      expect(m.state, s.id).toBe('done');
      expect(maxFill, s.id).toBeLessThan(1);
    }
  });
});
