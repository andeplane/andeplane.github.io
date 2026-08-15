import { initGpu, defaultSize } from './gpu/device.ts';
import { GEOMETRIES, SIZES, sitePosition, spinCountLabel, type GeometryKey } from './physics/lattice.ts';
import { onsagerMagnetization } from './physics/exact.ts';
import { Simulation, type Algorithm } from './sim/simulation.ts';
import { Observables, type Sample, type SampleTag } from './sim/observables.ts';
import { Statistics } from './sim/statistics.ts';
import { View, type ColormapKey } from './render/view.ts';
import { attachPointer, type PointerMode } from './interact/pointer.ts';
import { section, slider, segmented, toggle, button, Readouts } from './ui/panel.ts';
import { Chart, SERIES_COLORS } from './ui/charts.ts';
import { ScatterChart } from './ui/scatter.ts';
import { LoopChart } from './ui/loop.ts';
import { createTempDock } from './ui/tempdock.ts';
import { toast } from './ui/toast.ts';
import { createExplainer } from './ui/explainer.ts';
import { shouldWelcome, showWelcome, spotlightDock } from './ui/welcome.ts';
import { runSelfTest } from './selftest.ts';
import { storageGet, storageSet } from './storage.ts';

const T_MIN = 0.4;
const T_MAX = 5.0;
const H_SWEEP_AMPLITUDE = 0.3;
const H_SWEEP_PERIOD_MS = 30000;

async function start(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const gpu = await initGpu(canvas);
  if (!gpu) return;
  const { device } = gpu;

  const params = new URLSearchParams(location.search);
  if (params.has('selftest')) {
    void runSelfTest(device);
  }

  const availableSizes = SIZES.filter((L) => L * L * 4 <= device.limits.maxStorageBufferBindingSize);
  const urlGeometry = params.get('g') as GeometryKey | null;
  const geometry0: GeometryKey = urlGeometry && urlGeometry in GEOMETRIES ? urlGeometry : 'square';
  const urlL = Number(params.get('L'));
  const L0 = availableSizes.includes(urlL as (typeof SIZES)[number]) ? urlL : defaultSize(device);
  const urlT = Number(params.get('T'));
  const T0 = Number.isFinite(urlT) && urlT >= T_MIN && urlT <= T_MAX ? urlT : 4.0;
  const urlH = Number(params.get('h'));
  const h0 = Number.isFinite(urlH) && Math.abs(urlH) <= 1 ? urlH : 0;

  // --- Core objects -------------------------------------------------------
  const sim = new Simulation(device, L0, geometry0);
  sim.T = T0;
  sim.h = h0;
  const view = new View(gpu, canvas);
  const observables = new Observables(device);
  const stats = new Statistics();

  view.resize();
  view.setLattice(geometry0, L0);
  view.setSpins(sim.spins);
  sim.reset('random');
  new ResizeObserver(() => view.resize()).observe(canvas);

  const Tc = () => GEOMETRIES[sim.geometry.key].Tc;

  // --- Mutable UI state ---------------------------------------------------
  let paused = false;
  let stepOnce = false;
  let speedCap = 16;
  let sweepsPerFrame = 4;
  let pointerMode: PointerMode = 'paint';
  const brush = { radius: 24, value: 1 as 0 | 1 | 2 };
  let autoSweep = false;
  let autoSweepPhase = 0;
  let preQuenchT: number | null = null;
  let epoch = stats.currentEpoch;
  let urlDirty = false;
  let screenshotWanted = false;

  // Bumped by every user-visible intervention (any disturbance, or pausing); delayed
  // preset actions capture the value and abort if the world moved on under them.
  let actionGen = 0;

  function disturb(): void {
    actionGen++;
    epoch = stats.disturb(sim.sweepCount, sim.T, Tc());
  }

  const titlecard = document.getElementById('titlecard')!;
  function dimTitle(): void {
    titlecard.classList.add('dimmed');
  }

  // --- Onboarding ---------------------------------------------------------
  let dismissDockHint: (() => void) | null = null;
  function openGuide(): void {
    void showWelcome(Tc()).then(() => {
      dismissDockHint ??= spotlightDock();
    });
  }
  if (shouldWelcome()) openGuide();
  document.getElementById('help')!.addEventListener('click', openGuide);
  function noteDockUsed(): void {
    dismissDockHint?.();
    dismissDockHint = null;
  }

  // --- Temperature dock ---------------------------------------------------
  const dock = createTempDock(document.getElementById('tempdock')!, {
    min: T_MIN,
    max: T_MAX,
    value: sim.T,
    tc: Tc(),
    onChange: (T) => {
      sim.T = T;
      disturb();
      clearQuench();
      dimTitle();
      noteDockUsed();
      urlDirty = true;
    },
    onQuench: () => quench(),
  });

  function setT(T: number, animate = false): void {
    sim.T = Math.min(T_MAX, Math.max(T_MIN, T));
    dock.set(sim.T, animate);
    disturb();
    noteDockUsed();
    urlDirty = true;
  }

  function clearQuench(): void {
    if (preQuenchT !== null) {
      preQuenchT = null;
      dock.setQuenchLabel('❄ Quench');
    }
  }

  function quench(): void {
    dimTitle();
    if (preQuenchT === null) {
      preQuenchT = sim.T;
      setT(0.35 * Tc(), true);
      dock.setQuenchLabel('♨ Reheat');
      flashCold();
    } else {
      const back = preQuenchT;
      clearQuench();
      setT(back, true);
    }
  }

  function flashCold(): void {
    const el = document.getElementById('coldflash')!;
    el.classList.remove('flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('flash');
  }

  // --- Readouts -----------------------------------------------------------
  const readouts = new Readouts(document.getElementById('readouts')!);
  readouts.add('T', 'temperature', 'in units of J/k_B');
  readouts.add('phase', 'phase', 'relative to this lattice’s exact T_c');
  readouts.add('m', '|M| per spin', 'magnetization: the order parameter');
  readouts.add('e', 'E per spin', 'internal energy (J = 1)');
  readouts.add('acc', 'acceptance', 'accepted flips per attempt — the lattice’s pulse');
  readouts.add('sps', 'sweeps / s', 'full lattice updates per second');
  readouts.add('spins', 'spins', 'lattice sites being simulated');

  // --- Charts -------------------------------------------------------------
  const chartsRoot = document.getElementById('charts')!;
  const chartsHead = document.createElement('div');
  chartsHead.className = 'charts-head';
  const chartsTitle = document.createElement('h2');
  const collapsedKey = 'ising-charts-collapsed';
  const setCollapsed = (c: boolean) => {
    chartsRoot.classList.toggle('collapsed', c);
    chartsTitle.textContent = c ? 'Measurements ▸' : 'Measurements ▾';
    storageSet(collapsedKey, c ? '1' : '');
  };
  chartsTitle.addEventListener('click', () => setCollapsed(!chartsRoot.classList.contains('collapsed')));
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'clear';
  clearButton.addEventListener('click', () => {
    stats.clear(sim.geometry.key, sim.L);
    refreshScatters();
  });
  const sweepStatus = document.createElement('span');
  sweepStatus.className = 'sweep-status';
  chartsHead.append(chartsTitle, sweepStatus, clearButton);
  chartsRoot.append(chartsHead);

  const mChart = new Chart({
    title: 'magnetization m(t)',
    format: (v) => v.toFixed(2),
    series: [{ key: 'm', label: 'm', color: SERIES_COLORS.amber }],
    include: [-1, 1],
  });
  const eChart = new Chart({
    title: 'energy e(t)',
    format: (v) => v.toFixed(2),
    series: [{ key: 'e', label: 'e', color: SERIES_COLORS.blue }],
  });
  const scatterM = new ScatterChart({
    title: '⟨|M|⟩(T)',
    format: (v) => v.toFixed(2),
    color: SERIES_COLORS.amber,
    xDomain: [T_MIN, T_MAX],
    range: { min: 0, max: 1.05 },
  });
  const scatterChi = new ScatterChart({
    title: 'susceptibility χ(T)',
    format: (v) => formatCompact(v),
    color: SERIES_COLORS.violet,
    xDomain: [T_MIN, T_MAX],
    range: { min: 0 },
  });
  const scatterE = new ScatterChart({
    title: '⟨E⟩(T)',
    format: (v) => v.toFixed(2),
    color: SERIES_COLORS.blue,
    xDomain: [T_MIN, T_MAX],
    include: [0],
  });
  const scatterCv = new ScatterChart({
    title: 'heat capacity C_v(T)',
    format: (v) => formatCompact(v),
    color: SERIES_COLORS.green,
    xDomain: [T_MIN, T_MAX],
    range: { min: 0 },
  });
  const loopChart = new LoopChart('hysteresis m(h)', SERIES_COLORS.amber, H_SWEEP_AMPLITUDE + 0.05);
  loopChart.element.hidden = true;

  const scatters = [scatterM, scatterChi, scatterE, scatterCv];
  chartsRoot.append(mChart.element, eChart.element, ...scatters.map((s) => s.element), loopChart.element);
  setCollapsed(storageGet(collapsedKey) === '1');

  function applyGeometryToCharts(): void {
    const g = sim.geometry.key;
    for (const s of scatters) s.setTc(Tc());
    scatterM.setRefCurve(
      g === 'square' ? (T) => onsagerMagnetization(T) : null,
      g === 'square' ? 'Onsager, exact' : '',
    );
  }
  applyGeometryToCharts();

  function refreshScatters(): void {
    const points = stats.scatter(sim.geometry.key, sim.L);
    scatterM.setPoints(points.map((p) => ({ T: p.T, y: p.absM, n: p.n })));
    scatterE.setPoints(points.map((p) => ({ T: p.T, y: p.e, n: p.n })));
    scatterChi.setPoints(
      points.filter((p) => p.chi !== null).map((p) => ({ T: p.T, y: p.chi!, n: p.n })),
    );
    scatterCv.setPoints(
      points.filter((p) => p.cv !== null).map((p) => ({ T: p.T, y: p.cv!, n: p.n })),
    );
  }

  // --- Controls panel -----------------------------------------------------
  const controls = document.getElementById('controls')!;

  // Only the two headline groups start open — the rest are one click away, so the
  // panel reads as a short menu rather than a wall of widgets.
  const latticeGroup = section(controls, 'Lattice', true);
  segmented(
    latticeGroup,
    'Geometry',
    (Object.keys(GEOMETRIES) as GeometryKey[]).map((key) => ({
      value: key,
      label: GEOMETRIES[key].label,
      hint: `${GEOMETRIES[key].z} neighbors · T_c = ${GEOMETRIES[key].Tc.toFixed(3)}`,
    })),
    sim.geometry.key,
    (key) => {
      sim.setGeometry(key);
      view.setLattice(key, sim.L);
      dock.setTc(Tc());
      dock.setFound(isFound());
      applyGeometryToCharts();
      refreshScatters();
      disturb();
      urlDirty = true;
    },
  );
  segmented(
    latticeGroup,
    'Size',
    availableSizes.map((L) => ({
      value: String(L),
      label: `${L}²`,
      hint: `${spinCountLabel(L)} spins`,
    })),
    String(sim.L),
    (value) => {
      sim.setSize(Number(value));
      view.setLattice(sim.geometry.key, sim.L);
      view.setSpins(sim.spins);
      readouts.set('spins', spinCountLabel(sim.L));
      refreshScatters();
      disturb();
      urlDirty = true;
    },
  );

  const fieldGroup = section(controls, 'External field', false);
  const hSlider = slider(fieldGroup, 'Field h', {
    min: -1,
    max: 1,
    step: 0.005,
    value: sim.h,
    format: (v) => v.toFixed(3),
    hint: 'breaks the up/down symmetry — try it below T_c',
    onChange: (v) => {
      // Center detent: snap the interesting value, exactly zero.
      sim.h = Math.abs(v) < 0.02 ? 0 : v;
      if (sim.h !== v) hSlider.set(sim.h);
      disturb();
      urlDirty = true;
    },
  });
  const fieldRow = document.createElement('div');
  fieldRow.className = 'row';
  fieldGroup.append(fieldRow);
  button(fieldRow, 'h = 0', () => {
    sim.h = 0;
    hSlider.set(0);
    disturb();
    urlDirty = true;
  });
  const sweepButton = button(fieldRow, 'sweep: off', () => setAutoSweep(!autoSweep));

  function setAutoSweep(on: boolean): void {
    autoSweep = on;
    sweepButton.textContent = on ? 'sweep: on' : 'sweep: off';
    loopChart.element.hidden = !on;
    if (on) {
      autoSweepPhase = 0;
      loopChart.clear();
      setCollapsed(false);
      requestAnimationFrame(() => loopChart.element.scrollIntoView({ block: 'nearest' }));
    } else {
      sim.h = 0;
      hSlider.set(0);
    }
    disturb();
  }

  const dynamicsGroup = section(controls, 'Dynamics', false);
  segmented<Algorithm>(
    dynamicsGroup,
    'Update rule',
    [
      { value: 'metropolis', label: 'Metropolis', hint: 'flip if r < e^(−ΔE/T); the classic' },
      { value: 'glauber', label: 'Glauber', hint: 'flip if r < 1/(1+e^(ΔE/T)); same equilibrium' },
    ],
    sim.algorithm,
    (v) => {
      sim.algorithm = v;
      disturb();
    },
  );
  const speedSlider = slider(dynamicsGroup, 'Speed limit', {
    min: 1,
    max: 64,
    scale: 'log',
    value: speedCap,
    format: (v) => `${Math.round(v)} sw/frame`,
    hint: 'auto-tuned below this cap to hold frame rate',
    onChange: (v) => {
      speedCap = Math.round(v);
      sweepsPerFrame = Math.min(sweepsPerFrame, speedCap);
    },
  });
  function setSpeedCap(cap: number): void {
    speedCap = cap;
    sweepsPerFrame = Math.min(sweepsPerFrame, cap);
    speedSlider.set(cap);
  }
  const runRow = document.createElement('div');
  runRow.className = 'row';
  dynamicsGroup.append(runRow);
  const pauseButton = button(runRow, 'Pause', () => togglePause());
  pauseButton.title = 'Freeze or resume time (Space)';
  const stepButton = button(runRow, 'Step', () => {
    paused = true;
    pauseButton.textContent = 'Run';
    stepOnce = true;
  });
  stepButton.title = 'Advance a single sweep while paused (S)';
  function togglePause(): void {
    paused = !paused;
    actionGen++;
    pauseButton.textContent = paused ? 'Run' : 'Pause';
  }
  const resetRow = document.createElement('div');
  resetRow.className = 'row';
  dynamicsGroup.append(resetRow);
  button(resetRow, 'Randomize', () => resetLattice('random')).title =
    'Restart from pure noise — the T = ∞ configuration (R)';
  button(resetRow, 'All ↑', () => resetLattice('up')).title =
    'Restart from the uniform up ground state';
  button(resetRow, 'All ↓', () => resetLattice('down')).title =
    'Restart from the uniform down ground state';

  function resetLattice(mode: 'random' | 'up' | 'down'): void {
    sim.reset(mode);
    disturb();
  }

  const brushGroup = section(controls, 'Mouse & brush', false);
  segmented<PointerMode>(
    brushGroup,
    'Drag action',
    [
      { value: 'paint', label: 'Paint', hint: 'draw spins; scroll to zoom, alt-drag inverts' },
      { value: 'pan', label: 'Pan', hint: 'move around; scroll to zoom' },
    ],
    pointerMode,
    (v) => {
      pointerMode = v;
      pointer.refreshCursor();
    },
  );
  segmented(
    brushGroup,
    'Brush paints',
    [
      { value: '1', label: '↑ up' },
      { value: '0', label: '↓ down' },
      { value: '2', label: '~ random' },
    ],
    String(brush.value),
    (v) => {
      brush.value = Number(v) as 0 | 1 | 2;
    },
  );
  const radiusSlider = slider(brushGroup, 'Brush radius', {
    min: 2,
    max: 128,
    scale: 'log',
    value: brush.radius,
    format: (v) => `${Math.round(v)} cells`,
    onChange: (v) => {
      brush.radius = Math.round(v);
      pointer.refreshCursor();
    },
  });

  const experimentsGroup = section(controls, 'Experiments', true);

  // --- Automated temperature sweep: the answer to "how do I measure χ(T)?" -----
  // The honest way to measure the equilibrium curves is to anneal upward from an
  // ordered cold start, dwelling at each temperature until the statistics bin holds
  // enough equilibrated samples. Doing that by hand takes patience and protocol
  // knowledge; this does it automatically. Any user intervention cancels it.
  const SWEEP_SAMPLES_PER_STEP = 30;
  const SWEEP_MAX_DWELL_SWEEPS = 3000;
  let sweep: {
    steps: number[];
    index: number;
    collected: number;
    gen: number;
    startSweep: number;
  } | null = null;

  const measureButton = button(experimentsGroup, '▶ Measure the curve', () => toggleMeasureSweep());
  measureButton.title =
    'Anneal from cold to hot automatically, dwelling at each temperature to equilibrate and fill every chart';

  function sweepSteps(): number[] {
    const tc = Tc();
    const top = Math.min(T_MAX, 2.2 * tc);
    const steps: number[] = [];
    for (let t = Math.max(T_MIN, 0.3 * tc); t < top; t += Math.abs(t - tc) < 0.45 ? 0.06 : 0.2) {
      steps.push(Number(t.toFixed(3)));
    }
    steps.push(Number(top.toFixed(3)));
    return steps;
  }

  function toggleMeasureSweep(): void {
    if (sweep) {
      stopSweep('Measurement sweep stopped.');
      return;
    }
    setAutoSweepOffQuiet();
    if (paused) togglePause();
    sim.h = 0;
    hSlider.set(0);
    resetLattice('up');
    const steps = sweepSteps();
    setT(steps[0]);
    sweep = { steps, index: 0, collected: 0, gen: actionGen, startSweep: sim.sweepCount };
    updateSweepUi();
    toast(
      'Annealing from cold to hot: the lab dwells at each temperature, equilibrates, and measures. About a minute — touch anything to stop early.',
    );
  }

  function stopSweep(message: string | null): void {
    sweep = null;
    updateSweepUi();
    refreshScatters();
    if (message) toast(message);
  }

  function tickSweep(): void {
    if (!sweep) return;
    if (actionGen !== sweep.gen) {
      // The user intervened; their hands beat the protocol.
      stopSweep('Measurement sweep stopped.');
      return;
    }
    const dwell = sim.sweepCount - sweep.startSweep;
    if (sweep.collected < SWEEP_SAMPLES_PER_STEP && dwell < SWEEP_MAX_DWELL_SWEEPS) return;
    sweep.index++;
    if (sweep.index >= sweep.steps.length) {
      stopSweep('Sweep complete — your measurements against the exact curve.');
      return;
    }
    setT(sweep.steps[sweep.index], true);
    sweep.gen = actionGen;
    sweep.collected = 0;
    sweep.startSweep = sim.sweepCount;
    updateSweepUi();
  }

  function updateSweepUi(): void {
    measureButton.textContent = sweep ? '■ Stop the sweep' : '▶ Measure the curve';
    sweepStatus.textContent = sweep ? `measuring ${sweep.index + 1}/${sweep.steps.length}` : '';
  }

  button(experimentsGroup, 'Find the critical point', () => {
    setAutoSweepOffQuiet();
    setT(Math.min(T_MAX - 0.1, Tc() * 1.85));
    resetLattice('random');
    toast('Drag the temperature down slowly. When patches flicker at every size at once, you have found T_c.');
  });
  button(experimentsGroup, 'Shrinking droplet', () => {
    setAutoSweepOffQuiet();
    setT(0.6 * Tc());
    sim.reset('up');
    const [cx, cy] = sitePosition(sim.geometry.key, sim.L / 2, sim.L / 2);
    sim.queuePaint({ ax: cx, ay: cy, bx: cx, by: cy, radius: sim.L * 0.18, value: 0 });
    disturb();
    view.fit();
    toast('Curvature is the enemy: the droplet’s wall costs energy, so watch it shrink at a rate set by its radius.');
  });
  button(experimentsGroup, 'Hysteresis loop', () => {
    setT(0.75 * Tc());
    sim.reset('up');
    setAutoSweep(true);
    toast('The magnet remembers: m lags the sweeping field h. Cool further and the loop fattens.');
  });
  button(experimentsGroup, 'Supercritical quench', () => {
    setAutoSweepOffQuiet();
    setT(T_MAX);
    resetLattice('random');
    // Checkerboard dynamics coarsens fast; slow the clock so the mosaic is watchable.
    setSpeedCap(3);
    toast('Melting first… then an instant deep quench. Watch domains nucleate and coarsen — slowed down so you can see it.');
    // Captured after the setup calls above; if the user touches anything in the next
    // two seconds, the delayed quench aborts instead of clobbering their state.
    const gen = actionGen;
    setTimeout(() => {
      if (gen !== actionGen) return;
      setT(0.45 * Tc(), true);
      flashCold();
    }, 2000);
  });

  function setAutoSweepOffQuiet(): void {
    if (autoSweep) setAutoSweep(false);
  }

  const displayGroup = section(controls, 'Display', false);
  segmented<ColormapKey>(
    displayGroup,
    'Colors',
    [
      { value: 'ink', label: 'Ink' },
      { value: 'ember', label: 'Ember' },
    ],
    view.colormapKey,
    (v) => view.setColormap(v),
  );
  toggle(displayGroup, 'Motion smoothing', view.smoothing, (v) => {
    view.smoothing = v;
  });
  button(displayGroup, 'Reset view', () => view.fit());

  // Fade hint at the foot of the controls, dropped once fully scrolled.
  controls.addEventListener('scroll', () => {
    const atEnd = controls.scrollTop + controls.clientHeight >= controls.scrollHeight - 4;
    controls.classList.toggle('at-end', atEnd);
  });

  // --- Pointer, explainer, mobile bar --------------------------------------
  const pointer = attachPointer(canvas, view, {
    mode: () => pointerMode,
    brush: () => brush,
    onPaint: (stamp) => sim.queuePaint(stamp),
    onStroke: () => {
      disturb();
      dimTitle();
    },
  });

  const explainer = createExplainer();
  document.getElementById('explain')!.addEventListener('click', () => void explainer.open());

  const mobilebar = document.getElementById('mobilebar')!;
  mobilebar.hidden = false;
  document.getElementById('mb-controls')!.addEventListener('click', () => {
    chartsRoot.classList.remove('open');
    controls.classList.toggle('open');
  });
  document.getElementById('mb-charts')!.addEventListener('click', () => {
    controls.classList.remove('open');
    chartsRoot.classList.toggle('open');
    setCollapsed(false);
  });

  // --- Critical point badge ------------------------------------------------
  const foundKey = () => `ising-critical-${sim.geometry.key}`;
  const isFound = () => storageGet(foundKey()) === '1';
  dock.setFound(isFound());
  let criticalSince: number | null = null;

  function trackCritical(now: number): void {
    const near = Math.abs(sim.h) < 0.005 && Math.abs(sim.T - Tc()) / Tc() < 0.015 && !paused;
    if (!near || isFound()) {
      criticalSince = null;
      return;
    }
    criticalSince ??= now;
    if (now - criticalSince > 3000) {
      storageSet(foundKey(), '1');
      dock.setFound(true);
      const badge = document.createElement('div');
      badge.id = 'critbadge';
      badge.textContent = `✦ Critical point found — T_c = ${Tc().toFixed(3)} (${sim.geometry.label.toLowerCase()})`;
      document.body.append(badge);
      setTimeout(() => badge.remove(), 5000);
      criticalSince = null;
    }
  }

  // --- Screenshot ----------------------------------------------------------
  document.getElementById('shot')!.addEventListener('click', () => {
    screenshotWanted = true;
  });

  function takeScreenshot(): void {
    const bar = 46;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height + bar;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    ctx.fillStyle = '#0b0f1a';
    ctx.fillRect(0, canvas.height, out.width, bar);
    ctx.fillStyle = '#dbe3f2';
    ctx.font = `${Math.round(bar * 0.38)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `Ising Lab · ${sim.geometry.label.toLowerCase()} · T = ${sim.T.toFixed(3)} · ${spinCountLabel(sim.L)} spins · andeplane.github.io/demos/ising`,
      14,
      canvas.height + bar / 2,
    );
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ising-${sim.geometry.key}-T${sim.T.toFixed(2)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    });
  }

  // --- Keyboard ------------------------------------------------------------
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, dialog')) return;
    switch (event.key) {
      case ' ':
        togglePause();
        event.preventDefault();
        break;
      case 's':
      case 'S':
        paused = true;
        pauseButton.textContent = 'Run';
        stepOnce = true;
        break;
      case 'q':
      case 'Q':
        quench();
        break;
      case 'r':
      case 'R':
        resetLattice('random');
        break;
      case '[':
        brush.radius = Math.max(2, Math.round(brush.radius / 1.3));
        radiusSlider.set(brush.radius);
        pointer.refreshCursor();
        break;
      case ']':
        brush.radius = Math.min(128, Math.round(brush.radius * 1.3));
        radiusSlider.set(brush.radius);
        pointer.refreshCursor();
        break;
      case 'ArrowUp':
        setT(sim.T + (event.shiftKey ? 0.1 : 0.01));
        event.preventDefault();
        break;
      case 'ArrowDown':
        setT(sim.T - (event.shiftKey ? 0.1 : 0.01));
        event.preventDefault();
        break;
    }
  });

  // --- URL state -----------------------------------------------------------
  let lastUrlSync = 0;
  function syncUrl(now: number): void {
    if (!urlDirty || now - lastUrlSync < 800) return;
    urlDirty = false;
    lastUrlSync = now;
    const p = new URLSearchParams();
    p.set('g', sim.geometry.key);
    p.set('L', String(sim.L));
    p.set('T', sim.T.toFixed(3));
    if (sim.h !== 0 && !autoSweep) p.set('h', sim.h.toFixed(3));
    history.replaceState(null, '', `?${p.toString()}`);
  }

  // --- Sample handling -----------------------------------------------------
  let lastPushedSweep = -1;
  let lastScatterRefresh = 0;

  function onSample(sample: Sample): void {
    const { tag } = sample;
    const absM = Math.abs(sample.m);
    readouts.set('m', absM.toFixed(3));
    readouts.set('e', sample.e.toFixed(3));
    if (tag.flipSweeps > 0) readouts.set('acc', `${(sample.acceptance * 100).toFixed(1)}%`);

    if (tag.sweep !== lastPushedSweep) {
      lastPushedSweep = tag.sweep;
      mChart.push(tag.sweep, { m: sample.m });
      mChart.updateReadouts({ m: sample.m });
      eChart.push(tag.sweep, { e: sample.e });
      eChart.updateReadouts({ e: sample.e });
      if (autoSweep) loopChart.push(tag.h, sample.m);
    }

    const accepted = stats.accumulate(sample);
    if (accepted && sweep) sweep.collected++;
    const now = performance.now();
    if (accepted && now - lastScatterRefresh > 350) {
      lastScatterRefresh = now;
      refreshScatters();
    }
  }

  // --- Frame loop with sweeps-per-frame autotuner --------------------------
  let emaDt = 16;
  let calmFrames = 0;
  let lastFrame = performance.now();
  let spsSweeps = 0;
  let spsSince = performance.now();
  let firstFrame = true;

  readouts.set('spins', spinCountLabel(sim.L));

  let lastDpr = window.devicePixelRatio;

  function frame(now: number): void {
    const dt = now - lastFrame;
    lastFrame = now;
    emaDt = emaDt * 0.9 + Math.min(dt, 100) * 0.1;

    // A monitor move changes devicePixelRatio without any content-box resize, so the
    // ResizeObserver never fires; catch it here and rescale everything.
    if (window.devicePixelRatio !== lastDpr) {
      lastDpr = window.devicePixelRatio;
      view.resize();
      mChart.invalidate();
      eChart.invalidate();
      loopChart.invalidate();
      for (const s of scatters) s.invalidate();
    }

    if (!paused) {
      if (emaDt > 21 && sweepsPerFrame > 1) {
        sweepsPerFrame = Math.max(1, sweepsPerFrame >> 1);
        calmFrames = 0;
      } else if (emaDt < 13) {
        calmFrames++;
        if (calmFrames > 30 && sweepsPerFrame < speedCap) {
          sweepsPerFrame++;
          calmFrames = 0;
        }
      } else {
        calmFrames = 0;
      }
    }

    if (autoSweep && !paused) {
      autoSweepPhase += dt;
      sim.h = H_SWEEP_AMPLITUDE * Math.sin((2 * Math.PI * autoSweepPhase) / H_SWEEP_PERIOD_MS);
      hSlider.set(sim.h);
    }

    const sweeps = paused ? (stepOnce ? 1 : 0) : Math.min(sweepsPerFrame, speedCap);
    stepOnce = false;

    const encoder = device.createCommandEncoder();
    sim.encodeFrame(encoder, sweeps);

    let pending: { staging: GPUBuffer; tag: SampleTag } | null = null;
    const staging = sim.dirtySinceMeasure ? observables.acquire() : null;
    if (staging) {
      const flipSweeps = sim.encodeMeasure(encoder, staging);
      pending = {
        staging,
        tag: {
          T: sim.T,
          h: sim.h,
          driven: autoSweep,
          geometry: sim.geometry.key,
          L: sim.L,
          sweep: sim.sweepCount,
          flipSweeps,
          epoch,
        },
      };
    }

    view.render(encoder);
    device.queue.submit([encoder.finish()]);
    if (pending) observables.resolve(pending.staging, pending.tag, sim.N, onSample);

    if (screenshotWanted) {
      screenshotWanted = false;
      takeScreenshot();
    }
    if (firstFrame) {
      firstFrame = false;
      document.getElementById('loading')?.remove();
    }

    // Readouts and charts.
    spsSweeps += sweeps;
    if (now - spsSince > 500) {
      readouts.set('sps', `${Math.round((spsSweeps * 1000) / (now - spsSince))}`);
      spsSweeps = 0;
      spsSince = now;
    }
    readouts.set('T', sim.T.toFixed(3));
    const rel = (sim.T - Tc()) / Tc();
    readouts.set(
      'phase',
      Math.abs(rel) < 0.05 ? 'near-critical' : rel < 0 ? 'ordered' : 'disordered',
      Math.abs(rel) < 0.05 ? 'good' : 'plain',
    );

    const paintPaused = autoSweep || Math.abs(sim.h) > 0.005;
    for (const s of scatters) {
      s.setCursor(sim.T);
      s.setPaused(paintPaused ? 'h ≠ 0 — equilibrium measurement paused' : null);
      s.draw();
    }
    mChart.draw();
    eChart.draw();
    if (!loopChart.element.hidden) loopChart.draw();
    tickSweep();
    trackCritical(now);
    syncUrl(now);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function formatCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  if (a >= 10) return v.toFixed(0);
  return v.toFixed(1);
}

void start();
