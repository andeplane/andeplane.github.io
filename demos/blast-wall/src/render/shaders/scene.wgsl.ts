/**
 * Everything that gets drawn, in one module: the wall, the ground, the shock front and
 * the charge marker.
 *
 * The wall is drawn straight out of the solver's own buffers — the vertex shader reads
 * deformed node positions from the same arena the integrator writes, so nothing about
 * the geometry ever crosses back to the CPU. Two instances of the same triangles do the
 * masonry: instance 0 draws the expanded unit in mortar grey, instance 1 draws the same
 * unit shrunk back to the real 228 × 62 mm brick. The brick sits 6 mm inside the mortar
 * on every face, so what shows through the gap is the fuge, and the depth buffer sorts
 * it out for free.
 *
 * Normals come from screen-space derivatives of the world position. Bricks are faceted
 * and want faceted shading, so the cheapest normal is also the right one.
 */

export const sceneShader = /* wgsl */ `
struct Scene {
  viewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  light: vec4<f32>,     // direction.xyz, ambient strength
  opts: vec4<f32>,      // colour mode, time, shock radius, 1/reference speed
  offA: vec4<u32>,      // oX, oCentroid, oNodeScalar, oNodeUnit
  offB: vec4<u32>,      // oUnitScale, unitCount, shock visible, selection count
  world: vec4<f32>,     // wall length, height, thickness, grid step
  charge: vec4<f32>,    // charge xyz, marker radius
};

@group(0) @binding(0) var<uniform> S: Scene;
@group(0) @binding(1) var<storage, read> U: array<u32>;
@group(0) @binding(2) var<storage, read> RO: array<f32>;
@group(0) @binding(3) var<storage, read> RW: array<f32>;
@group(0) @binding(4) var<storage, read> unitFlags: array<u32>;

fn rw3(base: u32, i: u32) -> vec3<f32> {
  let b = base + i * 3u;
  return vec3<f32>(RW[b], RW[b + 1u], RW[b + 2u]);
}
fn ro3(base: u32, i: u32) -> vec3<f32> {
  let b = base + i * 3u;
  return vec3<f32>(RO[b], RO[b + 1u], RO[b + 2u]);
}

struct WallOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) damage: f32,
  @location(2) speed: f32,
  @location(3) @interpolate(flat) unit: u32,
  @location(4) @interpolate(flat) kind: u32,
};

@vertex
fn vsWall(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> WallOut {
  let unit = U[S.offA.w + vi];
  var p = rw3(S.offA.x, vi);
  // Both bodies shrink around the unit's own DEFORMED centroid, so the inset follows a
  // brick when it tumbles instead of pointing off along fixed world axes.
  let c = rw3(S.offA.y, unit);
  // Slot 0 is the brick's scale, slot 1 the mortar body's; which axis the mortar is set
  // back along depends on which way this wall runs, so the mesher bakes it in.
  let b = S.offB.x + unit * 8u + inst * 4u;
  p = c + (p - c) * vec3<f32>(RO[b], RO[b + 1u], RO[b + 2u]);
  var out: WallOut;
  out.clip = S.viewProj * vec4<f32>(p, 1.0);
  out.world = p;
  out.damage = RW[S.offA.z + vi * 2u];
  out.speed = RW[S.offA.z + vi * 2u + 1u];
  out.unit = unit;
  out.kind = inst;
  return out;
}

fn hash11(n: u32) -> f32 {
  var h = n * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return f32((h >> 22u) ^ h) / 4294967295.0;
}

/** Warm ash → ember ramp, used for both damage and speed so the two read alike. */
fn heat(t: f32) -> vec3<f32> {
  let u = clamp(t, 0.0, 1.0);
  let a = vec3<f32>(0.35, 0.10, 0.05);
  let b = vec3<f32>(0.95, 0.35, 0.08);
  let c = vec3<f32>(1.00, 0.60, 0.20);
  if (u < 0.5) { return mix(a, b, u * 2.0); }
  return mix(b, c, (u - 0.5) * 2.0);
}

@fragment
fn fsWall(in: WallOut) -> @location(0) vec4<f32> {
  var n = normalize(cross(dpdx(in.world), dpdy(in.world)));
  let view = normalize(S.camPos.xyz - in.world);
  if (dot(n, view) < 0.0) { n = -n; }

  var base: vec3<f32>;
  if (in.kind == 0u) {
    // Mortar: cool grey, and darker than any brick so the fuge reads as a shadow line.
    base = vec3<f32>(0.30, 0.29, 0.28);
  } else {
    // Real walls are not one colour. A hash per brick gives the wall its texture.
    let v = hash11(in.unit * 7919u);
    base = mix(vec3<f32>(0.62, 0.30, 0.20), vec3<f32>(0.80, 0.50, 0.36), v);
    base = base * (0.86 + 0.28 * hash11(in.unit * 104729u));
  }

  let mode = S.opts.x;
  var emissive = vec3<f32>(0.0);
  if (mode < 0.5) {
    // Damage belongs to the JOINT, so it is painted on the mortar and nowhere else. Tint
    // the bricks too and the whole wall goes orange the moment anything cracks, which
    // looks dramatic and says nothing; leave them alone and you get what you actually
    // want to see — a brick wall with the crack path glowing through the fuge.
    let d = clamp(in.damage, 0.0, 1.0);
    if (in.kind == 0u) {
      base = mix(base, heat(d), d);
      emissive = heat(d) * pow(d, 2.0) * 0.45;
    } else {
      base = base * (1.0 - 0.18 * d);
    }
  } else if (mode < 1.5) {
    // Speed: what is actually flying, brick and mortar alike.
    let sp = clamp(in.speed * S.opts.w, 0.0, 1.0);
    base = mix(base, heat(sp), sp * 0.9);
    emissive = heat(sp) * pow(sp, 2.0) * 0.9;
  }

  let L = normalize(S.light.xyz);
  let diff = max(dot(n, L), 0.0);
  // Hemisphere ambient: cool from the sky, warm bounce off the ground.
  let sky = mix(vec3<f32>(0.16, 0.13, 0.20), vec3<f32>(0.55, 0.62, 0.78), n.y * 0.5 + 0.5);
  let rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * 0.35;

  var colour = base * (sky * S.light.w + vec3<f32>(1.0, 0.94, 0.84) * diff * 1.05);
  colour = colour + emissive + vec3<f32>(0.45, 0.62, 0.85) * rim;
  // Roll off rather than clip. Late in a run almost every joint is fully damaged, and
  // without this the whole wall saturates to white and stops reading as masonry at all.
  colour = vec3<f32>(1.0) - exp(-colour * 1.25);

  if (unitFlags[in.unit] != 0u) {
    colour = mix(colour, vec3<f32>(0.30, 0.85, 0.95), 0.35) + vec3<f32>(0.05, 0.18, 0.22);
  }

  return vec4<f32>(colour, 1.0);
}

// --- ground ------------------------------------------------------------------------

struct GroundOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
};

@vertex
fn vsGround(@builtin(vertex_index) vi: u32) -> GroundOut {
  var k = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
  );
  let R = 70.0;
  let c = vec3<f32>(S.world.x * 0.5, 0.0, S.world.z * 0.5);
  let p = c + vec3<f32>(k[vi].x * R, 0.0, k[vi].y * R);
  var out: GroundOut;
  out.clip = S.viewProj * vec4<f32>(p, 1.0);
  out.world = p;
  return out;
}

@fragment
fn fsGround(in: GroundOut) -> @location(0) vec4<f32> {
  let step = S.world.w;
  let g = abs(fract(in.world.xz / step - 0.5) - 0.5) / fwidth(in.world.xz / step);
  let line = 1.0 - min(min(g.x, g.y), 1.0);
  let d = length(in.world.xz - vec2<f32>(S.world.x * 0.5, S.world.z * 0.5));
  let fade = clamp(1.0 - d / 45.0, 0.0, 1.0);
  let base = mix(vec3<f32>(0.055, 0.058, 0.070), vec3<f32>(0.10, 0.10, 0.12), fade);
  let colour = base + vec3<f32>(0.16, 0.20, 0.26) * line * fade * 0.6;
  return vec4<f32>(colour, 1.0);
}

// --- shock front and charge marker ---------------------------------------------------

/** One vertex of a lat/long sphere, straight out of the vertex index. */
fn spherePoint(vi: u32, rings: u32, segs: u32) -> vec3<f32> {
  let cell = vi / 6u;
  let corner = vi % 6u;
  let r = cell / segs;
  let s = cell % segs;
  var dr = array<u32, 6>(0u, 1u, 1u, 0u, 1u, 0u);
  var ds = array<u32, 6>(0u, 0u, 1u, 0u, 1u, 1u);
  let phi = f32(r + dr[corner]) / f32(rings) * 3.14159265;
  let theta = f32(s + ds[corner]) / f32(segs) * 6.28318530;
  return vec3<f32>(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));
}

struct ShellOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) world: vec3<f32>,
};

@vertex
fn vsShock(@builtin(vertex_index) vi: u32) -> ShellOut {
  let n = spherePoint(vi, 24u, 48u);
  let p = S.charge.xyz + n * max(S.opts.z, 0.001);
  var out: ShellOut;
  out.clip = S.viewProj * vec4<f32>(p, 1.0);
  out.normal = n;
  out.world = p;
  return out;
}

@fragment
fn fsShock(in: ShellOut) -> @location(0) vec4<f32> {
  if (S.offB.z == 0u) { discard; }
  let view = normalize(S.camPos.xyz - in.world);
  // Edge-on is where a thin shell has the most of itself in the way, so that is where it
  // should be brightest — the same reason a real blast front photographs as a ring.
  let fres = pow(1.0 - abs(dot(normalize(in.normal), view)), 2.5);
  let fade = clamp(1.0 - S.opts.z / 26.0, 0.0, 1.0);
  let a = fres * 0.5 * fade;
  return vec4<f32>(vec3<f32>(0.55, 0.85, 1.0) * a * 2.0, a);
}

@vertex
fn vsMarker(@builtin(vertex_index) vi: u32) -> ShellOut {
  let n = spherePoint(vi, 12u, 24u);
  let p = S.charge.xyz + n * S.charge.w;
  var out: ShellOut;
  out.clip = S.viewProj * vec4<f32>(p, 1.0);
  out.normal = n;
  out.world = p;
  return out;
}

@fragment
fn fsMarker(in: ShellOut) -> @location(0) vec4<f32> {
  let view = normalize(S.camPos.xyz - in.world);
  let f = max(dot(normalize(in.normal), view), 0.0);
  let colour = mix(vec3<f32>(0.65, 0.14, 0.08), vec3<f32>(1.0, 0.82, 0.42), pow(f, 1.5));
  return vec4<f32>(colour, 1.0);
}
`;
