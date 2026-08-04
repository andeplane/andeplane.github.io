import * as THREE from 'three'

/**
 * A prefiltered environment for indirect light.
 *
 * three's stock RoomEnvironment is a bright neutral photographic studio, and
 * it shows: every floor in the game is large and seen at a grazing angle,
 * where Fresnel drives reflectance towards 1, and a dark oak board turns into
 * a sheet of white studio. So the environment is built here instead — a dim
 * warm interior with a cool window on one side, which is what this house is
 * actually standing in.
 *
 * This is the only indirect-light source in the game (SPEC §6.3): screen-space
 * techniques are banned because they leak across portal boundaries, so the
 * softness has to come from somewhere real.
 */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene()

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(12, 8, 12),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }),
  )
  paintShell(shell.geometry)
  scene.add(shell)

  const panel = (
    color: [number, number, number],
    w: number,
    h: number,
    pos: [number, number, number],
    lookAt: [number, number, number],
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color[0], color[1], color[2]) }),
    )
    m.position.set(pos[0], pos[1], pos[2])
    m.lookAt(lookAt[0], lookAt[1], lookAt[2])
    scene.add(m)
  }

  // Warm practicals, high and soft.
  panel([1.5, 1.05, 0.62], 5, 1.6, [0, 3.4, -5.5], [0, 0, 0])
  panel([1.2, 0.84, 0.5], 5, 1.6, [5.5, 3.0, 0], [0, 0, 0])
  // One cool window, so surfaces have a direction to be lit *from*.
  panel([0.62, 0.82, 1.15], 3.2, 3.4, [-5.6, 1.8, 1.5], [0, 1.2, 0])

  const pmrem = new THREE.PMREMGenerator(renderer)
  const texture = pmrem.fromScene(scene, 0.04).texture
  pmrem.dispose()
  shell.geometry.dispose()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.material) (mesh.material as THREE.Material).dispose()
  })
  return texture
}

/** Dim warm above, darker below, so the gradient reads as an interior. */
function paintShell(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 4 // −1 .. 1
    const t = (y + 1) / 2
    // Ceiling warm and lifted, floor almost black.
    colors[i * 3 + 0] = 0.035 + 0.2 * t * t
    colors[i * 3 + 1] = 0.031 + 0.17 * t * t
    colors[i * 3 + 2] = 0.028 + 0.13 * t * t
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}
