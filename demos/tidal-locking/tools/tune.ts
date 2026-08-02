/**
 * Headless driver used to pick the material constants.
 *
 * The point of this file is to prove that locking actually happens -- and how fast --
 * before a single line of rendering code exists. Run it with:
 *
 *   npm run tune -- --stiffness=4e-5 --damping=2.2e-4 --orbits=120
 */
import { World } from '../src/physics/world.ts';
import { measure } from '../src/physics/diagnostics.ts';
import { DEFAULT_PARAMS, orbitalPeriod, type SimParams } from '../src/physics/params.ts';

const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [key, value = 'true'] = a.slice(2).split('=');
      return [key, value];
    }),
);

const num = (key: string, fallback: number) =>
  argv[key] !== undefined ? Number(argv[key]) : fallback;

const params: SimParams = {
  ...DEFAULT_PARAMS,
  particleCount: num('particles', DEFAULT_PARAMS.particleCount),
  stiffness: num('stiffness', DEFAULT_PARAMS.stiffness),
  damping: num('damping', DEFAULT_PARAMS.damping),
  orbitRadius: num('radius', DEFAULT_PARAMS.orbitRadius),
  spinRatio: num('spin', DEFAULT_PARAMS.spinRatio),
  eccentricity: num('ecc', DEFAULT_PARAMS.eccentricity),
  neighborRadius: num('cutoff', DEFAULT_PARAMS.neighborRadius),
  dt: num('dt', DEFAULT_PARAMS.dt),
  relaxTime: num('relax', DEFAULT_PARAMS.relaxTime),
  selfGravity: argv.selfgravity === 'true',
};

const orbits = num('orbits', 100);
const samples = num('samples', 25);

const world = new World(params);
const period = orbitalPeriod(params);
const totalTime = orbits * period;
const steps = Math.round(totalTime / params.dt);
const sampleEvery = Math.max(1, Math.floor(steps / samples));

const bonds = world.springs.count;
const perParticle = (2 * bonds) / world.n;
const mp = world.particleMass;
const omegaSpring = Math.sqrt(params.stiffness / mp);
const zeta = params.damping / (2 * Math.sqrt(params.stiffness * mp));

console.log('--- setup ---');
console.log(`particles      ${world.n}`);
console.log(`bonds          ${bonds}  (${perParticle.toFixed(1)} per particle)`);
console.log(`particle mass  ${mp.toExponential(3)}`);
console.log(`orbital period ${period.toFixed(2)}  (omega = ${(2 * Math.PI / period).toExponential(3)})`);
console.log(`spring omega   ${omegaSpring.toExponential(3)}  (${(omegaSpring / (2 * Math.PI / period)).toFixed(1)}x orbital)`);
console.log(`damping ratio  ${zeta.toFixed(2)} ${zeta > 1 ? '(overdamped)' : '(underdamped)'}`);
console.log(`dt             ${params.dt}  -> ${Math.round(period / params.dt)} steps/orbit, ${steps} total`);
console.log(`stability      dt*omega_max ~ ${(params.dt * omegaSpring * Math.sqrt(perParticle)).toFixed(3)} (want < 0.5)`);
console.log(`damping limit  dt*c*z/m = ${(params.dt * params.damping * perParticle / mp).toFixed(3)} (want < 2)`);
console.log('');

const first = measure(world);
console.log('--- run ---');
console.log(
  ['orbits', 'dist', 'w_orb', 'w_spin', 'ratio', 'lead°', 'strain', 'dE/E', 'dL/L'].map((s) => s.padStart(9)).join(''),
);

const t0 = Date.now();
let lockedAt = -1;
// The moon rings elastically at a period far shorter than an orbit, so single-point
// samples alias badly and invent structure that is not there. Average each report over
// its whole window instead.
const probeEvery = Math.max(1, Math.round(1 / params.dt));
let acc = { n: 0, ratio: 0, lead: 0, strain: 0, dist: 0, wOrb: 0, wSpin: 0, dE: 0, dL: 0 };
const clearAcc = () => {
  acc = { n: 0, ratio: 0, lead: 0, strain: 0, dist: 0, wOrb: 0, wSpin: 0, dE: 0, dL: 0 };
};

for (let i = 0; i <= steps; i++) {
  if (i % probeEvery === 0) {
    const d = measure(world);
    if (!Number.isFinite(d.distance) || d.distance > 1e4) {
      console.log(`\nBLEW UP at orbit ${(world.time / period).toFixed(2)}`);
      break;
    }
    acc.n++;
    acc.ratio += d.spinRatio;
    acc.lead += d.bulgeLead;
    acc.strain += d.tidalStrain;
    acc.dist += d.distance;
    acc.wOrb += d.omegaOrbit;
    acc.wSpin += d.omegaSpin;
    acc.dE += (d.totalEnergy - first.totalEnergy) / Math.abs(first.totalEnergy);
    acc.dL += (d.angularMomentum - first.angularMomentum) / Math.abs(first.angularMomentum);
  }
  if (i % sampleEvery === 0 && acc.n > 0) {
    const w = 1 / acc.n;
    if (lockedAt < 0 && Math.abs(acc.ratio * w - 1) < 0.03) lockedAt = world.time / period;
    const row = [
      (world.time / period).toFixed(1),
      (acc.dist * w).toFixed(4),
      (acc.wOrb * w).toExponential(2),
      (acc.wSpin * w).toExponential(2),
      (acc.ratio * w).toFixed(4),
      ((acc.lead * w * 180) / Math.PI).toFixed(2),
      (acc.strain * w).toFixed(4),
      (acc.dE * w).toExponential(1),
      (acc.dL * w).toExponential(1),
    ];
    console.log(row.map((s) => s.padStart(9)).join(''));
    clearAcc();
  }
  world.step(params.dt);
}

const wall = (Date.now() - t0) / 1000;
const final = measure(world);
// The locked moon librates, so a single end-point sample is noisy. Average one orbit.
const tail = averageOverOneOrbit();

console.log('');
console.log(`wall clock     ${wall.toFixed(2)} s for ${orbits} orbits  (${(orbits / wall).toFixed(1)} orbits/s)`);
console.log(`steps/sec      ${(steps / wall / 1e6).toFixed(2)} M`);
console.log(`locked (3%)    ${lockedAt >= 0 ? `orbit ${lockedAt.toFixed(1)}` : 'NOT LOCKED'}`);
console.log(`final ratio    ${tail.ratio.toFixed(4)} (averaged over the last orbit)`);
console.log(`final strain   ${(tail.strain * 100).toFixed(2)} %`);
console.log(`recession      ${(((tail.dist - first.distance) / first.distance) * 100).toFixed(3)} %`);
console.log(`energy drift   ${((final.totalEnergy - first.totalEnergy) / Math.abs(first.totalEnergy)).toExponential(2)}`);
console.log(`ang.mom drift  ${((final.angularMomentum - first.angularMomentum) / Math.abs(first.angularMomentum)).toExponential(2)}`);
console.log('');
console.log('--- angular momentum budget (spin should drain into the orbit) ---');
report('spin  ', first.spinAngularMomentum, final.spinAngularMomentum);
report('orbit ', first.orbitAngularMomentum, final.orbitAngularMomentum);
report('total ', first.angularMomentum, final.angularMomentum);
console.log(`heat           ${final.heat.toExponential(3)}  (${((final.heat / Math.abs(first.kinetic)) * 100).toFixed(2)} % of initial KE)`);

function report(label: string, a: number, b: number): void {
  const sign = b - a >= 0 ? '+' : '';
  console.log(`${label}         ${a.toExponential(4)} -> ${b.toExponential(4)}   (${sign}${(b - a).toExponential(2)})`);
}

function averageOverOneOrbit(): { ratio: number; strain: number; dist: number } {
  let ratio = 0;
  let strain = 0;
  let dist = 0;
  let count = 0;
  const n = Math.round(period / params.dt);
  for (let i = 0; i < n; i++) {
    if (i % probeEvery === 0) {
      const d = measure(world);
      ratio += d.spinRatio;
      strain += d.tidalStrain;
      dist += d.distance;
      count++;
    }
    world.step(params.dt);
  }
  return { ratio: ratio / count, strain: strain / count, dist: dist / count };
}
