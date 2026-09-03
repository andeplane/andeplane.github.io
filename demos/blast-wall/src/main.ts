/**
 * Wiring: state, the rebuild path, the frame loop, and the control panel.
 *
 * Three kinds of change, three costs. Moving a material slider rewrites one uniform.
 * Moving the charge recomputes the nodal loads. Changing the wall itself re-meshes and
 * rebuilds every GPU buffer — so all three are coalesced to once per frame, and dragging
 * a slider does not rebuild a wall sixty times a second.
 */

import { defaultWall, type WallSpec, type BondName, type SupportName } from './model/types.ts';
import { buildMesh, type Mesh } from './model/mesh.ts';
import { defaultMaterials, type Materials } from './physics/materials.ts';
import { defaultWorld, type WorldOptions } from './physics/solver.ts';
import {
  defaultCharge,
  ArrivalTable,
  incidentOverpressure,
  reflectedOverpressure,
  scaledDistance,
  MIN_SCALED_DISTANCE,
  type Charge,
} from './physics/blast.ts';
import { initGpu } from './gpu/device.ts';
import { GpuSolver } from './gpu/solver.ts';
import { Scene, type ColourMode } from './render/scene.ts';
import { OrbitCamera } from './render/camera.ts';
import { Panel, type Group } from './ui/controls.ts';
import { Editor, type Tool } from './ui/editor.ts';

const RESOLUTIONS: Record<string, { nx: number; ny: number; nz: number }> = {
  fast: { nx: 2, ny: 1, nz: 1 },
  balanced: { nx: 4, ny: 2, nz: 2 },
  fine: { nx: 6, ny: 2, nz: 2 },
};

const state = {
  spec: defaultWall(),
  materials: defaultMaterials(),
  world: defaultWorld(),
  charge: defaultCharge(),
  colourMode: 'damage' as ColourMode,
  referenceSpeed: 8,
  speed: 0.03,
  playing: false,
  showShock: true,
  resolution: 'balanced',
};

// A free-standing wall makes the most honest first impression: held top and bottom, a
// squat panel resists by arching and barely moves, which is true but reads as "nothing
// happened". Both are one dropdown apart.
state.spec.supports = 'base';
state.charge = { ...defaultCharge(), x: 1.8, y: 1.0, z: -4.5, mass: 25 };

const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as unknown as SVGSVGElement;
const camera = new OrbitCamera();

let mesh: Mesh;
let solver: GpuSolver;
let scene: Scene;
let arrival: ArrivalTable;
let device: GPUDevice;
let context: GPUCanvasContext;
let format: GPUTextureFormat;

let needsRebuild = false;
let needsMaterials = false;
let needsLoad = false;
let framed = false;

const el = (id: string) => document.getElementById(id)!;

function setStatus(text: string): void {
  el('status').textContent = text;
}

// --- build ---------------------------------------------------------------------------

function rebuild(): void {
  state.spec.divisions = RESOLUTIONS[state.resolution];
  scene?.destroy();
  solver?.destroy();
  mesh = buildMesh(state.spec, state.materials.density);
  solver = new GpuSolver(device, mesh, state.materials, state.world, state.charge);
  scene = new Scene(device, context, format, mesh, solver);
  refreshArrival();
  if (!framed) {
    camera.frame(mesh.lattice.length, mesh.lattice.height, mesh.lattice.thickness);
    framed = true;
  }
  el('hud-size').textContent = `${mesh.units.length} bricks · ${fmtK(mesh.elementCount)} elem`;
  editor?.clearSelection();
  // Editing mid-flight would silently restart the run on the new geometry, which reads
  // as the wall teleporting. Stop, so an edit is something you make and then fire.
  state.playing = false;
  const pp = document.getElementById('playpause');
  if (pp) pp.textContent = 'Play';
}

function refreshArrival(): void {
  arrival = new ArrivalTable(Math.max(state.charge.mass, 1e-3), 80);
}

const scheduleRebuild = () => {
  needsRebuild = true;
};
const scheduleMaterials = () => {
  needsMaterials = true;
};
const scheduleLoad = () => {
  needsLoad = true;
};

// --- editor --------------------------------------------------------------------------

const editor = new Editor(canvas, {
  camera,
  mesh: () => mesh,
  spec: () => state.spec,
  charge: () => state.charge,
  rebuild: scheduleRebuild,
  chargeMoved: () => {
    scheduleLoad();
    panel?.sync();
  },
  selectionChanged: (units) => scene.setSelection(units),
  status: setStatus,
});

for (const b of document.querySelectorAll<HTMLButtonElement>('.tool')) {
  b.addEventListener('click', () => {
    for (const o of document.querySelectorAll('.tool')) o.classList.remove('active');
    b.classList.add('active');
    editor.tool = b.dataset.tool as Tool;
    editor.clearSelection();
    setStatus(TOOL_HELP[editor.tool]);
  });
}

const TOOL_HELP: Record<Tool, string> = {
  select: 'Click a brick to select it, shift-click to add. Backspace removes, P pins.',
  carve: 'Drag across the wall to take bricks out — a doorway, a breach, a missing course.',
  pin: 'Drag across the wall to pin bricks in place: a fixed support wherever you paint one.',
  opening: 'Drag a rectangle on the wall face to cut a window or a door.',
};

// --- panel ---------------------------------------------------------------------------

function geometryGroups(): Group[] {
  const s = () => state.spec;
  const m = () => state.materials;
  const c = () => state.charge;
  return [
    {
      title: 'Playback and view',
      open: true,
      controls: [
        {
          kind: 'choice',
          label: 'Speed',
          options: [
            { value: '1', label: 'real time' },
            { value: '0.3', label: '0.3×' },
            { value: '0.1', label: '0.1×' },
            { value: '0.03', label: '0.03×' },
            { value: '0.01', label: '0.01×' },
            { value: '0.003', label: '0.003×' },
          ],
          get: () => String(state.speed),
          set: (v) => {
            state.speed = Number(v);
          },
        },
        {
          kind: 'choice',
          label: 'Colour by',
          options: [
            { value: 'damage', label: 'joint damage' },
            { value: 'speed', label: 'speed' },
            { value: 'plain', label: 'plain masonry' },
          ],
          get: () => state.colourMode,
          set: (v) => {
            state.colourMode = v as ColourMode;
          },
        },
        {
          kind: 'slider',
          label: 'Speed scale',
          unit: ' m/s',
          min: 0.5,
          max: 60,
          step: 0.5,
          log: true,
          get: () => state.referenceSpeed,
          set: (v) => {
            state.referenceSpeed = v;
          },
        },
        {
          kind: 'toggle',
          label: 'Show the shock front',
          get: () => state.showShock,
          set: (v) => {
            state.showShock = v;
          },
        },
      ],
    },
    {
      title: 'The wall',
      open: true,
      controls: [
        {
          kind: 'choice',
          label: 'Bond',
          options: [
            { value: 'running', label: 'løperforband (½ offset)' },
            { value: 'stack', label: 'stack (no offset)' },
            { value: 'third', label: 'third bond (⅓ offset)' },
            { value: 'wild', label: 'wild bond (random)' },
          ],
          get: () => s().bond,
          set: (v) => {
            s().bond = v as BondName;
            scheduleRebuild();
          },
        },
        {
          kind: 'slider',
          label: 'Length',
          unit: ' m',
          min: 0.5,
          max: 8,
          step: 0.24,
          get: () => s().length,
          set: (v) => {
            s().length = v;
            scheduleRebuild();
          },
        },
        {
          kind: 'slider',
          label: 'Height',
          unit: ' m',
          min: 0.3,
          max: 5,
          step: 0.074,
          get: () => s().height,
          set: (v) => {
            s().height = v;
            scheduleRebuild();
          },
        },
        {
          kind: 'choice',
          label: 'Thickness',
          options: [
            { value: '1', label: 'half brick (108 mm)' },
            { value: '2', label: 'full brick (228 mm)' },
          ],
          get: () => String(s().wythes),
          set: (v) => {
            s().wythes = Number(v);
            scheduleRebuild();
          },
        },
        {
          kind: 'choice',
          label: 'Supports',
          options: [
            { value: 'base', label: 'free-standing' },
            { value: 'base-top', label: 'infill: base and top' },
            { value: 'three-sided', label: 'base and both ends' },
            { value: 'four-sided', label: 'built in all round' },
            { value: 'free', label: 'nothing holds it' },
          ],
          get: () => s().supports,
          set: (v) => {
            s().supports = v as SupportName;
            scheduleRebuild();
          },
        },
        {
          kind: 'choice',
          label: 'Mesh',
          options: [
            { value: 'fast', label: 'fast — 2 elements/brick' },
            { value: 'balanced', label: 'balanced — 16' },
            { value: 'fine', label: 'fine — 24' },
          ],
          get: () => state.resolution,
          set: (v) => {
            state.resolution = v;
            scheduleRebuild();
          },
        },
        {
          kind: 'slider',
          label: 'Fuge',
          unit: ' mm',
          min: 4,
          max: 25,
          step: 1,
          get: () => s().joint * 1000,
          set: (v) => {
            s().joint = v / 1000;
            scheduleRebuild();
          },
        },
      ],
    },
    {
      title: 'The charge',
      open: true,
      controls: [
        {
          kind: 'slider',
          label: 'TNT mass',
          unit: ' kg',
          min: 0.2,
          max: 500,
          step: 0.1,
          log: true,
          get: () => c().mass,
          set: (v) => {
            c().mass = v;
            scheduleLoad();
          },
        },
        {
          kind: 'slider',
          label: 'Standoff',
          unit: ' m',
          min: 0.5,
          max: 40,
          step: 0.1,
          log: true,
          get: () => -c().z,
          set: (v) => {
            c().z = -v;
            scheduleLoad();
          },
        },
        {
          kind: 'slider',
          label: 'Height',
          unit: ' m',
          min: 0.05,
          max: 6,
          step: 0.05,
          get: () => c().y,
          set: (v) => {
            c().y = v;
            scheduleLoad();
          },
        },
        {
          kind: 'slider',
          label: 'Along the wall',
          unit: ' m',
          min: -4,
          max: 12,
          step: 0.05,
          get: () => c().x,
          set: (v) => {
            c().x = v;
            scheduleLoad();
          },
        },
        {
          kind: 'slider',
          label: 'Decay b',
          min: 0,
          max: 12,
          step: 0.1,
          get: () => c().decay,
          set: (v) => {
            c().decay = v;
            scheduleLoad();
          },
          format: (v) => (v === 0 ? 'from Z' : v.toFixed(1)),
        },
      ],
    },
    {
      title: 'The mortar joints',
      controls: [
        slider('Tensile ft', ' MPa', 0.01, 2, 0.01, () => m().ft / 1e6, (v) => (m().ft = v * 1e6)),
        slider('Cohesion c', ' MPa', 0.01, 3, 0.01, () => m().cohesion / 1e6, (v) => (m().cohesion = v * 1e6)),
        slider('tan φ', '', 0.05, 1.5, 0.01, () => m().tanPhi, (v) => (m().tanPhi = v)),
        slider('Fracture Gf', ' J/m²', 0.5, 120, 0.5, () => m().gf, (v) => (m().gf = v), true),
        slider('Crushing fc', ' MPa', 1, 60, 0.5, () => m().fc / 1e6, (v) => (m().fc = v * 1e6)),
        slider('Stiffness kn', ' GPa/m', 2, 400, 1, () => m().kn / 1e9, (v) => {
          m().kn = v * 1e9;
          m().ks = v * 1e9 * 0.44;
        }, true),
        {
          kind: 'toggle',
          label: 'Strain-rate hardening',
          get: () => m().dif > 0,
          set: (v) => {
            m().dif = v ? 1 : 0;
            scheduleMaterials();
          },
        },
      ],
    },
    {
      title: 'The bricks and the world',
      controls: [
        slider('Brick E', ' GPa', 2, 40, 0.5, () => m().E / 1e9, (v) => (m().E = v * 1e9)),
        slider('Density', ' kg/m³', 800, 2800, 10, () => m().density, (v) => (m().density = v)),
        slider('Damping', ' 1/s', 0, 60, 0.5, () => m().damping, (v) => (m().damping = v)),
        slider('Gravity', ' m/s²', 0, 20, 0.1, () => state.world.gravity, (v) => (state.world.gravity = v)),
        slider('Ground friction', '', 0, 1.5, 0.05, () => state.world.groundFriction, (v) => (state.world.groundFriction = v)),
      ],
    },
    {
      title: 'Edits',
      controls: [
        { kind: 'button', label: 'Remove selected bricks', onClick: () => editor.removeSelected() },
        { kind: 'button', label: 'Pin / unpin selected', onClick: () => editor.pinSelected() },
        {
          kind: 'button',
          label: 'Undo every edit',
          onClick: () => {
            state.spec.removed = [];
            state.spec.pinned = [];
            state.spec.openings = [];
            scheduleRebuild();
            setStatus('Wall restored: every removed brick, pin and opening is back.');
          },
        },
        {
          kind: 'button',
          label: 'Cut a doorway',
          onClick: () => {
            const lat = mesh.lattice;
            state.spec.openings.push({ x: lat.length * 0.5 - 0.45, y: 0, w: 0.9, h: Math.min(2.05, lat.height * 0.8) });
            scheduleRebuild();
          },
        },
      ],
    },
  ];
}

/** A material slider: same shape every time, and always schedules the same update. */
function slider(
  label: string,
  unit: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
  log = false,
): Group['controls'][number] {
  return {
    kind: 'slider',
    label,
    unit,
    min,
    max,
    step,
    log,
    get,
    set: (v) => {
      set(v);
      scheduleMaterials();
    },
  };
}

let panel: Panel;

// --- frame ---------------------------------------------------------------------------

let last = performance.now();
let statsAt = 0;

function frame(now: number): void {
  const wall = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (needsRebuild) {
    needsRebuild = needsMaterials = needsLoad = false;
    rebuild();
  }
  if (needsMaterials) {
    needsMaterials = false;
    solver.updateMaterials(state.materials);
  }
  if (needsLoad) {
    needsLoad = false;
    solver.updateLoad(state.charge);
    refreshArrival();
    updateBlastReadout();
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  let steps = 0;
  if (state.playing) {
    steps = Math.min(700, Math.round((wall * state.speed) / solver.dt));
  }

  const encoder = device.createCommandEncoder();
  solver.encodeSteps(encoder, steps);
  solver.encodeCentroids(encoder);
  const radius = state.showShock && state.playing ? arrival.radiusAt(solver.time) : 0;
  scene.draw(encoder, camera, w, h, {
    colourMode: state.colourMode,
    shockRadius: radius > 0 && radius < 60 ? radius : 0,
    referenceSpeed: state.referenceSpeed,
    charge: state.charge,
    chargeRadius: Math.max(0.12, Math.cbrt(Math.max(state.charge.mass, 0.01)) * 0.08),
  });
  device.queue.submit([encoder.finish()]);

  el('hud-time').textContent = `${(solver.time * 1000).toFixed(1)} ms`;
  drawOverlay();

  if (now - statsAt > 250) {
    statsAt = now;
    void solver.readStats().then((s) => {
      if (!s) return;
      el('hud-cracked').textContent = `${(s.cracked * 100).toFixed(1)} %`;
      el('hud-speed').textContent = `${s.maxSpeed.toFixed(1)} m/s`;
    });
  }

  requestAnimationFrame(frame);
}

function updateBlastReadout(): void {
  const lat = mesh.lattice;
  const r = Math.hypot(
    lat.length / 2 - state.charge.x,
    lat.height / 2 - state.charge.y,
    -state.charge.z,
  );
  const z = scaledDistance(r, state.charge.mass);
  const pr = reflectedOverpressure(incidentOverpressure(z));
  el('hud-z').textContent = `${z.toFixed(2)} m/kg⅓`;
  el('hud-pressure').textContent = pr > 1e6 ? `${(pr / 1e6).toFixed(2)} MPa` : `${(pr / 1e3).toFixed(0)} kPa`;
  if (z < MIN_SCALED_DISTANCE) {
    setStatus(
      `Z = ${z.toFixed(2)} is inside the range a single Friedlander pulse describes ` +
        '(Z > 0.4). Back the charge off, or read the load as indicative only.',
    );
  }
}

/** The rubber band, drawn on the wall face where it is being dragged. */
function drawOverlay(): void {
  const r = editor.rubber;
  overlay.replaceChildren();
  if (!r) return;
  const rect = canvas.getBoundingClientRect();
  const aspect = rect.width / Math.max(rect.height, 1);
  const pts = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ]
    .map(([x, y]) => camera.project([x, y, 0], aspect, rect.width, rect.height))
    .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', 'rgba(88, 183, 214, 0.18)');
  poly.setAttribute('stroke', '#58b7d6');
  poly.setAttribute('stroke-width', '1.5');
  overlay.append(poly);
}

// --- boot ----------------------------------------------------------------------------

async function boot(): Promise<void> {
  const gpu = await initGpu(canvas);
  if (!gpu) return;
  device = gpu.device;
  context = gpu.context;
  format = gpu.format;

  rebuild();
  panel = new Panel(el('groups'), geometryGroups());
  updateBlastReadout();

  el('detonate').addEventListener('click', () => {
    solver.reset();
    state.playing = true;
    el('playpause').textContent = 'Pause';
    setStatus('Firing. The front leaves the charge at several times the speed of sound and slows as it goes.');
  });
  el('playpause').addEventListener('click', () => {
    state.playing = !state.playing;
    el('playpause').textContent = state.playing ? 'Pause' : 'Play';
  });
  el('reset').addEventListener('click', () => {
    solver.reset();
    state.playing = false;
    el('playpause').textContent = 'Play';
    setStatus('Wall rebuilt, undamaged, at rest.');
  });

  document.getElementById('loading')?.remove();
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}

function fmtK(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

void boot();

export type { WallSpec, Materials, WorldOptions, Charge };
