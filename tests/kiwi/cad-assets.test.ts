import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { WHEEL_ANGLES_DEG } from '../../src/features/kiwi/kinematics.ts'

const folder = new URL('../../public/hardware/kiwi/cad/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', folder), 'utf8'))

test('published assembly and mixer use identical wheel geometry', () => {
  assert.deepEqual(manifest.parameters.wheel_angles_deg, [...WHEEL_ANGLES_DEG])
  assert.equal(manifest.parameters.wheel_center_radius, 131.8)
  assert.equal(manifest.parameters.wheel_diameter, 60)
  assert.equal(manifest.checks.status, 'PASS')
  assert.equal(manifest.checks.issues.length, 0)
})

test('actual binary print meshes fit the 256 mm print volume with XY bed margins', async () => {
  const stls = (await readdir(new URL('stl/', folder))).filter(name => name.endsWith('.stl'))
  assert.ok(stls.length >= 20)
  for (const name of stls) {
    const bytes = await readFile(new URL(`stl/${name}`, folder))
    const triangles = bytes.readUInt32LE(80)
    assert.equal(bytes.length, 84 + triangles * 50, `${name} has a complete binary STL payload`)
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let t = 0; t < triangles; t++) for (let v = 0; v < 3; v++) for (let axis = 0; axis < 3; axis++) {
      const value = bytes.readFloatLE(84 + t * 50 + 12 + v * 12 + axis * 4)
      assert.ok(Number.isFinite(value), `${name} coordinate`)
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value)
    }
    assert.ok(max[0] - min[0] <= 252.1 && max[1] - min[1] <= 252.1, `${name} XY bed dimensions`)
    assert.ok(max[2] - min[2] <= 256, `${name} Z height`)
    assert.ok(min[2] >= -.01, `${name} lies on or above the build plate`)
  }
})

test('GLB assembly contains every named CAD instance needed for selection and explosion', async () => {
  const bytes = await readFile(new URL('assembly.glb', folder))
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
  const names = new Set(gltf.nodes.map((node: { name?: string }) => node.name))
  for (const part of manifest.parts) for (const name of part.meshNames) assert.ok(names.has(name), name)
})

test('all advertised CAD downloads are real artifacts', async () => {
  for (const name of ['assembly.step', 'kiwi-print-pack.zip', 'source.zip', 'assembly-drawing.svg', 'assembly-guide.md', 'validation.json']) {
    const bytes = await readFile(new URL(name, folder))
    assert.ok(bytes.length > 100, name)
    if (name.endsWith('.zip')) assert.equal(bytes.toString('hex', 0, 4), '504b0304', name)
    if (name.endsWith('.step')) assert.match(bytes.toString('ascii', 0, 100), /ISO-10303-21/, name)
  }
})
