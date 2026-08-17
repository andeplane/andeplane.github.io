import { Renderer, type Padding, type Transform } from './render/renderer';
import { clearProbe, createProbe, MAX_PROBES, sampleProbe } from './sim/probes';
import { Solver } from './sim/solver';
import type { ExcitationParams, HoleParams, Probe, TubeParams } from './sim/types';
import { Controls, DEFAULT_SPEED, formatSpeed } from './ui/controls';
import { CanvasInteractions } from './ui/interactions';
import { ProbePlot, updateProbeLegend } from './ui/probePlot';

const STEP_TIME_BUDGET_MS = 12; // per-frame compute ceiling, keeps the UI responsive
const MAX_STEPS_PER_FRAME = 6000;
let nextProbeId = 1;

let tube: TubeParams = {
  length: 1.0,
  diameter: 0.12,
  holes: [{ position: 0.45, diameter: 0.035 }],
};
let excitation: ExcitationParams = { strength: 0.6, pulseWidth: 0.3 };
let speed = DEFAULT_SPEED;
let paused = false;
let showParticles = true;
let pendingSteps = 0;
let probes: Probe[] = [];
let hoveredProbeId: number | null = null;
/** The clock only runs once there is something to watch. */
let running = false;
let simAccumulator = 0;
let peakEnergy = 0;

let solver = new Solver(tube);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
let transform: Transform = renderer.computeTransform(solver.layout.nx, solver.layout.ny);

const hudTime = document.getElementById('hud-time')!;
const hudSpeed = document.getElementById('hud-speed')!;
const hudEnergy = document.getElementById('hud-energy')!;
const legendScale = document.getElementById('legend-scale')!;
const probePlot = new ProbePlot(document.getElementById('probe-plot') as HTMLCanvasElement);
const probeLegend = document.getElementById('probe-legend')!;

/** The meter dock grows once there is a trace to show; the view resizes around it. */
function syncProbeDock(): void {
  const has = probes.length > 0;
  if (document.body.classList.contains('has-probes') === has) return;
  document.body.classList.toggle('has-probes', has);
  resize();
}

function rebuildSolver(nextTube: TubeParams): void {
  tube = nextTube;
  solver = new Solver(tube);
  running = false;
  simAccumulator = 0;
  peakEnergy = 0;
  resize();
}

function strike(): void {
  solver.strike(excitation);
  running = true;
  simAccumulator = 0;
  peakEnergy = 0;
  paused = false;
  // Each strike restarts the clock, so the meters restart with it and p(t) is
  // always read from t = 0 at the moment of the hit.
  for (const probe of probes) clearProbe(probe);
  controls.setPaused(false);
}

const controls = new Controls(tube, excitation, {
  onExcitationChange(next) {
    excitation = next;
  },
  onTubeChange(next) {
    rebuildSolver(next);
  },
  onStrike: strike,
  onPauseToggle() {
    paused = !paused;
    controls.setPaused(paused);
  },
  onStep() {
    pendingSteps += 40;
  },
  onReset() {
    solver.reset();
    running = false;
    simAccumulator = 0;
    peakEnergy = 0;
    for (const probe of probes) clearProbe(probe);
  },
  onClearProbes() {
    probes = [];
    hoveredProbeId = null;
    syncProbeDock();
  },
  onSpeedChange(next) {
    speed = next;
    controls.setSpeed(speed);
  },
  onParticlesToggle(next) {
    showParticles = next;
  },
  onControlsToggle(open) {
    document.body.classList.toggle('controls-visible', open);
    resize();
  },
});
controls.setSpeed(speed);
controls.setPaused(paused);
controls.setParticles(showParticles);

new CanvasInteractions(canvas, {
  getSolver: () => solver,
  getTransform: () => transform,
  getProbes: () => probes,
  onHoleUpdate(holeIndex, patch) {
    const holes = tube.holes.map((h, i) => (i === holeIndex ? { ...h, ...(patch as HoleParams) } : h));
    rebuildSolver({ ...tube, holes });
    controls.syncTube(tube);
  },
  onProbeAdd(fx, fy) {
    if (probes.length >= MAX_PROBES) probes = probes.slice(1);
    probes = [...probes, createProbe(nextProbeId++, fx, fy)];
    syncProbeDock();
  },
  onProbeRemove: removeProbe,
  onProbeHover(id) {
    hoveredProbeId = id;
  },
});

function removeProbe(id: number): void {
  probes = probes.filter((p) => p.id !== id);
  if (hoveredProbeId === id) hoveredProbeId = null;
  syncProbeDock();
}

/** Keeps the simulation centred in the screen area the floating panels leave free. */
function currentPadding(): Padding {
  const narrow = window.innerWidth <= 700;
  const panelOpen = !narrow || document.body.classList.contains('controls-visible');
  const dock = document.body.classList.contains('has-probes');
  return {
    left: narrow ? 16 : 92,
    right: panelOpen && !narrow ? 348 : 16,
    top: narrow ? 96 : 136,
    bottom: narrow ? (dock ? 190 : 104) : dock ? 232 : 96,
  };
}

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight, currentPadding());
  transform = renderer.computeTransform(solver.layout.nx, solver.layout.ny);
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space' || e.key === 'h') {
    e.preventDefault();
    strike();
  } else if (e.key === 'p') {
    paused = !paused;
    controls.setPaused(paused);
  } else if (e.key === 'r') {
    solver.reset();
    running = false;
    peakEnergy = 0;
  }
});

function frame(nowMs: number, lastMs: number): void {
  const wallDt = Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000));
  const dt = solver.layout.dt;

  let stepsToRun = 0;
  if (pendingSteps > 0) {
    stepsToRun = Math.min(pendingSteps, MAX_STEPS_PER_FRAME);
    pendingSteps -= stepsToRun;
  } else if (!paused && running) {
    // Accumulate fractional steps instead of rounding each frame, so playback
    // speed stays honest at 0.001× where a frame is a fraction of one step.
    simAccumulator += wallDt * speed;
    stepsToRun = Math.min(MAX_STEPS_PER_FRAME, Math.floor(simAccumulator / dt));
    simAccumulator -= stepsToRun * dt;
  }

  let stepsDone = 0;
  if (stepsToRun > 0) {
    const start = performance.now();
    while (stepsDone < stepsToRun) {
      solver.step();
      stepsDone++;
      // Sample inside the loop: at 1× a single frame covers thousands of
      // steps, and a meter that only sampled once per frame would alias the
      // waveform into nonsense.
      for (const probe of probes) sampleProbe(probe, solver);
      if (stepsDone % 200 === 0 && performance.now() - start > STEP_TIME_BUDGET_MS) break;
    }
  } else {
    for (const probe of probes) sampleProbe(probe, solver);
  }

  transform = renderer.render(solver, {
    probes,
    showParticles,
    labels: true,
    simDt: stepsDone * dt,
    hoveredProbeId,
  });
  probePlot.draw(probes);
  updateProbeLegend(probeLegend, probes, removeProbe);

  const energy = solver.tubeEnergy();
  if (energy > peakEnergy) peakEnergy = energy;

  hudTime.textContent = `t = ${(solver.simTime * 1000).toFixed(2)} ms`;
  hudSpeed.textContent = paused ? 'paused' : `${formatSpeed(speed)}× speed`;
  hudEnergy.textContent =
    peakEnergy > 0 ? `${Math.round((energy / peakEnergy) * 100)}% energy left in tube` : 'press Hit';
  legendScale.textContent = `±${formatPa(renderer.scalePa)}`;

  requestAnimationFrame((t) => frame(t, nowMs));
}

function formatPa(v: number): string {
  return v >= 100 ? `${Math.round(v)} Pa` : `${v.toFixed(1)} Pa`;
}

// Render one frame synchronously so the full labeled geometry is visible
// immediately, even before the animation loop's first callback fires.
renderer.render(solver, { probes, showParticles, labels: true, simDt: 0 });
requestAnimationFrame((t) => frame(t, t));
