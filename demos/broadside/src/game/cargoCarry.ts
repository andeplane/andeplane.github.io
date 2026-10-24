interface Position { x: number; y: number; z: number; }
/** Route through the cave's connected aisles rather than through the chamber walls. */
export function cargoCarry(elapsed: number, from: Position, to: Position, world: number, reduced = false): Position {
  const smooth = (n: number) => { n = Math.max(0, Math.min(1, n)); return n * n * (3 - 2 * n); };
  const lift = reduced ? 1 : smooth(elapsed / 1.2);
  const travel = reduced ? 1 : smooth((elapsed - 1.2) / 5.6);
  if (travel >= 1) return { ...to };
  const points: Position[] = [from, { x: 0, y: to.y, z: 0 }];
  if (world >= 2) points.push({ x: 0, y: to.y, z: 30 });
  if (world === 2) points.push({ x: 0, y: to.y, z: 43 });
  if (world === 3) points.push({ x: 0, y: to.y, z: 34.5 }, { x: 28, y: to.y, z: 34.5 });
  points.push(to);
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.z - points[i]!.z));
  let remaining = lengths.reduce((a, b) => a + b, 0) * travel;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!, a = points[i]!, b = points[i + 1]!;
    if (remaining <= length || i === lengths.length - 1) {
      const fraction = length ? Math.min(1, remaining / length) : 1;
      return { x: a.x + (b.x - a.x) * fraction, y: from.y + (to.y - from.y) * lift, z: a.z + (b.z - a.z) * fraction };
    }
    remaining -= length;
  }
  return to;
}
