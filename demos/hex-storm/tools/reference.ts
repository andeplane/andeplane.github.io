/**
 * CPU reference for the GPU solver: same equations, same discretisation, same
 * parameters, in plain TypeScript. Used to check that the hexagon really is a
 * property of the model and to tune the jet width before touching WGSL.
 *
 *   npx tsx tools/reference.ts [N] [T] [jetWidth ...]
 */
import { DEFAULT_PARAMS, spongeRate, stableDt, targetVorticity, type Params } from '../src/sim/params.ts';
import { analyseRing, RING_SAMPLES } from '../src/sim/modes.ts';

// ---------- FFT ----------
function fft1d(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function fft2d(re: Float64Array, im: Float64Array, n: number, inverse: boolean): void {
  const r = new Float64Array(n);
  const c = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    r.set(re.subarray(y * n, y * n + n));
    c.set(im.subarray(y * n, y * n + n));
    fft1d(r, c, inverse);
    re.set(r, y * n);
    im.set(c, y * n);
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      r[y] = re[y * n + x];
      c[y] = im[y * n + x];
    }
    fft1d(r, c, inverse);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = r[y];
      im[y * n + x] = c[y];
    }
  }
}

// ---------- Solver ----------
class Solver {
  n: number;
  dx: number;
  p: Params;
  zeta: Float64Array;
  psi: Float64Array;
  zt: Float64Array; // target vorticity
  sp: Float64Array; // sponge rate
  rx: Float64Array; // x coordinate
  ry: Float64Array;
  eig: Float64Array; // FD Laplacian eigenvalues
  re: Float64Array;
  im: Float64Array;
  t = 0;

  constructor(n: number, p: Params) {
    this.n = n;
    this.dx = 2 / n;
    this.p = p;
    const nn = n * n;
    this.zeta = new Float64Array(nn);
    this.psi = new Float64Array(nn);
    this.zt = new Float64Array(nn);
    this.sp = new Float64Array(nn);
    this.rx = new Float64Array(nn);
    this.ry = new Float64Array(nn);
    this.re = new Float64Array(nn);
    this.im = new Float64Array(nn);
    this.eig = new Float64Array(nn);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const x = -1 + (i + 0.5) * this.dx;
        const y = -1 + (j + 0.5) * this.dx;
        const r = Math.hypot(x, y);
        this.rx[k] = x;
        this.ry[k] = y;
        this.zt[k] = targetVorticity(r, p);
        this.sp[k] = spongeRate(r, p);
        const lx = (2 - 2 * Math.cos((2 * Math.PI * i) / n)) / (this.dx * this.dx);
        const ly = (2 - 2 * Math.cos((2 * Math.PI * j) / n)) / (this.dx * this.dx);
        this.eig[k] = -(lx + ly);
      }
    }
    // Start on the target profile plus seed noise.
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296 - 0.5;
    };
    for (let k = 0; k < nn; k++) this.zeta[k] = this.zt[k] * (1 + p.seedNoise * rnd()) + p.seedNoise * rnd();
  }

  solvePsi(zeta: Float64Array, psi: Float64Array): void {
    const { n, re, im, eig } = this;
    re.set(zeta);
    im.fill(0);
    fft2d(re, im, n, false);
    for (let k = 0; k < n * n; k++) {
      const e = eig[k];
      if (e === 0) {
        re[k] = 0;
        im[k] = 0;
      } else {
        re[k] /= e;
        im[k] /= e;
      }
    }
    fft2d(re, im, n, true);
    psi.set(re);
  }

  /** dζ/dt for the given ζ (ψ solved inside). */
  rhs(zeta: Float64Array, out: Float64Array): void {
    const { n, dx, p, psi } = this;
    this.solvePsi(zeta, psi);
    const d2 = dx * dx;
    for (let j = 0; j < n; j++) {
      const jm = (j + n - 1) % n;
      const jp = (j + 1) % n;
      for (let i = 0; i < n; i++) {
        const im1 = (i + n - 1) % n;
        const ip = (i + 1) % n;
        const c = j * n + i;
        const e = j * n + ip, w = j * n + im1, nn_ = jp * n + i, s = jm * n + i;
        const ne = jp * n + ip, nw = jp * n + im1, se = jm * n + ip, sw = jm * n + im1;
        // Arakawa Jacobian J(ψ, ζ) = ψ_x ζ_y − ψ_y ζ_x
        const j1 =
          (psi[e] - psi[w]) * (zeta[nn_] - zeta[s]) - (psi[nn_] - psi[s]) * (zeta[e] - zeta[w]);
        const j2 =
          psi[e] * (zeta[ne] - zeta[se]) -
          psi[w] * (zeta[nw] - zeta[sw]) -
          psi[nn_] * (zeta[ne] - zeta[nw]) +
          psi[s] * (zeta[se] - zeta[sw]);
        const j3 =
          zeta[nn_] * (psi[ne] - psi[nw]) -
          zeta[s] * (psi[se] - psi[sw]) -
          zeta[e] * (psi[ne] - psi[se]) +
          zeta[w] * (psi[nw] - psi[sw]);
        const jac = (j1 + j2 + j3) / (12 * d2);
        // Velocity u = −ψ_y, v = ψ_x ; radial component for the γ term.
        const u = -(psi[nn_] - psi[s]) / (2 * dx);
        const v = (psi[e] - psi[w]) / (2 * dx);
        const x = this.rx[c];
        const y = this.ry[c];
        const r = Math.max(Math.hypot(x, y), 1e-6);
        const ur = (u * x + v * y) / r;
        const beta = 2 * p.gamma * r * ur;
        const lap = (zeta[e] + zeta[w] + zeta[nn_] + zeta[s] - 4 * zeta[c]) / d2;
        out[c] =
          -jac + beta + p.nu * lap - p.relax * (zeta[c] - this.zt[c]) - this.sp[c] * zeta[c];
      }
    }
  }

  /** SSP-RK3 step. */
  step(dt: number): void {
    const nn = this.n * this.n;
    const z0 = this.zeta;
    const k = new Float64Array(nn);
    const z1 = new Float64Array(nn);
    const z2 = new Float64Array(nn);
    this.rhs(z0, k);
    for (let i = 0; i < nn; i++) z1[i] = z0[i] + dt * k[i];
    this.rhs(z1, k);
    for (let i = 0; i < nn; i++) z2[i] = 0.75 * z0[i] + 0.25 * (z1[i] + dt * k[i]);
    this.rhs(z2, k);
    for (let i = 0; i < nn; i++) z0[i] = (z0[i] + 2 * (z2[i] + dt * k[i])) / 3;
    this.t += dt;
  }

  sample(x: number, y: number): number {
    const { n, dx, zeta } = this;
    const fx = (x + 1) / dx - 0.5;
    const fy = (y + 1) / dx - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const tx = fx - i0, ty = fy - j0;
    const at = (i: number, j: number) => zeta[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    return (
      (1 - tx) * (1 - ty) * at(i0, j0) +
      tx * (1 - ty) * at(i0 + 1, j0) +
      (1 - tx) * ty * at(i0, j0 + 1) +
      tx * ty * at(i0 + 1, j0 + 1)
    );
  }

  ring(): Float64Array {
    const out = new Float64Array(RING_SAMPLES);
    for (let i = 0; i < RING_SAMPLES; i++) {
      const a = (2 * Math.PI * i) / RING_SAMPLES;
      out[i] = this.sample(this.p.jetRadius * Math.cos(a), this.p.jetRadius * Math.sin(a));
    }
    return out;
  }

  maxSpeed(): number {
    const { n, dx, psi } = this;
    let m = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const u = -(psi[((j + 1) % n) * n + i] - psi[((j + n - 1) % n) * n + i]) / (2 * dx);
        const v = (psi[j * n + ((i + 1) % n)] - psi[j * n + ((i + n - 1) % n)]) / (2 * dx);
        m = Math.max(m, Math.hypot(u, v));
      }
    return m;
  }
}

const N = Number(process.argv[2] ?? 128);
const T = Number(process.argv[3] ?? 20);
// Remaining args: key=value overrides of Params, e.g. jetWidth=0.06 relax=1
const overrides: Partial<Params> = {};
for (const arg of process.argv.slice(4)) {
  const [k, v] = arg.split('=');
  (overrides as Record<string, number>)[k] = Number(v);
}

{
  const p = { ...DEFAULT_PARAMS, nu: DEFAULT_PARAMS.nu * (512 / N), ...overrides };
  const w = p.jetWidth;
  const s = new Solver(N, p);
  const dt = stableDt(N, p);
  const t0 = Date.now();
  let next = 0;
  const lines: string[] = [];
  while (s.t < T) {
    s.step(dt);
    if (s.t >= next) {
      const m = analyseRing(s.ring());
      lines.push(
        `t=${s.t.toFixed(1).padStart(5)} m=${m.dominant} purity=${m.purity.toFixed(2)} |u|max=${s.maxSpeed().toFixed(2)} P=[${Array.from(m.power.subarray(1, 10)).map((v) => v.toExponential(1)).join(' ')}]`,
      );
      next += T / 10;
    }
  }
  const m = analyseRing(s.ring());
  console.log(`\n== ${JSON.stringify(overrides)} jetWidth=${w}  N=${N}  dt=${dt.toExponential(2)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(lines.join('\n'));
  console.log(`FINAL m=${m.dominant} purity=${m.purity.toFixed(2)}`);
}
