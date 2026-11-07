import { initGpu } from './gpu/device.ts';
import { analyseRing, type ModeSpectrum, MAX_MODE } from './sim/modes.ts';
import { DEFAULT_PARAMS, type Params } from './sim/params.ts';
import { GRID_SIZES, Solver, type MouseState, type ViewState } from './sim/solver.ts';
import { checkbox, h, segmented, slider } from './ui/controls.ts';
import { Tour } from './ui/tour.ts';

const SATURN_DAYS_PER_UNIT = 5.75; // time unit ≈ 61 h; Saturn day ≈ 10.6 h
const SIM_TIME_PER_FRAME = 0.012; // at speed 1 and 60 fps: one jet lap ≈ 5 s

/** Presets: jet widths that select the polygon. Tuned against the mode readout. */
const PRESETS: { name: string; sides: number; params: Partial<Params> }[] = [
  { name: 'Saturn ⬡', sides: 6, params: { jetWidth: 0.08, gamma: 5.3, relax: 1.2 } },
  { name: 'Pentagon', sides: 5, params: { jetWidth: 0.09, gamma: 5.3, relax: 1.2 } },
  { name: 'Square', sides: 4, params: { jetWidth: 0.11, gamma: 5.3, relax: 1.2 } },
  { name: 'Heptagon', sides: 7, params: { jetWidth: 0.07, gamma: 5.3, relax: 1.2 } },
  { name: 'Octagon', sides: 8, params: { jetWidth: 0.06, gamma: 5.3, relax: 1.2 } },
];

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const gpu = await initGpu(canvas);
  if (!gpu) return;
  const { device, context, format } = gpu;

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  let gridSize: number = coarse ? 256 : 512;
  let params: Params = { ...DEFAULT_PARAMS, ...PRESETS[0].params };
  const view: ViewState = { mode: 0, contours: 0, exposure: 1, showRing: false };
  const mouse: MouseState = { x: 0, y: 0, strength: 0, radius: 0.05 };
  let speed = 1;
  let paused = false;
  let solver = new Solver(device, gridSize, params, format);
  let spectrum: ModeSpectrum | null = null;
  let stableSince = 0; // ms the dominant mode has held
  let lastDominant = 0;

  // ---------- canvas sizing ----------
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  };
  window.addEventListener('resize', resize);
  resize();

  // ---------- pointer → domain coords ----------
  const toDomain = (ev: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    let x = ((ev.clientX - rect.left) / rect.width - 0.5) * 2;
    let y = ((ev.clientY - rect.top) / rect.height - 0.5) * 2;
    if (aspect > 1) x *= aspect;
    else y /= aspect;
    x /= 0.92;
    y /= 0.92;
    return { x, y: -y };
  };
  let dragging = false;
  canvas.addEventListener('pointerdown', (ev) => {
    dragging = true;
    canvas.setPointerCapture(ev.pointerId);
    const p = toDomain(ev);
    Object.assign(mouse, p, { strength: ev.shiftKey ? -60 : 60 });
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const p = toDomain(ev);
    Object.assign(mouse, p, { strength: ev.shiftKey ? -60 : 60 });
  });
  const stop = () => {
    dragging = false;
    mouse.strength = 0;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  // ---------- control panel ----------
  const panel = document.getElementById('panel')!;
  const applyParams = () => solver.setParams(params);
  const reset = () => {
    solver.reset();
    spectrum = null;
    stableSince = 0;
  };
  const rebuild = () => {
    solver.destroy();
    solver = new Solver(device, gridSize, params, format);
    spectrum = null;
    stableSince = 0;
  };

  const presetRow = h('div', { class: 'btnrow', title: 'Each preset is a jet width. The number of sides is the number of unstable-wave crests that fit around the jet: about 0.9 × jet radius ÷ jet width.' });
  const presetButtons = PRESETS.map((p) => {
    const b = h(
      'button',
      {
        type: 'button',
        title: `Jet width ${p.params.jetWidth} → about ${p.sides} wave crests fit around the jet, so the polygon has ${p.sides} sides. Presets only set the jet width (and reset rotation and forcing to Saturn's); the physics is identical.`,
      },
      p.name,
    );
    b.addEventListener('click', () => {
      params = { ...params, ...p.params };
      syncSliders();
      applyParams();
      reset();
      presetButtons.forEach((x) => x.classList.toggle('active', x === b));
    });
    presetRow.append(b);
    return b;
  });
  presetButtons[0].classList.add('active');

  const sWidth = slider({
    label: 'Jet width',
    help: 'The knob that picks the polygon. Narrow jet → more sides; wide jet → fewer.',
    min: 0.04, max: 0.14, step: 0.001, value: params.jetWidth,
    format: (v) => v.toFixed(3),
    onInput: (v) => { params.jetWidth = v; applyParams(); },
  });
  const sSpeed = slider({
    label: 'Jet speed',
    help: 'Peak eastward wind. Saturn: ≈ 100 m/s.',
    min: 0.4, max: 1.6, step: 0.01, value: params.jetSpeed,
    onInput: (v) => { params.jetSpeed = v; applyParams(); },
  });
  const sGamma = slider({
    label: 'Rotation gradient γ',
    help: 'How fast the Coriolis parameter falls off away from the pole (f = f₀ − γr²). The Rossby-wave ingredient. Saturn ≈ 5.',
    min: 0, max: 40, step: 0.1, value: params.gamma,
    format: (v) => v.toFixed(1),
    onInput: (v) => { params.gamma = v; applyParams(); },
  });
  const sRelax = slider({
    label: 'Jet forcing',
    help: 'Rate at which the flow is nudged back to the target jet. Also damps the wave — too strong and no polygon forms.',
    min: 0.05, max: 3, step: 0.01, value: params.relax, log: true,
    onInput: (v) => { params.relax = v; applyParams(); },
  });
  const sNu = slider({
    label: 'Viscosity',
    help: 'Kinematic viscosity. Small = crisper vortices, more small-scale life.',
    min: 3e-5, max: 2e-3, step: 1e-5, value: params.nu, log: true,
    format: (v) => v.toExponential(1),
    onInput: (v) => { params.nu = v; applyParams(); },
  });
  const sPole = slider({
    label: 'Polar vortex',
    help: 'The cyclone sitting on the pole itself — the eye in Cassini’s pictures.',
    min: 0, max: 1.5, step: 0.01, value: params.poleSpeed,
    onInput: (v) => { params.poleSpeed = v; applyParams(); },
  });
  const sSim = slider({
    label: 'Simulation speed',
    min: 0.1, max: 4, step: 0.05, value: speed,
    format: (v) => v.toFixed(2) + '×',
    onInput: (v) => { speed = v; },
  });
  const sExposure = slider({
    label: 'Contrast',
    min: 0.3, max: 3, step: 0.01, value: view.exposure,
    onInput: (v) => { view.exposure = v; },
  });
  const sContours = slider({
    label: 'Streamlines',
    help: 'Contours of the streamfunction ψ — the paths the air follows right now. 0 = off.',
    min: 0, max: 60, step: 1, value: view.contours,
    format: (v) => (v === 0 ? 'off' : String(v)),
    onInput: (v) => { view.contours = v; },
  });
  const syncSliders = () => {
    sWidth.set(params.jetWidth);
    sSpeed.set(params.jetSpeed);
    sGamma.set(params.gamma);
    sRelax.set(params.relax);
    sNu.set(params.nu);
    sPole.set(params.poleSpeed);
  };

  const viewSeg = segmented(['Cassini', 'Vorticity', 'Speed', 'Dye'], 0, (i) => { view.mode = i; });
  const ringCheck = checkbox('Mark the jet radius', false, (v) => { view.showRing = v; });

  const gridSelect = h('select') as HTMLSelectElement;
  for (const n of GRID_SIZES) gridSelect.append(h('option', { value: String(n) }, `${n} × ${n}`));
  gridSelect.value = String(gridSize);
  gridSelect.addEventListener('change', () => {
    gridSize = Number(gridSelect.value);
    rebuild();
  });

  const resetBtn = h('button', { type: 'button', class: 'primary' }, 'Restart');
  resetBtn.addEventListener('click', reset);
  const cloudsBtn = h('button', { type: 'button' }, 'Re-seed clouds');
  cloudsBtn.addEventListener('click', () => solver.resetTracers());
  const pauseBtn = h('button', { type: 'button' }, 'Pause');
  const togglePause = () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('active', paused);
  };
  pauseBtn.addEventListener('click', togglePause);

  panel.append(
    h('h2', {}, 'Polygon'),
    presetRow,
    sWidth.el,
    h('h2', {}, 'Planet'),
    sSpeed.el,
    sGamma.el,
    sRelax.el,
    sNu.el,
    sPole.el,
    h('h2', {}, 'View'),
    viewSeg.el,
    sContours.el,
    sExposure.el,
    ringCheck.el,
    h('h2', {}, 'Run'),
    sSim.el,
    h('div', { class: 'control' }, h('div', { class: 'head' }, h('span', {}, 'Grid')), gridSelect),
    h('div', { class: 'btnrow' }, resetBtn, pauseBtn, cloudsBtn),
  );

  window.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const tag = (ev.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return;
    if (ev.key === ' ') { ev.preventDefault(); togglePause(); }
    if (ev.key === 'r' || ev.key === 'R') reset();
    if (ev.key >= '1' && ev.key <= '4') { view.mode = Number(ev.key) - 1; viewSeg.set(view.mode); }
    if (ev.key === 's' || ev.key === 'S') { view.contours = view.contours ? 0 : 24; sContours.set(view.contours); }
  });

  // ---------- readouts ----------
  const sidesEl = document.getElementById('sides')!;
  const sidesSub = document.getElementById('sides-sub')!;
  const specEl = document.getElementById('spectrum')!;
  const statsEl = document.getElementById('stats')!;
  const bars = Array.from({ length: MAX_MODE }, (_, i) => {
    const b = h('div', { class: 'bar' }, h('span', {}, String(i + 1)));
    specEl.append(b);
    return b;
  });
  const NAMES = ['', 'a lopsided ring', 'an ellipse', 'a triangle', 'a square', 'a pentagon', 'a hexagon', 'a heptagon', 'an octagon', 'a nonagon', 'a decagon', 'an 11-gon', 'a 12-gon'];
  const readoutsEl = document.getElementById('readouts')!;

  const updateSpectrum = (s: ModeSpectrum) => {
    let max = 0;
    for (let m = 1; m <= MAX_MODE; m++) max = Math.max(max, s.power[m]);
    for (let m = 1; m <= MAX_MODE; m++) {
      const bar = bars[m - 1];
      bar.style.height = `${max > 0 ? (100 * s.power[m]) / max : 0}%`;
      bar.classList.toggle('top', m === s.dominant && s.purity > 0.3);
    }
    const confident = s.purity > 0.6 && max > 1e-3;
    if (confident) {
      if (s.dominant !== lastDominant) {
        lastDominant = s.dominant;
        stableSince = performance.now();
        readoutsEl.classList.remove('flash');
        void readoutsEl.offsetWidth;
        readoutsEl.classList.add('flash');
      }
      sidesEl.textContent = String(s.dominant);
      sidesEl.classList.toggle('hex', s.dominant === 6);
      sidesSub.textContent = `${NAMES[s.dominant] ?? s.dominant + '-gon'} · ${(s.purity * 100).toFixed(0)}% of the wave power`;
    } else {
      lastDominant = 0;
      sidesEl.textContent = '–';
      sidesEl.classList.remove('hex');
      sidesSub.textContent = max > 1e-3 ? 'modes competing…' : 'waiting for the jet to go unstable…';
    }
  };

  // ---------- tour ----------
  const tour = new Tour(
    [
      {
        title: 'Saturn, from above the north pole',
        body: 'This is a slab of atmosphere seen from straight above the pole. On the real planet a jet stream at 78°N races eastward at 100 m/s, and its edge traces a <b>hexagon 30,000 km across</b> that has held its shape since Voyager saw it in 1980.<br><br>Here the same thing is being computed live on your GPU: 2D fluid dynamics on a rotating cap, nothing else. <b>Nothing in the code knows what a hexagon is.</b>',
        onEnter: () => { view.mode = 0; viewSeg.set(0); },
      },
      {
        title: 'The jet',
        body: 'The orange ring marks where the model keeps nudging the flow back toward an eastward jet — a stand-in for whatever deep process drives Saturn\'s. A jet like this is <b>barotropically unstable</b>: small wiggles on its flanks grow by feeding on the shear, exactly as a smoke plume starts to wobble.',
        onEnter: () => { view.showRing = true; ringCheck.set(true); view.mode = 1; viewSeg.set(1); },
        onLeave: () => { view.showRing = false; ringCheck.set(false); },
      },
      {
        title: 'Watch it go unstable',
        body: 'You are looking at <b>vorticity</b> — local spin. Amber spins counter-clockwise, blue clockwise. The jet started as two smooth rings of opposite spin plus a little noise. The noise is being amplified into waves, and the <b>sides</b> readout is counting how many crests fit around the ring.',
        onEnter: () => { view.mode = 1; viewSeg.set(1); },
        waitFor: { text: 'waiting for a dominant wave to lock in…', done: () => !!spectrum && spectrum.purity > 0.6 && stableSince > 0 && performance.now() - stableSince > 1500 },
      },
      {
        title: 'Why six?',
        body: 'For a smooth jet the fastest-growing wave has a wavelength of roughly <b>seven jet widths</b> (the classical Bickley-jet result). How many of those fit around a circle of the jet\'s radius decides the polygon. On Saturn the answer is six. Rotation (Rossby waves) and the forcing tidy it up and hold it steady.<br><br>Now switch to the cloud view: the bright, sharp-edged jet is the hexagon Cassini photographed.',
        onEnter: () => { view.mode = 0; viewSeg.set(0); },
      },
      {
        title: 'Make a pentagon',
        body: 'Try the <b>Jet width</b> slider or the presets in the panel. A wider jet fits fewer waves — five, then four. A narrower one gives seven or eight. This is exactly the experiment Aguiar, Read and colleagues did in 2010 with a spinning tank of water, and they got every polygon from 2 to 8.',
        onEnter: () => { document.getElementById('panel')!.classList.add('flash'); },
        onLeave: () => { document.getElementById('panel')!.classList.remove('flash'); },
      },
      {
        title: 'Stir it',
        body: '<b>Drag on the planet</b> to inject a storm (shift-drag for the opposite spin). Watch it get sheared into the jet, or trapped inside the polygon — the hexagon is a transport barrier, which is why its interior stays a different colour from the outside on Saturn.',
      },
      {
        title: 'What this is not',
        body: 'This is the rotating-tank version of Saturn: a single 2D layer. It reproduces the shape and the wave selection, but the real hexagon is deep, nearly stationary in the planet\'s frame, and lives in a stratified atmosphere — those parts need 3D. The write-up covers what is in the equations, what is not, and how the solver works.',
      },
    ],
    () => {
      try { localStorage.setItem('hex-storm-toured', '1'); } catch { /* ignore */ }
    },
  );
  document.getElementById('tour-btn')!.addEventListener('click', () => tour.start());
  let toured = false;
  try { toured = localStorage.getItem('hex-storm-toured') === '1'; } catch { /* ignore */ }
  if (!toured) tour.start();

  // ---------- main loop ----------
  document.getElementById('loading')?.remove();
  let frames = 0;
  let stepCount = 0;
  let lastStat = performance.now();
  let lastFrame = performance.now();
  let ringTick = 0;

  const renderFrame = (steps: number) => {
    const aspect = canvas.width / canvas.height;
    solver.frame(steps, view, mouse, context.getCurrentTexture().createView(), aspect);
    stepCount += steps;
    frames++;
    if (++ringTick % 6 === 0) {
      const s = solver;
      void s.readRing().then((ring) => {
        if (ring && s === solver) {
          spectrum = analyseRing(ring);
          updateSpectrum(spectrum);
        }
      }).catch(() => { /* solver was rebuilt mid-readback */ });
    }
  };

  // Debug/automation hook: drive frames without requestAnimationFrame.
  (window as unknown as { __hexStorm: unknown }).__hexStorm = {
    frame: (steps: number) => renderFrame(steps),
    run: async (n: number, steps = 10) => {
      for (let i = 0; i < n; i++) {
        renderFrame(steps);
        if (i % 4 === 3) await device.queue.onSubmittedWorkDone();
      }
      const ring = await solver.readRing();
      if (ring) { spectrum = analyseRing(ring); updateSpectrum(spectrum); }
      return { time: solver.time, spectrum };
    },
    get solver() { return solver; },
    snapshot: () => { renderFrame(0); return canvas.toDataURL('image/png'); },
    get spectrum() { return spectrum; },
    setParams: (p: Partial<Params>) => { params = { ...params, ...p }; syncSliders(); applyParams(); },
    reset,
    view,
  };

  const loop = () => {
    const now = performance.now();
    const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    // Frame-rate independent: target sim time per real second at 60 fps.
    const target = paused ? 0 : SIM_TIME_PER_FRAME * 60 * elapsed * speed;
    const steps = paused ? 0 : Math.max(1, Math.min(60, Math.round(target / solver.dt)));
    renderFrame(steps);

    if (now - lastStat > 500) {
      const fps = (frames * 1000) / (now - lastStat);
      const sps = (stepCount * 1000) / (now - lastStat);
      const laps = (solver.time * params.jetSpeed) / (2 * Math.PI * params.jetRadius);
      statsEl.replaceChildren(
        h('span', {}, 'time ', h('b', {}, `${(solver.time * SATURN_DAYS_PER_UNIT).toFixed(1)} Saturn days`)),
        h('span', {}, 'jet laps ', h('b', {}, laps.toFixed(1))),
        h('span', {}, 'grid ', h('b', {}, `${solver.n}²`)),
        h('span', {}, 'fps ', h('b', {}, fps.toFixed(0))),
        h('span', {}, 'steps/s ', h('b', {}, sps.toFixed(0))),
        h('span', {}, 'dt ', h('b', {}, solver.dt.toExponential(1))),
      );
      frames = 0;
      stepCount = 0;
      lastStat = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void main();
