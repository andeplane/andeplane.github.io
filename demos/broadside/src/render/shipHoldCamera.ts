/** Elevated enough to see the bottom of a partly full chest over its front rim. */
export function shipHoldCamera(portrait: boolean, seconds: number, reduced = false) {
  const bob = reduced ? 0 : Math.sin(seconds * .75) * .025;
  return {
    position: { x: 0, y: 6.1 + bob, z: -3.8 },
    target: { x: 0, y: 1.45, z: 2 },
    fov: portrait ? 1.95 : 1.3,
  };
}
