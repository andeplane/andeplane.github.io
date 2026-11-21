interface ShorePoint { x: number; z: number }

export interface TidalGrotto {
  entry: ShorePoint;
  inner: ShorePoint;
  exit: ShorePoint;
  yaw: number;
  seed: number;
}

export function planGrotto(side: number, seed: number): TidalGrotto {
  const entry = { x: side * 13.5, z: -17.5 };
  const yaw = side * .97;
  const at = (distance: number) => ({
    x: entry.x + Math.sin(yaw) * distance,
    z: entry.z + Math.cos(yaw) * distance,
  });
  return { entry, inner: at(9), exit: at(16), yaw, seed };
}

function ellipse(x: number, z: number, cx: number, cz: number, rx: number, rz: number) {
  return 1 - Math.hypot((x - cx) / rx, (z - cz) / rz);
}

function union(a: number, b: number, radius: number) {
  const blend = Math.max(0, radius - Math.abs(a - b));
  return Math.max(a, b) + blend * blend / (4 * radius);
}

/** Signed land field in unit-island space, positive on land. The family determines
 * the large geographic features; independent noise fields weather the resulting shore. */
export function coastField(family: number, x: number, z: number): number {
  if (family === 1) {
    const headland = ellipse(x, z, -.09, -.02, .91, .98);
    const southernSpit = ellipse(x, z, .57, -.46, .59, .32);
    const northernSpit = ellipse(x, z, .47, .62, .52, .32);
    const land = union(union(headland, southernSpit, .2), northernSpit, .16);
    return Math.min(land, -ellipse(x, z, 1.04, .14, .75, .46) * .59);
  }
  if (family === 2) {
    // A lee harbour between uneven lobes, joined by a low saddle.
    return union(ellipse(x, z, -.4, .18, .60, .87), ellipse(x, z, .43, -.14, .62, .70), .3);
  }
  if (family === 3) {
    const spine = ellipse(x, z, -.08, -.12, .97, .70);
    return union(spine, ellipse(x + .45 * z, z, .25, .43, .44, .65), .22);
  }
  const west = ellipse(x, z, -.42, .08, .53, .98);
  const east = ellipse(x, z, .53, .09, .40, .71);
  return union(union(west, east, .12), ellipse(x, z, .05, -.33, .86, .59), .24);
}
