import { HELPERS, UNIFORMS } from './common.wgsl.ts';

/**
 * Fullscreen pass. Maps the canvas to domain coordinates, then draws the cap as a planet
 * disc: Cassini-style clouds, or vorticity / speed / dye colour maps, with optional
 * streamline (ψ-contour) overlay and a starfield outside the limb.
 */
export const RENDER = /* wgsl */ `
${UNIFORMS}
${HELPERS}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> zeta: array<f32>;
@group(0) @binding(2) var<storage, read> psi: array<f32>;
@group(0) @binding(3) var tracer: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = p[vi] * 0.5 + 0.5;
  return o;
}

fn at(buf: u32, i: i32, j: i32) -> f32 {
  let c = idx(wrap(i, u.n), wrap(j, u.n), u.n);
  if (buf == 0u) { return zeta[c]; }
  return psi[c];
}

// Bilinear sample of a storage field at domain point p.
fn field(buf: u32, p: vec2f) -> f32 {
  let fx = (p.x + 1.0) / u.dx - 0.5;
  let fy = (p.y + 1.0) / u.dx - 0.5;
  let i0 = i32(floor(fx));
  let j0 = i32(floor(fy));
  let tx = fx - f32(i0);
  let ty = fy - f32(j0);
  return mix(mix(at(buf, i0, j0), at(buf, i0 + 1, j0), tx),
             mix(at(buf, i0, j0 + 1), at(buf, i0 + 1, j0 + 1), tx), ty);
}

fn velocity(p: vec2f) -> vec2f {
  let h = u.dx;
  return vec2f(-(field(1u, p + vec2f(0.0, h)) - field(1u, p - vec2f(0.0, h))),
                 field(1u, p + vec2f(h, 0.0)) - field(1u, p - vec2f(h, 0.0))) / (2.0 * h);
}

// Diverging map for vorticity: cyan ← black → amber.
fn vortColor(z: f32) -> vec3f {
  let t = tanh(z);
  let neg = vec3f(0.10, 0.55, 1.00);
  let pos = vec3f(1.00, 0.55, 0.12);
  let base = vec3f(0.02, 0.02, 0.04);
  var c = base;
  if (t < 0.0) { c = mix(base, neg, -t); } else { c = mix(base, pos, t); }
  // push the extremes toward white so strong cores glow
  let a = abs(t);
  return mix(c, vec3f(1.0), smoothstep(0.75, 1.0, a) * 0.6);
}

// Heat ramp for speed: black → violet → red → orange → yellow → white.
fn heat(x: f32) -> vec3f {
  let t = clamp(x, 0.0, 1.0);
  let c0 = vec3f(0.0, 0.0, 0.02);
  let c1 = vec3f(0.25, 0.04, 0.45);
  let c2 = vec3f(0.85, 0.15, 0.25);
  let c3 = vec3f(1.0, 0.55, 0.1);
  let c4 = vec3f(1.0, 0.95, 0.6);
  if (t < 0.25) { return mix(c0, c1, t / 0.25); }
  if (t < 0.5) { return mix(c1, c2, (t - 0.25) / 0.25); }
  if (t < 0.75) { return mix(c2, c3, (t - 0.5) / 0.25); }
  return mix(c3, c4, (t - 0.75) / 0.25);
}

fn stars(px: vec2f) -> vec3f {
  var acc = vec3f(0.0);
  for (var l = 0; l < 2; l++) {
    let scale = select(90.0, 45.0, l == 1);
    let cell = floor(px * scale);
    let h = hash21(cell + f32(l) * 17.0);
    let jitter = vec2f(hash21(cell + 3.1), hash21(cell + 7.7));
    let d = length(fract(px * scale) - jitter);
    let bright = smoothstep(0.985, 1.0, h);
    let glow = exp(-d * d * 250.0);
    let tint = mix(vec3f(0.8, 0.85, 1.0), vec3f(1.0, 0.9, 0.7), hash21(cell + 1.3));
    acc += tint * bright * glow * (0.6 + 0.4 * sin(u.time * 1.5 + h * 40.0));
  }
  return acc;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let aspect = u.view.w;
  // Domain coords: the unit disc fills 92% of the shorter canvas side.
  var p = (in.uv - 0.5) * 2.0;
  if (aspect > 1.0) { p.x *= aspect; } else { p.y /= aspect; }
  p = p / 0.92;
  // Flip y so that eastward (counter-clockwise from above the pole) reads correctly.
  p.y = -p.y;
  let r = length(p);
  let mode = u32(u.view.x);

  // ---------- space ----------
  var space = stars(in.uv * vec2f(max(aspect, 1.0), max(1.0 / aspect, 1.0)));
  // soft limb glow
  let glowR = u.capRadius;
  let glow = exp(-max(r - glowR, 0.0) * 9.0) * 0.18;
  space += vec3f(0.55, 0.7, 1.0) * glow;

  // ---------- fields ----------
  let uv = (p + 1.0) * 0.5;
  let tr = textureSampleLevel(tracer, samp, uv, 0.0);
  let z = field(0u, p);
  let v = velocity(p);
  let speed = length(v);
  let cloud = tr.r;
  let band = tr.g;

  // relief light from the cloud field gradient
  let e = 0.75 * u.dx;
  let cx = textureSampleLevel(tracer, samp, uv + vec2f(e, 0.0), 0.0).r - textureSampleLevel(tracer, samp, uv - vec2f(e, 0.0), 0.0).r;
  let cy = textureSampleLevel(tracer, samp, uv + vec2f(0.0, e), 0.0).r - textureSampleLevel(tracer, samp, uv - vec2f(0.0, e), 0.0).r;
  let nrm = normalize(vec3f(-cx * 6.0, -cy * 6.0, 1.0));
  let L = normalize(vec3f(-0.6, 0.5, 0.65));
  let relief = dot(nrm, L);

  var col = vec3f(0.0);
  let exposure = u.view.z;

  if (mode == 0u) {
    // Cassini: grey cloud deck, bright anticyclones, dark cyclones, subtle warm bands.
    let bandc = smoothstep(0.2, 0.8, band);
    let base = 0.14 + 0.26 * bandc;
    var b = base + cloud * 3.2 * exposure;
    b += 0.18 * (relief - 0.55);
    // anticyclones (clockwise, ζ < 0) are bright high clouds; cyclones are dark holes
    b -= 0.22 * tanh(z * 0.09);
    // the jet itself is the bright, sharp band Cassini sees
    b += 0.28 * smoothstep(0.35, 1.0, speed);
    b = clamp(b, 0.0, 1.5);
    let tint = mix(vec3f(0.98, 0.90, 0.74), vec3f(0.80, 0.86, 1.0), bandc);
    col = vec3f(b) * tint;
  } else if (mode == 1u) {
    col = vortColor(z * 0.05 * exposure);
    col += vec3f(cloud * 0.6) * (0.3 + 0.7 * abs(tanh(z * 0.05)));
  } else if (mode == 2u) {
    col = heat(speed * 0.9 * exposure);
    col += vec3f(cloud) * 0.5;
  } else {
    // Dye: the bands, plus fluid age tint.
    let a = tr.b;
    let c0 = vec3f(0.05, 0.25, 0.55);
    let c1 = vec3f(1.0, 0.75, 0.25);
    col = mix(c0, c1, smoothstep(0.2, 0.8, band)) * (0.5 + 0.5 * exposure);
    col = mix(col, col * vec3f(0.9, 0.6, 0.9), a * 0.3);
    col += vec3f(cloud) * 0.6;
    col = mix(col, vec3f(0.02), smoothstep(0.75, 1.05, speed) * 0.0);
  }

  // ---------- streamline overlay ----------
  if (u.view.y > 0.0) {
    let ps = field(1u, p) * u.view.y;
    let f = fract(ps);
    let w = fwidth(ps) * 1.2;
    let line = 1.0 - smoothstep(0.0, w, min(f, 1.0 - f));
    col = mix(col, vec3f(0.85, 0.95, 1.0), line * 0.55);
  }

  // ---------- jet ring marker ----------
  if (u.showRing > 0.0) {
    let d = abs(r - u.jetRadius);
    let ring = exp(-d * d * 30000.0);
    col = mix(col, vec3f(1.0, 0.35, 0.2), ring * 0.7);
  }

  // ---------- limb ----------
  let limb = 1.0 - smoothstep(0.86, 0.99, r);
  let dark = 1.0 - 0.3 * smoothstep(0.5, 1.0, r);
  col = col * limb * dark;
  col = mix(space, col, smoothstep(0.985, 0.96, r));

  // gentle filmic curve
  col = col / (col + 0.55) * 1.4;
  return vec4f(col, 1.0);
}
`;
