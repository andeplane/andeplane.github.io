/** Elevated enough to see the bottom of a partly full chest over its front rim. */
export function shipHoldCamera(portrait: boolean, seconds: number, reduced = false, fullChest = false) {
  const bob = reduced ? 0 : Math.sin(seconds * .75) * .025;
  return {
    position: { x: 0, y: (fullChest ? 4.05 : 5.85) + bob, z: fullChest ? -5.4 : -5 },
    target: { x: 0, y: 1.9, z: fullChest ? .45 : 1.2 },
    fov: portrait ? (fullChest ? 1.5 : 1.66) : 1.2,
  };
}
