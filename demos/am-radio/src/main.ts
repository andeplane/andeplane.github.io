import "./style.css";
import "katex/dist/katex.min.css";
import { STATIONS } from "./stations";
import {
  defaults,
  capacitance,
  resonance,
  gapForFrequency,
  response,
  CARRIERS,
  CA,
  RA,
  HEFF,
  PORT,
  ANTENNA,
  RadioEngine,
  CAPTURE,
} from "./physics.ts";
import { LAYOUT } from "./propagation.ts";
import { createScene, type Capture } from "./scene";
import { theory } from "./theory";
import { history } from "./history";
import { setupIntroduction } from "./introduction";
import {
  createField,
  sourceForProbeField,
  DT as DT2,
  NX,
  NY,
  DX,
  PML,
  PROBE_DISTANCE,
  type Wall,
} from "./field.ts";
import { runOffline, tunedStation, type OfflineResult } from "./offline.ts";
import processorUrl from "./processor.ts?worker&url";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const state = { ...defaults, stations: [...defaults.stations] };
const RF_RATE = 48000 * 512;
const dx1 = 299792458 / RF_RATE / 0.99;
const pathLength = (LAYOUT.cells - 1) * dx1;
const distances = LAYOUT.sources.map((s) => (LAYOUT.receiver - s) * dx1);
$("#app").innerHTML =
  `<header><a href="/">AH / EXPERIMENTS</a><div class="header-actions"><button type="button" id="about-lab">About this lab</button><a href="#theory">Read the physics ↗</a></div></header><main>
<section class="intro"><div><p class="eyebrow">INTERACTIVE PHYSICS · NO. 04</p><h1>How does a<br>radio work<span>?</span></h1><p class="lede">Five simulated broadcasts in one field.<br>Move the plates. Hear how a radio finds a station.</p></div><div class="intro-note">Field → antenna → circuit → speaker<br><b>600 — 1200 kHz</b><br>Every arrow is solved or labelled.</div></section>
<section class="lab"><div class="lab-top"><span><i class="status-dot"></i> AM RECEIVER / LIVE BENCH</span><div><button id="play" class="primary">▶ Start receiver</button><label class="volume">Listen <input id="volume" aria-label="Listening volume" type="range" min="0" max="1" step=".01" value=".35"></label></div></div>
<div class="bench"><div class="visual"><div id="scene" aria-label="Interactive 3D illustration of the dipole antenna, tuning plates, coil, diode and speaker"></div><div class="scene-caption"><span>E FIELD <b class="teal">━</b> &nbsp; B FIELD <b class="purple">━</b> &nbsp; ARM CHARGE ±q</span><span>Drag to orbit · scroll to zoom</span></div><div class="scene-labels"><span>01 TRANSMITTERS ●</span><span>02 DIPOLE ▲</span><span>03 LC TANK</span><span>04 DIODE · LOAD</span></div><p class="visual-note">Illustrative geometry · field lines are the replayed Yee grid (E, η₀H), normalized · arms glow with the computed port charge · one 20.8 μs window replays over 8 s · cone indicates measured voltage</p></div>
<aside><span class="eyebrow">TUNING / AIR CAPACITOR</span><div class="frequency"><span id="frequency">900</span><small>kHz</small></div><div class="station-presets">${STATIONS.map((station, i) => `<button class="preset" data-station="${i}">${CARRIERS[i] / 1000}<small>${station.name}</small></button>`).join("")}</div><label class="control">Plate separation <output id="gap-value"></output><input id="gap" aria-label="Plate separation" type="range" min=".25" max="1.45" step=".001" value="${state.gap}"></label><div class="minor-readings"><span>C <b id="capacitance"></b></span><span>+ Cₐ <b>${(CA * 1e12).toFixed(2)} pF</b></span><span>L <b>250 μH</b></span></div><p class="hint">Wider gap → less capacitance → higher frequency. The antenna's own capacitance sits on the same node.</p><label class="control">Antenna angle to E <output id="angle-value"></output><input id="angle" aria-label="Antenna angle" type="range" min="0" max="90" step="1" value="0"></label><label class="check"><input id="direct" type="checkbox"> Direct injection (bypasses field & antenna)</label><p id="status" role="status">Start to hear and measure the circuit.</p></aside></div>
<div class="signal-chain"><span>PROGRAM</span><b>→</b><span>SHEET CURRENT J</span><b>→</b><span>MAXWELL · 1D GRID</span><b>→</b><span>DIPOLE PORT (MoM)</span><b>→</b><span>LC TANK</span><b>→</b><span>DIODE + RC</span><b>→</b><span>FILTER + AMP</span><b>→</b><span>8 Ω LOAD</span></div>
<div class="instruments"><div class="plot-panel"><h3>01 / Frequency selection <small>Detector-disconnected theory · |V/E|</small></h3><canvas id="response" aria-label="Theoretical tank voltage per V/m of incident field versus frequency"></canvas><div class="axis"><span>500 kHz</span><span>850</span><span>1350 kHz</span></div></div><div class="plot-panel"><h3>02 / Incident field &amp; tank voltage <small id="rf-window">Awaiting receiver</small></h3><canvas id="rf" aria-label="Incident electric field at the antenna and tank voltage traces"></canvas><div class="legend"><span class="muted">━ E at the antenna (V/m)</span><span class="teal">━ Tank (V)</span><span id="rf-scale">±6</span></div></div><div class="plot-panel"><h3>03 / Antenna port <small>same RF window</small></h3><canvas id="port" aria-label="Port charge and port current traces"></canvas><div class="legend"><span class="gold">━ Arm charge Cₐ(v_oc − v) (pC)</span><span class="purple">━ Port current (μA)</span><span id="port-scale"></span></div></div><div class="plot-panel"><h3>04 / Diode current <small>μA · same RF window</small></h3><canvas id="diodeplot" aria-label="Diode forward current pulses"></canvas><div class="legend"><span class="gold">━ Current into detector capacitor</span><span id="diode-scale">0–100 μA</span></div></div><div class="plot-panel"><h3>05 / Recovered sound <small id="audio-window">Voltage across 8 Ω</small></h3><canvas id="audio" aria-label="Envelope and speaker voltage over time"></canvas><div class="legend"><span class="gold">━ Detector (DC included)</span><span class="teal">━ Speaker</span><span>±3 V</span></div></div><div class="plot-panel"><h3>06 / Field along the path <small>space–time · Yee grid replay</small></h3><canvas id="spacetime" aria-label="Electric field on the one-dimensional grid over the captured window, position horizontal and time vertical"></canvas><div class="legend"><span class="gold">● transmitters</span><span>▲ antenna</span><span id="deviation">Yee vs exact: —</span></div></div></div>
<div class="meters"><div><span>SPEAKER VOLTAGE</span><b id="rms">—<small> V RMS</small></b></div><div><span>POWER INTO 8 Ω</span><b id="power">—<small> mW</small></b></div><div><span>DETECTOR VOLTAGE</span><b id="envelope">—<small> V</small></b></div><div><span>CIRCUIT STEP RATE</span><b id="step-rate">—<small> MHz</small></b></div></div>
<div class="meters secondary"><div><span>INCIDENT E</span><b id="m-incident">—<small> V/m RMS</small></b></div><div><span>POWER INTO PORT</span><b id="m-port">—<small> μW</small></b></div><div><span>RE-RADIATED + COPPER</span><b id="m-rad">—<small> pW</small></b></div><div><span>AVAILABLE (MATCHED)</span><b id="m-avail">—<small> W</small></b></div><div><span>AUDIO THREAD LOAD</span><b id="m-load">—<small> %</small></b></div></div>
<p class="chain-note"><b>Antenna port from the wire geometry.</b> A ${ANTENNA.length} m copper dipole of ${ANTENNA.radius * 1e3} mm radius, solved by a thin-wire method of moments at the five carriers: h<sub>eff</sub> = ${HEFF.toFixed(3)} m, C<sub>a</sub> = ${(CA * 1e12).toFixed(2)} pF, R<sub>a</sub> = ${(PORT.radiationResistance * 1e3).toFixed(1)} mΩ radiation + ${(PORT.ohmicResistance * 1e3).toFixed(0)} mΩ copper (band spread ${(PORT.heightSpread * 100).toFixed(3)} % / ${(PORT.capacitanceSpread * 100).toFixed(3)} %). The five transmitters are current sheets ${distances.map((d) => d.toFixed(0)).join(", ")} m from the antenna on a ${LAYOUT.cells}-cell Yee grid (Δx = ${dx1.toFixed(1)} m) spanning the last ${pathLength.toFixed(0)} m of the path. The audible receiver uses the exact retarded plane-wave solution of that one-dimensional problem; the grid recomputes every captured window and the deviation is shown live. R<sub>a</sub> is ${(RA / (1 / (2 * Math.PI * 9e5 * CA))).toExponential(1)} of the port reactance and is left out of the time stepping; its loss is estimated from the port current.</p>
<details class="settings" open><summary>Transmitter &amp; circuit controls</summary><div class="settings-grid"><div><span class="eyebrow">ON THE AIR / INDEPENDENT SOURCES</span><div class="broadcasts">${STATIONS.map((station, i) => `<label class="check"><input class="broadcast" data-index="${i}" type="checkbox" checked>${station.frequency / 1000} kHz · ${station.name}</label>`).join("")}</div><label class="upload">Replace the 900 kHz sound<input id="upload" type="file" accept="audio/*"></label><p id="sound-credit" class="hint">Five local channels · music, historic speech, bells and test tone.</p></div><div><label class="control">Modulation depth <output id="depth-value"></output><input id="depth" aria-label="Modulation depth" type="range" min="0" max="1.4" step=".01" value=".65"></label><label class="control">Incident E field per carrier <output id="field-value"></output><input id="field" aria-label="Incident electric field" type="range" min="0" max="2" step=".01" value="1"></label><label class="check"><input id="diode" type="checkbox" checked> Diode connected</label></div><div><label class="control">Detector RC time <output id="tau-value"></output><input id="tau" aria-label="Detector RC time" type="range" min="5" max="400" step="1" value="80"></label><label class="control">Amplifier voltage gain <output id="gain-value"></output><input id="gain" aria-label="Amplifier voltage gain" type="range" min="1" max="20" step=".1" value="3"></label><button id="reset">Reset controls</button></div></div></details></section>
<section class="station-guide"><span class="eyebrow">THE DIAL / FIVE SIMULTANEOUS BROADCASTS</span><h2>A small world on the air.</h2><div class="station-cards">${STATIONS.map((s, i) => `<button class="station-card" data-tune="${i}"><span>${s.frequency / 1000} <small>kHz</small></span><b>${s.name}</b><strong>${s.title}</strong><em>${s.artist}</em><small>${s.kind}</small></button>`).join("")}</div><p>Click a card to move the tuning plates. Recorded stations loop 90-second excerpts; all transmitters continue while you tune. The 900 kHz upload replaces the spoken program.</p></section><section class="field-panel"><div class="field-heading"><div><span class="eyebrow">WEBGPU / SOLVING MAXWELL ON A 2D GRID</span><h2>Watch the carrier travel.</h2></div><button id="field-play">Pause field</button></div><p>Real two-dimensional electromagnetic propagation, slowed to see the wavefront. Add a conducting screen: reflection and diffraction emerge from the field equations. The outer ${PML} cells are a perfectly matched layer.</p><div class="field-view"><canvas id="field-canvas" aria-label="WebGPU computed electric field, with source on left and probe on right"></canvas><span class="field-source">LINE SOURCE</span><span class="field-probe">RECEIVER</span></div><div class="field-tools"><label>Screen <select id="field-wall"><option value="0" selected>none</option><option value="1">conducting, with aperture</option><option value="2">conducting, closed</option></select></label><label>Carrier <select id="field-frequency"><option value="600000">600 kHz</option><option value="900000" selected>900 kHz</option><option value="1200000">1200 kHz</option></select></label><button id="field-reset">Reset field</button><span id="field-time">0.00 μs</span><span id="field-reading">E = 0 V/m</span></div><div class="field-color-scale"><span id="scale-low">−1.5 V/m</span><i></i><span id="scale-high">+1.5 V/m</span></div><p id="field-status" role="status">Preparing WebGPU compute…</p><p class="field-note">${NX} × ${NY} cells · Δx = ${DX} m · Δt = ${(DT2 * 1e9).toFixed(2)} ns · Courant 0.45 · ${PML}-cell split-field PML · line current calibrated to the slider's field strength at the receiver, ${PROBE_DISTANCE.toFixed(0)} m away. The source is an infinite line current perpendicular to this slice, so the wave is cylindrical (1/√r), not a 3D broadcast pattern.</p>
<div class="offline"><div class="field-heading"><div><span class="eyebrow">SLOW MODE / FULL-WAVE END TO END</span><h3>Let the 2D field drive the radio.</h3></div></div><p>This grid needs ${(1 / DT2 / 1e6).toFixed(0)} million steps per second of physical time, so it cannot feed the speaker live. Instead it solves a short stretch of all five modulated broadcasts, the receiver cell's E<sub>z</sub> becomes the dipole's open-circuit voltage through the same moment-method port, and the identical tank–diode–filter–amplifier chain is stepped at the grid's ${(DT2 * 1e9).toFixed(1)} ns. No audio and no real-time solution enters this path.</p><div class="field-tools"><label>Physical duration <select id="offline-seconds"><option value="0.002" selected>2 ms</option><option value="0.01">10 ms</option><option value="0.05">50 ms</option></select></label><button id="offline-run" class="primary">Run full-wave receiver</button><button id="offline-cancel" disabled>Cancel</button><button id="offline-play" disabled>▶ Play recovered audio</button><span id="offline-status">Tune the receiver first; the run uses the current plates, angle, screen and transmitters.</span></div><progress id="offline-progress" max="1" value="0" hidden></progress><div class="offline-plots" id="offline-plots" hidden><div class="plot-panel"><h3>A / Transmitted message <small id="offline-station"></small></h3><canvas id="offline-message"></canvas><div class="legend"><span class="muted">━ Message m(t), delayed by r/c</span><span class="gold">━ |E<sub>z</sub>| at the receiver (V/m)</span></div></div><div class="plot-panel"><h3>B / Recovered from the 2D field <small>speaker voltage</small></h3><canvas id="offline-audio"></canvas><div class="legend"><span class="gold">━ Detector</span><span class="teal">━ Speaker (V)</span><span id="offline-scale"></span></div></div></div><p id="offline-report" class="field-note"></p></div></section><section class="experiments"><span class="eyebrow">FOUR THINGS TO TRY</span><div><p><b>01 / Find a station.</b> Sweep the plate separation slowly. All five carriers are present in one field; only the circuit decides what comes through.</p><p><b>02 / Turn away.</b> Rotate the dipole to 90°. The tangential field, the induced charge and the port voltage all go to zero together.</p><p><b>03 / Remove the detector.</b> Disconnect the diode. RF is still in the tank, but the music has no way to reach the speaker.</p><p><b>04 / Take the slow road.</b> Run the full-wave mode with the closed screen, then with the aperture: the recovered sound follows the diffracted field.</p></div></section>
<section class="schematic"><span class="eyebrow">THE ACTUAL MODEL / SHARED GROUND AT EVERY ⏚</span><h2>Follow the current.</h2><svg viewBox="0 0 1080 235" role="img" aria-label="Circuit schematic: antenna port (open-circuit voltage from the field in series with the antenna capacitance and resistance) into parallel LC and loss resistance; diode to detector RC, buffered filter and amplifier to speaker resistance"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M35 165V155m0-40V75H80m60 0h80m0 0h240m-240 0v35m0 65v25m100-125v35m0 50v40m80-125v35m0 65v25m60-125h65m35 0h50v40m0 45v40m0-125h105m-105 0h75v35m0 65v25m110-125h60m100 0h55v35m0 65v25"/><circle cx="35" cy="135" r="20"/><path d="M30 128h10m-5-5v10m-5 10h10"/><path d="M96 62v26m8-26v26M104 75h36"/><path d="M220 110c-24 0-24 14 0 14c-24 0-24 14 0 14c-24 0-24 14 0 14c-24 0-24 14 0 14v9M300 120h40m-40 12h40m-20-22v10m0 12v28"/><rect x="391" y="110" width="18" height="65"/><path d="M525 60l35 15-35 15zM560 57v36M590 130h40m-40 12h40m-20-27v15m0 12v18"/><rect x="676" y="110" width="18" height="65"/><rect x="715" y="50" width="80" height="50" rx="4"/><path d="M855 45l100 30-100 30z"/><rect x="1001" y="110" width="18" height="65"/></g><g fill="currentColor" font-family="monospace" font-size="13"><text x="8" y="55">v₀꜀ = hₑ𝒻𝒻·E</text><text x="66" y="50">Cₐ ${(CA * 1e12).toFixed(1)}pF</text><text x="60" y="105">Rₐ ${(RA * 1e3).toFixed(0)}mΩ*</text><text x="178" y="225">L 250μH</text><text x="280" y="225">C variable</text><text x="365" y="225">Rₚ 100k</text><text x="510" y="40">0.15V diode</text><text x="595" y="225">C𝒹</text><text x="662" y="225">R𝒹 100k</text><text x="720" y="70">buffer</text><text x="720" y="90">4× LP</text><text x="849" y="135">30Hz HP</text><text x="849" y="155">G, ±3V</text><text x="849" y="175">Rout 1Ω</text><text x="985" y="225">R 8Ω</text><text x="22" y="187">⏚</text><text x="212" y="211">⏚</text><text x="312" y="211">⏚</text><text x="392" y="211">⏚</text><text x="602" y="211">⏚</text><text x="677" y="211">⏚</text><text x="1002" y="211">⏚</text></g></svg><p>The antenna is a Thévenin port: the open-circuit voltage is the incident field times the moment-method effective height, in series with the port capacitance. The port current flows back through that capacitance, so the tank loads the antenna and the antenna detunes the tank. *R<sub>a</sub> (radiation plus copper) is a millionth of the port reactance and is accounted as a loss from the port current rather than integrated. The detector loads the tank; the ideal buffer isolates the output filters and powered amplifier. The 3D bench is an illustration; this schematic defines the simulated connections.</p></section>
${history}<section id="theory">${theory}</section><footer>AM RADIO LAB · ELECTROMAGNETISM YOU CAN LISTEN TO</footer></main>`;
let ctx: AudioContext | undefined,
  node: AudioWorkletNode | undefined,
  volume: GainNode | undefined,
  starting = false;
type Telemetry = {
  rfE: Float32Array;
  rfGrid: Float32Array;
  rfTank: Float32Array;
  rfDiode: Float32Array;
  rfCharge: Float32Array;
  rfCurrent: Float32Array;
  spaceTime: Float32Array;
  spaceTimeH: Float32Array;
  deviation: number;
  audio: Float32Array;
  env: Float32Array;
  power: {
    port: number;
    radiated: number;
    tank: number;
    diode: number;
    detector: number;
    available: number;
    load: number;
    incident: number;
  };
  rms: number;
  envelope: number;
  rfRate: number;
  rate: number;
  time: number;
  load: number;
};
let latest: Telemetry | undefined;
let capacity: { average: number; peak: number; underrun: number } | undefined;
/** Main-thread copy of the programs, for the slow mode's transmitter stream. */
const programs = new RadioEngine(48000);
let field: Awaited<ReturnType<typeof createField>> | undefined;
let fieldRunning = true;
createField($<HTMLCanvasElement>("#field-canvas"), $("#field-status"))
  .then((f) => {
    field = f;
    $("#field-status").textContent += ` · ${(f.memoryBytes / 1024).toFixed(0)} KiB of GPU buffers`;
  })
  .catch((error) => {
    $("#field-status").textContent = String(error);
    $("#field-play").setAttribute("disabled", "true");
    $("#offline-run").setAttribute("disabled", "true");
    $("#offline-status").textContent =
      "The slow mode needs WebGPU. The real-time receiver above does not.";
  });
$("#field-play").onclick = () => {
  fieldRunning = !fieldRunning;
  $("#field-play").textContent = fieldRunning ? "Pause field" : "Run field";
};
$("#field-reset").onclick = () => field?.reset();
let scene: ReturnType<typeof createScene> | undefined;
try {
  scene = createScene($("#scene"));
} catch {
  $("#scene").innerHTML =
    '<p class="fallback">3D needs WebGL. The circuit, audio and scopes still work.</p>';
}
function sync() {
  $("#frequency").textContent = (resonance(state.gap) / 1000).toFixed(1);
  $("#capacitance").textContent =
    (capacitance(state.gap) * 1e12).toFixed(1) + " pF";
  for (const [key, unit, digits] of [
    ["gap", " mm", 3],
    ["angle", "°", 0],
    ["depth", "%", 0],
    ["field", " V/m", 2],
    ["tau", " μs", 0],
    ["gain", "×", 1],
  ] as const) {
    $("#" + key + "-value").textContent =
      (state[key] * (key === "depth" ? 100 : 1)).toFixed(digits) + unit;
  }
  document
    .querySelectorAll<HTMLElement>(".preset")
    .forEach((p, i) =>
      p.classList.toggle(
        "active",
        Math.abs(resonance(state.gap) - CARRIERS[i]) < 18000,
      ),
    );
  node?.port.postMessage({ settings: state });
  programs.configure(state);
  $("#scale-low").textContent = `−${(1.5 * state.field).toFixed(2)} V/m`;
  $("#scale-high").textContent = `+${(1.5 * state.field).toFixed(2)} V/m`;
  drawResponse();
}
for (const key of ["gap", "angle", "depth", "field", "tau", "gain"] as const)
  $("#" + key).addEventListener("input", (e) => {
    state[key] = Number((e.target as HTMLInputElement).value);
    sync();
  });
for (const key of ["diode", "direct"] as const)
  $("#" + key).addEventListener("change", (e) => {
    state[key] = (e.target as HTMLInputElement).checked;
    sync();
  });
document.querySelectorAll<HTMLButtonElement>(".preset").forEach(
  (p, i) =>
    (p.onclick = () => {
      state.gap = gapForFrequency(CARRIERS[i]);
      $("#gap").setAttribute("value", String(state.gap));
      $<HTMLInputElement>("#gap").value = String(state.gap);
      sync();
    }),
);
document.querySelectorAll<HTMLInputElement>(".broadcast").forEach(
  (p, i) =>
    (p.onchange = () => {
      state.stations[i] = p.checked;
      sync();
    }),
);
document.querySelectorAll<HTMLButtonElement>(".station-card").forEach(
  (p, i) =>
    (p.onclick = () => {
      state.gap = gapForFrequency(CARRIERS[i]);
      $<HTMLInputElement>("#gap").value = String(state.gap);
      sync();
    }),
);
$("#reset").onclick = () => {
  Object.assign(state, defaults, { stations: [true, true, true, true, true] });
  for (const key of ["gap", "angle", "depth", "field", "tau", "gain"] as const)
    $<HTMLInputElement>("#" + key).value = String(state[key]);
  for (const key of ["diode", "direct"] as const)
    $<HTMLInputElement>("#" + key).checked = state[key];
  document
    .querySelectorAll<HTMLInputElement>(".broadcast")
    .forEach((p) => (p.checked = true));
  sync();
};
async function loadSound(bytes: ArrayBuffer, index = 2, limit = 90) {
  if (!ctx || !node) return;
  const decoded = await ctx.decodeAudioData(bytes);
  const length = Math.min(decoded.length, ctx.sampleRate * limit);
  const offline = new OfflineAudioContext(1, length, ctx.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  const filter = offline.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3500;
  src.connect(filter).connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] *= 1 / peak;
  programs.tracks[index] = samples;
  node.port.postMessage({ track: { index, samples } });
}
function watchCapacity(context: AudioContext) {
  // AudioRenderCapacity (Chromium) reports the audio thread's actual load and underruns.
  const cap = (context as unknown as { renderCapacity?: EventTarget & { start(o: { updateInterval: number }): void } }).renderCapacity;
  if (!cap) return;
  cap.addEventListener("update", (ev) => {
    const e = ev as Event & { averageLoad: number; peakLoad: number; underrunRatio: number };
    capacity = { average: e.averageLoad, peak: e.peakLoad, underrun: e.underrunRatio };
  });
  cap.start({ updateInterval: 1 });
}
$("#play").onclick = async () => {
  if (starting) return;
  starting = true;
  try {
    if (!ctx) {
      $("#status").textContent = "Preparing circuit and four local recordings…";
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: "playback" });
      await ctx.audioWorklet.addModule(processorUrl);
      node = new AudioWorkletNode(ctx, "physical-am-radio", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      volume = ctx.createGain();
      volume.gain.value = Number($<HTMLInputElement>("#volume").value);
      node.connect(volume).connect(ctx.destination);
      node.port.onmessage = ({ data }) => {
        if (data.port) return;
        latest = data;
      };
      node.onprocessorerror = () => {
        $("#status").textContent =
          "Audio processor stopped. Reload to restart the receiver.";
      };
      watchCapacity(ctx);
      sync();
      await ctx.resume();
      const results = await Promise.allSettled(
        STATIONS.map(async (station, index) => {
          if (!station.file) return;
          const response = await fetch(
            `${import.meta.env.BASE_URL}audio/${station.file}`,
          );
          if (!response.ok) throw Error(station.name + " unavailable");
          await loadSound(await response.arrayBuffer(), index);
        }),
      );
      const failed = results.flatMap((r, i) =>
        r.status === "rejected" ? [STATIONS[i].name] : [],
      );
      $("#sound-credit").textContent = failed.length
        ? "Could not load: " +
          failed.join(", ") +
          ". Other stations are available."
        : "All five channels ready · local recordings · credits below.";
    } else if (ctx.state === "running") await ctx.suspend();
    else await ctx.resume();
    const running = ctx.state === "running";
    $("#play").textContent = running ? "Ⅱ Pause receiver" : "▶ Resume receiver";
    $("#status").textContent = running
      ? `Running · audio is measured speaker voltage · latency ${((ctx.baseLatency + ((ctx as AudioContext & { outputLatency?: number }).outputLatency || 0)) * 1000).toFixed(0)} ms`
      : "Paused · circuit state and scopes held.";
  } catch (e) {
    $("#status").textContent = "Could not start audio: " + String(e);
    await ctx?.close();
    ctx = undefined;
    node = undefined;
  } finally {
    starting = false;
  }
};
$("#volume").oninput = () => {
  volume?.gain.setTargetAtTime(
    Number($<HTMLInputElement>("#volume").value),
    ctx!.currentTime,
    0.02,
  );
};
$("#upload").onchange = async () => {
  const file = $<HTMLInputElement>("#upload").files?.[0];
  if (!file) return;
  if (!ctx) {
    $("#sound-credit").textContent =
      "Start the receiver first, then choose your audio file.";
    $<HTMLInputElement>("#upload").value = "";
    return;
  }
  try {
    if (file.size > 30_000_000)
      throw Error("Please use a file smaller than 30 MB");
    await loadSound(await file.arrayBuffer(), 2, 60);
    $("#sound-credit").textContent =
      "900 kHz: " + file.name + " · first 60 seconds · local only";
  } catch (e) {
    $("#sound-credit").textContent = "Audio could not load: " + String(e);
  }
};
function canvas(id: string) {
  const c = $<HTMLCanvasElement>("#" + id),
    r = c.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio, 2);
  if (
    c.width !== Math.round(r.width * dpr) ||
    c.height !== Math.round(r.height * dpr)
  ) {
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  g.strokeStyle = "#29383f";
  g.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    g.beginPath();
    g.moveTo(0, (r.height * i) / 5);
    g.lineTo(r.width, (r.height * i) / 5);
    g.stroke();
  }
  for (let i = 1; i < 8; i++) {
    g.beginPath();
    g.moveTo((r.width * i) / 8, 0);
    g.lineTo((r.width * i) / 8, r.height);
    g.stroke();
  }
  return { g, w: r.width, h: r.height };
}
function trace(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: ArrayLike<number>,
  color: string,
  scale: number,
  zero = 0.5,
) {
  g.strokeStyle = color;
  g.lineWidth = 1.35;
  g.beginPath();
  for (let i = 0; i < data.length; i++) {
    const y = h * (zero - data[i] / scale);
    if (i === 0) g.moveTo(0, y);
    else g.lineTo((i / (data.length - 1)) * w, y);
  }
  g.stroke();
}
const responsePeak = Math.max(
  ...CARRIERS.map((f) => response(f, gapForFrequency(f))),
);
function drawResponse() {
  const { g, w, h } = canvas("response");
  g.strokeStyle = "#75e5ca";
  g.lineWidth = 2;
  g.beginPath();
  for (let x = 0; x < w; x++) {
    const f = 500000 + (x / w) * 850000;
    const y = h - 12 - (response(f, state.gap) / (1.1 * responsePeak)) * (h - 28);
    if (!x) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  for (let j = 0; j < CARRIERS.length; j++) {
    const x = ((CARRIERS[j] - 500000) / 850000) * w;
    g.strokeStyle = state.stations[j] ? "#b99963" : "#39454a";
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(x, 12);
    g.lineTo(x, h - 10);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#acb9bd";
    g.font = "10px monospace";
    g.fillText(String(CARRIERS[j] / 1000), x + 4, 12);
  }
  g.fillStyle = "#819398";
  g.fillText(`${(1.1 * responsePeak).toFixed(2)} V per V/m`, 3, 12);
}
const stImage = document.createElement("canvas");
stImage.width = LAYOUT.cells;
stImage.height = CAPTURE;
function drawSpaceTime(t: Telemetry) {
  const { g, w, h } = canvas("spacetime");
  const ig = stImage.getContext("2d")!;
  const img = ig.createImageData(LAYOUT.cells, CAPTURE);
  let peak = 1e-9;
  for (let i = 0; i < t.spaceTime.length; i++) peak = Math.max(peak, Math.abs(t.spaceTime[i]));
  for (let row = 0; row < CAPTURE; row++)
    for (let x = 0; x < LAYOUT.cells; x++) {
      const v = t.spaceTime[row * LAYOUT.cells + x] / peak;
      // Latest step at the bottom.
      const o = ((CAPTURE - 1 - row) * LAYOUT.cells + x) * 4;
      const a = Math.min(1, Math.abs(v));
      img.data[o] = v > 0 ? 12 + 65 * a : 12 + 180 * a;
      img.data[o + 1] = v > 0 ? 22 + 208 * a : 22 + 100 * a;
      img.data[o + 2] = v > 0 ? 27 + 170 * a : 27 + 50 * a;
      img.data[o + 3] = 255;
    }
  ig.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(stImage, 0, 0, w, h);
  g.fillStyle = "#f3d79a";
  for (const s of LAYOUT.sources) g.fillRect(((s + 0.5) / LAYOUT.cells) * w - 2, h - 5, 4, 4);
  g.fillStyle = "#ffffff";
  const rx = ((LAYOUT.receiver + 0.5) / LAYOUT.cells) * w;
  g.beginPath();
  g.moveTo(rx - 4, h - 1);
  g.lineTo(rx + 4, h - 1);
  g.lineTo(rx, h - 8);
  g.fill();
  g.fillStyle = "#c9dfd5";
  g.font = "9px monospace";
  g.fillText(`0 m`, 3, h - 3);
  g.fillText(`${pathLength.toFixed(0)} m`, w - 40, h - 3);
  g.fillText(`t − ${((CAPTURE / RF_RATE) * 1e6).toFixed(1)} μs`, 3, 10);
  g.fillText(`±${peak.toFixed(2)} V/m`, w - 66, 10);
}
let lastPaint = 0,
  visualTime = 0,
  lastTime = 0;
const fmt = (x: number, digits = 2) =>
  Number.isFinite(x) ? x.toFixed(digits) : "—";
function frame(ms: number) {
  requestAnimationFrame(frame);
  const running = ctx?.state === "running";
  if (running) visualTime += (ms - lastTime) / 1000;
  lastTime = ms;
  const capture: Capture | undefined = latest && {
    spaceTime: latest.spaceTime,
    spaceTimeH: latest.spaceTimeH,
    rfCharge: latest.rfCharge,
    rfE: latest.rfE,
    cells: LAYOUT.cells,
    steps: CAPTURE,
    sources: LAYOUT.sources,
    receiver: LAYOUT.receiver,
    time: latest.time,
  };
  scene?.update(
    visualTime,
    state.gap,
    state.angle,
    running ? latest?.rms || 0 : 0,
    capture,
  );
  if (field && !offlineBusy) {
    const f = Number($<HTMLSelectElement>("#field-frequency").value);
    const wall = Number($<HTMLSelectElement>("#field-wall").value) as Wall;
    const amp = sourceForProbeField(state.field, f);
    const samples = new Float32Array(fieldRunning ? 16 : 0);
    for (let n = 0; n < samples.length; n++) {
      const t = field.time + (n + 1) * DT2;
      samples[n] = amp * Math.min(1, t / 1e-6) * Math.sin(2 * Math.PI * f * t);
    }
    void field.draw(samples, wall, Math.max(1e-3, 1.5 * state.field));
    $("#field-time").textContent = (field.time * 1e6).toFixed(2) + " μs";
    $("#field-reading").textContent = "E = " + field.probe.toFixed(4) + " V/m";
  }
  if (ms - lastPaint < 80) return;
  lastPaint = ms;
  drawResponse();
  const rf = canvas("rf"),
    port = canvas("port"),
    diode = canvas("diodeplot"),
    aud = canvas("audio");
  if (latest) {
    const rfMax = Math.max(
      1,
      Math.ceil(
        Math.max(...latest.rfE.map(Math.abs), ...latest.rfTank.map(Math.abs)),
      ),
    );
    trace(rf.g, rf.w, rf.h, latest.rfE, "#697e88", 2 * rfMax);
    trace(rf.g, rf.w, rf.h, latest.rfTank, "#75e5ca", 2 * rfMax);
    $("#rf-scale").textContent = "±" + rfMax + " · auto";
    const qMax = Math.max(1, Math.ceil(Math.max(...latest.rfCharge.map(Math.abs))));
    const iMax = Math.max(1, Math.ceil(Math.max(...latest.rfCurrent.map(Math.abs))));
    trace(port.g, port.w, port.h, latest.rfCharge, "#e4b97a", 2 * qMax);
    trace(port.g, port.w, port.h, latest.rfCurrent, "#c6a6fa", 2 * iMax);
    $("#port-scale").textContent = `±${qMax} pC · ±${iMax} μA`;
    const diodeMax = Math.max(
      10,
      Math.ceil(Math.max(...latest.rfDiode) / 10) * 10,
    );
    trace(
      diode.g,
      diode.w,
      diode.h,
      latest.rfDiode,
      "#e4b97a",
      diodeMax / 0.9,
      0.95,
    );
    $("#diode-scale").textContent = "0–" + diodeMax + " μA · auto";
    trace(aud.g, aud.w, aud.h, latest.env, "#e4b97a", 6);
    trace(aud.g, aud.w, aud.h, latest.audio, "#75e5ca", 6);
    drawSpaceTime(latest);
    $("#deviation").textContent = `Yee vs exact: ${(latest.deviation * 1e3).toFixed(2)} mV/m`;
    $("#rms").innerHTML = latest.rms.toFixed(3) + "<small> V RMS</small>";
    $("#power").innerHTML =
      ((latest.rms ** 2 / 8) * 1000).toFixed(2) + "<small> mW</small>";
    $("#envelope").innerHTML = latest.envelope.toFixed(3) + "<small> V</small>";
    $("#step-rate").innerHTML =
      (latest.rfRate / 1e6).toFixed(3) + "<small> MHz</small>";
    $("#rf-window").textContent =
      ((CAPTURE / latest.rfRate) * 1e6).toFixed(1) + " μs · ±" + rfMax;
    $("#audio-window").textContent =
      ((2048 / latest.rate) * 1000).toFixed(1) + " ms · ±3 V";
    const p = latest.power;
    $("#m-incident").innerHTML = fmt(Math.sqrt(Math.max(0, p.incident) * 376.73), 3) + "<small> V/m RMS</small>";
    $("#m-port").innerHTML = fmt(p.port * 1e6, 2) + "<small> μW</small>";
    $("#m-rad").innerHTML = fmt(p.radiated * 1e12, 1) + "<small> pW</small>";
    $("#m-avail").innerHTML = fmt(p.available, 2) + "<small> W</small>";
    const load = capacity ? capacity.average : latest.load;
    $("#m-load").innerHTML =
      fmt(load * 100, 0) +
      `<small> %${capacity ? ` · peak ${fmt(capacity.peak * 100, 0)} · underrun ${fmt(capacity.underrun * 100, 1)} %` : " (worklet timer)"}</small>`;
  }
}
// ---------- Slow mode: full-wave 2D field through the identical receiver ----------
let offlineBusy = false,
  offlineCancel = false,
  offlineResult: OfflineResult | undefined,
  offlineSource: AudioBufferSourceNode | undefined;
function drawOffline(r: OfflineResult) {
  $("#offline-plots").hidden = false;
  const m = canvas("offline-message"),
    a = canvas("offline-audio");
  trace(m.g, m.w, m.h, r.message, "#697e88", 2.2);
  let ePeak = 1e-9;
  for (const v of r.incident) ePeak = Math.max(ePeak, v);
  trace(m.g, m.w, m.h, r.incident, "#e4b97a", 1.1 * ePeak, 0.98);
  let vPeak = 1e-9;
  for (const v of r.audio) vPeak = Math.max(vPeak, Math.abs(v));
  for (const v of r.envelope) vPeak = Math.max(vPeak, Math.abs(v));
  const scale = Math.max(0.1, Math.ceil(vPeak * 10) / 10);
  trace(a.g, a.w, a.h, r.envelope, "#e4b97a", 2 * scale);
  trace(a.g, a.w, a.h, r.audio, "#75e5ca", 2 * scale);
  $("#offline-scale").textContent = `±${scale} V · ${(r.seconds * 1000).toFixed(0)} ms`;
  $("#offline-station").textContent = `${CARRIERS[r.station] / 1000} kHz · ${STATIONS[r.station].name}`;
  // Normalized cross-correlation of the recovered speaker voltage with the delayed
  // message over the second half of the run, maximized over lag: the detector RC and the
  // four 5 kHz poles delay the audio by a few hundred microseconds.
  const start = Math.floor(r.message.length / 2);
  let mm = 0,
    aa = 0;
  for (let i = start; i < r.message.length; i++) {
    mm += r.message[i] ** 2;
    aa += r.audio[i] ** 2;
  }
  let corr = NaN,
    lag = 0;
  const maxLag = Math.min(start, Math.round(0.0008 * r.rate));
  for (let d = 0; d <= maxLag; d++) {
    let ma = 0;
    for (let i = start; i < r.message.length; i++) ma += r.message[i - d] * r.audio[i];
    const c = mm > 0 && aa > 0 ? ma / Math.sqrt(mm * aa) : NaN;
    if (!(c <= corr)) {
      corr = c;
      lag = d;
    }
  }
  let rms = 0;
  for (const v of r.audio) rms += v * v;
  rms = Math.sqrt(rms / r.audio.length);
  $("#offline-report").innerHTML =
    `<b>Measured.</b> ${r.steps.toLocaleString()} Maxwell steps (${(r.seconds * 1e3).toFixed(0)} ms of physical time) in ${r.wallSeconds.toFixed(1)} s: ${(r.stepsPerSecond / 1e3).toFixed(0)} k steps/s, ${r.slowdown.toFixed(0)}× slower than real time. Receiver stepped ${r.steps.toLocaleString()} times at ${(DT2 * 1e9).toFixed(2)} ns and decimated by ${r.decimation} to ${r.rate.toFixed(1)} Hz. Peak |E<sub>z</sub>| at the receiver ${ePeak.toFixed(3)} V/m; speaker ${rms.toFixed(3)} V RMS; correlation of the second half of the speaker voltage with the delayed message ${fmt(corr, 3)} at a lag of ${((lag / r.rate) * 1e3).toFixed(2)} ms (detector and filter delay). Light travel time to the receiver ${(r.travelSeconds * 1e6).toFixed(2)} μs.`;
}
$("#offline-run").onclick = async () => {
  if (!field || offlineBusy) return;
  offlineBusy = true;
  offlineCancel = false;
  $("#offline-run").setAttribute("disabled", "true");
  $("#offline-cancel").removeAttribute("disabled");
  $("#offline-play").setAttribute("disabled", "true");
  const progress = $<HTMLProgressElement>("#offline-progress");
  progress.hidden = false;
  progress.value = 0;
  const t0 = performance.now();
  try {
    const seconds = Number($<HTMLSelectElement>("#offline-seconds").value);
    const wall = Number($<HTMLSelectElement>("#field-wall").value) as Wall;
    const settings = { ...state, stations: [...state.stations] };
    offlineResult = await runOffline(
      field,
      programs,
      settings,
      seconds,
      wall,
      tunedStation(resonance(state.gap)),
      (done, total, phase) => {
        progress.value = done / total;
        const elapsed = (performance.now() - t0) / 1000;
        const eta = done > 0 ? (elapsed * (total - done)) / done : NaN;
        $("#offline-status").textContent = `${phase} · ${Math.round((100 * done) / total)} % · ${elapsed.toFixed(0)} s elapsed${Number.isFinite(eta) ? `, about ${Math.ceil(eta)} s left` : ""}`;
        return !offlineCancel;
      },
    );
    drawOffline(offlineResult);
    $("#offline-status").textContent = "Done · the plots and the play button use only the 2D field solution.";
    $("#offline-play").removeAttribute("disabled");
  } catch (e) {
    $("#offline-status").textContent = offlineCancel ? "Cancelled." : "Slow mode failed: " + String(e);
  } finally {
    offlineBusy = false;
    progress.hidden = true;
    $("#offline-run").removeAttribute("disabled");
    $("#offline-cancel").setAttribute("disabled", "true");
  }
};
$("#offline-cancel").onclick = () => {
  offlineCancel = true;
};
$("#offline-play").onclick = async () => {
  const r = offlineResult;
  if (!r) return;
  offlineSource?.stop();
  const context = ctx ?? new AudioContext();
  if (context.state !== "running") await context.resume();
  const buffer = context.createBuffer(1, r.audio.length, r.rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < r.audio.length; i++) data[i] = r.audio[i] / 3;
  const src = context.createBufferSource();
  src.buffer = buffer;
  // Loop a short excerpt so that a 2 ms tone burst is audible as a tone.
  src.loop = r.seconds < 0.1;
  const gain = context.createGain();
  gain.gain.value = Number($<HTMLInputElement>("#volume").value);
  src.connect(gain).connect(context.destination);
  src.start();
  if (src.loop) src.stop(context.currentTime + 1.5);
  offlineSource = src;
  $("#offline-status").textContent = `Playing the recovered ${(r.seconds * 1000).toFixed(0)} ms${src.loop ? ", looped for 1.5 s" : ""} · listening volume applies.`;
};
sync();
setupIntroduction(() => {
  if (ctx?.state !== "running") $("#play").click();
});
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => {
  void ctx?.close();
  scene?.dispose();
  field?.dispose();
});
