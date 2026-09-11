/**
 * Prints the fidelity / performance table quoted in README.md. Run with
 *   node --experimental-strip-types scripts/measure.ts
 * Numbers depend on the machine; the README states which machine produced them.
 */
import {
  RadioEngine,
  defaults,
  gapForFrequency,
  PORT,
  ANTENNA,
  CA,
  RA,
  HEFF,
  RP,
  L,
  capacitance,
} from "../src/physics.ts";
import { analyze, shortDipoleRadiationResistance, EPS0, C0 } from "../src/antenna.ts";
import { COURANT_1D, LAYOUT } from "../src/propagation.ts";
import { PML_MAX, PML, DT as DT2, NX, NY } from "../src/field.ts";
const row = (k: string, v: string) => console.log(`| ${k} | ${v} |`);
console.log("| Quantity | Value |\n|---|---|");
const h = ANTENNA.length / 2;
row("Antenna", `${ANTENNA.length} m dipole, radius ${ANTENNA.radius * 1e3} mm, ${ANTENNA.segments} segments`);
row("h_eff (MoM) vs L/2", `${HEFF.toFixed(4)} m vs ${h} m (${((HEFF / h - 1) * 100).toFixed(1)} %)`);
row("C_a (MoM) vs πε₀h/(ln(h/a)−1)", `${(CA * 1e12).toFixed(3)} pF vs ${(((Math.PI * EPS0 * h) / (Math.log(h / ANTENNA.radius) - 1)) * 1e12).toFixed(3)} pF`);
row("R_rad (MoM) vs 20π²(L/λ)² at 900 kHz", `${(PORT.radiationResistance * 1e3).toFixed(2)} mΩ vs ${(shortDipoleRadiationResistance(2, 9e5) * 1e3).toFixed(2)} mΩ`);
row("R_ohm (copper, skin effect, 900 kHz)", `${(PORT.ohmicResistance * 1e3).toFixed(1)} mΩ`);
const xa = 1 / (2 * Math.PI * 9e5 * CA);
row("|X_a| at 900 kHz", `${(xa / 1e3).toFixed(1)} kΩ (R_a/|X_a| = ${(RA / xa).toExponential(1)})`);
row("h_eff, C_a spread over 600–1200 kHz", `${(PORT.heightSpread * 100).toFixed(3)} %, ${(PORT.capacitanceSpread * 100).toFixed(3)} %`);
const lam = C0 / 300e6;
const hw = analyze({ length: 0.47 * lam, radius: 0.001 * lam, segments: 41 }, 300e6);
row("Half-wave dipole check (0.47 λ, a = 0.001 λ)", `Z = ${hw.impedance[0].toFixed(1)} + j${hw.impedance[1].toFixed(1)} Ω (textbook ≈ 73 Ω at resonance)`);
row("Coil Q (R_p/ωL at 900 kHz)", `${(RP / (2 * Math.PI * 9e5 * L)).toFixed(0)}`);
row("Tank C + C_a at 900 kHz", `${((capacitance(gapForFrequency(9e5)) + CA) * 1e12).toFixed(1)} pF`);
const dx1 = C0 / 24576000 / COURANT_1D;
row("1D grid", `${LAYOUT.cells} cells × ${dx1.toFixed(2)} m, S = ${COURANT_1D}, Mur ABC`);
row("1D dispersion at 1200 kHz (Yee relation)", `${(((1 - COURANT_1D ** 2) * (((2 * Math.PI * 1.2e6) / C0) * dx1) ** 2) / 24).toExponential(2)}`);
row("2D grid", `${NX} × ${NY} cells × 5 m, Δt = ${(DT2 * 1e9).toFixed(3)} ns, ${PML}-cell PML (L_max = ${PML_MAX.toFixed(3)})`);
const e = new RadioEngine(48000, 512);
e.configure({ ...defaults });
for (let n = 0; n < 4800; n++) e.sample();
const t0 = performance.now();
for (let n = 0; n < 48000; n++) e.sample(n % 2048 === 2047);
const secs = (performance.now() - t0) / 1000;
row("Real-time engine (Node, this machine)", `${((48000 * 512) / secs / 1e6).toFixed(1)} M RF steps/s, ${(secs * 100).toFixed(0)} % of one core per second of audio`);
let worst = 0;
for (let n = 0; n < 3000; n++) {
  e.sample(n % 700 === 699);
  if (n % 700 === 699) worst = Math.max(worst, e.deviation);
}
row("Yee replay vs exact retarded field (5 stations, ≈5 V/m)", `${(worst * 1e3).toFixed(2)} mV/m`);
const tone = (depth: number, gap = gapForFrequency(1.2e6)) => {
  const en = new RadioEngine(48000, 512);
  en.configure({ ...defaults, gap, depth, stations: [false, false, false, false, true] });
  const N = 4800;
  const out = new Float64Array(N);
  for (let n = 0; n < 2400; n++) en.sample();
  for (let n = 0; n < N; n++) out[n] = en.sample();
  const amp = (f: number) => {
    let c = 0,
      s = 0;
    for (let n = 0; n < N; n++) {
      c += out[n] * Math.cos((2 * Math.PI * f * n) / 48000);
      s += out[n] * Math.sin((2 * Math.PI * f * n) / 48000);
    }
    return (2 * Math.hypot(c, s)) / N;
  };
  return { amp, engine: en };
};
const a = tone(0.65).amp;
row("THD of 1 kHz tone, 65 % depth, 1 V/m", `${((100 * Math.hypot(a(2000), a(3000), a(4000))) / a(1000)).toFixed(2)} %`);
const b = tone(1.3).amp;
row("THD at 130 % modulation", `${((100 * Math.hypot(b(2000), b(3000), b(4000))) / b(1000)).toFixed(1)} %`);
row("Adjacent-station rejection (150 kHz)", `${(20 * Math.log10(a(1000) / tone(0.65, gapForFrequency(1.05e6)).amp(1000))).toFixed(1)} dB`);
const far = 20 * Math.log10(a(1000) / tone(0.65, gapForFrequency(0.6e6)).amp(1000));
row("Far-station rejection (600 kHz)", Number.isFinite(far) ? `${far.toFixed(1)} dB` : "no output (tank voltage below the diode threshold)");
const en = tone(0).engine;
for (let n = 0; n < 9600; n++) en.sample(n === 9599);
row("Power at 1 V/m, 1200 kHz carrier", `incident ${(en.power.incident * 1e3).toFixed(3)} mW/m², port ${(en.power.port * 1e6).toFixed(2)} µW, re-radiated ${(en.power.radiated * 1e12).toFixed(1)} pW, available ${en.power.available.toFixed(2)} W`);
