/**
 * Node-runnable correctness checks for the FDTD solver, independent of any
 * DOM/canvas code. Run with `npm run selftest`.
 */
import { C_SOUND } from '../src/physics/constants';
import { createProbe, PROBE_SAMPLE_INTERVAL, sampleProbe } from '../src/sim/probes';
import { Solver } from '../src/sim/solver';
import type { TubeParams } from '../src/sim/types';

let failures = 0;

function check(name: string, cond: boolean, detail: string): void {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

function makeSolver(tube: TubeParams): Solver {
  return new Solver(tube);
}

function midY(solver: Solver): number {
  return Math.round((solver.layout.tubeY0 + solver.layout.tubeY1) / 2);
}

/** Runs until `stopAt(step)` is true, tracking the peak |pressure| seen at each probe. */
function trackPeaks(
  solver: Solver,
  probes: { x: number; y: number }[],
  maxSteps: number,
): { peak: number; peakStep: number }[] {
  const results = probes.map(() => ({ peak: 0, peakStep: -1 }));
  for (let step = 0; step < maxSteps; step++) {
    solver.step();
    probes.forEach((probe, i) => {
      const v = Math.abs(solver.pressureAt(probe.x, probe.y));
      if (v > results[i].peak) {
        results[i].peak = v;
        results[i].peakStep = step;
      }
    });
  }
  return results;
}

console.log('1) wave speed matches the speed of sound in a plain tube');
{
  const tube: TubeParams = { length: 1.5, diameter: 0.1, holes: [] };
  const solver = makeSolver(tube);
  solver.strike({ strength: 0.8, pulseWidth: 0.3 });
  const y = midY(solver);
  const { tubeX0, tubeX1 } = solver.layout;
  const xA = tubeX0 + 15;
  const xB = tubeX1 - 15;
  const distanceCells = xB - xA;
  const distanceM = distanceCells * solver.layout.h;
  const expectedSteps = Math.ceil((distanceM / C_SOUND / solver.layout.dt) * 1.6);

  const [peakA, peakB] = trackPeaks(
    solver,
    [
      { x: xA, y },
      { x: xB, y },
    ],
    expectedSteps,
  );

  const measuredSpeed = distanceM / ((peakB.peakStep - peakA.peakStep) * solver.layout.dt);
  const relError = Math.abs(measuredSpeed - C_SOUND) / C_SOUND;
  check(
    'both probes saw a clear pulse',
    peakA.peak > 1 && peakB.peak > 1,
    `peakA=${peakA.peak.toFixed(2)} Pa, peakB=${peakB.peak.toFixed(2)} Pa`,
  );
  check(
    `measured speed ${measuredSpeed.toFixed(1)} m/s within 8% of c=${C_SOUND} m/s`,
    relError < 0.08,
    `relative error ${(relError * 100).toFixed(1)}%`,
  );
}

console.log('\n2) solver stays bounded (CFL-stable) over many steps');
{
  const tube: TubeParams = {
    length: 1.5,
    diameter: 0.12,
    holes: [{ position: 0.5, diameter: 0.08 }],
  };
  const solver = makeSolver(tube);
  solver.strike({ strength: 1, pulseWidth: 0.05 });
  let maxAbs = 0;
  let sawNaN = false;
  for (let step = 0; step < 20000; step++) {
    solver.step();
    for (let i = 0; i < solver.p.length; i += 37) {
      const v = solver.p[i];
      if (!Number.isFinite(v)) {
        sawNaN = true;
        break;
      }
      if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
    if (sawNaN) break;
  }
  check('no NaN/Infinity after 20000 steps', !sawNaN, 'found non-finite pressure');
  check(
    `pressure stays bounded (max |p| = ${maxAbs.toFixed(1)} Pa)`,
    maxAbs < 5000,
    `max |p| = ${maxAbs} Pa, expected a bounded decaying field`,
  );
}

console.log('\n3) sponge boundary absorbs outgoing waves (no bounce-back)');
{
  const tube: TubeParams = { length: 1.0, diameter: 0.12, holes: [] };
  const solver = makeSolver(tube);
  solver.strike({ strength: 1, pulseWidth: 0.2 });
  const y = midY(solver);
  const probeX = solver.layout.tubeX1 - 5; // just inside the open end
  const steps = 30000;
  let peak = 0;
  let peakStep = -1;
  let afterPeakMax = 0;
  for (let step = 0; step < steps; step++) {
    solver.step();
    const v = Math.abs(solver.pressureAt(probeX, y));
    if (v > peak) {
      peak = v;
      peakStep = step;
    }
    // Look for any late resurgence well after the initial pulse + one full
    // tube transit (a reflection off the sponge would show up here).
    if (peakStep >= 0 && step > peakStep + 2000) {
      if (v > afterPeakMax) afterPeakMax = v;
    }
  }
  const ratio = afterPeakMax / peak;
  check(
    `late-time residual stays small (${(ratio * 100).toFixed(2)}% of peak)`,
    ratio < 0.08,
    `peak=${peak.toFixed(2)} Pa, late max=${afterPeakMax.toFixed(2)} Pa`,
  );
}

console.log('\n4) hole diameter actually changes the physics (not just the drawing)');
{
  const base: TubeParams = { length: 1.2, diameter: 0.12, holes: [] };
  const small: TubeParams = { ...base, holes: [{ position: 0.4, diameter: 0.01 }] };
  const large: TubeParams = { ...base, holes: [{ position: 0.4, diameter: 0.09 }] };

  function downstreamAndHolePeaks(tube: TubeParams): { downstream: number; atHole: number } {
    const solver = makeSolver(tube);
    solver.strike({ strength: 0.8, pulseWidth: 0.2 });
    const y = midY(solver);
    const downstreamX = solver.layout.tubeX1 - 10;
    const gap = solver.layout.holeGaps[0];
    const holeExteriorX = Math.round((gap.x0 + gap.x1) / 2);
    const holeExteriorY = solver.layout.tubeY1 + solver.layout.wallThicknessCells + 8;
    const [downstream, atHole] = trackPeaks(
      solver,
      [
        { x: downstreamX, y },
        { x: holeExteriorX, y: holeExteriorY },
      ],
      12000,
    );
    return { downstream: downstream.peak, atHole: atHole.peak };
  }

  const smallRes = downstreamAndHolePeaks(small);
  const largeRes = downstreamAndHolePeaks(large);

  check(
    `large hole lets less through downstream (${largeRes.downstream.toFixed(2)} < ${smallRes.downstream.toFixed(2)} Pa)`,
    largeRes.downstream < smallRes.downstream,
    'expected the larger hole to divert more energy away from the downstream probe',
  );
  check(
    `large hole radiates more outside it (${largeRes.atHole.toFixed(2)} > ${smallRes.atHole.toFixed(2)} Pa)`,
    largeRes.atHole > smallRes.atHole,
    'expected the larger hole to radiate a stronger pulse into the atmosphere',
  );
}

console.log('\n5) a new strike starts from silence');
{
  const tube: TubeParams = { length: 1.0, diameter: 0.12, holes: [{ position: 0.5, diameter: 0.03 }] };
  const solver = makeSolver(tube);
  solver.strike({ strength: 1, pulseWidth: 0.3 });
  for (let step = 0; step < 3000; step++) solver.step();
  const beforeRestrike = solver.p.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  solver.strike({ strength: 1, pulseWidth: 0.3 });
  const afterRestrike = solver.p.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  check(
    'the tube was still ringing before the second strike',
    beforeRestrike > 1,
    `max |p| was only ${beforeRestrike.toFixed(2)} Pa — the first strike left nothing to clear`,
  );
  check(
    'striking again clears the field and the clock',
    afterRestrike === 0 && solver.simTime === 0,
    `max |p| = ${afterRestrike} Pa, t = ${solver.simTime}`,
  );
}

console.log('\n6) a pressure meter records the pulse arriving when it should');
{
  const tube: TubeParams = { length: 1.4, diameter: 0.12, holes: [] };
  const solver = makeSolver(tube);
  const { tubeX0, tubeX1, nx, ny } = solver.layout;
  const x = tubeX1 - 12;
  const y = midY(solver);
  const probe = createProbe(1, x / nx, y / ny);
  solver.strike({ strength: 0.8, pulseWidth: 0.2 });

  const travelM = (x - solver.layout.sourceX) * solver.layout.h;
  const steps = Math.ceil(((travelM / C_SOUND) * 1.5) / solver.layout.dt);
  for (let step = 0; step < steps; step++) {
    solver.step();
    sampleProbe(probe, solver);
  }

  let peakIndex = 0;
  for (let i = 1; i < probe.p.length; i++) {
    if (Math.abs(probe.p[i]) > Math.abs(probe.p[peakIndex])) peakIndex = i;
  }
  const arrival = probe.t[peakIndex];
  const expected = travelM / C_SOUND;
  const relError = Math.abs(arrival - expected) / expected;
  check(
    'the meter recorded samples on the simulation clock',
    probe.t.length > 10 && probe.t[1] - probe.t[0] >= PROBE_SAMPLE_INTERVAL,
    `${probe.t.length} samples, first gap ${(probe.t[1] - probe.t[0]).toExponential(2)} s`,
  );
  check(
    `peak arrives at ${(arrival * 1000).toFixed(2)} ms, expected ${(expected * 1000).toFixed(2)} ms`,
    relError < 0.1 && probe.peak > 1,
    `relative error ${(relError * 100).toFixed(1)}%, peak ${probe.peak.toFixed(2)} Pa (tube ${tubeX0}..${tubeX1})`,
  );
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
