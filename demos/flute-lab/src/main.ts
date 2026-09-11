import "./style.css";
import { LENGTH, NOTES } from "./bore";
import { spectrum, pitch, noteName } from "./spectrum";
import workletUrl from "./audio-worklet.ts?worker&url";
import { Flute, NX, NY, DX, HOLES, KEYS, TOP, BOTTOM, X0, X1 } from "./physics";
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
if (new URLSearchParams(location.search).has("embed"))
  document.body.classList.add("embedded");
$("#app").innerHTML = `
<header><a href="/#/projects/flute-lab">← <span>ANDERS HAFREAGER / PROJECTS</span></a><span class="edition">EXPERIMENT 02 · AIR IN MOTION</span></header>
<main><div class="intro"><div><div class="eyebrow">PHYSICS / MUSIC / INTERACTIVE</div><h1>Recorder <em>Lab.</em></h1><p>Hold Space to blow; release to stop. Or toggle sustained airflow.</p></div><div class="intro-actions"><button id="start" class="primary">Start the airflow <span>↗</span></button><button id="how-button" class="how-button" aria-haspopup="dialog">ⓘ How does it work?</button></div></div>
<dialog id="how-dialog" aria-labelledby="how-title"><div class="how-heading"><div><div class="eyebrow">FROM BREATH TO A MEASURED NOTE</div><h2 id="how-title">How does it work?</h2></div><button id="how-close" aria-label="Close explanation">✕</button></div><div class="how-steps"><section><h3>1. Supply the breath</h3><p>Hold <kbd>Space</kbd> to blow and release it to stop. Or click the airflow button for continuous blowing. The mouthpiece inlet is sealed; the narrow windway guides air toward a separate open window and a sharp edge, the labium.</p></section><section><h3>2. Let the air column resonate</h3><p>Breath supplies energy to acoustic feedback at the labium. Pressure waves travel along the bore and reflect. Covering holes changes those reflections and the resonant pitch. Cover from the mouthpiece toward the bell; a hole beyond the first open one usually has less effect.</p><p>Use <kbd>1</kbd>–<kbd>8</kbd> for C5–C6, or <kbd>QWERTYUIOP</kbd> for individual holes. Try a melody: <strong>3 2 1 2 3 3 3</strong>.</p></section><section><h3>3. Listen with the microphone</h3><p>Sound radiates through the labium window, open holes, and bell into the simulated room. The orange microphone samples the pressure there. That measured waveform feeds both your speakers and the Fourier plot. The plot separates it into frequencies; its axis shows Hz (cycles per second) and musical notes, with an estimated fundamental — the base repetition frequency — highlighted. Compression is pressure above ambient; rarefaction is below it.</p></section><section><h3>4. Slow down the same physics</h3><p>At ¼ speed, four seconds of listening contain one second of simulation: frequencies fall to a quarter, so C5 becomes C3. At extreme slow motion the waves become visible but the sound falls below hearing.</p></section></div><div class="how-model"><strong>What is simulated?</strong><p>A reduced one-dimensional traveling-wave bore drives a two-dimensional room solver. The steady-breath source, radiation loads, and losses are approximations; this is not a full turbulent airflow simulation. The room does not feed back into the bore. The colors show modeled pressure with a demonstration normalization, not an absolute sound-level prediction; the inlet arrow is schematic. Note buttons select hole combinations, not prerecorded tones.</p><button id="how-details">Model details & research sources ↗</button></div></dialog>
<section class="lab" aria-label="Flute simulation">
<div class="toolbar"><div><span id="led" class="led"></span><strong id="status">READY TO BREATHE</strong><span class="divider">/</span><span>Bore + room acoustics</span></div><div><button id="pause" disabled>Pause</button><button id="reset">Reset field</button></div></div>
<div class="field-wrap"><canvas id="field" aria-label="Pressure field with a flute and movable microphone" title="The mouthpiece inlet is sealed. The open window at the labium radiates sound. The colors show simulated pressure."></canvas><div class="field-caption"><span>SEALED INLET → OPEN LABIUM → BORE & ROOM → MIC</span><span id="clock">0.0000 s simulated</span></div></div>
<div class="legend"><span><i class="negative"></i> Rarefaction</span><span class="scale"></span><span><i class="positive"></i> Compression</span><span class="legend-note">Sealed windway → open labium window · click the room to move the mic</span></div>
<section class="spectrum-card"><div class="spectrum-heading"><div><div class="section-label">FOURIER SPECTRUM / MEASURED MICROPHONE PRESSURE</div><p>Frequency in Hz · equal-tempered notes (A4 = 440 Hz)</p></div><div class="pitch-readout"><strong id="measured-note">—</strong><span id="measured-frequency">Start airflow to measure</span></div></div><canvas id="spectrum" aria-label="Fourier spectrum of microphone pressure, frequency in Hz and note names on the x axis"></canvas><div class="scope-footer"><span>Hann window · relative amplitude (dB)</span><span id="spectrum-window">Waiting for microphone samples</span></div></section><div class="melody"><div class="section-label">PLAY A SCALE <small>Keys 1–8 select fingerings. Try: 3 2 1 2 3 3 3.</small></div><div id="notes" class="note-keys"></div></div><div class="fingering"><div class="section-label">CUSTOM FINGERING<small>Q–P toggle holes. Cover from the mouthpiece toward the bell.</small></div><div id="keys" class="keys"></div><div class="presets"><span id="fingering-name">C5 fingering</span><button id="closed">Close all</button><button id="opened">Open all</button></div></div>
<div class="controls"><label><span>STEADY BREATH <output id="breath-value">1.00</output></span><input id="breath" type="range" min="0" max="1.5" value="1" step=".01"><small>Breath strength while blowing. Release Space to let the sound decay.</small></label><label><span>SIMULATION SPEED <output id="speed-value">1×</output></span><input id="speed" type="range" min="-4" max="0" value="0" step=".01"><div class="speed-presets"><button data-speed="1">1×</button><button data-speed="0.25">¼×</button><button data-speed="0.01">¹⁄₁₀₀×</button><button data-speed="0.001">¹⁄₁₀₀₀×</button></div><small>Slower physics = lower pitch. Below hearing range, watch the waves.</small></label><label><span>MICROPHONE VOLUME <output id="volume-value">35%</output></span><input id="volume" type="range" min="0" max="1" value=".35" step=".01"><small>Only pressure at the orange microphone reaches your speakers.</small></label></div>
</section>
<section class="readouts"><div class="scope-card"><div class="section-label">AT THE MICROPHONE <span id="pressure">0.000 Pa</span></div><canvas id="scope" aria-label="Microphone pressure waveform"></canvas><div class="scope-footer"><span>Last <b id="window">43</b> ms of listening time</span><span id="rms">RMS 0.000 Pa</span></div></div><div class="insight"><div class="eyebrow">TRY THIS</div><h2>Cover in order.<br>Play a real melody.</h2><p>Use <kbd>1</kbd>–<kbd>8</kbd> for C5–C6. Or cover holes from Q toward P to descend. A hole beyond the first open hole usually changes pitch only slightly. These are simplified recorder-style fingerings, not a standard recorder chart.</p><button id="slow">Watch a wave at 0.001× ↗</button></div></section>
<details id="model-details"><summary>Inside the experiment <span>MODEL, LIMITS & SOURCES +</span></summary><div class="notes"><div><h3>A recorder-inspired acoustic model</h3><p>Steady breath powers a nonlinear active reflection at the labium. Left- and right-traveling pressure waves propagate along the bore at 343 m/s. Each hole is a three-port scattering junction; opening one connects a radiation load. The geometry and acoustic feedback generate the tone.</p><p>Ten hole positions and the 32.4 cm bore are calibrated to a chromatic subset from C5 to C6 at the default breath. The scale buttons only cover holes; they never generate a frequency. Custom combinations can detune, as on a real wind instrument.</p></div><div><h3>What you see and hear</h3><p>The narrow bore uses a 96 kHz one-dimensional waveguide. Its outgoing flows feed a separate 48 kHz, 2D pressure–velocity room solver. The bore colors show the waveguide pressure; exterior colors show the room pressure. Coupling is one-way: room reflections do not feed back into the bore.</p><p>The room has absorbing edges. Tone-hole radiation loads and viscothermal losses are simplified; turbulence and the recorder's full 3D geometry are not resolved. The mouthpiece inlet is sealed. Steady breath passes through a narrow windway to a separate open labium window, which radiates into the room; the inlet itself is not an exterior acoustic source. The arrow is schematic, not resolved airflow. The FFT and speakers both receive the room microphone. Audio alone has DC filtering, gain and soft limiting.</p><label class="jet-control">Jet gain / overblow <output id="jet-value">24</output><input id="jet-speed" type="range" min="12" max="45" value="24" step="1"></label><button id="pulse">Inject a room test pulse</button></div><div><h3>Research & lineage</h3><p><a href="https://www.yamaha.com/en/musical_instrument_guide/recorder/mechanism/" target="_blank" rel="noreferrer">Yamaha · Recorder parts & windway ↗</a></p><p><a href="https://newt.phys.unsw.edu.au/jw/fluteacoustics.html" target="_blank" rel="noreferrer">UNSW · Flute acoustics ↗</a><br>Steady power, jet feedback, and open-hole resonance.</p><p><a href="https://quod.lib.umich.edu/cgi/p/pod/dod-idx/integration-of-physical-modeling-for-synthesis-and-animation.pdf?c=icmc;idno=bbp2372.1995.153;format=pdf" target="_blank" rel="noreferrer">Cook · Waveguide flute & tone holes ↗</a><br>Traveling-wave sections with scattering junctions.</p><p><a href="https://arxiv.org/abs/1502.02170" target="_blank" rel="noreferrer">Price et al. · Air-jet amplifier ↗</a><br>Saturating gain and acoustic feedback.</p><p><a href="https://andeplane.github.io/#/projects/tube-sim" target="_blank" rel="noreferrer">Original Tube Acoustics Lab ↗</a><br>A separate, unchanged experiment.</p></div></div></details>
<footer>BUILT FROM PRESSURE, VELOCITY & A LITTLE BREATH.<span>NO NOTE OSCILLATORS · NO RECORDED SAMPLES</span></footer></main>`;
let ctx: AudioContext | undefined,
  node: AudioWorkletNode | undefined,
  gain: GainNode | undefined;
let paused = false,
  starting = false,
  speed = 1;
let spaceHeld = false,
  latchedFlow = false;
const blowing = () => spaceHeld || latchedFlow;
const initial = new Flute();
let data = {
  bore: new Float32Array(128),
  sampleRate: 48000,
  p: initial.p,
  solid: initial.solid,
  time: 0,
  jet: 0,
  mic: initial.mic,
  trace: new Float32Array(16384),
  traceIndex: 0,
};
const open = Array<boolean>(10).fill(false);
const field = $<HTMLCanvasElement>("#field"),
  scope = $<HTMLCanvasElement>("#scope"),
  fftCanvas = $<HTMLCanvasElement>("#spectrum");
const fftContext = fftCanvas.getContext("2d")!;
let lastFft = 0;
const g = field.getContext("2d")!,
  s = scope.getContext("2d")!;
const raster = document.createElement("canvas");
raster.width = NX;
raster.height = NY;
const r = raster.getContext("2d")!,
  pixels = r.createImageData(NX, NY);
function controls() {
  node?.port.postMessage({
    type: "controls",
    speed,
    breath: blowing() ? Number($<HTMLInputElement>("#breath").value) : 0,
    jetGain: Number($<HTMLInputElement>("#jet-speed").value),
    open,
    paused,
  });
}
const scale = [
  { note: "C5", closed: 10 },
  { note: "D5", closed: 9 },
  { note: "E5", closed: 8 },
  { note: "F5", closed: 7 },
  { note: "G5", closed: 5 },
  { note: "A5", closed: 3 },
  { note: "B5", closed: 1 },
  { note: "C6", closed: 0 },
];
function fingering(n: number) {
  open.forEach((_, i) => (open[i] = i >= n));
  keys();
  controls();
}
$("#notes").innerHTML = scale
  .map(
    (n, i) =>
      `<button data-note="${i}"><strong>${n.note}</strong><kbd>${i + 1}</kbd></button>`,
  )
  .join("");
document
  .querySelectorAll<HTMLButtonElement>("[data-note]")
  .forEach(
    (b) => (b.onclick = () => fingering(scale[Number(b.dataset.note)].closed)),
  );
function keys() {
  $("#keys").innerHTML = open
    .map(
      (o, i) =>
        `<button data-hole="${i}" aria-label="Hole ${i + 1}, ${KEYS[i].toUpperCase()}, ${o ? "open" : "closed"}" aria-pressed="${!o}" class="key ${o ? "open" : ""}"><span class="hole-dot"></span><kbd>${KEYS[i].toUpperCase()}</kbd><small>${o ? "OPEN" : "CLOSED"}</small></button>`,
    )
    .join("");
  document
    .querySelectorAll<HTMLButtonElement>("[data-hole]")
    .forEach((b) => (b.onclick = () => toggle(Number(b.dataset.hole))));
  const first = open.indexOf(true),
    count = first < 0 ? 10 : first;
  const regular = open.every((v, i) => v === i >= count);
  $("#fingering-name").textContent = regular
    ? (count === 10 ? "C5" : NOTES[count]) + " fingering"
    : "Custom fingering";
  document
    .querySelectorAll<HTMLButtonElement>("[data-note]")
    .forEach((b, i) => {
      const selected = regular && scale[i].closed === count;
      b.classList.toggle("selected", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
  initial.open = [...open];
  initial.geometry();
  if (!node) data.solid = initial.solid;
}
function toggle(i: number) {
  open[i] = !open[i];
  keys();
  controls();
}
keys();
function updateFlowUI() {
  $("#start").textContent = blowing() ? "Stop airflow ■" : "Start airflow ↗";
  $("#start").setAttribute("aria-pressed", String(blowing()));
  $("#start").classList.toggle("flow-on", blowing());
  $("#pause").textContent = paused ? "Resume" : "Pause";
  const active =
    Boolean(node) &&
    blowing() &&
    !paused &&
    Number($<HTMLInputElement>("#breath").value) > 0;
  $("#led").classList.toggle("active", active);
  $("#status").textContent = starting
    ? "STARTING AUDIO…"
    : paused
      ? "PAUSED"
      : active
        ? spaceHeld
          ? "BLOWING · SPACE HELD"
          : "BLOWING · TOGGLED ON"
        : node
          ? "BREATH OFF · HOLD SPACE"
          : "HOLD SPACE OR TOGGLE AIRFLOW";
}
async function ensureAudio() {
  if (starting) return;
  starting = true;
  try {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: "interactive" });
      await ctx.audioWorklet.addModule(workletUrl);
      node = new AudioWorkletNode(ctx, "flute-physics", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      gain = ctx.createGain();
      gain.gain.value = Number($<HTMLInputElement>("#volume").value);
      node.connect(gain).connect(ctx.destination);
      node.port.onmessage = ({ data: d }) => {
        data = d;
      };
      node.onprocessorerror = () => {
        $("#status").textContent = "AUDIO PROCESSOR ERROR · RELOAD TO RESTART";
      };
    }
    await ctx.resume();
    controls();
    node?.port.postMessage({
      type: "mic",
      x: data.mic % NX,
      y: Math.floor(data.mic / NX),
    });
    $<HTMLButtonElement>("#pause").disabled = false;
  } catch (error) {
    $("#status").textContent =
      `Could not start audio: ${error instanceof Error ? error.message : String(error)}`;
    spaceHeld = false;
    latchedFlow = false;
    await ctx?.close();
    ctx = undefined;
    node = undefined;
  } finally {
    starting = false;
    if (node) {
      controls();
      updateFlowUI();
    } else {
      $("#start").textContent = "Retry airflow ↗";
      $("#start").setAttribute("aria-pressed", "false");
    }
  }
}
function applyFlow() {
  if (blowing()) {
    paused = false;
    void ensureAudio();
  }
  controls();
  updateFlowUI();
}
$("#start").onclick = () => {
  latchedFlow = !blowing();
  spaceHeld = false;
  applyFlow();
};
updateFlowUI();
$("#pause").onclick = () => {
  paused = !paused;
  controls();
  updateFlowUI();
};
$("#reset").onclick = () => {
  node?.port.postMessage({ type: "reset" });
};
$("#closed").onclick = () => {
  open.fill(false);
  keys();
  controls();
};
$("#opened").onclick = () => {
  open.fill(true);
  keys();
  controls();
};
for (const id of ["breath", "jet-speed"])
  $<HTMLInputElement>("#" + id).oninput = () => {
    $("#breath-value").textContent = Number(
      $<HTMLInputElement>("#breath").value,
    ).toFixed(2);
    $("#jet-value").textContent = $<HTMLInputElement>("#jet-speed").value;
    controls();
    updateFlowUI();
  };
function setSpeed(v: number) {
  speed = v;
  $<HTMLInputElement>("#speed").value = String(Math.log10(v));
  $("#speed-value").textContent = Number(v.toPrecision(3)) + "×";
  controls();
}
$<HTMLInputElement>("#speed").oninput = (e) =>
  setSpeed(10 ** Number((e.target as HTMLInputElement).value));
document
  .querySelectorAll<HTMLButtonElement>("[data-speed]")
  .forEach((b) => (b.onclick = () => setSpeed(Number(b.dataset.speed))));
$("#slow").onclick = () => {
  setSpeed(0.001);
  field.scrollIntoView({ behavior: "smooth", block: "center" });
};
$<HTMLInputElement>("#volume").oninput = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  $("#volume-value").textContent = Math.round(v * 100) + "%";
  if (ctx && gain) gain.gain.setTargetAtTime(v, ctx.currentTime, 0.025);
};
$("#pulse").onclick = () => node?.port.postMessage({ type: "pulse" });
window.addEventListener("keydown", (e) => {
  if ($<HTMLDialogElement>("#how-dialog").open) return;
  const editing =
    e.target instanceof HTMLElement &&
    (e.target.isContentEditable ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement ||
      (e.target instanceof HTMLInputElement && e.target.type !== "range"));
  if (e.code === "Space" && !editing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (e.repeat) return;
    // Taking a breath with Space takes over from latched flow; release stops it.
    spaceHeld = true;
    latchedFlow = false;
    applyFlow();
    return;
  }
  if (
    e.repeat ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  )
    return;
  if (/^[1-8]$/.test(e.key)) {
    e.preventDefault();
    fingering(scale[Number(e.key) - 1].closed);
    return;
  }
  const i = KEYS.indexOf(e.key.toLowerCase());
  if (i >= 0) {
    e.preventDefault();
    toggle(i);
  }
});
function releaseBreath() {
  if (!spaceHeld) return;
  spaceHeld = false;
  controls();
  updateFlowUI();
}
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && spaceHeld) {
    e.preventDefault();
    releaseBreath();
  }
});
window.addEventListener("blur", releaseBreath);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseBreath();
});
field.onclick = (e) => {
  const box = field.getBoundingClientRect(),
    x = Math.floor(((e.clientX - box.left) / box.width) * NX),
    y = Math.floor(((e.clientY - box.top) / box.height) * NY);
  const hole = HOLES.findIndex(
    (h) => Math.abs(x - h) < 1 && Math.abs(y - TOP) < 3,
  );
  if (hole >= 0) toggle(hole);
  else if (!data.solid[y * NX + x]) {
    if (node) node.port.postMessage({ type: "mic", x, y });
    else
      data.mic = initial.mic =
        Math.max(8, Math.min(NY - 9, y)) * NX +
        Math.max(8, Math.min(NX - 9, x));
  }
};
function size(canvas: HTMLCanvasElement) {
  const box = canvas.getBoundingClientRect(),
    dpr = Math.min(2, devicePixelRatio);
  if (
    canvas.width !== Math.round(box.width * dpr) ||
    canvas.height !== Math.round(box.height * dpr)
  ) {
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
  }
  return { w: canvas.width, h: canvas.height };
}
function drawSpectrum() {
  const { w, h } = size(fftCanvas),
    f = fftContext,
    dpr = Math.min(2, devicePixelRatio),
    left = 42 * dpr,
    right = w - 16 * dpr,
    top = 16 * dpr,
    bottom = h - 48 * dpr;
  const mags = spectrum(data.trace, data.traceIndex),
    rate = data.sampleRate,
    measurement = pitch(mags, rate, data.trace.length);
  const minHz = speed < 0.1 ? 20 : 220,
    maxHz = speed < 0.1 ? 2000 : 4200,
    xFor = (hz: number) =>
      left + (Math.log(hz / minHz) / Math.log(maxHz / minHz)) * (right - left);
  f.clearRect(0, 0, w, h);
  f.font = `${9 * dpr}px Inter,system-ui`;
  f.lineWidth = dpr;
  for (let db = 0; db >= -60; db -= 20) {
    const y = top + (-db / 60) * (bottom - top);
    f.strokeStyle = "#25252c";
    f.beginPath();
    f.moveTo(left, y);
    f.lineTo(right, y);
    f.stroke();
    f.fillStyle = "#888";
    f.textAlign = "right";
    f.fillText(String(db), left - 8 * dpr, y + 3 * dpr);
  }
  const ticks =
    speed < 0.1
      ? [28, 40, 52, 64, 76, 88]
      : [60, 64, 67, 72, 76, 79, 84, 88, 91];
  let lastLabel = -Infinity;
  for (const midi of ticks) {
    const hz = 440 * 2 ** ((midi - 69) / 12),
      x = xFor(hz);
    if (
      x < left ||
      x > right ||
      x - lastLabel < 44 * dpr ||
      (measurement && Math.abs(x - xFor(measurement.hz)) < 42 * dpr)
    )
      continue;
    lastLabel = x;
    f.strokeStyle = "#262631";
    f.beginPath();
    f.moveTo(x, top);
    f.lineTo(x, bottom);
    f.stroke();
    f.fillStyle = "#c5c7d3";
    f.textAlign = "center";
    f.fillText(noteName(midi), x, bottom + 17 * dpr);
    f.fillStyle = "#888";
    f.fillText(Math.round(hz) + " Hz", x, bottom + 32 * dpr);
  }
  let max = 0.002;
  for (const v of mags) max = Math.max(max, v);
  f.strokeStyle = "#818cf8";
  f.lineWidth = 1.6 * dpr;
  f.beginPath();
  let began = false;
  for (
    let i = Math.max(1, Math.floor((minHz * data.trace.length) / rate));
    i < mags.length;
    i++
  ) {
    const hz = (i * rate) / data.trace.length;
    if (hz > maxHz) break;
    const x = xFor(hz),
      db = Math.max(-60, 20 * Math.log10((mags[i] + 1e-12) / max)),
      y = top - (db / 60) * (bottom - top);
    if (!began) {
      f.moveTo(x, y);
      began = true;
    } else f.lineTo(x, y);
  }
  f.stroke();
  if (measurement) {
    $("#measured-note").textContent = measurement.note;
    $("#measured-frequency").textContent =
      measurement.hz.toFixed(1) +
      " Hz · " +
      Math.round(measurement.cents) +
      " cents";
    const x = xFor(measurement.hz);
    if (x >= left && x <= right) {
      f.strokeStyle = "#f3b17b";
      f.setLineDash([4 * dpr, 4 * dpr]);
      f.beginPath();
      f.moveTo(x, top);
      f.lineTo(x, bottom);
      f.stroke();
      f.setLineDash([]);
      f.fillStyle = "#f3b17b";
      f.textAlign =
        x > right - 25 * dpr
          ? "right"
          : x < left + 25 * dpr
            ? "left"
            : "center";
      f.fillText(measurement.note, x, bottom + 17 * dpr);
      f.fillText(Math.round(measurement.hz) + " Hz", x, bottom + 32 * dpr);
    }
  } else {
    $("#measured-note").textContent = "—";
    $("#measured-frequency").textContent =
      speed < 0.01
        ? "Below reliable pitch range"
        : "Waiting for a stable signal";
  }
  $("#spectrum-window").textContent =
    ((1000 * data.trace.length) / rate).toFixed(0) +
    " ms window · " +
    (rate / data.trace.length).toFixed(2) +
    " Hz bins · listening time";
}
let visualMax = 0.05;
function draw() {
  const { w, h } = size(field),
    sx = w / NX,
    sy = h / NY;
  let max = 0;
  for (const p of [...data.p, ...data.bore]) max = Math.max(max, Math.abs(p));
  visualMax = Math.max(0.02, max, visualMax * 0.985);
  for (let i = 0; i < data.p.length; i++) {
    const x = i % NX,
      y = Math.floor(i / NX),
      along = (x + 0.5 - X0) * DX;
    const pressure =
      y > TOP && y < BOTTOM && along >= 0 && along <= LENGTH
        ? data.bore[Math.min(127, Math.round((along / LENGTH) * 127))]
        : data.p[i];
    const value = pressure / visualMax,
      alpha = Math.min(1, Math.pow(Math.abs(value), 0.55) * 2.4),
      color = value > 0 ? [244, 174, 115] : [82, 191, 192];
    for (let j = 0; j < 3; j++)
      pixels.data[i * 4 + j] = Math.round(
        [13, 13, 19][j] * (1 - alpha) + color[j] * alpha,
      );
    pixels.data[i * 4 + 3] = 255;
  }
  r.putImageData(pixels, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(raster, 0, 0, w, h);
  g.strokeStyle = "#ffffff09";
  g.lineWidth = 1;
  for (let x = 0; x < NX; x += 5) {
    g.beginPath();
    g.moveTo(x * sx, 0);
    g.lineTo(x * sx, h);
    g.stroke();
  }
  for (let y = 0; y < NY; y += 5) {
    g.beginPath();
    g.moveTo(0, y * sy);
    g.lineTo(w, y * sy);
    g.stroke();
  }
  g.fillStyle = "#999aaa";
  g.fillRect(X0 * sx, TOP * sy, (LENGTH / DX) * sx, sy);
  g.fillRect(X0 * sx, BOTTOM * sy, (LENGTH / DX) * sx, sy);
  HOLES.forEach((x, i) => {
    if (open[i]) {
      g.fillStyle = "#101017";
      g.fillRect((x - 0.35) * sx, TOP * sy, 0.7 * sx, sy);
    }
  });
  g.font = `${Math.max(10, w / 95)}px monospace`;
  g.textAlign = "center";
  if (field.clientWidth > 550)
    HOLES.forEach((x, i) => {
      g.fillStyle = open[i] ? "#ebbd88" : "#9eaa9d";
      g.fillText(KEYS[i].toUpperCase(), (x + 0.5) * sx, (TOP - 2) * sy);
    });
  // Recorder head: a sealed windway over a block, ending at an OPEN window.
  // The fixed arrow denotes steady mean breath, not oscillating resolved flow.
  g.fillStyle = "#676978";
  g.fillRect((X0 - 6) * sx, TOP * sy, 6 * sx, (BOTTOM - TOP + 1) * sy);
  g.fillStyle = "#0d0d13";
  g.fillRect((X0 - 6) * sx, (TOP + 0.55) * sy, 6.5 * sx, 0.6 * sy);
  g.fillRect(X0 * sx, TOP * sy, 1.8 * sx, sy);
  g.fillStyle = "#c4c5d4";
  g.beginPath();
  g.moveTo((X0 + 1.8) * sx, TOP * sy);
  g.lineTo((X0 + 1.8) * sx, (TOP + 1) * sy);
  g.lineTo((X0 + 0.8) * sx, (TOP + 1) * sy);
  g.closePath();
  g.fill();
  g.strokeStyle = "#a5b4fc";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo((X0 - 7.5) * sx, (TOP + 0.85) * sy);
  g.lineTo((X0 + 0.5) * sx, (TOP + 0.85) * sy);
  g.stroke();
  g.beginPath();
  g.moveTo((X0 - 0.2) * sx, (TOP + 0.4) * sy);
  g.lineTo((X0 + 0.5) * sx, (TOP + 0.85) * sy);
  g.lineTo((X0 - 0.2) * sx, (TOP + 1.3) * sy);
  g.stroke();
  if (field.clientWidth > 550) {
    g.fillStyle = "#a5b4fc";
    g.textAlign = "left";
    g.fillText("SEALED WINDWAY", (X0 - 7) * sx, (BOTTOM + 4) * sy);
    g.fillStyle = "#f3b17b";
    g.fillText("OPEN WINDOW / LABIUM", (X0 - 3) * sx, (TOP - 5) * sy);
    g.strokeStyle = "#f3b17b66";
    g.beginPath();
    g.moveTo((X0 + 1) * sx, (TOP - 4) * sy);
    g.lineTo((X0 + 1) * sx, (TOP - 0.5) * sy);
    g.stroke();
  }
  const mx = ((data.mic % NX) + 0.5) * sx,
    my = (Math.floor(data.mic / NX) + 0.5) * sy;
  g.strokeStyle = "#f3b17b";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(mx, my, (7 * w) / 1000, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(mx, my + (8 * w) / 1000);
  g.lineTo(mx, my + (17 * w) / 1000);
  g.stroke();
  g.fillStyle = "#f3b17b";
  g.fillText("MIC", mx + (12 * w) / 1000, my + (4 * w) / 1000);
  g.fillStyle = "#a2aea0";
  g.textAlign = "center";
  g.fillText(
    `${LENGTH.toFixed(3)} m BORE`,
    ((X0 + X1) / 2) * sx,
    (BOTTOM + 5) * sy,
  );
  $("#clock").textContent = data.time.toFixed(4) + " s simulated";
  const sw = size(scope);
  s.clearRect(0, 0, sw.w, sw.h);
  s.strokeStyle = "#d6dcd1";
  s.lineWidth = 1;
  s.beginPath();
  s.moveTo(0, sw.h / 2);
  s.lineTo(sw.w, sw.h / 2);
  s.stroke();
  let traceMax = 0.001,
    sq = 0;
  for (let i = 0; i < 2048; i++) {
    const p =
      data.trace[
        (data.traceIndex - 2048 + i + data.trace.length) % data.trace.length
      ];
    traceMax = Math.max(traceMax, Math.abs(p));
    sq += p * p;
  }
  s.strokeStyle = "#818cf8";
  s.lineWidth = 1.5;
  s.beginPath();
  for (let i = 0; i < 2048; i++) {
    const p =
      data.trace[
        (data.traceIndex - 2048 + i + data.trace.length) % data.trace.length
      ];
    const x = (i / 2047) * sw.w,
      y = sw.h / 2 - (p / traceMax) * sw.h * 0.4;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.stroke();
  $("#pressure").textContent = (data.p[data.mic] ?? 0).toFixed(3) + " Pa";
  $("#rms").textContent = "RMS " + Math.sqrt(sq / 2048).toFixed(3) + " Pa";
  $("#window").textContent = (
    (2048 / (ctx?.sampleRate ?? 48000)) *
    1000
  ).toFixed(0);
  if (performance.now() - lastFft > 100) {
    drawSpectrum();
    lastFft = performance.now();
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
window.addEventListener("pagehide", () => {
  void ctx?.close();
});

if (window.parent !== window) {
  new ResizeObserver(() =>
    window.parent.postMessage(
      {
        type: "recorder-lab-height",
        height: Math.ceil($("#app").getBoundingClientRect().height),
      },
      location.origin,
    ),
  ).observe($("#app"));
}

const howDialog = $<HTMLDialogElement>("#how-dialog");
$("#how-button").onclick = () => {
  releaseBreath();
  howDialog.showModal();
};
$("#how-close").onclick = () => howDialog.close();
$("#how-details").onclick = () => {
  howDialog.close();
  $<HTMLDetailsElement>("#model-details").open = true;
  $("#model-details").scrollIntoView({ behavior: "smooth", block: "start" });
};
