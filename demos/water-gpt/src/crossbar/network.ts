/**
 * The hydraulic network of one physical crossbar tile.
 *
 * R row manifolds run horizontally, C collector columns run vertically. Row i is fed at its
 * left end from a reservoir held at head s_i; it then passes every column, and at crossing
 * (i, j) a valve of hydraulic conductance g_ij (laminar Hagen–Poiseuille flow through a thin
 * pipe, q = g·Δh) lets water from the row manifold into column j. Each column runs downward
 * and drains at the bottom into a collector held at zero head. All flow is laminar, so the
 * whole network is linear: Kirchhoff's current law at every junction (mass conservation),
 * with flow = conductance × head difference on every pipe.
 *
 * Non-ideality: the manifolds themselves are pipes with a small resistance r per segment
 * (between neighbouring crossings, and from the last crossing to the collector). In the
 * ideal limit r → 0 every valve sees the full reservoir head and column outflow is
 * exactly Σ_i g_ij s_i. With r > 0 the head sags along each row and builds up along each
 * column — the hydraulic twin of IR drop in a resistive memory crossbar.
 *
 * Units are normalised: valve conductance g ∈ [0, 1] (fully open = 1), heads in [0, 1].
 * The dimensionless manifold resistance is λ = r · g_max.
 */

export interface NetworkSolution {
  /** Head at every row-manifold node a[i*C + j]. */
  a: Float64Array;
  /** Head at every column node b[i*C + j]. */
  b: Float64Array;
  /** Column outflow into each collector. */
  q: Float64Array;
  sweeps: number;
  residual: number;
}

export class CrossbarNetwork {
  /** Valve conductances, row-major [R × C]. */
  readonly g: Float64Array;
  private scratchD: Float64Array;
  private scratchR: Float64Array;
  private scratchC: Float64Array;

  constructor(
    readonly R: number,
    readonly C: number,
    g: ArrayLike<number>,
    /** Manifold segment resistance λ (0 = ideal). */
    readonly lambda: number,
  ) {
    this.g = Float64Array.from(g);
    const n = Math.max(R, C);
    this.scratchD = new Float64Array(n);
    this.scratchR = new Float64Array(n);
    this.scratchC = new Float64Array(n);
  }

  /** Ideal crossbar: column outflow q_j = Σ_i g_ij s_i. */
  idealOutflow(s: ArrayLike<number>, out: Float64Array = new Float64Array(this.C)): Float64Array {
    const { R, C, g } = this;
    out.fill(0);
    for (let i = 0; i < R; i++) {
      const si = s[i];
      if (si === 0) continue;
      const off = i * C;
      for (let j = 0; j < C; j++) out[j] += g[off + j] * si;
    }
    return out;
  }

  /**
   * Solve the full network for reservoir heads s by alternating line relaxation: each row
   * manifold is a tridiagonal (chain) system given the column heads, and each column is a
   * chain given the row heads. Both line solves are exact (Thomas algorithm); alternating
   * them converges quickly while λ·(R + C)² is modest, which is also the regime where a
   * crossbar is useful at all.
   */
  solve(s: ArrayLike<number>, tol = 1e-12, maxSweeps = 400, warm?: NetworkSolution): NetworkSolution {
    const { R, C, g } = this;
    const N = R * C;
    const a = warm ? warm.a : new Float64Array(N);
    const b = warm ? warm.b : new Float64Array(N);
    const q = new Float64Array(C);
    if (this.lambda <= 0) {
      for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) a[i * C + j] = s[i];
      b.fill(0);
      this.idealOutflow(s, q);
      return { a, b, q, sweeps: 0, residual: 0 };
    }
    if (!warm) for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) a[i * C + j] = s[i];
    const c = 1 / this.lambda;
    const d = this.scratchD;
    const rhs = this.scratchR;
    const cp = this.scratchC;
    let sweeps = 0;
    let change = Infinity;
    let scale = 0;
    for (let i = 0; i < R; i++) scale = Math.max(scale, Math.abs(s[i]));
    if (scale === 0) {
      a.fill(0);
      b.fill(0);
      return { a, b, q, sweeps: 0, residual: 0 };
    }
    while (sweeps < maxSweeps && change > tol * scale) {
      change = 0;
      // Rows: node j couples to j−1 (or the reservoir at j = 0) and j+1 (dead end at C−1).
      for (let i = 0; i < R; i++) {
        const off = i * C;
        for (let j = 0; j < C; j++) {
          const gij = g[off + j];
          d[j] = c + (j < C - 1 ? c : 0) + gij;
          rhs[j] = gij * b[off + j] + (j === 0 ? c * s[i] : 0);
        }
        // Thomas algorithm with constant off-diagonal −c.
        cp[0] = -c / d[0];
        rhs[0] = rhs[0] / d[0];
        for (let j = 1; j < C; j++) {
          const m = d[j] + c * cp[j - 1];
          cp[j] = -c / m;
          rhs[j] = (rhs[j] + c * rhs[j - 1]) / m;
        }
        for (let j = C - 1; j >= 0; j--) {
          const v = j === C - 1 ? rhs[j] : rhs[j] - cp[j] * a[off + j + 1];
          const dv = Math.abs(v - a[off + j]);
          if (dv > change) change = dv;
          a[off + j] = v;
        }
      }
      // Columns: node i couples to i−1 (dead end at 0) and i+1 (the collector at R−1).
      for (let j = 0; j < C; j++) {
        for (let i = 0; i < R; i++) {
          const gij = g[i * C + j];
          d[i] = (i > 0 ? c : 0) + c + gij;
          rhs[i] = gij * a[i * C + j];
        }
        cp[0] = -c / d[0];
        rhs[0] = rhs[0] / d[0];
        for (let i = 1; i < R; i++) {
          const m = d[i] + c * cp[i - 1];
          cp[i] = -c / m;
          rhs[i] = (rhs[i] + c * rhs[i - 1]) / m;
        }
        for (let i = R - 1; i >= 0; i--) {
          const v = i === R - 1 ? rhs[i] : rhs[i] - cp[i] * b[(i + 1) * C + j];
          const dv = Math.abs(v - b[i * C + j]);
          if (dv > change) change = dv;
          b[i * C + j] = v;
        }
      }
      sweeps++;
    }
    for (let j = 0; j < C; j++) q[j] = b[(R - 1) * C + j] * c;
    return { a, b, q, sweeps, residual: change / scale };
  }

  /**
   * The as-built transfer matrix T [C × R]: column outflow per unit head on each reservoir.
   * The network is linear, so by superposition q = T s for any heads s. It is found by
   * solving the full network once per reservoir (unit head on that row, zero elsewhere) —
   * "commissioning" the tile — after which every multiply is exact for this network.
   */
  transferMatrix(): Float64Array {
    const { R, C } = this;
    const T = new Float64Array(C * R);
    const s = new Float64Array(R);
    for (let i = 0; i < R; i++) {
      s.fill(0);
      s[i] = 1;
      const sol = this.solve(s, 1e-11);
      for (let j = 0; j < C; j++) T[j * R + i] = sol.q[j];
    }
    return T;
  }

  /** Flow through each pipe segment and valve, for drawing. */
  segmentFlows(sol: NetworkSolution): { row: Float32Array; col: Float32Array; valve: Float32Array } {
    const { R, C, g } = this;
    const row = new Float32Array(R * C);
    const col = new Float32Array(R * C);
    const valve = new Float32Array(R * C);
    for (let i = 0; i < R; i++)
      for (let j = 0; j < C; j++) valve[i * C + j] = g[i * C + j] * (sol.a[i * C + j] - sol.b[i * C + j]);
    // Row segment entering node j carries everything that leaves through valves j..C−1.
    for (let i = 0; i < R; i++) {
      let acc = 0;
      for (let j = C - 1; j >= 0; j--) {
        acc += valve[i * C + j];
        row[i * C + j] = acc;
      }
    }
    // Column segment leaving node i downward carries everything entering through valves 0..i.
    for (let j = 0; j < C; j++) {
      let acc = 0;
      for (let i = 0; i < R; i++) {
        acc += valve[i * C + j];
        col[i * C + j] = acc;
      }
    }
    return { row, col, valve };
  }
}

/** Dense direct solve of the same network (Gaussian elimination) — a test oracle. */
export function denseSolve(R: number, C: number, g: ArrayLike<number>, lambda: number, s: ArrayLike<number>): Float64Array {
  const N = 2 * R * C;
  const A = new Float64Array(N * N);
  const rhs = new Float64Array(N);
  const c = 1 / lambda;
  const A_ = (r: number, k: number, v: number) => (A[r * N + k] += v);
  const ai = (i: number, j: number) => i * C + j;
  const bi = (i: number, j: number) => R * C + i * C + j;
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++) {
      const gij = g[i * C + j];
      const ra = ai(i, j);
      A_(ra, ra, gij);
      A_(ra, bi(i, j), -gij);
      if (j === 0) {
        A_(ra, ra, c);
        rhs[ra] += c * s[i];
      } else {
        A_(ra, ra, c);
        A_(ra, ai(i, j - 1), -c);
      }
      if (j < C - 1) {
        A_(ra, ra, c);
        A_(ra, ai(i, j + 1), -c);
      }
      const rb = bi(i, j);
      A_(rb, rb, gij);
      A_(rb, ra, -gij);
      if (i > 0) {
        A_(rb, rb, c);
        A_(rb, bi(i - 1, j), -c);
      }
      A_(rb, rb, c);
      if (i < R - 1) A_(rb, bi(i + 1, j), -c);
    }
  // Gaussian elimination with partial pivoting.
  for (let k = 0; k < N; k++) {
    let p = k;
    for (let r = k + 1; r < N; r++) if (Math.abs(A[r * N + k]) > Math.abs(A[p * N + k])) p = r;
    if (p !== k) {
      for (let t = 0; t < N; t++) {
        const tmp = A[k * N + t];
        A[k * N + t] = A[p * N + t];
        A[p * N + t] = tmp;
      }
      const tmp = rhs[k];
      rhs[k] = rhs[p];
      rhs[p] = tmp;
    }
    for (let r = k + 1; r < N; r++) {
      const f = A[r * N + k] / A[k * N + k];
      if (f === 0) continue;
      for (let t = k; t < N; t++) A[r * N + t] -= f * A[k * N + t];
      rhs[r] -= f * rhs[k];
    }
  }
  const x = new Float64Array(N);
  for (let k = N - 1; k >= 0; k--) {
    let v = rhs[k];
    for (let t = k + 1; t < N; t++) v -= A[k * N + t] * x[t];
    x[k] = v / A[k * N + k];
  }
  const q = new Float64Array(C);
  for (let j = 0; j < C; j++) q[j] = x[bi(R - 1, j)] * c;
  return q;
}
