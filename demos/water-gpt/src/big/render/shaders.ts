/**
 * The valve field: one full-screen fragment pass that draws all ~124 M valves.
 *
 * Level of detail is decided per pixel from `scale` (valves per device pixel):
 *   > ~6 valves/px   the hall: a mip-mapped atlas of 8×8-valve aggregates
 *                    (mean opening, +/− balance, max opening), built as bytes stream in;
 *   ~0.6–6           each valve as a tinted cell read straight from the weight buffer the
 *                    compute kernels use (so what you see is what computes): opening =
 *                    |w| / (the tile's w_max), quantised to the machine's valve stops;
 *   < ~0.6           each valve as a glass tank: supply manifold, valve wheel, feed,
 *                    tank with water at the valve's opening, outlet into the + or −
 *                    collector, refraction/caustics and flow particles whose speed is the
 *                    real flow h·g from the last token through that crossbar.
 */
export const FIELD_WGSL = /* wgsl */ `
struct U {
  res: vec2f,
  scale: f32,
  time: f32,
  centerInt: vec2i,
  centerFrac: vec2f,
  worldSize: vec2f,
  atlasSize: vec2f,
  nRects: u32,
  levels: u32,
  now: f32,
  hoverGrid: i32,
  hover: vec2i,
  timesGridOff: u32,
  dpr: f32,
  kvCtx: u32,
  kvLen: u32,
  dModel: u32,
  nHead: u32,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> tables: array<u32>;
@group(0) @binding(2) var<storage, read> times: array<f32>;
@group(0) @binding(3) var<storage, read> vals: array<u32>;

@group(0) @binding(4) var<storage, read> act: array<f32>;
@group(0) @binding(5) var<storage, read> actMeta: array<f32>;
@group(0) @binding(6) var atlas: texture_2d<f32>;
@group(0) @binding(7) var samp: sampler;
@group(0) @binding(8) var<storage, read> wmaxB: array<f32>;
@group(0) @binding(9) var<storage, read> kv: array<f32>;
@group(0) @binding(10) var<storage, read> kvmax: array<f32>;

const CYAN = vec3f(0.22, 0.86, 1.0);
const AMBER = vec3f(1.0, 0.62, 0.20);
const BRASS = vec3f(0.84, 0.70, 0.43);
const VIOLET = vec3f(0.66, 0.60, 1.0);
const GLASS = vec3f(0.045, 0.07, 0.105);

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn hash21(p: vec2i) -> f32 {
  var h = (u32(p.x) * 0x8da6b343u) ^ (u32(p.y) * 0xd8163841u);
  h = h ^ (h >> 15u); h = h * 0x2c1b3c6du; h = h ^ (h >> 12u);
  return f32(h & 0xffffu) / 65535.0;
}

// smoothstep that also accepts e0 > e1 (WGSL rejects constant reversed edges)
fn ss(e0: f32, e1: f32, x: f32) -> f32 {
  let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

fn sdBox(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn fillAA(d: f32, aa: f32) -> f32 { return clamp(0.5 - d / aa, 0.0, 1.0); }

// grid table: 8 u32 per grid, after 8 u32 per rect
fn gInfo(g: u32, k: u32) -> u32 { return tables[u.nRects * 8u + g * 8u + k]; }

// signed valve opening in [-1, 1]: |w| / w_max of its tile, at the machine's valve stops
fn valveOpening(g: u32, row: u32, col: u32) -> f32 {
  let tilesC = gInfo(g, 5u);
  let tr = row / 64u; let tc = col / 64u;
  let tile = tr * tilesC + tc;
  let e = (row % 64u) * 64u + (col % 64u);
  let v = unpack2x16float(vals[gInfo(g, 0u) + tile * 2048u + (e >> 1u)]);
  let w = select(v.x, v.y, (e & 1u) == 1u);
  let wm = wmaxB[gInfo(g, 1u) + tile];
  if (wm <= 0.0) { return 0.0; }
  var a = abs(w) / wm;
  if (u.levels > 0u) { let L = f32(u.levels); a = floor(a * L + 0.5) / L; }
  return sign(w) * a;
}

fn waterColor(s: f32) -> vec3f { return select(AMBER, CYAN, s >= 0.0); }

struct Ctx {
  g: u32, row: u32, col: u32,
  fill: f32, front: f32, actv: f32,
  head: f32, outflow: f32,
};

fn loadState(g: u32, row: u32, col: u32) -> vec2f {
  let axis = gInfo(g, 7u);
  var band = row / 64u; var within = row % 64u;
  if (axis == 1u) { band = col / 64u; within = col % 64u; }
  let lt = times[u.timesGridOff + gInfo(g, 6u) + band];
  let age = u.now - lt - f32(within) * 0.006;
  let fill = ss(0.0, 0.9, age);
  let front = select(0.0, exp(-age * 2.5), age >= 0.0);
  return vec2f(fill, front);
}

fn activity(g: u32) -> f32 {
  let at = u.now - times[g];
  return select(0.0, exp(-at * 0.9), at >= 0.0);
}

// ---- far: atlas of 8x8 aggregates ------------------------------------------------
fn farColor(wpos: vec2f, c: Ctx) -> vec3f {
  let uv = wpos / 8.0 / u.atlasSize;
  let lod = log2(max(u.scale / 8.0, 1e-4));
  let s = textureSampleLevel(atlas, samp, uv, lod);
  let m = s.r;
  let bal = s.g * 2.0 - 1.0;
  // luminous water: deep blue for nearly shut valves, bright cyan for wide open ones,
  // tinted amber where the − collectors dominate
  // m = mean valve opening |w|/w_max over 8×8 valves; trained weights sit at 0.13–0.25
  let I = pow(clamp((m - 0.1) * 6.5, 0.0, 1.0), 1.2);
  var water = mix(vec3f(0.01, 0.045, 0.11), vec3f(0.25, 0.80, 1.0), I);
  water = mix(water, AMBER * (0.15 + 0.85 * I), clamp(-bal * 1.4, 0.0, 1.0) * 0.75);
  var col = mix(GLASS * 0.9, water, c.fill);
  col = col + vec3f(0.55, 0.9, 1.0) * c.front * 0.45;
  return col;
}

// ---- mid: one tinted cell per valve ----------------------------------------------
fn midColor(fr: vec2f, gval: f32, c: Ctx) -> vec3f {
  let px = u.scale;
  let d = sdBox(fr - vec2f(0.5), vec2f(0.42), 0.12);
  let inside = fillAA(d, px * 1.5);
  let a = pow(abs(gval), 0.75) * c.fill;
  var col = GLASS * (0.8 + 0.4 * inside);
  col = col + waterColor(gval) * a * 1.5 * mix(0.45, 1.0, inside);
  let flow = abs(c.head * gval) * c.actv;
  col = col + waterColor(c.head * gval) * flow * 1.4;
  col = col + vec3f(0.55, 0.9, 1.0) * c.front * 0.4;
  return col;
}

// ---- near: a glass tank per valve --------------------------------------------------
fn tankColor(fr: vec2f, gval: f32, c: Ctx, cellPx: f32, seed: f32, cellX: f32, cellY: f32) -> vec3f {
  let aa = 1.25 / cellPx;
  let t = u.time;
  let detail = ss(5.0, 14.0, cellPx);
  let fine = ss(26.0, 70.0, cellPx);
  let wc = waterColor(gval);
  let open = abs(gval);
  let f = c.head * gval;               // this valve's flow (units of full-open × full head)
  let flowAmt = abs(f) * c.actv;

  // backdrop: dark slate with a faint vertical sheen
  var col = vec3f(0.028, 0.04, 0.062) + vec3f(0.01, 0.016, 0.024) * (1.0 - fr.y);

  // supply manifold (row pipe) along the top
  let man = sdBox(fr - vec2f(0.5, 0.08), vec2f(0.6, 0.045), 0.0);
  let manA = fillAA(man, aa) * detail;
  let headCol = select(VIOLET, vec3f(0.35, 0.65, 1.0), c.head >= 0.0);
  var manCol = vec3f(0.09, 0.12, 0.16) + headCol * (0.12 + 0.5 * abs(c.head) * c.actv);
  let manP = fract((cellX + fr.x) * 2.0 - t * 1.6 * c.head);
  manCol = manCol + headCol * ss(0.12, 0.0, abs(manP - 0.5) - 0.02) * abs(c.head) * c.actv * fine * ss(0.03, 0.0, abs(fr.y - 0.08) - 0.012);
  col = mix(col, manCol, manA);

  // collectors: + (cyan) and − (amber) down the right side
  let yo = c.outflow;
  for (var k = 0; k < 2; k = k + 1) {
    let x = select(0.915, 0.835, k == 0);
    let sgn = select(-1.0, 1.0, k == 0);
    let cd = sdBox(fr - vec2f(x, 0.5), vec2f(0.032, 0.6), 0.0);
    let ca = fillAA(cd, aa) * detail;
    let wcol = select(AMBER, CYAN, k == 0);
    let mine = max(sgn * yo, 0.0);
    var ccol = vec3f(0.08, 0.1, 0.13) + wcol * (0.10 + 0.55 * mine * c.actv);
    let cp = fract((cellY + fr.y) * 2.5 - t * (0.6 + 2.5 * mine));
    ccol = ccol + mix(wcol, vec3f(1.0), 0.25) * ss(0.1, 0.0, abs(cp - 0.5) - 0.03) * (0.25 + 1.4 * mine) * c.actv * fine;
    col = mix(col, ccol, ca);
  }

  // feed pipe from the manifold into the tank, with the valve wheel
  let feed = sdBox(fr - vec2f(0.41, 0.175), vec2f(0.022, 0.06), 0.0);
  col = mix(col, vec3f(0.12, 0.15, 0.19) + wc * flowAmt * 0.8, fillAA(feed, aa) * detail);
  let wheelP = fr - vec2f(0.41, 0.17);
  let wheel = abs(length(wheelP) - 0.045) - 0.009;
  let ang = open * 1.5707963;
  let dirv = vec2f(cos(ang), sin(ang));
  let spoke = max(abs(dot(wheelP, vec2f(-dirv.y, dirv.x))) - 0.007, length(wheelP) - 0.05);
  let wheelA = max(fillAA(wheel, aa), fillAA(spoke, aa)) * detail;
  col = mix(col, BRASS * (0.75 + 0.35 * fine), wheelA);

  // tank body (glass)
  let tc = vec2f(0.41, 0.56);
  let hs = vec2f(0.27, 0.29);
  let tp = fr - tc;
  let dOuter = sdBox(tp, hs, 0.07);
  let dInner = dOuter + 0.022;
  let inTank = fillAA(dInner, aa);
  let glassWall = fillAA(dOuter, aa) - inTank;

  // water level = valve opening (rises from the bottom while the reservoirs fill)
  let top = tc.y - hs.y + 0.03;
  let bot = tc.y + hs.y - 0.03;
  let level = open * c.fill;
  var surf = bot - level * (bot - top);
  let wob = (0.006 + 0.014 * flowAmt) * sin(fr.x * 31.0 + t * 3.1 + seed * 6.28) * fine;
  surf = surf + wob * step(0.002, level);
  let inWater = inTank * fillAA(surf - fr.y, aa) * step(0.0005, level);

  // interior: back wall with faint stripes, refracted under water
  let refr = sin(fr.y * 40.0 + t * 1.3 + seed * 9.0) * 0.012 * fine;
  let stripeX = fr.x + refr * inWater;
  let stripes = 0.5 + 0.5 * sin(stripeX * 90.0);
  var inner = vec3f(0.035, 0.05, 0.075) + vec3f(0.012, 0.018, 0.026) * stripes * fine;
  // water body: absorption with depth, a bright band just under the surface where the
  // light enters, thin caustic filaments, and rising bubbles while water flows through
  let depth = clamp((fr.y - surf) / max(bot - top, 0.01), 0.0, 1.0);
  var water = wc * (0.16 + 0.42 * exp(-depth * 2.2)) * (0.55 + 0.45 * c.fill);
  water = water + wc * ss(0.06, 0.0, fr.y - surf) * 0.22;
  let w1 = fr.x * 26.0 + sin(fr.y * 13.0 + t * 1.3 + seed * 6.0) * 1.6 + t * 0.7;
  let w2 = fr.x * 17.0 - sin(fr.y * 21.0 - t * 1.1) * 1.3 - t * 0.5 + seed * 3.0;
  let caus = pow(1.0 - abs(sin(w1)), 14.0) + pow(1.0 - abs(sin(w2)), 14.0);
  water = water + mix(wc, vec3f(1.0), 0.5) * caus * 0.10 * fine * (1.0 - depth * 0.6);
  water = water + wc * flowAmt * 0.5;
  // bubbles: three per tank, rising at a speed set by this valve's flow
  for (var k = 0; k < 3; k = k + 1) {
    let fk = f32(k);
    let bx = 0.41 + (fract(seed * 7.13 + fk * 0.37) - 0.5) * 0.36;
    let phase = fract(t * (0.15 + 1.4 * flowAmt) + fk * 0.33 + seed);
    let by = mix(bot - 0.02, surf + 0.02, phase);
    let br = 0.006 + 0.006 * fract(seed * 3.7 + fk);
    let bd = abs(length(fr - vec2f(bx + sin(phase * 9.0 + fk) * 0.01, by)) - br);
    water = water + vec3f(0.85, 0.95, 1.0) * ss(aa * 1.5, 0.0, bd) * 0.45 * fine * ss(0.0, 0.03, flowAmt);
  }
  inner = mix(inner, water, inWater);
  // meniscus
  let men = ss(aa * 2.0, 0.0, abs(fr.y - surf)) * inTank * step(0.002, level);
  inner = inner + mix(wc, vec3f(1.0), 0.55) * men * 0.95;
  // inflow stream falling from the feed into the water
  let streamX = abs(fr.x - 0.41) - (0.004 + 0.014 * flowAmt);
  let inStream = fillAA(streamX, aa) * step(top - 0.02, fr.y) * step(fr.y, surf) * step(0.01, flowAmt);
  let dash = 0.55 + 0.45 * sin(fr.y * 70.0 - t * (8.0 + 30.0 * flowAmt));
  inner = inner + mix(wc, vec3f(1.0), 0.3) * inStream * dash * (0.5 + flowAmt) * fine;
  col = mix(col, inner, inTank);

  // glass wall: rim light + specular streak
  let fres = pow(clamp(1.0 + dOuter / 0.05, 0.0, 1.0), 3.0);
  col = col + vec3f(0.55, 0.7, 0.85) * glassWall * (0.35 + 0.4 * fres);
  let spec = ss(0.03, 0.0, abs(tp.x + 0.17 + tp.y * 0.08)) * ss(hs.y, hs.y - 0.08, abs(tp.y)) * inTank;
  col = col + vec3f(0.8, 0.9, 1.0) * spec * 0.12 * (0.4 + 0.6 * detail);
  let glint = ss(0.012, 0.0, length(tp - vec2f(-0.2, -0.22)) - 0.004) * fine;
  col = col + vec3f(1.0) * glint * 0.35;
  // graduations on the glass
  for (var i = 1; i < 4; i = i + 1) {
    let gy = bot - f32(i) * 0.25 * (bot - top);
    let tick = max(abs(fr.y - gy) - 0.004, abs(fr.x - 0.635) - 0.025);
    col = col + vec3f(0.6, 0.7, 0.8) * fillAA(tick, aa) * 0.35 * fine;
  }

  // outlet: down from the tank, across to its collector
  let cx = select(0.915, 0.835, gval >= 0.0);
  let o1 = sdBox(fr - vec2f(0.41, 0.905), vec2f(0.022, 0.035), 0.0);
  let o2 = sdBox(fr - vec2f((0.41 + cx) * 0.5, 0.935), vec2f((cx - 0.41) * 0.5, 0.02), 0.0);
  let od = min(o1, o2);
  var ocol = vec3f(0.11, 0.14, 0.18) + wc * (0.12 * open + 0.7 * flowAmt);
  let op = fract((fr.x + fr.y) * 6.0 - t * (1.0 + 8.0 * flowAmt) * sign(f + 1e-6));
  ocol = ocol + wc * ss(0.12, 0.0, abs(op - 0.5) - 0.05) * flowAmt * fine;
  col = mix(col, ocol, fillAA(od, aa) * detail * step(0.0005, open));

  // the loading wave washes over
  col = col + vec3f(0.55, 0.9, 1.0) * c.front * 0.3;
  return col;
}

fn background(wpos: vec2f) -> vec3f {
  let px = u.scale;
  var col = vec3f(0.012, 0.02, 0.034);
  // blueprint grid every 1024 valves, fine every 256 when close enough
  let g1 = abs(fract(wpos / 1024.0 + 0.5) - 0.5) * 1024.0;
  let l1 = ss(px * 1.2, 0.0, min(g1.x, g1.y));
  col = col + vec3f(0.05, 0.09, 0.14) * l1 * 0.5;
  let g2 = abs(fract(wpos / 256.0 + 0.5) - 0.5) * 256.0;
  let l2 = ss(px * 1.0, 0.0, min(g2.x, g2.y)) * ss(40.0, 8.0, px);
  col = col + vec3f(0.04, 0.07, 0.11) * l2 * 0.35;
  return col;
}

@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let pix = fp.xy - u.res * 0.5;
  let off = pix * u.scale;
  let wf = u.centerFrac + off;
  let fl = floor(wf);
  let cell = u.centerInt + vec2i(fl);
  let fr = wf - fl;
  let wpos = vec2f(cell) + fr;
  let px = u.scale;
  var col = background(wpos);

  for (var i = 0u; i < u.nRects; i = i + 1u) {
    let x0 = i32(tables[i * 8u]);
    let y0 = i32(tables[i * 8u + 1u]);
    let w = i32(tables[i * 8u + 2u]);
    let h = i32(tables[i * 8u + 3u]);
    let g = tables[i * 8u + 4u];
    let colStart = tables[i * 8u + 5u];
    let lx = cell.x - x0;
    let ly = cell.y - y0;
    // cheap reject against the rect plus its reservoir / stream / frame margins
    let resW = clamp(28.0 * px, 24.0, 200.0);
    let streamMax = f32(tables[i * 8u + 7u]);
    let streamL = min(clamp(90.0 * px, 64.0, 1600.0), streamMax);
    let mpx = 3.0 * px + 1.0;
    if (f32(lx) < -max(resW, mpx) || f32(lx) > f32(w) + mpx || f32(ly) < -mpx || f32(ly) > f32(h) + max(streamL, mpx)) { continue; }
    let rows = gInfo(g, 3u);
    let actOff = gInfo(g, 2u);
    let actv = activity(g);
    let amax = max(actMeta[g * 4u], 1e-6);
    let kind = tables[i * 8u + 6u] >> 16u;
    if (kind != 0u) {
      // the KV cache: key / value valves programmed by each token as it passes
      let kfx = max(f32(-lx) - fr.x, f32(lx - w) + fr.x);
      let kfy = max(f32(-ly) - fr.y, f32(ly - h) + fr.y);
      let kd = max(kfx, kfy);
      if (kd > 0.0) {
        if (kd < 3.0 * px) { col = mix(col, VIOLET * (0.3 + 0.5 * actv), ss(3.0 * px, 0.5 * px, kd) * 0.7); }
        continue;
      }
      let layer = tables[i * 8u + 6u] & 0xffffu;
      var pos = u32(lx);
      var dim = u32(ly);
      if (kind == 2u) { pos = u32(ly); dim = u32(lx); }
      var c: Ctx;
      c.g = g; c.row = u32(ly); c.col = u32(lx);
      c.fill = select(0.0, 1.0, pos < u.kvLen);
      let age = u.now - times[g];
      c.front = select(0.0, exp(-age * 1.5), pos + 1u == u.kvLen && age >= 0.0);
      c.actv = actv; c.head = 0.0; c.outflow = 0.0;
      var gv = 0.0;
      if (pos < u.kvLen) {
        let which = select(1u, 0u, kind == 1u);
        let v = kv[((layer * 2u + which) * u.kvCtx + pos) * u.dModel + dim];
        let nb = (u.kvCtx + 63u) / 64u;
        let h = dim / (u.dModel / u.nHead);
        let m = kvmax[((layer * 2u + which) * u.nHead + h) * nb + pos / 64u];
        gv = select(0.0, clamp(v / m, -1.0, 1.0), m > 0.0);
      }
      let tNearK = ss(0.75, 0.32, px);
      var shade = midColor(fr, gv, c) + VIOLET * 0.03;
      if (tNearK > 0.0) {
        shade = mix(shade, tankColor(fr, gv, c, 1.0 / px, hash21(cell), f32(cell.x % 1024), f32(cell.y % 1024)), tNearK);
      }
      col = shade;
      break;
    }
    // reservoirs: heads drawn as level bars to the left of the crossbar
    if (lx < 0 && f32(-lx) <= resW && ly >= 0 && ly < h && actv > 0.003) {
      let hr = act[actOff + u32(ly)];
      let len = abs(hr) * resW;
      let dx = f32(-lx) - fr.x;
      if (dx < len) {
        let hc = select(VIOLET, vec3f(0.35, 0.65, 1.0), hr >= 0.0);
        col = col + hc * actv * (0.35 + 0.5 * ss(len, 0.0, dx));
      }
      continue;
    }
    // collector outflows: glowing streams falling out of the bottom
    if (ly >= h && f32(ly - h) < streamL && lx >= 0 && lx < w && actv > 0.003) {
      let c = colStart + u32(lx);
      let yo = act[actOff + rows + c] / amax;
      let dy = (f32(ly - h) + fr.y) / streamL;
      let ripple = 0.55 + 0.45 * sin(dy * 40.0 - u.time * 9.0 + f32(c) * 0.37);
      let a = abs(yo) * actv * (1.0 - dy) * (1.0 - dy) * ripple;
      col = col + waterColor(yo) * a * 1.3;
      continue;
    }
    // brass frame
    let fx = max(f32(-lx) - 1.0 + (1.0 - fr.x), f32(lx - w) + fr.x);
    let fy = max(f32(-ly) - 1.0 + (1.0 - fr.y), f32(ly - h) + fr.y);
    let dFrame = max(fx, fy);
    if (dFrame > 0.0) {
      if (dFrame < 3.0 * px) {
        let a = ss(3.0 * px, 0.5 * px, dFrame);
        col = mix(col, BRASS * (0.35 + 0.65 * actv), a * 0.8);
      }
      continue;
    }
    // inside the crossbar
    let row = u32(ly);
    let colIdx = colStart + u32(lx);
    let ls = loadState(g, row, colIdx);
    var c: Ctx;
    c.g = g; c.row = row; c.col = colIdx;
    c.fill = ls.x; c.front = ls.y; c.actv = actv;
    c.head = act[actOff + row];
    c.outflow = act[actOff + rows + colIdx] / amax;

    var shade = vec3f(0.0);
    let tFar = ss(2.0, 7.0, px);
    let tNear = ss(0.75, 0.32, px);
    if (tFar > 0.0) { shade = farColor(wpos, c); }
    if (tFar < 1.0) {
      let gv = valveOpening(g, row, colIdx);
      var near = vec3f(0.0);
      if (tNear > 0.0) {
        near = tankColor(fr, gv, c, 1.0 / px, hash21(cell), f32(cell.x % 1024), f32(cell.y % 1024));
      }
      var mid = vec3f(0.0);
      if (tNear < 1.0) { mid = midColor(fr, gv, c); }
      let detailCol = mix(mid, near, tNear);
      shade = mix(detailCol, shade, tFar);
    }
    // activity glow at hall scale: columns light up with their outflow
    let colGlow = abs(c.outflow) * actv * ss(0.6, 3.0, px);
    let pulse = 0.65 + 0.35 * sin(wpos.y * 0.02 - u.time * 5.0);
    shade = shade + waterColor(c.outflow) * colGlow * 0.55 * pulse;
    // faint tile seams (each 64×64 tile is one physical crossbar module)
    let tileEdge = min(min(f32(lx % 64) + fr.x, 64.0 - f32(lx % 64) - fr.x), min(f32(ly % 64) + fr.y, 64.0 - f32(ly % 64) - fr.y));
    shade = shade + vec3f(0.08, 0.11, 0.15) * ss(px * 1.0, 0.0, tileEdge) * ss(48.0, 6.0, px) * ss(0.08, 0.3, px);
    // hover outline
    if (u.hoverGrid >= 0 && cell.x == u.hover.x && cell.y == u.hover.y) {
      let e = min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y));
      shade = shade + BRASS * ss(px * 2.5, 0.0, e) * 0.9;
    }
    col = shade;
    break;
  }
  // vignette + gentle tone map
  let v = length(pix / u.res);
  col = col * (1.0 - 0.35 * v * v);
  col = col / (1.0 + col * 0.35);
  return vec4f(pow(col, vec3f(0.92)), 1.0);
}
`

/** Downsample one mip level into the next (box filter via a linear sample). */
export const MIP_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VO;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  return textureSampleLevel(src, samp, i.uv, 0.0);
}
`
