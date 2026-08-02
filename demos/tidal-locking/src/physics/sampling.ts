import { makeRng } from './rng.ts';

/**
 * Blue-noise-ish point cloud filling a ball of the given radius.
 *
 * A cubic lattice would give the moon preferred crystal directions, and the tidal
 * bulge would visibly snap to them. Uniform random points clump instead. So: start
 * random, then run a few rounds of short-range repulsion (a cheap stand-in for
 * Lloyd relaxation / Poisson-disk sampling) and re-project strays back inside the
 * ball. The result deforms like rock rather than like graph paper.
 */
export function sampleBall(count: number, radius: number, seed: number): Float64Array {
  const rng = makeRng(seed);
  const p = new Float64Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Rejection sampling: uniform in the cube, keep what lands in the ball.
    let x = 0;
    let y = 0;
    let z = 0;
    do {
      x = rng() * 2 - 1;
      y = rng() * 2 - 1;
      z = rng() * 2 - 1;
    } while (x * x + y * y + z * z > 1);
    p[i * 3] = x * radius;
    p[i * 3 + 1] = y * radius;
    p[i * 3 + 2] = z * radius;
  }

  // Mean spacing of `count` points packed into the ball.
  const spacing = radius * Math.cbrt((4 * Math.PI) / (3 * count));
  const minDist = spacing * 0.9;
  relax(p, count, radius, minDist, 60);
  isotropise(p, count);
  return p;
}

/**
 * Squash the cloud, very slightly, until its second-moment tensor is exactly isotropic.
 *
 * This matters far more than it looks. A few hundred randomly placed points have an
 * intrinsic quadrupole asymmetry of order 1/sqrt(N) -- around 7% at N=200 -- which is
 * several times *larger* than the 1% tidal bulge we are trying to demonstrate. Left
 * alone, the moon locks because gravity grabs a permanent lump, the way a lopsided
 * asteroid does, and the lock time barely responds to the material constants. Removing
 * the l=2 term of the rest shape leaves the tidal bulge as the only handle gravity has,
 * which is the phenomenon this whole simulation exists to show.
 */
function isotropise(p: Float64Array, count: number): void {
  const s = new Float64Array(9);
  for (let i = 0; i < count; i++) {
    const x = p[i * 3];
    const y = p[i * 3 + 1];
    const z = p[i * 3 + 2];
    s[0] += x * x;
    s[1] += x * y;
    s[2] += x * z;
    s[4] += y * y;
    s[5] += y * z;
    s[8] += z * z;
  }
  s[3] = s[1];
  s[6] = s[2];
  s[7] = s[5];

  // Normalise to unit trace/3 so the matrix sits near the identity, then Newton-Schulz
  // its inverse square root: Z -> S^-1/2 converges quadratically from Z = I.
  const scale = 3 / (s[0] + s[4] + s[8]);
  const y = new Float64Array(9);
  for (let i = 0; i < 9; i++) y[i] = s[i] * scale;
  let z = identity3();

  for (let iter = 0; iter < 12; iter++) {
    const t = mul3(z, y);
    // T <- (3I - Z Y) / 2
    for (let i = 0; i < 9; i++) t[i] = -0.5 * t[i];
    t[0] += 1.5;
    t[4] += 1.5;
    t[8] += 1.5;
    const yNext = mul3(y, t);
    const zNext = mul3(t, z);
    y.set(yNext);
    z = zNext;
  }

  for (let i = 0; i < count; i++) {
    const x = p[i * 3];
    const yy = p[i * 3 + 1];
    const zz = p[i * 3 + 2];
    p[i * 3] = z[0] * x + z[1] * yy + z[2] * zz;
    p[i * 3 + 1] = z[3] * x + z[4] * yy + z[5] * zz;
    p[i * 3 + 2] = z[6] * x + z[7] * yy + z[8] * zz;
  }
}

function identity3(): Float64Array {
  const m = new Float64Array(9);
  m[0] = m[4] = m[8] = 1;
  return m;
}

function mul3(a: Float64Array, b: Float64Array): Float64Array {
  const m = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      m[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return m;
}

function relax(
  p: Float64Array,
  count: number,
  radius: number,
  minDist: number,
  iterations: number,
): void {
  const push = new Float64Array(count * 3);
  const minDist2 = minDist * minDist;

  for (let iter = 0; iter < iterations; iter++) {
    push.fill(0);

    for (let i = 0; i < count; i++) {
      const ix = p[i * 3];
      const iy = p[i * 3 + 1];
      const iz = p[i * 3 + 2];
      for (let j = i + 1; j < count; j++) {
        const dx = p[j * 3] - ix;
        const dy = p[j * 3 + 1] - iy;
        const dz = p[j * 3 + 2] - iz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minDist2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        // Linear falloff: full strength at coincident, zero at minDist.
        const w = ((minDist - d) / d) * 0.35;
        push[i * 3] -= dx * w;
        push[i * 3 + 1] -= dy * w;
        push[i * 3 + 2] -= dz * w;
        push[j * 3] += dx * w;
        push[j * 3 + 1] += dy * w;
        push[j * 3 + 2] += dz * w;
      }
    }

    for (let i = 0; i < count; i++) {
      let x = p[i * 3] + push[i * 3];
      let y = p[i * 3 + 1] + push[i * 3 + 1];
      let z = p[i * 3 + 2] + push[i * 3 + 2];
      const r = Math.hypot(x, y, z);
      if (r > radius) {
        const s = radius / r;
        x *= s;
        y *= s;
        z *= s;
      }
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
  }
}
