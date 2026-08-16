import { Renderer, type Transform } from './render/renderer';
import { sampleProbe } from './sim/probes';
import { Solver } from './sim/solver';
import type { ExcitationParams, HoleParams, Probe, TubeParams } from './sim/types';
import { Controls } from './ui/controls';
import { CanvasInteractions } from './ui/interactions';
import { drawProbePlot, updateProbeLegend } from './ui/probePlot';

const STEP_TIME_BUDGET_MS = 12; // per-frame compute ceiling, keeps the UI responsive
const MAX_STEPS_PER_FRAME = 6000;
let nextProbeId = 1;

let tube: TubeParams = {
  length: 1.0,
  diameter: 0.12,
  holes: [{ position: 0.45, diameter: 0.035 }],
};
let excitation: ExcitationParams = { strength: 0.6, pulseWidth: 0.3 };
let speed = 0.03;
let paused = false;
let pendingSteps = 0;
let probes: Probe[] = [];

let solver = new Solver(tube);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
let transform: Transform = renderer.computeTransform(solver.layout.nx, solver.layout.ny);

const hudTime = document.getElementById('hud-time')!;
const hudSpeed = document.getElementById('hud-speed')!;
const probePlotCanvas = document.getElementById('probe-plot') as HTMLCanvasElement;
const probeLegend = document.getElementById('probe-legend')!;

function rebuildSolver(nextTube: TubeParams): void {
  tube = nextTube;
  solver = new Solver(tube);
}

const controls = new Controls(tube, excitation, {
  onExcitationChange(next) {
    excitation = next;
  },
  onTubeChange(next) {
    rebuildSolver(next);
  },
  onStrike() {
    solver.strike(excitation);
    paused = false;
    controls.setPaused(false);
  },
  onPauseToggle() {
    paused = !paused;
    controls.setPaused(paused);
  },
  onStep() {
    pendingSteps += 40;
  },
  onReset() {
    solver.reset();
  },
  onSpeedChange(next) {
    speed = next;
    controls.setSpeed(speed);
  },
  onControlsToggle(open) {
    document.body.classList.toggle('controls-visible', open);
  },
});
controls.setSpeed(speed);
controls.setPaused(paused);

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
    if (probes.length >= 4) probes = probes.slice(1);
    probes = [...probes, { id: nextProbeId++, fx, fy, history: [] }];
  },
  onProbeRemove(id) {
    probes = probes.filter((p) => p.id !== id);
  },
});

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
  transform = renderer.computeTransform(solver.layout.nx, solver.layout.ny);
}
window.addEventListener('resize', resize);
resize();

function frame(nowMs: number, lastMs: number): void {
  const wallDt = Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000));

  let stepsToRun = 0;
  if (pendingSteps > 0) {
    stepsToRun = Math.min(pendingSteps, MAX_STEPS_PER_FRAME);
    pendingSteps -= stepsToRun;
  } else if (!paused) {
    const simSeconds = wallDt * speed;
    stepsToRun = Math.min(MAX_STEPS_PER_FRAME, Math.round(simSeconds / solver.layout.dt));
  }

  if (stepsToRun > 0) {
    const start = performance.now();
    let done = 0;
    while (done < stepsToRun) {
      solver.step();
      done++;
      if (done % 200 === 0 && performance.now() - start > STEP_TIME_BUDGET_MS) break;
    }
  }

  for (const probe of probes) sampleProbe(probe, solver);

  transform = renderer.render(solver, { showVelocity: false, probes, labels: true });
  drawProbePlot(probePlotCanvas, probes);
  updateProbeLegend(probeLegend, probes);

  hudTime.textContent = `t = ${(solver.simTime * 1000).toFixed(2)} ms`;
  hudSpeed.textContent = paused ? '(paused)' : `playback ${speed}×`;

  requestAnimationFrame((t) => frame(t, nowMs));
}

// Render one frame synchronously so the full labeled geometry is visible
// immediately, even before the animation loop's first callback fires.
renderer.render(solver, { showVelocity: false, probes, labels: true });
requestAnimationFrame((t) => frame(t, t));
