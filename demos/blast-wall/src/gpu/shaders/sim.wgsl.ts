/**
 * The solver, on the GPU. A line-for-line port of `src/physics/solver.ts`.
 *
 * Four kernels:
 *
 *   elementForces   per element  → writes 8 nodal forces into its own slot
 *   jointForces     per pair     → writes one force into its own slot
 *   integrate       per node     → gathers its slots, adds blast, gravity, ground, steps
 *   advanceClock    one thread   → t += dt
 *
 * Nothing is scattered and nothing is atomic. Each kernel writes only where it alone
 * writes, and the node kernel walks a precomputed adjacency list to collect what belongs
 * to it — which also makes the whole thing bit-for-bit reproducible run to run. WGSL has
 * no f32 atomics anyway, and the compare-and-swap workaround is slower and would give up
 * that determinism for nothing.
 *
 * Everything lives in three arenas (see `layout.ts`), because WebGPU promises only eight
 * storage buffers per stage and this solver has twenty-odd arrays.
 */

export const PARAMS_STRUCT = /* wgsl */ `
struct Params {
  dt: f32, gravity: f32, damping: f32, dif: f32,
  kn: f32, ks: f32, ft: f32, gf: f32,
  cohesion: f32, tanPhi: f32, fc: f32, jointThickness: f32,
  groundOmega: f32, groundFriction: f32, dx: f32, dy: f32,
  dz: f32, loadScale: f32, spare18: f32, spare19: f32,
  nodeCount: u32, elementCount: u32, pairCount: u32, unitCount: u32,
  oElements: u32, oPairs: u32, oPairAxis: u32, oElemStart: u32,
  oElemData: u32, oPairStart: u32, oPairData: u32, oUnitRange: u32,
  oNodeUnit: u32, oX0: u32, oInvMass: u32, oPairArea: u32,
  oLoadDir: u32, oLoadPulse: u32, oK: u32, oUnitScale: u32,
  oX: u32, oVel: u32, oQuat: u32, oElemForce: u32,
  oPairForce: u32, oPairDamage: u32, oPairState: u32, oNodeScalar: u32,
  oClock: u32, oCentroid: u32, oTrace: u32, probeNode: u32,
  traceStride: u32, traceLen: u32,
};
`;

export const simShader = /* wgsl */ `
${PARAMS_STRUCT}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> U: array<u32>;
@group(0) @binding(2) var<storage, read> RO: array<f32>;
@group(0) @binding(3) var<storage, read_write> RW: array<f32>;

fn rw3(base: u32, i: u32) -> vec3<f32> {
  let b = base + i * 3u;
  return vec3<f32>(RW[b], RW[b + 1u], RW[b + 2u]);
}
fn ro3(base: u32, i: u32) -> vec3<f32> {
  let b = base + i * 3u;
  return vec3<f32>(RO[b], RO[b + 1u], RO[b + 2u]);
}
fn setRw3(base: u32, i: u32, v: vec3<f32>) {
  let b = base + i * 3u;
  RW[b] = v.x; RW[b + 1u] = v.y; RW[b + 2u] = v.z;
}

/** Natural coordinates of local node l, from its (a,b,c) sign bits. */
fn corner(l: u32) -> vec3<f32> {
  return vec3<f32>(
    f32((l >> 2u) & 1u) * 2.0 - 1.0,
    f32((l >> 1u) & 1u) * 2.0 - 1.0,
    f32(l & 1u) * 2.0 - 1.0,
  );
}

/** Rotation matrix of a quaternion (x, y, z, w), as its three columns. */
fn quatCols(q: vec4<f32>) -> mat3x3<f32> {
  let x2 = q.x + q.x; let y2 = q.y + q.y; let z2 = q.z + q.z;
  let xx = q.x * x2; let xy = q.x * y2; let xz = q.x * z2;
  let yy = q.y * y2; let yz = q.y * z2; let zz = q.z * z2;
  let wx = q.w * x2; let wy = q.w * y2; let wz = q.w * z2;
  return mat3x3<f32>(
    vec3<f32>(1.0 - (yy + zz), xy + wz, xz - wy),
    vec3<f32>(xy - wz, 1.0 - (xx + zz), yz + wx),
    vec3<f32>(xz + wy, yz - wx, 1.0 - (xx + yy)),
  );
}

fn quatMul(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  );
}

/**
 * Müller's iterative polar decomposition, warm-started from the previous step so one or
 * two iterations do it. Without pulling the rotation out, a brick tumbling in flight
 * would develop enormous fictitious strains and tear itself apart.
 */
fn extractRotation(F: mat3x3<f32>, q0: vec4<f32>) -> vec4<f32> {
  var q = q0;
  for (var it = 0u; it < 8u; it = it + 1u) {
    let R = quatCols(q);
    var omega = vec3<f32>(0.0);
    var den = 1e-9;
    for (var c = 0u; c < 3u; c = c + 1u) {
      omega = omega + cross(R[c], F[c]);
      den = den + dot(R[c], F[c]);
    }
    omega = omega / abs(den);
    let w = length(omega);
    if (w < 1e-9) { break; }
    let half = w * 0.5;
    q = normalize(quatMul(vec4<f32>(omega * (sin(half) / w), cos(half)), q));
  }
  return q;
}

@compute @workgroup_size(64)
fn elementForces(@builtin(global_invocation_id) gid: vec3<u32>) {
  let e = gid.x;
  if (e >= P.elementCount) { return; }

  let inv = vec3<f32>(1.0 / (4.0 * P.dx), 1.0 / (4.0 * P.dy), 1.0 / (4.0 * P.dz));

  var p: array<vec3<f32>, 8>;
  var Xr: array<vec3<f32>, 8>;
  var c = vec3<f32>(0.0);
  var C = vec3<f32>(0.0);
  for (var l = 0u; l < 8u; l = l + 1u) {
    let n = U[P.oElements + e * 8u + l];
    p[l] = rw3(P.oX, n);
    Xr[l] = ro3(P.oX0, n);
    c = c + p[l];
    C = C + Xr[l];
  }
  c = c / 8.0;
  C = C / 8.0;

  var col0 = vec3<f32>(0.0);
  var col1 = vec3<f32>(0.0);
  var col2 = vec3<f32>(0.0);
  for (var l = 0u; l < 8u; l = l + 1u) {
    p[l] = p[l] - c;
    let g = corner(l) * inv;
    col0 = col0 + p[l] * g.x;
    col1 = col1 + p[l] * g.y;
    col2 = col2 + p[l] * g.z;
  }

  let qb = P.oQuat + e * 4u;
  let q = extractRotation(
    mat3x3<f32>(col0, col1, col2),
    vec4<f32>(RW[qb], RW[qb + 1u], RW[qb + 2u], RW[qb + 3u]),
  );
  RW[qb] = q.x; RW[qb + 1u] = q.y; RW[qb + 2u] = q.z; RW[qb + 3u] = q.w;
  let R = quatCols(q);

  // Displacement measured in the element's own rotated frame: uᵣ = Rᵀ p − P.
  var u: array<f32, 24>;
  for (var l = 0u; l < 8u; l = l + 1u) {
    let rel = vec3<f32>(dot(R[0], p[l]), dot(R[1], p[l]), dot(R[2], p[l])) - (Xr[l] - C);
    u[l * 3u] = rel.x;
    u[l * 3u + 1u] = rel.y;
    u[l * 3u + 2u] = rel.z;
  }

  for (var l = 0u; l < 8u; l = l + 1u) {
    var fl = vec3<f32>(0.0);
    for (var j = 0u; j < 24u; j = j + 1u) {
      let uj = u[j];
      fl.x = fl.x + RO[P.oK + (l * 3u) * 24u + j] * uj;
      fl.y = fl.y + RO[P.oK + (l * 3u + 1u) * 24u + j] * uj;
      fl.z = fl.z + RO[P.oK + (l * 3u + 2u) * 24u + j] * uj;
    }
    // f = −R K uᵣ, back in the world frame.
    setRw3(P.oElemForce + e * 24u, l, -(R[0] * fl.x + R[1] * fl.y + R[2] * fl.z));
  }
}

fn dynamicIncrease(rate: f32) -> f32 {
  if (P.dif <= 0.0) { return 1.0; }
  return min(4.0, 1.0 + 0.45 * (log(max(rate, 1e-4) / 1e-4) / log(10.0)) * P.dif);
}

@compute @workgroup_size(64)
fn jointForces(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pi = gid.x;
  if (pi >= P.pairCount) { return; }

  let a = U[P.oPairs + pi * 2u];
  let b = U[P.oPairs + pi * 2u + 1u];
  let axis = U[P.oPairAxis + pi];
  let area = RO[P.oPairArea + pi];
  let st = P.oPairState + pi * 5u;

  var n = vec3<f32>(0.0);
  n[axis] = 1.0;

  let d = rw3(P.oX, b) - rw3(P.oX, a);
  let crush = RW[st + 4u];
  // Measured from the crushed state, so a joint already squashed does not spring back.
  let dn = dot(d, n) - crush;
  let vn = dot(rw3(P.oVel, b) - rw3(P.oVel, a), n);

  // Rate hardening gauged over the real mortar thickness, not the zero-thickness ideal.
  let scale = dynamicIncrease(abs(vn) / max(P.jointThickness, 1e-4));
  let ft = P.ft * scale;
  let coh = P.cohesion * scale;

  let kappa = max(RW[st], dn);
  RW[st] = kappa;

  // Bilinear cohesive law: linear up to ft at δ₀, then straight down to zero at
  // δf = 2Gf/ft, so the area under the curve is exactly the fracture energy. Damage is
  // the loss of secant stiffness, which is what makes unloading run back to the origin.
  let delta0 = P.ft / P.kn;
  let deltaF = max(2.0 * P.gf / max(ft, 1.0), 1.01 * delta0);
  let k = max(kappa, delta0);
  var envelope = P.kn * k;
  if (k > delta0) { envelope = max(0.0, ft * (deltaF - k) / (deltaF - delta0)); }
  let kSecant = envelope / k;
  let dmg = clamp(1.0 - kSecant / P.kn, 0.0, 1.0);

  // Damaged in tension, undamaged in compression — a cracked joint still has to bear, or
  // the wall falls through itself — but capped at fc, where the mortar crushes for good.
  var sigma: f32;
  if (dn > 0.0) {
    sigma = kSecant * dn;
  } else {
    sigma = P.kn * dn;
    if (sigma < -P.fc) {
      RW[st + 4u] = crush + dn + P.fc / P.kn;
      sigma = -P.fc;
    }
  }

  // Coulomb friction, with the cohesion carried off by the same damage.
  let slip = vec3<f32>(RW[st + 1u], RW[st + 2u], RW[st + 3u]);
  let s = (d - n * dot(d, n)) - slip;
  var t = P.ks * s;
  let tMag = length(t);
  let tMax = coh * (1.0 - dmg) + max(0.0, -sigma) * P.tanPhi;
  if (tMag > tMax && tMag > 0.0) {
    let extra = s * (1.0 - tMax / tMag);
    RW[st + 1u] = slip.x + extra.x;
    RW[st + 2u] = slip.y + extra.y;
    RW[st + 3u] = slip.z + extra.z;
    t = t * (tMax / tMag);
  }

  setRw3(P.oPairForce, pi, (t + n * sigma) * area);
  RW[P.oPairDamage + pi] = dmg;
}

fn friedlander(tau: f32, b: f32) -> f32 {
  if (tau < 0.0 || tau > 6.0) { return 0.0; }
  return (1.0 - tau) * exp(-b * tau);
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nodeCount) { return; }

  let inv = RO[P.oInvMass + i];
  if (inv == 0.0) {
    setRw3(P.oVel, i, vec3<f32>(0.0));
    RW[P.oNodeScalar + i * 2u] = 0.0;
    RW[P.oNodeScalar + i * 2u + 1u] = 0.0;
    return;
  }

  var f = vec3<f32>(0.0);

  // Gather: every element and every joint this node takes part in.
  for (var e = U[P.oElemStart + i]; e < U[P.oElemStart + i + 1u]; e = e + 1u) {
    let slot = U[P.oElemData + e];
    f = f + rw3(P.oElemForce + (slot >> 3u) * 24u, slot & 7u);
  }

  var dmg = 0.0;
  for (var p = U[P.oPairStart + i]; p < U[P.oPairStart + i + 1u]; p = p + 1u) {
    let slot = U[P.oPairData + p];
    let pi = slot >> 1u;
    let pf = rw3(P.oPairForce, pi);
    // Side 0 is the − side of the joint and takes the force as written; side 1 takes it
    // back, which is what makes a joint an internal force rather than a source.
    if ((slot & 1u) == 0u) { f = f + pf; } else { f = f - pf; }
    dmg = max(dmg, RW[P.oPairDamage + pi]);
  }

  // loadScale is zero while the wall settles under its own weight, so the blast cannot
  // go off during the relaxation run.
  if (P.loadScale != 0.0) {
    let lp = P.oLoadPulse + i * 3u;
    let shape = friedlander((RW[P.oClock] - RO[lp]) / max(RO[lp + 1u], 1e-9), RO[lp + 2u]);
    if (shape != 0.0) {
      f = f + ro3(P.oLoadDir, i) * shape * P.loadScale;
    }
  }

  let mass = 1.0 / inv;
  var v = rw3(P.oVel, i);
  var pos = rw3(P.oX, i);

  f.y = f.y - mass * P.gravity;
  f = f - P.damping * mass * v;

  if (pos.y < 0.0) {
    // Damped on the way in, so debris lands instead of trampolining off the floor.
    let nrm = mass * P.groundOmega * (P.groundOmega * (-pos.y) - min(v.y, 0.0) * 1.4);
    f.y = f.y + nrm;
    let vt = length(vec2<f32>(v.x, v.z));
    if (vt > 1e-6) {
      let fric = min(P.groundFriction * nrm, mass * vt / max(P.dt, 1e-9));
      f.x = f.x - v.x / vt * fric;
      f.z = f.z - v.z / vt * fric;
    }
  }

  v = v + f * inv * P.dt;
  pos = pos + v * P.dt;

  setRw3(P.oVel, i, v);
  setRw3(P.oX, i, pos);
  RW[P.oNodeScalar + i * 2u] = dmg;
  RW[P.oNodeScalar + i * 2u + 1u] = length(v);
}

/**
 * Advance the clock, and record the probe's displacement while we are here.
 *
 * The trace is written by the solver rather than sampled by the renderer, so the curve
 * is spaced evenly in SIMULATION time. Sampling it per frame instead would stretch and
 * squash the axis every time the playback speed changed, or the frame rate dipped.
 */
@compute @workgroup_size(1)
fn advanceClock() {
  let t = RW[P.oClock] + P.dt;
  RW[P.oClock] = t;
  let step = RW[P.oClock + 1u] + 1.0;
  RW[P.oClock + 1u] = step;

  if (u32(step) % P.traceStride != 0u) { return; }
  let s = u32(RW[P.oClock + 2u]);
  if (s >= P.traceLen) { return; }
  let d = rw3(P.oX, P.probeNode) - ro3(P.oX0, P.probeNode);
  // Out of plane is +z: the façade faces −z and the blast pushes it inward.
  RW[P.oTrace + s * 2u] = t;
  RW[P.oTrace + s * 2u + 1u] = d.z;
  RW[P.oClock + 2u] = f32(s + 1u);
}

/**
 * Per-unit centroids, so the renderer can shrink each expanded unit back to the real
 * brick and leave the fuge visible. Once per frame, not once per step.
 */
@compute @workgroup_size(64)
fn unitCentroids(@builtin(global_invocation_id) gid: vec3<u32>) {
  let u = gid.x;
  if (u >= P.unitCount) { return; }
  let s = U[P.oUnitRange + u * 2u];
  let e = U[P.oUnitRange + u * 2u + 1u];
  var c = vec3<f32>(0.0);
  for (var i = s; i < e; i = i + 1u) {
    c = c + rw3(P.oX, i);
  }
  setRw3(P.oCentroid, u, c / f32(max(e - s, 1u)));
}
`;
