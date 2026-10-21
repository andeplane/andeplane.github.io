import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { WHEEL_ANGLES_DEG } from '../../src/features/kiwi/kinematics.ts'

for (const variant of ['front-camera', 'three-cameras', 'stereo']) {
const folder = new URL(`../../public/hardware/kiwi/cad/${variant}/`, import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', folder), 'utf8'))


test(`${variant}: published assembly and mixer use identical wheel geometry`, () => {
  assert.deepEqual(manifest.parameters.wheel_angles_deg, [...WHEEL_ANGLES_DEG])
  assert.equal(manifest.parameters.wheel_center_radius, 131.8)
  assert.equal(manifest.parameters.wheel_diameter, 60)
  assert.equal(manifest.checks.status, 'PASS')
  assert.equal(manifest.checks.issues.length, 0)
})

test(`${variant}: actual binary print meshes fit the 256 mm print volume with XY bed margins`, async () => {
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

test(`${variant}: GLB assembly contains every named CAD instance needed for selection and explosion`, async () => {
  const bytes = await readFile(new URL('assembly.glb', folder))
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
  const names = new Set(gltf.nodes.map((node: { name?: string }) => node.name))
  for (const part of manifest.parts) for (const name of part.meshNames) assert.ok(names.has(name), name)
})

test(`${variant}: all advertised CAD downloads are real artifacts`, async () => {
  for (const name of ['assembly.step', 'kiwi-print-pack.zip', 'source.zip', 'assembly-drawing.svg', 'assembly-guide.md', 'validation.json']) {
    const bytes = await readFile(new URL(name, folder))
    assert.ok(bytes.length > 100, name)
    if (name.endsWith('.zip')) assert.equal(bytes.toString('hex', 0, 4), '504b0304', name)
    if (name.endsWith('.step')) assert.match(bytes.toString('ascii', 0, 100), /ISO-10303-21/, name)
  }
  const source = await readFile(new URL('kiwi.py', folder))
  assert.equal(createHash('sha256').update(source).digest('hex'), manifest.sourceSha256)
  assert.deepEqual(source, await readFile(new URL('../../hardware/kiwi/cad/kiwi.py', import.meta.url)))
})


test(`${variant}: actual model contains its selected cameras and no distance hardware`, () => {
  assert.equal(manifest.variant, variant)
  assert.equal(manifest.activeDistanceSensors, 0)
  const ids = manifest.parts.map(p => p.id)
  assert.ok(!ids.some(id => /^(tof|cliff|i2c-mux|sensor-regulator)/i.test(id)))
  const cameras = ids.filter(id => /^camera-(front|left|right)-pcb$/.test(id))
  assert.equal(cameras.length, variant === 'three-cameras' ? 3 : 1)
  const lenses = ids.filter(id => /^camera-(front|left|right)-lens-/.test(id))
  assert.equal(lenses.length, variant === 'three-cameras' ? 3 : variant === 'stereo' ? 2 : 1)
  assert.equal(ids.includes('camera-usb-hub'), variant === 'three-cameras')
  assert.equal(ids.includes('camera-power-buck'), variant === 'three-cameras')
})

test(`${variant}: cameras are inset below the lid and three-camera axes face diagonally forward`, () => {
  assert.deepEqual(manifest.cameraPlacement.map(p => p.yawDegFromFront).sort((a, b) => a - b), variant === 'three-cameras' ? [-45, 0, 45] : [0])
  for (const camera of manifest.cameraPlacement) {
    assert.equal(camera.boardInternal, true)
    assert.ok(camera.port.glassSetbackMm >= 1)
    assert.ok(camera.port.planningRadialMarginMm > 0)
    const pcb = manifest.parts.find(p => p.id === `camera-${camera.label}-pcb`)
    assert.ok(pcb.boundingBoxMm.max[2] < manifest.parameters.shell_top)
    assert.ok(pcb.boundingBoxMm.min[2] > manifest.parameters.shell_bottom)
    assert.equal(camera.centerZMm, 117)
    const [x, y, z] = camera.boardCenterCadMm
    assert.deepEqual(camera.boardCenterGlbM, [x / 1000, z / 1000, -y / 1000].map(n => Math.round(n * 1e6) / 1e6))
  }
  for (const key of ['cameraEnvelopeChecks', 'cameraPlugChecks', 'opticalPortChecks', 'cameraFastenerChecks']) {
    assert.ok(manifest.checks[key].length, key)
    assert.ok(manifest.checks[key].every(check => check.passed), key)
  }
})
}
