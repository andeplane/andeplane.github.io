import { Group, Vector3 } from 'three';
import { DEFAULT_PARAMS, orbitalPeriod, type SimParams } from './physics/params.ts';
import { SimDriver } from './sim/driver.ts';
import { createStage } from './render/scene.ts';
import { EarthView } from './render/earth.ts';
import { MoonView } from './render/moon.ts';
import { createStarfield } from './render/stars.ts';
import { TrailView } from './render/trail.ts';
import { ParticleView } from './render/particles.ts';
import { buildSpringNetworkPreview } from './render/springPreview.ts';
import { texturesReady } from './render/textures.ts';
import { Chart, SERIES_COLORS } from './ui/charts.ts';
import { Readouts, button, section, segmented, slider, toggle } from './ui/panel.ts';
import { createExplainer } from './ui/explainer.ts';

/** Earth is a point mass in the physics. On screen it needs a body. */
const EARTH_RENDER_RADIUS = 2.45;
/** The sun is off-stage; only its direction matters. */
/**
 * Phase angle held between the sun and the planet-moon line, in radians.
 *
 * About 54 degrees, which leaves the moon roughly 80% lit -- a fat gibbous. A full moon
 * has no terminator at all and reads completely flat, while a half moon hides half the
 * face we are trying to watch. It also has to work the other way round: full moon means
 * new Earth, so a small phase angle leaves the planet almost entirely dark in the views
 * that show both.
 */
const PHASE_ANGLE = 0.95;
/** Tilt of the sun out of the orbital plane, so the terminator is not vertical. */
const SUN_ELEVATION = 0.3;
const UP = new Vector3(0, 1, 0);
/** Where the moon is pinned in the co-rotating view, as an angle in the orbital plane. */
const MOON_SCREEN_BEARING = Math.PI / 2;

type ViewMode = 'fromEarth' | 'corotating' | 'fixed';

/** Camera placement for the view from the planet, in units of the planet's radius. */
const EYE_TOWARD_MOON = 0.4;
const EYE_ABOVE = 1.6;

const params: SimParams = { ...DEFAULT_PARAMS };
let period = orbitalPeriod(params);

const canvas = document.getElementById('view') as HTMLCanvasElement;
const stage = createStage(canvas);
const driver = new SimDriver(params);

// --- Scene ---------------------------------------------------------------------
stage.scene.add(createStarfield(900));

/**
 * Everything that orbits lives in here, and in the co-rotating view this whole group is
 * turned backwards by the moon's orbital angle.
 *
 * Rotating the frame rather than chasing it with the camera is what makes the view
 * watchable. This runs as a time lapse at roughly twelve orbits a second, so in a fixed
 * frame the moon jumps about seventy degrees between animation frames -- a strobe, not a
 * motion. Held still against a turning sky, the only movement left on the moon is its
 * rotation relative to the planet, which is the thing being demonstrated, and which
 * slows to a stop on its own.
 */
const orbitFrame = new Group();
stage.scene.add(orbitFrame);

const earth = new EarthView(stage.renderer, EARTH_RENDER_RADIUS);
orbitFrame.add(earth.group);

const moon = new MoonView(stage.renderer, params.moonRadius);
orbitFrame.add(moon.group);

const trail = new TrailView();
orbitFrame.add(trail.group);

let particles = new ParticleView(params.particleCount, buildSpringNetworkPreview(params));
orbitFrame.add(particles.points, particles.bonds);
particles.setVisible(false);

// --- View state ----------------------------------------------------------------
const view = {
  running: true,
  speed: 1,
  exaggeration: 6,
  trail: true,
  rings: true,
  nearSideMark: false,
  particles: false,
  mode: 'fromEarth' as ViewMode,
};

const explainer = createExplainer();
document.getElementById('explain')?.addEventListener('click', () => void explainer.open());

// --- Charts --------------------------------------------------------------------
const chartRoot = document.getElementById('charts')!;

const distanceChart = new Chart({
  title: 'Separation',
  format: (v) => v.toFixed(3),
  series: [{ key: 'distance', label: 'planet ↔ moon', color: SERIES_COLORS.distance }],
});

const rateChart = new Chart({
  title: 'Angular speed',
  format: (v) => v.toExponential(1),
  series: [
    { key: 'spin', label: 'moon spin', color: SERIES_COLORS.spin },
    { key: 'orbit', label: 'orbit', color: SERIES_COLORS.orbit },
  ],
});

const ratioChart = new Chart({
  title: 'Spin ÷ orbit',
  format: (v) => v.toFixed(2),
  series: [{ key: 'ratio', label: 'ratio', color: SERIES_COLORS.ratio }],
  reference: { value: 1, label: 'synchronous' },
  include: [1],
});

for (const chart of [distanceChart, rateChart, ratioChart]) chartRoot.append(chart.element);

// --- Readouts ------------------------------------------------------------------
const readoutRoot = document.getElementById('readouts')!;
const readouts = new Readouts(readoutRoot);
readouts.add('status', 'State');
readouts.add('orbits', 'Orbits');
readouts.add('ratio', 'Spin ÷ orbit', 'Reaches 1 when the moon is locked');
readouts.add('lead', 'Bulge lead', 'How far the tidal bulge runs ahead of the planet');
readouts.add('strain', 'Tidal bulge', 'Long axis over short axis, minus one');
readouts.add('heat', 'Heat made', 'Energy the springs have turned into warmth');
readouts.add('angmom', 'Ang. momentum', 'Total, relative to the start. Should not move');
readouts.add('perf', 'Steps/s');

// --- Controls ------------------------------------------------------------------
const controlRoot = document.getElementById('controls')!;

const playback = section(controlRoot, 'Playback');
const row = document.createElement('div');
row.className = 'row';
playback.append(row);
const playButton = button(row, 'Pause', () => setRunning(!view.running));
button(row, 'Restart', () => restart());

slider(playback, 'Speed', {
  min: 0.15,
  max: 10,
  value: 1,
  format: (v) => `${v.toFixed(2)}×`,
  onChange: (v) => {
    view.speed = v;
    driver.setSpeed(v);
  },
  hint: 'The time lapse is paced to keep the moon turning at a watchable rate, so it runs faster as the spin winds down. Locks in about five minutes at 1×.',
});

segmented(
  playback,
  'Point of view',
  [
    {
      value: 'fromEarth',
      label: 'From the planet',
      hint: 'Standing on the planet, watching the moon. Its face turns, slows, and finally holds still — which is exactly what "the same side always faces us" means.',
    },
    {
      value: 'corotating',
      label: 'Co-rotating',
      hint: 'The whole system from outside, with the moon pinned in place and the sky turning instead. Shows the orbit and the moon together.',
    },
    {
      value: 'fixed',
      label: 'Fixed',
      hint: 'A frame that does not turn. Honest, but at this time lapse the moon crosses the screen far too fast to follow.',
    },
  ],
  'fromEarth',
  (v) => {
    view.mode = v;
    if (v !== 'corotating') orbitFrame.rotation.y = 0;
    trail.reset();
    stage.setCameraDriven(v === 'fromEarth');
  },
);

const material = section(controlRoot, 'The moon’s insides');
slider(material, 'Internal friction', {
  min: 0,
  max: 6e-4,
  value: params.damping,
  format: (v) => (v === 0 ? 'none' : v.toExponential(1)),
  onChange: (v) => {
    params.damping = v;
    driver.setMaterial(params.stiffness, v);
  },
  hint: 'Turn it down and the locking slows in proportion. At zero the despin all but stops: with nothing to make the bulge lag, gravity has nothing off-axis to pull on. This one number is the mechanism.',
});
slider(material, 'Stiffness', {
  min: 4e-4,
  max: 6e-3,
  value: params.stiffness,
  scale: 'log',
  format: (v) => v.toExponential(1),
  onChange: (v) => {
    params.stiffness = v;
    driver.setMaterial(v, params.damping);
  },
  hint: 'A softer moon bulges more, so gravity has more to grip.',
});

const start = section(controlRoot, 'Starting conditions');
slider(start, 'Initial spin', {
  min: 0,
  max: 4,
  value: params.spinRatio,
  format: (v) => `${v.toFixed(2)}× orbit`,
  onChange: (v) => {
    params.spinRatio = v;
  },
  hint: 'Applied on restart. Above 1× the moon is spinning too fast and must slow down; below 1× it speeds up.',
});
slider(start, 'Orbit radius', {
  min: 6,
  max: 14,
  value: params.orbitRadius,
  format: (v) => `${v.toFixed(1)} R`,
  onChange: (v) => {
    params.orbitRadius = v;
  },
  hint: 'Applied on restart. Tidal torque falls off as the sixth power of distance.',
});
button(start, 'Apply and restart', () => restart());

const display = section(controlRoot, 'Display');
slider(display, 'Bulge exaggeration', {
  min: 1,
  max: 40,
  value: view.exaggeration,
  format: (v) => `${v.toFixed(0)}×`,
  onChange: (v) => {
    view.exaggeration = v;
  },
  hint: 'The real bulge is a fraction of a percent. This scales it for the eye and changes nothing in the physics.',
});
toggle(display, 'Orbit trail (fixed frame only)', view.trail, (v) => {
  view.trail = v;
  trail.setVisible(view.trail, view.rings);
});
toggle(display, 'Radius rings', view.rings, (v) => {
  view.rings = v;
  trail.setVisible(view.trail, view.rings);
});
toggle(display, 'Outline the near side', view.nearSideMark, (v) => {
  view.nearSideMark = v;
  moon.setNearSideMark(v);
});
toggle(display, 'Show particles and springs', view.particles, (v) => {
  view.particles = v;
  particles.setVisible(v);
});

// Drop the bottom fade once there is nothing left to scroll to.
const markScrollEnd = () => {
  const atEnd = controlRoot.scrollTop + controlRoot.clientHeight >= controlRoot.scrollHeight - 2;
  controlRoot.classList.toggle('at-end', atEnd);
};
controlRoot.addEventListener('scroll', markScrollEnd, { passive: true });
window.addEventListener('resize', markScrollEnd);
markScrollEnd();

// --- Loop ----------------------------------------------------------------------
const moonCentre = new Vector3();
const earthCentre = new Vector3();
const earthDirFromMoon = new Vector3();
const sunDirection = new Vector3();
const eyeToMoon = new Vector3();
const toMoonDir = new Vector3();
const eyeSide = new Vector3();

let lastChartSample = -Infinity;
let lastTrailSample = -Infinity;
let lastChartDraw = 0;
let earthSpin = 0;
let previousOrbits = 0;
let lockedAt: number | null = null;

driver.setSpeed(view.speed);
driver.setRunning(true);
// The default view drives the camera itself, so take it off the orbit controls now --
// otherwise they recompute the camera from their own spherical coordinates every frame
// and drag it wherever they please.
stage.setCameraDriven(view.mode === 'fromEarth');

function setRunning(running: boolean): void {
  view.running = running;
  driver.setRunning(running);
  playButton.textContent = running ? 'Pause' : 'Play';
}

function restart(): void {
  period = orbitalPeriod(params);
  lockedAt = null;
  previousOrbits = 0;
  trail.reset();
  for (const chart of [distanceChart, rateChart, ratioChart]) chart.clear();
  lastChartSample = -Infinity;
  lastTrailSample = -Infinity;

  orbitFrame.remove(particles.points, particles.bonds);
  particles = new ParticleView(params.particleCount, buildSpringNetworkPreview(params));
  particles.setVisible(view.particles);
  orbitFrame.add(particles.points, particles.bonds);

  driver.reset({ ...params });
  setRunning(true);
}

// Hold the splash until both the simulation has produced a frame and the imagery has
// decoded. The moon's colour map is a few megabytes, and revealing the scene before it
// lands shows a black disc where the subject should be.
let ready = false;
let texturesDone = false;
void texturesReady().then(() => {
  texturesDone = true;
});

let previousTime = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtWall = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;

  const snapshot = driver.frame;
  if (!snapshot) {
    stage.render();
    return;
  }
  ready = ready || texturesDone;

  if (ready) document.getElementById('loading')?.remove();

  const d = snapshot.diagnostics;
  earthCentre.set(snapshot.earth[0], snapshot.earth[1], snapshot.earth[2]);
  moonCentre.set(d.moonCentre[0], d.moonCentre[1], d.moonCentre[2]);

  earth.group.position.copy(earthCentre);
  moon.group.position.copy(moonCentre);
  moon.update(d.deformation, view.exaggeration);

  earthDirFromMoon.subVectors(earthCentre, moonCentre).normalize();

  // Hold the sun at a fixed angle to the planet-moon line rather than fixed against the
  // stars. Thousands of orbits a minute would otherwise cycle the moon's phase several
  // times a second and strobe the whole scene from lit to dark. Derived from the actual
  // moon direction so the phase comes out the same whichever way the orbit is going.
  const bearing = Math.atan2(moonCentre.z - earthCentre.z, moonCentre.x - earthCentre.x);
  toMoonDir.subVectors(moonCentre, earthCentre).normalize();
  sunDirection
    .copy(toMoonDir)
    .multiplyScalar(-1)
    .applyAxisAngle(UP, PHASE_ANGLE)
    .addScaledVector(UP, SUN_ELEVATION)
    .normalize();
  moon.setLighting(sunDirection, earthDirFromMoon);
  earthSpin += dtWall * 0.06;
  earth.update(sunDirection, earthSpin);

  particles.update(snapshot.particles);

  // Sample the trail and the charts in simulation time, so the curves have the same
  // shape whatever the frame rate or the speed setting.
  // Only the fixed frame has a wake worth drawing: elsewhere the moon does not move,
  // and old samples would be dragged around by the frame's own rotation.
  const orbitStep = snapshot.orbits - lastTrailSample;
  const wantTrail = view.mode === 'fixed';
  trail.setResolvable(wantTrail && orbitStep < 0.03);
  if (wantTrail && orbitStep > 0.004) {
    lastTrailSample = snapshot.orbits;
    trail.push(moonCentre);
  }
  trail.group.position.copy(earthCentre);
  trail.setRadii(d.distance);
  // From the planet's surface the orbit rings are just a stray line across the sky.
  trail.setVisible(view.mode === 'fixed' && view.trail, view.mode !== 'fromEarth' && view.rings);

  // Plot the orbit-averaged values, not the instantaneous ones: an orbit lasts a
  // fraction of a second, so single samples alias the orbital ripple into a sawtooth.
  const avg = snapshot.averages;
  if (snapshot.orbits - lastChartSample > 1.5) {
    lastChartSample = snapshot.orbits;
    distanceChart.push(snapshot.orbits, { distance: avg.distance });
    rateChart.push(snapshot.orbits, { spin: avg.omegaSpin, orbit: avg.omegaOrbit });
    ratioChart.push(snapshot.orbits, { ratio: avg.spinRatio });
  }

  // Charts are information, not animation: 15Hz is plenty and saves the frame budget.
  if (now - lastChartDraw > 66) {
    lastChartDraw = now;
    distanceChart.draw();
    rateChart.draw();
    ratioChart.draw();
    distanceChart.updateReadouts({ distance: avg.distance });
    rateChart.updateReadouts({ spin: avg.omegaSpin, orbit: avg.omegaOrbit });
    ratioChart.updateReadouts({ ratio: avg.spinRatio });
    updateReadouts(snapshot.orbits, d, avg, snapshot.stepsPerSecond, snapshot.saturated);
  }

  if (view.mode === 'corotating') {
    // Turn the frame so the moon sits at a fixed bearing: up and slightly right of the
    // planet from this camera. The starfield is outside the group, so the sky wheels
    // past instead -- which is exactly what an observer on the moon would see.
    orbitFrame.rotation.y = bearing + MOON_SCREEN_BEARING;
  } else if (view.mode === 'fromEarth') {
    placeEyeOnPlanet();
  }

  previousOrbits = snapshot.orbits;
  stage.render();
}


/**
 * Put the camera on the planet, looking at the moon.
 *
 * Offset above the surface and a little toward the moon, so the planet's limb curves
 * across the bottom of frame and gives the shot somewhere to stand. The moon then fills
 * a good share of the view and its rotation is legible directly -- no diagram required.
 */
function placeEyeOnPlanet(): void {
  eyeToMoon.subVectors(moonCentre, earthCentre).normalize();
  eyeSide.copy(UP).multiplyScalar(EARTH_RENDER_RADIUS * EYE_ABOVE);
  stage.camera.position
    .copy(earthCentre)
    .addScaledVector(eyeToMoon, EARTH_RENDER_RADIUS * EYE_TOWARD_MOON)
    .add(eyeSide);
  stage.camera.up.set(0, 1, 0);
  stage.camera.lookAt(moonCentre);
}

function updateReadouts(
  orbits: number,
  d: import('./physics/diagnostics.ts').Diagnostics,
  avg: import('./sim/protocol.ts').Averages,
  stepsPerSecond: number,
  saturated: boolean,
): void {
  const locked = Math.abs(avg.spinRatio - 1) < 0.03;
  if (locked && lockedAt === null) lockedAt = orbits;
  if (!locked && lockedAt !== null && Math.abs(avg.spinRatio - 1) > 0.08) lockedAt = null;

  readouts.set(
    'status',
    lockedAt !== null ? `locked after ${Math.round(lockedAt)} orbits` : 'despinning',
    lockedAt !== null ? 'good' : 'plain',
  );
  readouts.set('orbits', Math.round(orbits).toLocaleString());
  readouts.set('ratio', avg.spinRatio.toFixed(3));
  readouts.set('lead', `${((avg.bulgeLead * 180) / Math.PI).toFixed(2)}°`);
  readouts.set('strain', `${(avg.tidalStrain * 100).toFixed(3)} %`);
  readouts.set('heat', d.heat.toExponential(2));
  readouts.set('angmom', d.angularMomentum.toExponential(6));
  readouts.set(
    'perf',
    `${(stepsPerSecond / 1000).toFixed(0)}k${saturated ? ' (maxed)' : ''}`,
  );
  void previousOrbits;
  void period;
}

requestAnimationFrame(frame);
