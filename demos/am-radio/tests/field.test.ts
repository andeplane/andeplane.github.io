import { test } from "node:test";
import assert from "node:assert/strict";
import { referenceStep, NX, NY, DT, COURANT } from "../src/field.ts";
test("Yee vacuum Courant number respects the two-dimensional bound", () =>
  assert.ok(COURANT < 1 / Math.sqrt(2)));
test("finite propagation reaches a distant field probe after the light travel time", () => {
  let a = new Float32Array(NX * NY * 4),
    early = 0,
    late = 0;
  for (let n = 1; n <= 600; n++) {
    a = referenceStep(a, n * DT, 900000, 1, false);
    const v = Math.abs(a[(64 * NX + 210) * 4]);
    if (n < 340) early = Math.max(early, v);
    if (n > 450) late = Math.max(late, v);
  }
  assert.ok(early < 1e-4, `early ${early}`);
  assert.ok(late > 0.001, `late ${late}`);
  assert.ok(a.every(Number.isFinite));
});
test("conducting cells enforce zero tangential electric field", () => {
  let a = new Float32Array(NX * NY * 4);
  a[(30 * NX + 145) * 4] = 1;
  a = referenceStep(a, DT, 900000, 0, true);
  assert.equal(a[(30 * NX + 145) * 4], 0);
});
