/**
 * CPU reference implementation: scalar random-site Metropolis on a small lattice, for
 * cross-checking the GPU numbers. Run with `npm run reference`.
 */

type GeometryKey = 'square' | 'triangular' | 'honeycomb';

const L = 48;
const N = L * L;

function neighbors(g: GeometryKey, x: number, y: number): [number, number][] {
  const xp = (x + 1) % L;
  const xm = (x + L - 1) % L;
  const yp = (y + 1) % L;
  const ym = (y + L - 1) % L;
  switch (g) {
    case 'square':
      return [
        [xp, y],
        [xm, y],
        [x, yp],
        [x, ym],
      ];
    case 'triangular':
      return [
        [xp, y],
        [xm, y],
        [x, yp],
        [x, ym],
        [xp, yp],
        [xm, ym],
      ];
    case 'honeycomb':
      return [
        [xp, y],
        [xm, y],
        [x, (x + y) % 2 === 0 ? yp : ym],
      ];
  }
}

function simulate(g: GeometryKey, T: number, sweepsEquil: number, sweepsMeasure: number) {
  const s = new Int8Array(N).fill(1);
  const beta = 1 / T;
  const sweep = () => {
    for (let k = 0; k < N; k++) {
      const x = Math.floor(Math.random() * L);
      const y = Math.floor(Math.random() * L);
      let nsum = 0;
      for (const [nx, ny] of neighbors(g, x, y)) nsum += s[ny * L + nx];
      const dE = 2 * s[y * L + x] * nsum;
      if (dE <= 0 || Math.random() < Math.exp(-beta * dE)) s[y * L + x] *= -1;
    }
  };
  for (let i = 0; i < sweepsEquil; i++) sweep();
  let sAbsM = 0;
  let sE = 0;
  let samples = 0;
  for (let i = 0; i < sweepsMeasure; i++) {
    sweep();
    if (i % 3 !== 0) continue;
    let m = 0;
    let bonds = 0;
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < L; x++) {
        m += s[y * L + x];
        // Forward bonds only, matching the GPU reduction.
        const xp = (x + 1) % L;
        const yp = (y + 1) % L;
        const v = s[y * L + x];
        if (g === 'square') bonds += v * (s[y * L + xp] + s[yp * L + x]);
        else if (g === 'triangular') bonds += v * (s[y * L + xp] + s[yp * L + x] + s[yp * L + xp]);
        else bonds += v * s[y * L + xp] + ((x + y) % 2 === 0 ? v * s[yp * L + x] : 0);
      }
    }
    sAbsM += Math.abs(m / N);
    sE += -bonds / N;
    samples++;
  }
  return { absM: sAbsM / samples, e: sE / samples };
}

const TEMPS: Record<GeometryKey, number[]> = {
  square: [1.5, 1.8, 2.1, 2.269, 2.6, 3.5],
  triangular: [2.0, 3.0, 3.641, 4.2, 5.0],
  honeycomb: [0.8, 1.2, 1.519, 1.9, 2.5],
};

for (const g of Object.keys(TEMPS) as GeometryKey[]) {
  console.log(`\n${g} (48×48, random-site Metropolis)`);
  console.log('  T        <e>       <|m|>');
  for (const T of TEMPS[g]) {
    const { absM, e } = simulate(g, T, 2000, 3000);
    console.log(`  ${T.toFixed(3).padEnd(8)} ${e.toFixed(4).padEnd(9)} ${absM.toFixed(4)}`);
  }
}
