/**
 * Rendering: a fullscreen triangle whose fragment shader maps each pixel to a lattice
 * site. Zoomed out, a pixel covers many cells and a cheap nearest-index lookup is
 * honest. Zoomed in, cells are drawn as the true Voronoi regions of the site positions
 * in world space — squares on the square lattice, hexagons on the triangular one, the
 * familiar honeycomb on the brick-wall lattice.
 *
 * The lattice pass writes into a persistent accumulation texture with alpha blending
 * (the "motion smoothing" temporal fade — at many sweeps per frame the critical state
 * shimmers instead of strobing); a second pass blits that texture to the canvas, whose
 * own texture is transient and cannot carry state between frames.
 */
export const RENDER_WGSL = /* wgsl */ `
struct ViewUniforms {
  col_down: vec4f,
  col_up: vec4f,
  center: vec2f,      // world coords at the viewport center
  viewport: vec2f,    // physical pixels
  px_per_cell: f32,
  L: f32,
  geom: f32,          // 0 square, 1 triangular, 2 honeycomb
  hi_zoom: f32,       // 1 = Voronoi cells + borders
  alpha: f32,         // blend factor into the accumulation texture
}

@group(0) @binding(0) var<storage, read> spins: array<u32>;
@group(0) @binding(1) var<uniform> view_u: ViewUniforms;

struct VSOut {
  @builtin(position) pos: vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VSOut {
  var out: VSOut;
  let x = f32(i32(vi & 1u) * 4 - 1);
  let y = f32(i32(vi >> 1u) * 4 - 1);
  out.pos = vec4f(x, y, 0.0, 1.0);
  return out;
}

const SQRT3_HALF = 0.8660254;

fn site_pos(i: f32, j: f32, geom: u32) -> vec2f {
  switch geom {
    case 0u: {
      return vec2f(i, j);
    }
    case 1u: {
      return vec2f(i + 0.5 * j, SQRT3_HALF * j);
    }
    default: {
      // Parity from rounded indices; works because i, j arrive integral here.
      let par = (i32(i) + i32(j)) % 2;
      let dy = select(-0.25, 0.25, ((par + 2) % 2) == 0);
      return vec2f(i * SQRT3_HALF, j * 1.5 + dy);
    }
  }
}

/* World point -> fractional lattice coordinates (inverse basis). */
fn frac_coords(w: vec2f, geom: u32) -> vec2f {
  switch geom {
    case 0u: {
      return w;
    }
    case 1u: {
      return vec2f(w.x - w.y * 0.57735027, w.y * 1.1547005);
    }
    default: {
      return vec2f(w.x / SQRT3_HALF, w.y / 1.5);
    }
  }
}

fn spin_at_wrapped(i: i32, j: i32, L: i32) -> f32 {
  let x = u32(((i % L) + L) % L);
  let y = u32(((j % L) + L) % L);
  return f32(spins[y * u32(L) + x]);
}

@fragment
fn fs_lattice(in: VSOut) -> @location(0) vec4f {
  let geom = u32(view_u.geom);
  let L = i32(view_u.L);
  let w = view_u.center + (in.pos.xy - view_u.viewport * 0.5) / view_u.px_per_cell;
  let uv = frac_coords(w, geom);

  var s: f32;
  var border = 0.0;

  if (view_u.hi_zoom < 0.5) {
    s = spin_at_wrapped(i32(round(uv.x)), i32(round(uv.y)), L);
  } else {
    // Voronoi: nearest of the 3x3 candidate sites around floor(uv).
    let i0 = i32(floor(uv.x));
    let j0 = i32(floor(uv.y));
    var d1 = 1e9;
    var d2 = 1e9;
    var best = 0.0;
    for (var dj = -1; dj <= 1; dj++) {
      for (var di = -1; di <= 1; di++) {
        let ci = i0 + di;
        let cj = j0 + dj;
        let d = distance(w, site_pos(f32(ci), f32(cj), geom));
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = spin_at_wrapped(ci, cj, L);
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    s = best;
    if (view_u.px_per_cell > 12.0) {
      let lw = 1.2 / view_u.px_per_cell;
      border = 1.0 - smoothstep(lw * 0.5, lw * 1.5, d2 - d1);
    }
  }

  var color = mix(view_u.col_down.rgb, view_u.col_up.rgb, s);
  color = mix(color, view_u.col_down.rgb * 0.55 + view_u.col_up.rgb * 0.1, border * 0.65);
  return vec4f(color, view_u.alpha);
}
`;

/** Accumulation texture -> canvas, same-size copy. */
export const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var accum: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let x = f32(i32(vi & 1u) * 4 - 1);
  let y = f32(i32(vi >> 1u) * 4 - 1);
  return vec4f(x, y, 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = textureLoad(accum, vec2i(pos.xy), 0);
  return vec4f(c.rgb, 1.0);
}
`;
