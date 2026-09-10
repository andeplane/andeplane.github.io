import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceValue, sourceResponse, SOURCE_WIDTH } from '../../src/features/neural-operators/labs/lib/heat-source.ts';
test('continuous heater adds the correct mean heat and begins at zero', () => {
  const xs = Array.from({ length: 512 }, (_, i) => i / 512);
  assert(xs.every(x => sourceResponse(x, 0, .02) === 0));
  const values = xs.map(x => sourceResponse(x, .3, .02));
  const mean = values.reduce((a,b)=>a+b,0)/values.length;
  assert(Math.abs(mean - .3*Math.sqrt(2*Math.PI)*SOURCE_WIDTH) < 1e-12);
  assert(values.every(v=>v > -1e-12));
  assert(Math.abs(sourceResponse(.4, .3, 0) - .3*sourceValue(.4)) < 1e-12);
});
