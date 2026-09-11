// Periodic domain [0, 1)^2. Real Fourier basis; direct DFT for clarity.
export const modes = Array.from({ length: 5 }, (_, x) =>
  Array.from({ length: 9 }, (_, j) => [x, j - 4] as const),
)
  .flat()
  .filter(([x, y]) => x > 0 || y > 0);
export type Coeff = { c: number; s: number }[];
export function coefficients(seed: number): Coeff {
  // The same identifiable walkthrough field is used across all lessons.
  if (seed === 42)
    return modes.map(([x, y]) => ({
      c: x === 1 && y === 0 ? 0.65 : x === 3 && y === 0 ? 0.2 : 0,
      s: x === 0 && y === 2 ? 0.35 : 0,
    }));
  let state = seed;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
  return modes.map(([x, y]) => ({
    c: rand() / (1 + 0.3 * (x * x + y * y)),
    s: rand() / (1 + 0.3 * (x * x + y * y)),
  }));
}
export function multiplier(k: number, nu: number, t: number) {
  const [x, y] = modes[k];
  return Math.exp(-4 * Math.PI ** 2 * nu * t * (x * x + y * y));
}
export function field(a: Coeff, n: number, w?: number[], retained = 4) {
  return Array.from({ length: n * n }, (_, i) => {
    const x = (i % n) / n,
      y = Math.floor(i / n) / n;
    let u = 0;
    for (let k = 0; k < modes.length; k++) {
      const [kx, ky] = modes[k];
      if (Math.max(kx, Math.abs(ky)) > retained) continue;
      const p = 2 * Math.PI * (kx * x + ky * y);
      u += (a[k].c * Math.cos(p) + a[k].s * Math.sin(p)) * (w?.[k] ?? 1);
    }
    return u;
  });
}
export function project(u: number[], n: number): Coeff {
  return modes.map(([kx, ky]) => {
    let c = 0,
      s = 0;
    u.forEach((v, i) => {
      const p =
        2 * Math.PI * ((kx * (i % n)) / n + (ky * Math.floor(i / n)) / n);
      c += (v * Math.cos(p) * 2) / u.length;
      s += (v * Math.sin(p) * 2) / u.length;
    });
    return { c, s };
  });
}
export function dataset(nu: number, t: number) {
  return Array.from({ length: 24 }, (_, j) => {
    const inputPixels = spatialField(100 + j, 16);
    const targetPixels = spatialField(100 + j, 16, t, nu);
    return {
      inputPixels,
      targetPixels,
      x: project(inputPixels, 16),
      y: project(targetPixels, 16),
    };
  });
}

export function trainStep(
  w: number[],
  data: ReturnType<typeof dataset>,
  lr = 20,
) {
  const next = [...w];
  let loss = 0;
  for (let k = 0; k < w.length; k++) {
    let grad = 0;
    for (const { x, y } of data) {
      const dc = w[k] * x[k].c - y[k].c,
        ds = w[k] * x[k].s - y[k].s;
      grad += dc * x[k].c + ds * x[k].s;
      loss += (dc * dc + ds * ds) / 2;
    }
    next[k] -= (lr * grad) / data.length;
  }
  return { weights: next, loss: loss / (data.length * w.length) };
}
export function relativeError(pred: number[], truth: number[]) {
  return Math.sqrt(
    pred.reduce((s, v, i) => s + (v - truth[i]) ** 2, 0) /
      Math.max(
        1e-15,
        truth.reduce((s, v) => s + v * v, 0),
      ),
  );
}
export function interpolate(
  u: number[],
  n: number,
  out: number,
  nearest = false,
) {
  return Array.from({ length: out * out }, (_, i) => {
    const x = ((i % out) * n) / out,
      y = (Math.floor(i / out) * n) / out;
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    const at = (a: number, b: number) => u[((b + n) % n) * n + ((a + n) % n)];
    return nearest
      ? at(Math.round(x), Math.round(y))
      : at(ix, iy) * (1 - fx) * (1 - fy) +
          at(ix + 1, iy) * fx * (1 - fy) +
          at(ix, iy + 1) * (1 - fx) * fy +
          at(ix + 1, iy + 1) * fx * fy;
  });
}
export function color(v: number): [number, number, number] {
  const stops = [
    [14, 25, 65],
    [33, 75, 167],
    [29, 163, 181],
    [122, 218, 176],
    [245, 223, 126],
    [255, 128, 82],
  ];
  const t = Math.max(0, Math.min(0.9999, (v + 1.7) / 3.4)) * (stops.length - 1),
    i = Math.floor(t),
    f = t - i;
  return stops[i].map((a, j) => Math.round(a + (stops[i + 1][j] - a) * f)) as [
    number,
    number,
    number,
  ];
}

// Independent spatial generator: localized Gaussian hot/cold spots.
// Periodic image sums define the field, not a truncated Fourier series.
export function spots(seed: number) {
  if (seed === 42)
    return [
      { x: 0.32, y: 0.38, sigma: 0.065, amplitude: 1.5 },
      { x: 0.71, y: 0.66, sigma: 0.095, amplitude: -1.1 },
    ];
  let state = seed;
  const r = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: 3 }, (_, i) => ({
    x: r(),
    y: r(),
    sigma: 0.065 + 0.065 * r(),
    amplitude: (i % 2 ? -1 : 1) * (0.8 + 0.9 * r()),
  }));
}
export function spatialField(seed: number, n: number, time = 0, nu = 0.02) {
  const blobs = spots(seed);
  const mean = blobs.reduce(
    (s, b) => s + 2 * Math.PI * b.amplitude * b.sigma * b.sigma,
    0,
  );
  const out = Array<number>(n * n).fill(-mean);
  for (const b of blobs) {
    const variance = b.sigma * b.sigma + 2 * nu * time;
    const periodic = (x: number, center: number) => {
      let sum = 0;
      for (let image = -4; image <= 4; image++)
        sum += Math.exp(-((x - center + image) ** 2) / (2 * variance));
      return sum;
    };
    const xs = Array.from({ length: n }, (_, i) => periodic(i / n, b.x));
    const ys = Array.from({ length: n }, (_, j) => periodic(j / n, b.y));
    const amplitude = (b.amplitude * b.sigma * b.sigma) / variance;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) out[j * n + i] += amplitude * xs[i] * ys[j];
  }
  return out;
}
export const average = (u: number[]) => u.reduce((s, v) => s + v, 0) / u.length;
