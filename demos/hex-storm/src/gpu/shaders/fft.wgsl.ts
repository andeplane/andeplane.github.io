/**
 * One-dimensional FFT along rows or columns of an N×N complex array, one workgroup per
 * line, the whole line in shared memory. Four variants make up a Poisson solve:
 *
 *   rows  forward  : real ζ  → complex A
 *   cols  forward  : A → A, then multiply by 1/λ(kx,ky) (FD Laplacian eigenvalues)
 *   rows  inverse  : A → A  (scaled by 1/N)
 *   cols  inverse  : A → real ψ (scaled by 1/N)
 */
export interface FftVariant {
  axis: 'rows' | 'cols';
  inverse: boolean;
  inputReal: boolean;
  outputReal: boolean;
  poisson: boolean;
}

export const FFT_WORKGROUP = 256;

export function fftShader(n: number, v: FftVariant): string {
  const logn = Math.log2(n);
  if (!Number.isInteger(logn)) throw new Error('N must be a power of two');
  const sign = v.inverse ? '1.0' : '-1.0';
  const scale = v.inverse ? `1.0 / ${n}.0` : '1.0';

  const load = v.inputReal
    ? `return vec2f(inReal[${v.axis === 'rows' ? 'line * N + i' : 'i * N + line'}], 0.0);`
    : `return inC[${v.axis === 'rows' ? 'line * N + i' : 'i * N + line'}];`;
  const store = v.outputReal
    ? `outReal[${v.axis === 'rows' ? 'line * N + i' : 'i * N + line'}] = value.x;`
    : `outC[${v.axis === 'rows' ? 'line * N + i' : 'i * N + line'}] = value;`;

  const inBinding = v.inputReal
    ? `@group(0) @binding(0) var<storage, read> inReal: array<f32>;`
    : `@group(0) @binding(0) var<storage, read> inC: array<vec2f>;`;
  const outBinding = v.outputReal
    ? `@group(0) @binding(1) var<storage, read_write> outReal: array<f32>;`
    : `@group(0) @binding(1) var<storage, read_write> outC: array<vec2f>;`;

  // Eigenvalue of the 5-point Laplacian for wavenumber (kx, ky); the poisson pass runs on
  // columns, so `line` is kx and `i` is ky. dx = 2/N.
  const poisson = v.poisson
    ? `
    let dx = 2.0 / ${n}.0;
    let lx = (2.0 - 2.0 * cos(6.283185307179586 * f32(line) / ${n}.0)) / (dx * dx);
    let ly = (2.0 - 2.0 * cos(6.283185307179586 * f32(i) / ${n}.0)) / (dx * dx);
    let eig = -(lx + ly);
    if (line == 0u && i == 0u) { value = vec2f(0.0); } else { value = value / eig; }`
    : '';

  return /* wgsl */ `
const N: u32 = ${n}u;
const LOGN: u32 = ${logn}u;
const WG: u32 = ${FFT_WORKGROUP}u;
const PI: f32 = 3.14159265358979;

${inBinding}
${outBinding}

var<workgroup> buf: array<vec2f, N>;

fn load(line: u32, i: u32) -> vec2f { ${load} }
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

@compute @workgroup_size(WG)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let line = wg.x;
  // Bit-reversed load.
  for (var i = lid.x; i < N; i += WG) {
    let src = reverseBits(i) >> (32u - LOGN);
    buf[i] = load(line, src);
  }
  workgroupBarrier();
  // Cooley–Tukey butterflies, in place. Each butterfly touches a disjoint pair.
  for (var s = 1u; s < N; s = s << 1u) {
    for (var j = lid.x; j < N / 2u; j += WG) {
      let grp = j / s;
      let k = j - grp * s;
      let i0 = grp * 2u * s + k;
      let i1 = i0 + s;
      let ang = ${sign} * PI * f32(k) / f32(s);
      let w = vec2f(cos(ang), sin(ang));
      let t = cmul(w, buf[i1]);
      let a = buf[i0];
      buf[i0] = a + t;
      buf[i1] = a - t;
    }
    workgroupBarrier();
  }
  for (var i = lid.x; i < N; i += WG) {
    var value = buf[i] * ${scale};
    ${poisson}
    ${store}
  }
}
`;
}
