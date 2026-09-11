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
} from "./physics";
import { createScene } from "./scene";
import { theory } from "./theory";
import { history } from "./history";
import { setupIntroduction } from "./introduction";
import { createField } from "./field";
import processorUrl from "./processor.ts?worker&url";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const state = { ...defaults, stations: [...defaults.stations] };
$("#app").innerHTML =
  `<header><a href="/">AH / EXPERIMENTS</a><div class="header-actions"><button type="button" id="about-lab">About this lab</button><a href="#theory">Read the physics ↗</a></div></header><main>
<section class="intro"><div><p class="eyebrow">INTERACTIVE PHYSICS · NO. 04</p><h1>How does a<br>radio work<span>?</span></h1><p class="lede">Five simulated broadcasts in one signal.<br>Move the plates. Hear how a radio finds a station.</p></div><div class="intro-note">A working circuit simulation<br><b>600 — 1200 kHz</b><br>Move the plates. Find the music.</div></section>
<section class="lab"><div class="lab-top"><span><i class="status-dot"></i> AM RECEIVER / LIVE BENCH</span><div><button id="play" class="primary">▶ Start receiver</button><label class="volume">Listen <input id="volume" aria-label="Listening volume" type="range" min="0" max="1" step=".01" value=".35"></label></div></div>
<div class="bench"><div class="visual"><div id="scene" aria-label="Interactive 3D illustration of antenna, tuning plates, coil, diode and speaker"></div><div class="scene-caption"><span>E FIELD <b class="teal">━</b> &nbsp; B FIELD <b class="purple">━</b></span><span>Drag to orbit · scroll to zoom</span></div><div class="scene-labels"><span>01 ANTENNA</span><span>02 LC TANK</span><span>03 DIODE</span><span>04 LOAD</span></div><p class="visual-note">Illustrative geometry · normalized fields · slowed carrier · cone indicates voltage</p></div>
<aside><span class="eyebrow">TUNING / AIR CAPACITOR</span><div class="frequency"><span id="frequency">900</span><small>kHz</small></div><div class="station-presets">${STATIONS.map((station, i) => `<button class="preset" data-station="${i}">${CARRIERS[i] / 1000}<small>${station.name}</small></button>`).join("")}</div><label class="control">Plate separation <output id="gap-value"></output><input id="gap" aria-label="Plate separation" type="range" min=".25" max="1.45" step=".001" value="${state.gap}"></label><div class="minor-readings"><span>C <b id="capacitance"></b></span><span>L <b>250 μH</b></span></div><p class="hint">Wider gap → less capacitance → higher frequency.</p><label class="control">Antenna angle <output id="angle-value"></output><input id="angle" aria-label="Antenna angle" type="range" min="0" max="90" step="1" value="0"></label><label class="check"><input id="direct" type="checkbox"> Direct signal injection</label><p id="status" role="status">Start to hear and measure the circuit.</p></aside></div>
<div class="signal-chain"><span>AIR / Σ AM</span><b>→</b><span>ANTENNA</span><b>→</b><span>LC RESONANCE</span><b>→</b><span>DIODE + RC</span><b>→</b><span>FILTER + AMP</span><b>→</b><span>8 Ω LOAD</span></div>
<div class="instruments"><div class="plot-panel"><h3>01 / Frequency selection <small>Detector-disconnected theory</small></h3><canvas id="response" aria-label="Theoretical tank voltage gain versus frequency"></canvas><div class="axis"><span>500 kHz</span><span>850</span><span>1350 kHz</span></div></div><div class="plot-panel"><h3>02 / Radio-frequency voltage <small id="rf-window">Awaiting receiver</small></h3><canvas id="rf" aria-label="Antenna and tank voltage traces"></canvas><div class="legend"><span class="muted">━ Antenna</span><span class="teal">━ Tank</span><span id="rf-scale">±6 V</span></div></div><div class="plot-panel"><h3>03 / Diode current <small>μA · same RF window</small></h3><canvas id="diodeplot" aria-label="Diode forward current pulses"></canvas><div class="legend"><span class="gold">━ Current into detector capacitor</span><span id="diode-scale">0–100 μA</span></div></div><div class="plot-panel"><h3>04 / Recovered sound <small id="audio-window">Voltage across 8 Ω</small></h3><canvas id="audio" aria-label="Envelope and speaker voltage over time"></canvas><div class="legend"><span class="gold">━ Detector (DC included)</span><span class="teal">━ Speaker</span><span>±3 V</span></div></div></div>
<div class="meters"><div><span>SPEAKER VOLTAGE</span><b id="rms">—<small> V RMS</small></b></div><div><span>POWER INTO 8 Ω</span><b id="power">—<small> mW</small></b></div><div><span>DETECTOR VOLTAGE</span><b id="envelope">—<small> V</small></b></div><div><span>CIRCUIT STEP RATE</span><b id="step-rate">—<small> MHz</small></b></div></div>
<details class="settings" open><summary>Transmitter & circuit controls</summary><div class="settings-grid"><div><span class="eyebrow">ON THE AIR / INDEPENDENT SOURCES</span><div class="broadcasts">${STATIONS.map((station, i) => `<label class="check"><input class="broadcast" data-index="${i}" type="checkbox" checked>${station.frequency / 1000} kHz · ${station.name}</label>`).join("")}</div><label class="upload">Replace the 900 kHz sound<input id="upload" type="file" accept="audio/*"></label><p id="sound-credit" class="hint">Five local channels · music, historic speech, bells and test tone.</p></div><div><label class="control">Modulation depth <output id="depth-value"></output><input id="depth" aria-label="Modulation depth" type="range" min="0" max="1.4" step=".01" value=".65"></label><label class="control">Incident E field per carrier <output id="field-value"></output><input id="field" aria-label="Incident electric field" type="range" min="0" max="2" step=".01" value="1"></label><label class="check"><input id="diode" type="checkbox" checked> Diode connected</label></div><div><label class="control">Detector RC time <output id="tau-value"></output><input id="tau" aria-label="Detector RC time" type="range" min="5" max="400" step="1" value="80"></label><label class="control">Amplifier voltage gain <output id="gain-value"></output><input id="gain" aria-label="Amplifier voltage gain" type="range" min="1" max="20" step=".1" value="5"></label><button id="reset">Reset controls</button></div></div></details></section>
<section class="station-guide"><span class="eyebrow">THE DIAL / FIVE SIMULTANEOUS BROADCASTS</span><h2>A small world on the air.</h2><div class="station-cards">${STATIONS.map((s, i) => `<button class="station-card" data-tune="${i}"><span>${s.frequency / 1000} <small>kHz</small></span><b>${s.name}</b><strong>${s.title}</strong><em>${s.artist}</em><small>${s.kind}</small></button>`).join("")}</div><p>Click a card to move the tuning plates. Recorded stations loop 90-second excerpts; all transmitters continue while you tune. The 900 kHz upload replaces the spoken program.</p></section><section class="field-panel"><div class="field-heading"><div><span class="eyebrow">WEBGPU / SOLVING MAXWELL ON A GRID</span><h2>Watch the carrier travel.</h2></div><button id="field-play">Pause field</button></div><p>Real 2D electromagnetic propagation, slowed to see the wavefront. Add a conducting screen: reflection and diffraction emerge from the field equations.</p><div class="field-view"><canvas id="field-canvas" aria-label="WebGPU computed electric field, with source on left and probe on right"></canvas><span class="field-source">LINE SOURCE</span><span class="field-probe">FIELD PROBE</span></div><div class="field-tools"><label><input id="field-wall" type="checkbox"> Conducting screen with aperture</label><label>Carrier <select id="field-frequency"><option value="600000">600 kHz</option><option value="900000" selected>900 kHz</option><option value="1200000">1200 kHz</option></select></label><button id="field-reset">Reset field</button><span id="field-time">0.00 μs</span><span id="field-reading">E = 0 V/m</span></div><div class="field-color-scale"><span>−0.042 V/m</span><i></i><span>+0.042 V/m</span></div><p id="field-status" role="status">Preparing WebGPU compute…</p><p class="field-note">Separate carrier-only experiment · 1280 × 640 m · Δx = 5 m · Δt = 7.51 ns · sponge boundaries. The audible receiver uses the analytic incident field, not this slowed grid. The source represents an infinite line current perpendicular to this 2D slice.</p></section><section class="experiments"><span class="eyebrow">THREE THINGS TO TRY</span><div><p><b>01 / Find a station.</b> Sweep the plate separation slowly. All five carriers are present; only the circuit decides what comes through.</p><p><b>02 / Turn away.</b> Rotate the antenna to 90°. Watch the voltage decay as the electric field loses its projection onto the antenna.</p><p><b>03 / Remove the detector.</b> Disconnect the diode. RF is still in the tank, but the music has no way to reach the speaker.</p></div></section>
<section class="schematic"><span class="eyebrow">THE ACTUAL MODEL / SHARED GROUND AT EVERY ⏚</span><h2>Follow the current.</h2><svg viewBox="0 0 1080 235" role="img" aria-label="Circuit schematic: antenna source through 100 kiloohm resistance into parallel LC and loss resistance; diode to detector RC, buffered filter and amplifier to speaker resistance"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M35 165V155m0-40V75H80m60 0h80m0 0h240m-240 0v35m0 65v25m100-125v35m0 50v40m80-125v35m0 65v25m60-125h65m35 0h50v40m0 45v40m0-125h105m-105 0h75v35m0 65v25m110-125h60m100 0h55v35m0 65v25"/><circle cx="35" cy="135" r="20"/><path d="M30 128h10m-5-5v10m-5 10h10"/><rect x="80" y="66" width="60" height="18"/><path d="M220 110c-24 0-24 14 0 14c-24 0-24 14 0 14c-24 0-24 14 0 14c-24 0-24 14 0 14v9M300 120h40m-40 12h40m-20-22v10m0 12v28"/><rect x="391" y="110" width="18" height="65"/><path d="M525 60l35 15-35 15zM560 57v36M590 130h40m-40 12h40m-20-27v15m0 12v18"/><rect x="676" y="110" width="18" height="65"/><rect x="715" y="50" width="80" height="50" rx="4"/><path d="M855 45l100 30-100 30z"/><rect x="1001" y="110" width="18" height="65"/></g><g fill="currentColor" font-family="monospace" font-size="13"><text x="15" y="55">Vₛ</text><text x="75" y="50">Rₛ 100k</text><text x="178" y="225">L 250μH</text><text x="280" y="225">C variable</text><text x="365" y="225">Rₚ 100k</text><text x="510" y="40">0.15V diode</text><text x="595" y="225">C𝒹</text><text x="662" y="225">R𝒹 100k</text><text x="720" y="70">buffer</text><text x="720" y="90">4× LP</text><text x="849" y="135">30Hz HP</text><text x="849" y="155">G, ±3V</text><text x="849" y="175">Rout 1Ω</text><text x="985" y="225">R 8Ω</text><text x="22" y="187">⏚</text><text x="212" y="211">⏚</text><text x="312" y="211">⏚</text><text x="392" y="211">⏚</text><text x="602" y="211">⏚</text><text x="677" y="211">⏚</text><text x="1002" y="211">⏚</text></g></svg><p>The detector loads the tank. The ideal buffer isolates the output filters and powered amplifier. The 3D bench is an illustration; this schematic defines the simulated connections.</p></section>
${history}<section id="theory">${theory}</section><footer>AM RADIO LAB · ELECTROMAGNETISM YOU CAN LISTEN TO</footer></main>`;
let ctx: AudioContext | undefined,
  node: AudioWorkletNode | undefined,
  volume: GainNode | undefined,
  starting = false;
let latest:
  | {
      rfIn: Float32Array;
      rfTank: Float32Array;
      rfDiode: Float32Array;
      audio: Float32Array;
      env: Float32Array;
      rms: number;
      envelope: number;
      rfRate: number;
      rate: number;
      time: number;
    }
  | undefined;
let field: Awaited<ReturnType<typeof createField>> | undefined;
let fieldRunning = true;
createField($<HTMLCanvasElement>("#field-canvas"), $("#field-status"))
  .then((f) => {
    field = f;
  })
  .catch((error) => {
    $("#field-status").textContent = String(error);
    $("#field-play").setAttribute("disabled", "true");
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
  node.port.postMessage({ track: { index, samples } });
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
        latest = data;
      };
      node.onprocessorerror = () => {
        $("#status").textContent =
          "Audio processor stopped. Reload to restart the receiver.";
      };
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
      ? "Running · audio is measured speaker voltage."
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
  data: Float32Array,
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
function drawResponse() {
  const { g, w, h } = canvas("response");
  g.strokeStyle = "#75e5ca";
  g.lineWidth = 2;
  g.beginPath();
  for (let x = 0; x < w; x++) {
    const f = 500000 + (x / w) * 850000;
    const y = h - 12 - (response(f, state.gap) / 0.5) * (h - 28);
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
  g.fillText("0.5 V/V", 3, 12);
}
let lastPaint = 0,
  visualTime = 0,
  lastTime = 0;
function frame(ms: number) {
  requestAnimationFrame(frame);
  const running = ctx?.state === "running";
  if (running) visualTime += (ms - lastTime) / 1000;
  lastTime = ms;
  scene?.update(
    visualTime,
    state.gap,
    state.angle,
    running ? latest?.rms || 0 : 0,
    state.depth,
    state.field,
  );
  if (field) {
    void field.draw(
      fieldRunning,
      Number($<HTMLSelectElement>("#field-frequency").value),
      state.field,
      $<HTMLInputElement>("#field-wall").checked,
    );
    $("#field-time").textContent = (field.time * 1e6).toFixed(2) + " μs";
    $("#field-reading").textContent = "E = " + field.probe.toFixed(4) + " V/m";
  }
  if (ms - lastPaint < 80) return;
  lastPaint = ms;
  drawResponse();
  const rf = canvas("rf"),
    diode = canvas("diodeplot"),
    aud = canvas("audio");
  if (latest) {
    const rfMax = Math.max(
      1,
      Math.ceil(
        Math.max(...latest.rfIn.map(Math.abs), ...latest.rfTank.map(Math.abs)),
      ),
    );
    trace(rf.g, rf.w, rf.h, latest.rfIn, "#697e88", 2 * rfMax);
    trace(rf.g, rf.w, rf.h, latest.rfTank, "#75e5ca", 2 * rfMax);
    $("#rf-scale").textContent = "±" + rfMax + " V · auto";
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
    $("#rms").innerHTML = latest.rms.toFixed(3) + "<small> V RMS</small>";
    $("#power").innerHTML =
      ((latest.rms ** 2 / 8) * 1000).toFixed(2) + "<small> mW</small>";
    $("#envelope").innerHTML = latest.envelope.toFixed(3) + "<small> V</small>";
    $("#step-rate").innerHTML =
      (latest.rfRate / 1e6).toFixed(3) + "<small> MHz</small>";
    $("#rf-window").textContent =
      ((512 / latest.rfRate) * 1e6).toFixed(1) + " μs · ±" + rfMax + " V";
    $("#audio-window").textContent =
      ((2048 / latest.rate) * 1000).toFixed(1) + " ms · ±3 V";
  }
}
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
