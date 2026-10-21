import assert from 'node:assert/strict'
import { test } from 'node:test'
import { examplePose, objects, roomAt, rooms, route, walls } from '../../src/features/kiwi/mapExample.ts'

test('example drive stays in mapped rooms and clears walls and furniture with a 29 cm base', () => {
  for (let i = 0; i <= 3000; i++) {
    const { point: [x, y], heading } = examplePose(i / 3000)
    assert.ok(roomAt([x, y]), `unmapped position ${x},${y}`)
    assert.ok(Number.isFinite(heading))
    for (const [ax, ay, bx, by] of walls) {
      const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSquared))
      const distance = Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay))
      assert.ok(distance >= .145, `route touches wall: ${x},${y}`)
    }
    for (const o of objects) {
      const distance = Math.hypot(Math.max(o.x - x, 0, x - o.x - o.w), Math.max(o.y - y, 0, y - o.y - o.d))
      assert.ok(distance >= .145, `route touches ${o.name}: ${x},${y}`)
    }
  }
  assert.deepEqual(examplePose(0).point, route[0])
  assert.deepEqual(examplePose(1).point.map(n => Math.round(n * 100)), route.at(-1)!.map(n => Math.round(n * 100)))
})

test('suggested room names have matching object observations and route coverage', () => {
  const visited = new Set(route.map(p => roomAt(p)?.id))
  for (const room of rooms) {
    assert.ok(visited.has(room.id), room.id)
    for (const label of room.objects) assert.ok(objects.some(o => o.name === label && o.room === room.id), label)
  }
  assert.equal(roomAt([-1, -1]), undefined)
})
