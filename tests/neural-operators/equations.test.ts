import assert from 'node:assert/strict';
import { test } from 'node:test';
import katex from 'katex';
import { E, phaseTex, amplitudesTex, productTex, shiftTex, contributionTex } from '../../src/features/neural-operators/labs/lib/equations.ts';

test('dynamic contribution retains LaTeX multiplication commands instead of JavaScript tab escapes', () => {
  const tex = contributionTex(3.4411, 0.9845, 1 / 12);
  assert.equal(tex.split(String.raw`\times`).length - 1, 2);
  assert(!tex.includes('\t'));
  const html = katex.renderToString(tex, { throwOnError: true, strict: 'error' });
  assert(html.includes('×'));
});

test('shared equations and dynamic formulas render and contain no accidental control escapes', () => {
  const expressions = [...Object.values(E), phaseTex(3, -2), amplitudesTex(0.3, -0.2), productTex(-0.4, 0.8), shiftTex(0.5), contributionTex(3.4411, -0.9845, 1 / 12)];
  for (const tex of expressions) {
    assert(!/[\u0000-\u0009\u000b-\u001f]/.test(tex));
    assert.doesNotThrow(() => katex.renderToString(tex, { throwOnError: true, strict: 'error' }));
  }
});
