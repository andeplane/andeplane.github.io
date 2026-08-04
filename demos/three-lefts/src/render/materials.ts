import * as THREE from 'three'

/**
 * A deliberately tiny, shared material set.
 *
 * Two reasons it is shared rather than per-cell:
 *  - the recursive portal pass mutates stencil state per draw, and mutating
 *    four materials is cheap where mutating hundreds would not be;
 *  - three.js compiles a shader variant per material configuration, and a
 *    compile mid-traversal is a visible hitch exactly when the player walks
 *    through a door — the worst possible moment (SPEC §6.2).
 *
 * All surface colour comes from baked vertex colours instead (SPEC §6.3).
 */
export const materials = {
  plaster: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
  }),
  // Floors are large and are almost always seen at a grazing angle, where
  // Fresnel drives reflectance towards 1 and a smooth surface turns into a
  // mirror of the environment map — a dark oak floor renders as a sheet of
  // white. Waxed-but-worn roughness keeps the sheen without the blowout.
  wood: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.0,
  }),
  stone: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0,
  }),
  /** Self-lit surfaces. Vertex colours exceed 1.0 so they bloom. */
  glow: new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  }),
}

export const sceneMaterials: THREE.Material[] = [
  materials.plaster,
  materials.wood,
  materials.stone,
  materials.glow,
]

/** Chalk marks; one clone per mark, since each carries its own tally texture. */
export const chalkMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  color: 0xd8d4c6,
})

/**
 * Materials created at run time (chalk). They must receive the same stencil
 * state as everything else, or a mark would draw outside the portal region it
 * belongs to and bleed into whatever room is on screen.
 */
const extraMaterials: THREE.Material[] = []

export function registerMaterial(m: THREE.Material) {
  extraMaterials.push(m)
}

export function clearExtraMaterials() {
  for (const m of extraMaterials) m.dispose()
  extraMaterials.length = 0
}

/** Applies one stencil configuration across every scene material. */
export function setSceneStencil(ref: number) {
  for (const m of sceneMaterials) applyStencil(m, ref)
  for (const m of extraMaterials) applyStencil(m, ref)
}

function applyStencil(m: THREE.Material, ref: number) {
  m.stencilWrite = true
  m.stencilFunc = THREE.EqualStencilFunc
  m.stencilRef = ref
  m.stencilFuncMask = 0xff
  m.stencilWriteMask = 0xff
  m.stencilFail = THREE.KeepStencilOp
  m.stencilZFail = THREE.KeepStencilOp
  m.stencilZPass = THREE.KeepStencilOp
}

/** Marks a portal's pixels: stencil += 1 where it is actually visible. */
export const portalMarkMaterial = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  depthTest: true,
  stencilWrite: true,
  stencilFunc: THREE.EqualStencilFunc,
  stencilRef: 0,
  stencilZPass: THREE.IncrementStencilOp,
})

/** Undoes the mark once we come back from recursion. */
export const portalUnmarkMaterial = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  depthTest: false,
  stencilWrite: true,
  stencilFunc: THREE.EqualStencilFunc,
  stencilRef: 0,
  stencilZPass: THREE.DecrementStencilOp,
})

/**
 * Stamps the portal's own depth back over the region after recursion, so the
 * destination room's depth values do not leak into this cell's sorting.
 */
export const portalDepthMaterial = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: true,
  depthTest: true,
  depthFunc: THREE.AlwaysDepth,
  stencilWrite: true,
  stencilFunc: THREE.EqualStencilFunc,
  stencilRef: 0,
  stencilZPass: THREE.KeepStencilOp,
})

/**
 * Resets depth to the far plane inside a freshly marked portal region, so the
 * destination cell draws unobstructed. A raw shader, so three.js injects no
 * clipping-plane chunks — this quad must never be clipped.
 */
export const depthResetMaterial = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: /* glsl */ `
    in vec3 position;
    void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    out vec4 fragColor;
    void main() { fragColor = vec4(0.0); }
  `,
  colorWrite: false,
  depthWrite: true,
  depthTest: true,
  depthFunc: THREE.AlwaysDepth,
  stencilWrite: true,
  stencilFunc: THREE.EqualStencilFunc,
  stencilRef: 0,
  stencilZPass: THREE.KeepStencilOp,
})

/**
 * Fills a portal we chose not to recurse into (depth cap, or too small to be
 * worth it) so it reads as an unlit doorway rather than a hole in the world.
 */
export const portalFallbackMaterial = new THREE.MeshBasicMaterial({
  color: 0x07070a,
  depthWrite: true,
  stencilWrite: true,
  stencilFunc: THREE.EqualStencilFunc,
  stencilRef: 0,
  stencilZPass: THREE.KeepStencilOp,
  toneMapped: false,
})
