/// <reference lib="webworker" />
import { World } from '../physics/world.ts';
import { measure } from '../physics/diagnostics.ts';
import { orbitalPeriod, type SimParams } from '../physics/params.ts';
import type { Averages, Frame, FromWorker, ToWorker } from './protocol.ts';

/**
 * The integrator, off the main thread.
 *
 * At full speed this loop runs a couple of hundred thousand steps per second, which is
 * far more than a rendered frame's budget allows. Running it here means the simulation
 * can saturate a core while the scene still draws at 60fps -- and it keeps the physics
 * modules free of any DOM or three.js import, so the same code runs in the headless
 * tuner unchanged.
 */

let world: World | null = null;
let params: SimParams | null = null;
let period = 1;
let running = false;
let speedMultiplier = 1;

let lastTick = 0;
let lastPost = 0;
let stepsSinceSample = 0;
let stepsRequested = 0;
let pending = 0;

/** Probe every so many steps, so the published averages cover whole orbits. */
const PROBE_INTERVAL = 256;
let stepsSinceProbe = 0;
let probeCount = 0;
const totals: Averages = blankAverages();
let averages: Averages = blankAverages();
let windowStart = 0;
let haveAverage = false;

function blankAverages(): Averages {
  return { distance: 0, omegaOrbit: 0, omegaSpin: 0, spinRatio: 0, bulgeLead: 0, tidalStrain: 0 };
}
let sampleStart = 0;
let stepsPerSecond = 0;
let saturated = false;

/**
 * Target apparent spin of the moon, in revolutions per second of wall clock, at 1x.
 *
 * The pacing is driven by this rather than by simulated time, because the two are not
 * the same thing to watch. What the eye tracks is the moon turning relative to the
 * planet, at (ratio - 1) turns per orbit -- so a fixed time-lapse rate strobes badly at
 * the start, when the moon is spinning at twice the orbital rate, and then crawls at the
 * end when it has almost stopped. Holding the *apparent* rate steady instead keeps the
 * motion legible the whole way through, and as a bonus spends the wall-clock budget
 * where something is actually happening.
 */
const TARGET_APPARENT_RPS = 1.6;
/** Bounds on the time-lapse rate, in orbits per second. */
const MIN_ORBITS_PER_SECOND = 0.6;
const MAX_ORBITS_PER_SECOND = 45;

const POST_INTERVAL_MS = 1000 / 60;
/** Ceiling on work per tick, so a slow machine falls behind instead of freezing. */
const MAX_STEPS_PER_TICK = 200000;
/**
 * Largest batch we will hold work back for, and the update rate we refuse to drop below.
 *
 * Batching exists because an unclamped message loop ticks every fraction of a
 * millisecond and the round trip then costs more than the integration. But a fixed floor
 * is a trap: at the default pace the simulation only needs ~14k steps a second, so a
 * 600-step batch advances the world 23 times a second while the screen draws 60. Two
 * frames in three then show nothing at all and the third jumps -- which reads as a
 * stutter no matter how correct the physics is. The floor is therefore capped so the
 * world always moves at least UPDATE_HZ times a second.
 */
const MAX_BATCH_FLOOR = 600;
const UPDATE_HZ = 240;

// setTimeout is clamped to a 4ms floor once a few callbacks have nested. At the step
// sizes here that idles roughly three quarters of the available time, capping the
// simulation far below what the core can actually do. A MessageChannel is not clamped.
const loop = new MessageChannel();
loop.port1.onmessage = () => tick();
// Paused, the unclamped loop would spin a core for nothing, so idle on a timer instead.
const schedule = () => {
  if (running) loop.port2.postMessage(0);
  else setTimeout(tick, 30);
};

const post = (message: FromWorker) => self.postMessage(message);

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
    case 'reset':
      params = message.params;
      world = new World(params);
      period = orbitalPeriod(params);
      lastTick = performance.now();
      sampleStart = lastTick;
      stepsSinceSample = 0;
      windowStart = 0;
      haveAverage = false;
      probeCount = 0;
      for (const key of Object.keys(totals) as (keyof Averages)[]) totals[key] = 0;
      post({ type: 'ready' });
      publish();
      break;
    case 'material':
      world?.setMaterial(message.stiffness, message.damping);
      break;
    case 'speed':
      speedMultiplier = message.multiplier;
      break;
    case 'running':
      running = message.running;
      lastTick = performance.now();
      break;
  }
};

function tick(): void {
  const now = performance.now();

  if (running && world && params) {
    // Advance by wall-clock elapsed time, not by a fixed step count. Tying the speed to
    // the frame rate would make the simulation run twice as fast on a 120Hz display.
    const elapsed = Math.min((now - lastTick) / 1000, 0.25);
    const wantedPerSecond = paceUnitsPerSecond() / params.dt;
    const wanted = elapsed * wantedPerSecond;
    pending += wanted;
    stepsRequested += wanted;

    // Batch, but never so coarsely that the world visibly jumps between updates.
    const floor = Math.max(1, Math.min(MAX_BATCH_FLOOR, wantedPerSecond / UPDATE_HZ));
    if (pending >= floor) {
      const steps = Math.min(Math.floor(pending), MAX_STEPS_PER_TICK);
      pending -= steps;
      for (let i = 0; i < steps; i++) {
        world.step(params.dt);
        if (++stepsSinceProbe >= PROBE_INTERVAL) {
          stepsSinceProbe = 0;
          accumulate(measure(world));
        }
      }
      stepsSinceSample += steps;
    }
  } else {
    pending = 0;
  }
  lastTick = now;

  if (now - sampleStart > 500) {
    stepsPerSecond = (stepsSinceSample * 1000) / (now - sampleStart);
    // Falling behind is a CPU limit, not a queue limit: the per-tick cap is never the
    // thing that bites. Compare what was asked for against what the clock allowed.
    saturated = running && stepsRequested > 0 && stepsSinceSample < stepsRequested * 0.85;
    stepsSinceSample = 0;
    stepsRequested = 0;
    sampleStart = now;
  }

  if (now - lastPost >= POST_INTERVAL_MS) {
    lastPost = now;
    publish();
  }

  schedule();
}

/**
 * Fold one probe into the running mean, and close the window once a whole orbit has
 * elapsed. The window has to be a whole orbit: anything shorter leaves part of the
 * eccentricity ripple in the average, which is exactly the sawtooth being averaged out.
 */
/** Simulated time per second of wall clock, chosen to hold the apparent spin steady. */
function paceUnitsPerSecond(): number {
  const relative = Math.abs(averages.spinRatio - 1);
  const orbitsPerSecond = clamp(
    (speedMultiplier * TARGET_APPARENT_RPS) / Math.max(relative, 1e-3),
    MIN_ORBITS_PER_SECOND * speedMultiplier,
    MAX_ORBITS_PER_SECOND * speedMultiplier,
  );
  return orbitsPerSecond * period;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function accumulate(d: ReturnType<typeof measure>): void {
  totals.distance += d.distance;
  totals.omegaOrbit += d.omegaOrbit;
  totals.omegaSpin += d.omegaSpin;
  totals.spinRatio += d.spinRatio;
  totals.bulgeLead += d.bulgeLead;
  totals.tidalStrain += d.tidalStrain;
  probeCount++;

  if (world && world.time - windowStart >= period) {
    const w = 1 / probeCount;
    averages = {
      distance: totals.distance * w,
      omegaOrbit: totals.omegaOrbit * w,
      omegaSpin: totals.omegaSpin * w,
      spinRatio: totals.spinRatio * w,
      bulgeLead: totals.bulgeLead * w,
      tidalStrain: totals.tidalStrain * w,
    };
    haveAverage = true;
    for (const key of Object.keys(totals) as (keyof Averages)[]) totals[key] = 0;
    probeCount = 0;
    windowStart = world.time;
  }
}

function publish(): void {
  if (!world) return;
  const diagnostics = measure(world);
  if (!haveAverage) {
    averages = {
      distance: diagnostics.distance,
      omegaOrbit: diagnostics.omegaOrbit,
      omegaSpin: diagnostics.omegaSpin,
      spinRatio: diagnostics.spinRatio,
      bulgeLead: diagnostics.bulgeLead,
      tidalStrain: diagnostics.tidalStrain,
    };
  }
  const frame: Frame = {
    diagnostics,
    averages,
    earth: Float32Array.from(world.earthPos),
    particles: Float32Array.from(world.pos),
    orbits: world.time / period,
    stepsPerSecond,
    saturated,
  };
  post({ type: 'frame', frame });
}

schedule();
