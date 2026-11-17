import assert from "node:assert/strict";
import { test } from "node:test";
import { hintArrow, type Rectangle } from "../src/hintGeometry.ts";

const card: Rectangle = { x: 100, y: 240, width: 100, height: 140 };
test("horizontal arrows connect the facing card edges with a straight line", () => {
  const target = { ...card, x: 500 };
  const arrow = hintArrow(card, target);
  assert.equal(arrow.start[0], 204);
  assert.equal(arrow.start[1], 310);
  assert.equal(arrow.end[0], 493);
  assert.equal(arrow.end[1], 310);
  assert.match(arrow.path, /^M [\d. -]+ L [\d. -]+$/);
  assert(!arrow.path.includes("NaN"));
});

test("a foundation arrow ends just outside the correct target edge", () => {
  const target = { x: 100, y: 20, width: 100, height: 140 };
  const arrow = hintArrow(card, target);
  assert.equal(arrow.start[0], 150);
  assert(arrow.start[1] < card.y);
  assert.equal(arrow.end[0], 150);
  assert(arrow.end[1] > target.y + target.height);
  assert(arrow.end[1] < card.y);
});

test("arrow geometry scales with responsive card sizes and stays finite", () => {
  for (const scale of [0.6, 1, 1.5]) {
    const resize = (value: Rectangle): Rectangle => ({
      x: value.x * scale,
      y: value.y * scale,
      width: value.width * scale,
      height: value.height * scale,
    });
    const target = { x: 380, y: 40, width: 100, height: 140 };
    const arrow = hintArrow(resize(card), resize(target));
    assert(arrow.start.every(Number.isFinite));
    assert(arrow.end.every(Number.isFinite));
    assert(!/NaN|Infinity/.test(arrow.path));
    assert(!/[CQ]/.test(arrow.path));
  }
  assert.throws(() => hintArrow(card, card));
});
