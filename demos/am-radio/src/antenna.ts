/**
 * Thin-wire method of moments for a straight, center-fed dipole.
 *
 * Solves the electric-field integral equation (Maxwell's equations in integral
 * form) on the wire with pulse current expansion and point matching, following
 * Harrington, "Field Computation by Moment Methods", chapter 4. The wire is a
 * perfect conductor of length `length` and radius `radius`, divided into an odd
 * number of equal segments; the feed gap is the central segment.
 *
 * From the solved current distribution the receiving-antenna port is derived:
 * input impedance, open-circuit voltage for a broadside plane wave, effective
 * height by reciprocity, induced charge distribution and radiation resistance.
 * Nothing about the port is prescribed except the wire geometry.
 *
 * SI units, e^{+jωt} time convention. Complex numbers are (re, im) pairs.
 */
export const C0 = 299792458;
export const MU0 = 1.25663706212e-6;
export const EPS0 = 8.8541878128e-12;
export const ETA0 = Math.sqrt(MU0 / EPS0);
export type Wire = { length: number; radius: number; segments: number };
/** Copper conductivity for the skin-effect loss estimate (S/m). */
export const COPPER = 5.8e7;

// 8-point Gauss–Legendre on [-1, 1].
const GX = [
  -0.9602898564975363, -0.7966664774136267, -0.525532409916329,
  -0.1834346424956498, 0.1834346424956498, 0.525532409916329,
  0.7966664774136267, 0.9602898564975363,
];
const GW = [
  0.1012285362903763, 0.2223810344533745, 0.3137066458778873,
  0.3626837833783620, 0.3626837833783620, 0.3137066458778873,
  0.2223810344533745, 0.1012285362903763,
];
/**
 * ψ = (1/ℓ) ∫_{z1}^{z2} e^{-jkR}/(4πR) dz',  R = sqrt((z - z')² + a²).
 * The static 1/R part is integrated analytically (it is sharply peaked when the
 * segment is much longer than the wire radius); the smooth remainder
 * (e^{-jkR} - 1)/R is integrated with Gauss–Legendre quadrature.
 */
function psi(z: number, z1: number, z2: number, a: number, k: number) {
  const l = z2 - z1;
  const stat = Math.asinh((z - z1) / a) - Math.asinh((z - z2) / a);
  let re = 0,
    im = 0;
  const mid = (z1 + z2) / 2,
    half = l / 2;
  for (let g = 0; g < 8; g++) {
    const zp = mid + half * GX[g];
    const R = Math.hypot(z - zp, a);
    const kr = k * R;
    // (e^{-jkR} - 1)/R, written to avoid cancellation for small kR.
    const c = Math.cos(kr) - 1,
      s = -Math.sin(kr);
    re += (GW[g] * half * c) / R;
    im += (GW[g] * half * s) / R;
  }
  return [(stat + re) / (4 * Math.PI * l), im / (4 * Math.PI * l)];
}
/** Solve the complex system A x = b in place (Gaussian elimination with partial pivoting). */
function solveComplex(
  n: number,
  ar: Float64Array,
  ai: Float64Array,
  br: Float64Array,
  bi: Float64Array,
) {
  for (let c = 0; c < n; c++) {
    let p = c,
      best = -1;
    for (let r = c; r < n; r++) {
      const m = ar[r * n + c] ** 2 + ai[r * n + c] ** 2;
      if (m > best) {
        best = m;
        p = r;
      }
    }
    if (p !== c) {
      for (let j = 0; j < n; j++) {
        let t = ar[c * n + j];
        ar[c * n + j] = ar[p * n + j];
        ar[p * n + j] = t;
        t = ai[c * n + j];
        ai[c * n + j] = ai[p * n + j];
        ai[p * n + j] = t;
      }
      let t = br[c];
      br[c] = br[p];
      br[p] = t;
      t = bi[c];
      bi[c] = bi[p];
      bi[p] = t;
    }
    const pr = ar[c * n + c],
      pi = ai[c * n + c],
      d = pr * pr + pi * pi;
    for (let r = c + 1; r < n; r++) {
      const xr = ar[r * n + c],
        xi = ai[r * n + c];
      if (!xr && !xi) continue;
      // f = x / pivot
      const fr = (xr * pr + xi * pi) / d,
        fi = (xi * pr - xr * pi) / d;
      for (let j = c; j < n; j++) {
        const yr = ar[c * n + j],
          yi = ai[c * n + j];
        ar[r * n + j] -= fr * yr - fi * yi;
        ai[r * n + j] -= fr * yi + fi * yr;
      }
      br[r] -= fr * br[c] - fi * bi[c];
      bi[r] -= fr * bi[c] + fi * br[c];
    }
  }
  const xr = new Float64Array(n),
    xi = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sr = br[r],
      si = bi[r];
    for (let j = r + 1; j < n; j++) {
      sr -= ar[r * n + j] * xr[j] - ai[r * n + j] * xi[j];
      si -= ar[r * n + j] * xi[j] + ai[r * n + j] * xr[j];
    }
    const pr = ar[r * n + r],
      pi = ai[r * n + r],
      d = pr * pr + pi * pi;
    xr[r] = (sr * pr + si * pi) / d;
    xi[r] = (si * pr - sr * pi) / d;
  }
  return [xr, xi];
}
/**
 * Impedance matrix Z_mn (Harrington eq. 4-26): the vector-potential term of the
 * current pulse on segment n observed at the center of segment m, plus the
 * scalar-potential difference across segment m produced by the charge pulses
 * that the current step at each end of segment n implies. The two end charge
 * pulses are half segments, which enforces zero current at the wire ends.
 */
export function impedanceMatrix(wire: Wire, frequency: number) {
  const { length: L, radius: a, segments: N } = wire;
  if (N % 2 === 0 || N < 3) throw Error("segments must be odd and at least 3");
  const w = 2 * Math.PI * frequency,
    k = w / C0,
    d = L / N;
  const zc = (n: number) => -L / 2 + (n + 0.5) * d;
  // Shifted (charge) segment j runs from center j-1 to center j; j=0 and j=N are half length.
  const q1 = (j: number) => (j === 0 ? -L / 2 : zc(j - 1));
  const q2 = (j: number) => (j === N ? L / 2 : zc(j));
  const zr = new Float64Array(N * N),
    zi = new Float64Array(N * N);
  // Cache the potential of every charge pulse at every segment end point.
  const pr = new Float64Array((N + 1) * (N + 1)),
    pi = new Float64Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++)
    for (let e = 0; e <= N; e++) {
      const [r, i] = psi(-L / 2 + e * d, q1(j), q2(j), a, k);
      pr[j * (N + 1) + e] = r;
      pi[j * (N + 1) + e] = i;
    }
  for (let m = 0; m < N; m++)
    for (let n = 0; n < N; n++) {
      const [ar, ai] = psi(zc(m), zc(n) - d / 2, zc(n) + d / 2, a, k);
      // jωμ d² ψ
      let re = -w * MU0 * d * d * ai,
        im = w * MU0 * d * d * ar;
      // (1/jωε)[ψ(n+,m+) - ψ(n+,m-) - ψ(n-,m+) + ψ(n-,m-)], n+ = pulse n+1, n- = pulse n; m± = ends m+1, m.
      const br =
        pr[(n + 1) * (N + 1) + m + 1] -
        pr[(n + 1) * (N + 1) + m] -
        pr[n * (N + 1) + m + 1] +
        pr[n * (N + 1) + m];
      const bi =
        pi[(n + 1) * (N + 1) + m + 1] -
        pi[(n + 1) * (N + 1) + m] -
        pi[n * (N + 1) + m + 1] +
        pi[n * (N + 1) + m];
      // 1/(jωε) = -j/(ωε)
      re += bi / (w * EPS0);
      im -= br / (w * EPS0);
      zr[m * N + n] = re;
      zi[m * N + n] = im;
    }
  return { zr, zi, d, N };
}
export type Excitation = { gap?: [number, number]; field?: [number, number] };
/**
 * Solve for the segment currents. `gap` is a delta-gap generator voltage at the
 * center segment; `field` is the tangential incident electric field (uniform
 * along the wire, i.e. broadside incidence on an electrically short wire; the
 * polarization angle is applied by the caller). `load` is a lumped impedance
 * inserted in the feed gap. Returns currents and the feed current index.
 */
export function solveCurrents(
  wire: Wire,
  frequency: number,
  excitation: Excitation,
  load: [number, number] = [0, 0],
) {
  const { zr, zi, d, N } = impedanceMatrix(wire, frequency);
  const c = (N - 1) / 2;
  const ar = zr.slice(),
    ai = zi.slice();
  ar[c * N + c] += load[0];
  ai[c * N + c] += load[1];
  const br = new Float64Array(N),
    bi = new Float64Array(N);
  if (excitation.field) {
    for (let m = 0; m < N; m++) {
      br[m] = excitation.field[0] * d;
      bi[m] = excitation.field[1] * d;
    }
  }
  if (excitation.gap) {
    br[c] += excitation.gap[0];
    bi[c] += excitation.gap[1];
  }
  const [ir, ii] = solveComplex(N, ar, ai, br, bi);
  return { ir, ii, feed: c, d, N };
}
const cdiv = (ar: number, ai: number, br: number, bi: number) => {
  const d = br * br + bi * bi;
  return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
};
const cmul = (ar: number, ai: number, br: number, bi: number) => [
  ar * br - ai * bi,
  ar * bi + ai * br,
];
/** Frequency-domain antenna characterization at one frequency. */
export function analyze(wire: Wire, frequency: number) {
  const tx = solveCurrents(wire, frequency, { gap: [1, 0] });
  const [zr, zi] = cdiv(1, 0, tx.ir[tx.feed], tx.ii[tx.feed]);
  // Reciprocity: h_eff = (1/I_feed) ∫ I(z) dz for the transmitting distribution.
  let sr = 0,
    si = 0;
  for (let n = 0; n < tx.N; n++) {
    sr += tx.ir[n] * tx.d;
    si += tx.ii[n] * tx.d;
  }
  const [hr, hi] = cdiv(sr, si, tx.ir[tx.feed], tx.ii[tx.feed]);
  // Receiving: short-circuit current for a 1 V/m tangential field, V_oc = Z_in I_sc.
  const rx = solveCurrents(wire, frequency, { field: [1, 0] });
  const [vr, vi] = cmul(zr, zi, rx.ir[rx.feed], rx.ii[rx.feed]);
  // Open-circuit receiving current distribution → induced charge on the wire.
  const oc = solveCurrents(wire, frequency, { field: [1, 0] }, [1e15, 0]);
  const w = 2 * Math.PI * frequency;
  // Line charge from continuity, ρ = -(1/jω) dI/dz. For a real excitation the
  // quasi-static current is in quadrature, so the in-phase charge is
  // -Im(dI/dz)/ω; the current step between pulses is spread over the charge pulse.
  const lineCharge = (ir: Float64Array, ii: Float64Array, N: number, d: number) => {
    const rho = new Float64Array(N + 1);
    for (let j = 0; j <= N; j++) {
      const prev = j === 0 ? 0 : ii[j - 1];
      const next = j === N ? 0 : ii[j];
      const l = j === 0 || j === N ? d / 2 : d;
      rho[j] = -(next - prev) / (w * l);
    }
    void ir;
    return rho;
  };
  const charge = lineCharge(oc.ir, oc.ii, oc.N, oc.d);
  const transmittingCharge = lineCharge(tx.ir, tx.ii, tx.N, tx.d);
  const transmitting = new Float64Array(tx.N);
  for (let n = 0; n < tx.N; n++)
    transmitting[n] =
      Math.hypot(tx.ir[n], tx.ii[n]) / Math.hypot(tx.ir[tx.feed], tx.ii[tx.feed]);
  return {
    frequency,
    impedance: [zr, zi] as [number, number],
    effectiveHeight: [hr, hi] as [number, number],
    /** Open-circuit voltage per V/m of tangential incident field, from the receiving solve. */
    openCircuit: [vr, vi] as [number, number],
    /** Induced charge per unit length (C/m) per V/m for the open-circuited antenna, at segment ends. */
    charge,
    /** Charge per unit length (C/m) per volt of feed-gap voltage (transmitting mode), at segment ends. */
    transmittingCharge,
    /** Normalized transmitting current distribution |I(z)/I_feed| at segment centers. */
    transmitting,
    feedCurrentPerVoltPerMetre: [rx.ir[rx.feed], rx.ii[rx.feed]] as [
      number,
      number,
    ],
  };
}
/** Skin-effect resistance of a copper wire referred to the feed for a triangular current distribution. */
export function ohmicResistance(wire: Wire, frequency: number) {
  const rs = Math.sqrt((Math.PI * frequency * MU0) / COPPER);
  return (rs * wire.length) / (2 * Math.PI * wire.radius) / 3;
}
/** Analytic short-dipole radiation resistance (triangular current), for comparison. */
export const shortDipoleRadiationResistance = (length: number, frequency: number) =>
  20 * Math.PI ** 2 * ((length * frequency) / C0) ** 2;
/**
 * Port model used by the time-domain receiver: for an electrically short wire
 * the input impedance is a capacitance in series with a small resistance and
 * the effective height is real and frequency independent. Everything here is
 * evaluated from the moment-method solution at the given frequencies; the
 * returned spread quantifies how good the frequency-independent approximation is.
 */
export function antennaPort(wire: Wire, frequencies: number[], center: number) {
  const rows = frequencies.map((f) => {
    const r = analyze(wire, f);
    const w = 2 * Math.PI * f;
    return {
      frequency: f,
      resistance: r.impedance[0],
      capacitance: -1 / (w * r.impedance[1]),
      effectiveHeight: r.effectiveHeight[0],
      openCircuit: r.openCircuit[0],
      charge: r.charge,
      transmitting: r.transmitting,
    };
  });
  const at = analyze(wire, center);
  const wc = 2 * Math.PI * center;
  const capacitance = -1 / (wc * at.impedance[1]);
  const heights = rows.map((r) => r.effectiveHeight);
  const caps = rows.map((r) => r.capacitance);
  const spread = (a: number[]) =>
    (Math.max(...a) - Math.min(...a)) / Math.abs(a.reduce((x, y) => x + y) / a.length);
  return {
    wire,
    center,
    capacitance,
    radiationResistance: at.impedance[0],
    ohmicResistance: ohmicResistance(wire, center),
    resistance: at.impedance[0] + ohmicResistance(wire, center),
    effectiveHeight: at.effectiveHeight[0],
    charge: at.charge,
    transmittingCharge: at.transmittingCharge,
    transmitting: at.transmitting,
    rows,
    heightSpread: spread(heights),
    capacitanceSpread: spread(caps),
  };
}
export type AntennaPort = ReturnType<typeof antennaPort>;
