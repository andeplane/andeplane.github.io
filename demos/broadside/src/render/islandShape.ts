/** The render coast is shared by terrain, submerged shelf and surf. Collision/save radii stay unchanged. */
export type IslandCoast = { pos: { x: number; z: number }; radius: number };

export function coastPhase(island: IslandCoast): number {
  return ((island.pos.x * 0.173 + island.pos.z * 0.319 + island.radius * 0.711) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
}

const HARMONICS = [[.12, 3, 1], [.07, 7, 1.7], [.025, 11, -.6]] as const;

export function coastRadius(angle: number, phase: number): number {
  return 1 + HARMONICS.reduce((sum, [amplitude, frequency, offset]) =>
    sum + amplitude * Math.sin(frequency * angle + phase * offset), 0);
}

export function coastDistance(island: IslandCoast, x: number, z: number): number {
  const dx = x - island.pos.x, dz = z - island.pos.z;
  return Math.hypot(dx, dz) - island.radius * coastRadius(Math.atan2(dx, dz), coastPhase(island));
}

/** Generated from the same amplitudes/conventions as coastRadius; passed phase is never recomputed on the GPU. */
export const COAST_GLSL = `
float coastRadius(float angle, float phase) {
  return 1.0 ${HARMONICS.map(([amplitude, frequency, offset]) =>
    `+ ${amplitude.toFixed(3)} * sin(${frequency.toFixed(1)} * angle + phase * ${offset.toFixed(3)})`).join(' ')};
}
float coastDistance(vec2 p, vec4 island) {
  vec2 d = p - island.xy;
  float radial = length(d);
  // Far water needs no contour trigonometry; this conservative bound stays outside every shelf.
  if (radial > island.z * 1.215 + 25.0) return radial - island.z * 1.215;
  return radial - island.z * coastRadius(atan(d.x, d.y), island.w);
}`;
