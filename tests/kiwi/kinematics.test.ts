import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bodyVelocity, limitedWheelRpm, wheelRpm } from '../../src/features/kiwi/kinematics.ts'

test('three wheel inverse kinematics recover combined translation and rotation', () => {
  for (const vx of [-0.23, 0, 0.19]) for (const vy of [-0.17, 0, 0.25]) for (const omega of [-0.6, 0, 0.8]) {
    const recovered = bodyVelocity(wheelRpm(vx, vy, omega))
    assert.ok(Math.abs(recovered.vx - vx) < 1e-12)
    assert.ok(Math.abs(recovered.vy - vy) < 1e-12)
    assert.ok(Math.abs(recovered.omega - omega) < 1e-12)
  }
})

test('a pure turn drives all three wheels equally and causes no translation', () => {
  const rpm = wheelRpm(0, 0, 1)
  assert.ok(rpm.every(n => Math.abs(n - rpm[0]) < 1e-12))
  assert.ok(rpm[0] > 0)
})

test('uniform wheel limiting preserves the requested body twist direction', () => {
  const result = limitedWheelRpm(0.25, 0.25, 1, 80)
  assert.ok(result.scale < 1)
  assert.ok(Math.max(...result.actual.map(Math.abs)) <= 80 + 1e-12)
  const recovered = bodyVelocity(result.actual)
  assert.ok(Math.abs(recovered.vx - 0.25 * result.scale) < 1e-12)
  assert.ok(Math.abs(recovered.vy - 0.25 * result.scale) < 1e-12)
  assert.ok(Math.abs(recovered.omega - result.scale) < 1e-12)
})
