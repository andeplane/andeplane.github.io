/** Keep the orbit inside the chamber when dragging upward or pulling back. */
export function caveCameraPosition(
  target: { x: number; y: number; z: number },
  distance: number,
  orbit: number,
  elevation: number,
): { x: number; y: number; z: number } {
  const ceiling = 7.5;
  const maxElevation = Math.asin(
    Math.min(1, Math.max(0, (ceiling - target.y) / distance)),
  );
  const angle = Math.max(0, Math.min(elevation, maxElevation));
  return {
    x: Math.max(
      -10,
      Math.min(10, target.x + Math.cos(orbit) * distance * Math.cos(angle)),
    ),
    y: Math.min(ceiling, target.y + Math.sin(angle) * distance),
    z: target.z + Math.sin(orbit) * distance * Math.cos(angle),
  };
}
