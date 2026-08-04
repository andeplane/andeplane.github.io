import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTemple } from './temple.js';
import { buildSanctuary } from './sanctuary.js';
import { MONUMENTS } from './monuments.js';
import {
  STYLOBATE,
  ORDERS,
  PLAN,
  PROVENANCE,
  HUMAN_HEIGHT,
} from './params.js';

const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dbdd6);
scene.fog = new THREE.Fog(0x9dbdd6, 620, 1900);

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 3000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.target.set(0, 9, 0);

// ── Light ───────────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xbfd8ea, 0xa89a7c, 1.05));

const sun = new THREE.DirectionalLight(0xfff2dc, 2.5);
sun.position.set(-90, 110, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
// Frustum has to span the whole sanctuary — roughly x −80..200, z −90..90.
const s = sun.shadow.camera;
s.left = -230;
s.right = 230;
s.top = 230;
s.bottom = -230;
s.near = 1;
s.far = 700;
sun.shadow.bias = -0.0009;
scene.add(sun);

// ── Ground ──────────────────────────────────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2400, 2400),
  new THREE.MeshStandardMaterial({ color: 0x6f6a4a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ── Temple and sanctuary ────────────────────────────────────────────────────
const { root, layers: templeLayers, plan } = buildTemple();
scene.add(root);

const {
  root: sanctuaryRoot,
  layers: sanctuaryLayers,
  groups: sanctuaryGroups,
  built: monuments,
} = buildSanctuary();
scene.add(sanctuaryRoot);

const layers = { ...templeLayers, ...sanctuaryLayers };

// ── Views ───────────────────────────────────────────────────────────────────
const VIEWS = {
  visitor: {
    label: 'Visitor',
    pos: [STYLOBATE.length / 2 + 46, HUMAN_HEIGHT, 20],
    target: [0, 11, 0],
    fov: 55,
  },
  east: {
    label: 'East front',
    pos: [STYLOBATE.length / 2 + 96, 26, 0],
    target: [0, 12, 0],
    fov: 42,
  },
  flank: {
    label: 'Flank',
    pos: [10, 34, STYLOBATE.width / 2 + 118],
    target: [0, 11, 0],
    fov: 44,
  },
  aerial: {
    label: 'Aerial',
    pos: [118, 132, 128],
    target: [0, 6, 0],
    fov: 45,
  },
  plan: {
    label: 'Plan',
    pos: [0, 235, 0.01],
    target: [0, 0, 0],
    fov: 42,
    up: [0, 0, -1], //  north (−z) up, east (+x) right
  },
  // The whole complex: great temple, its predecessor, the altar it faces.
  sanctuary: {
    label: 'Sanctuary',
    pos: [20, 115, 205],
    target: [72, 0, -10],
    fov: 52,
  },
  // Straight down over the whole sanctuary — the numbered site map.
  site: {
    label: 'Site map',
    pos: [62, 300, -6],
    target: [62, 0, -6.01],
    fov: 46,
    up: [0, 0, -1], //  north up, east right — standard plan orientation
  },
  // Close on one outer column: base, unfluted shaft, painted necking, volutes.
  detail: {
    label: 'Column',
    pos: [STYLOBATE.length / 2 + 17, 13, STYLOBATE.width / 2 + 11],
    target: [STYLOBATE.length / 2 - 2.2, 11.5, STYLOBATE.width / 2 - 2.2],
    fov: 38,
  },
};

function setView(key) {
  const v = VIEWS[key];
  camera.up.set(...(v.up || [0, 1, 0]));
  controls.object.up.copy(camera.up);
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  camera.fov = v.fov;
  camera.updateProjectionMatrix();
  controls.update();
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('on', b.dataset.view === key);
  });
}

// ── UI ──────────────────────────────────────────────────────────────────────
const LAYER_LABELS = {
  foundation: ['Foundation', 'attested'],
  krepidoma: ['Krepidoma', 'conjectural'],
  outerRing: ['Outer peristasis', 'attested'],
  innerRing: ['Inner peristasis', 'attested'],
  thirdRow: ['Third facade rows', 'conjectural'],
  pronaos: ['Pronaos (east)', 'attested'],
  rearHall: ['Rear hall (west)', 'attested'],
  cella: ['Cella colonnades', 'conjectural'],
  cellaWalls: ['Cella walls', 'conjectural'],
  entablature: ['Entablature', 'conjectural'],
  roof: ['Roof', 'conjectural'],
  insitu: ['Surviving column', 'attested'],
  human: ['Human, 1.72 m', 'attested'],
  temples: ['Temples & altar', 'derived'],
  buildings: ['Buildings & stoas', 'derived'],
  monuments: ['Bases & monuments', 'derived'],
  sacredWay: ['Sacred Way', 'derived'],
};

/** Layers belonging to the wider sanctuary rather than the temple itself. */
const SANCTUARY_LAYERS = new Set(Object.keys(sanctuaryGroups));

const layersEl = document.getElementById('layers');
const sanctuaryEl = document.getElementById('sanctuary-layers');

for (const [name, group] of Object.entries(layers)) {
  const [label, prov] = LAYER_LABELS[name] || [name, 'conjectural'];
  const count = plan.counts[name] ?? sanctuaryGroups[name]?.ids.length;
  const row = document.createElement('label');
  row.className = 'row';
  row.innerHTML = `
    <input type="checkbox" ${group.visible ? 'checked' : ''}>
    <span class="dot" style="background:${PROVENANCE[prov].color}"></span>
    <span class="lbl">${label}</span>
    <span class="num">${count ?? ''}</span>`;
  row.querySelector('input').addEventListener('change', (e) => {
    group.visible = e.target.checked;
  });
  (SANCTUARY_LAYERS.has(name) ? sanctuaryEl : layersEl).appendChild(row);
}

document.getElementById('sanctuary-note').textContent =
  `${MONUMENTS.length + 1} monuments. Positions read off the official ODAP site ` +
  `plan by eye — good to roughly ±5 m, not survey grade.`;

// ── Monument labels ─────────────────────────────────────────────────────────
// Screen-space HTML rather than 3D text: sharp at every zoom, and free.
const labelRoot = document.getElementById('labels');
const labelEls = [];

function makeLabel(id, text, x, z, y = 0) {
  const el = document.createElement('div');
  el.className = 'mlabel';
  el.innerHTML = `<b>${id}</b>${text}`;
  labelRoot.appendChild(el);
  labelEls.push({ el, pos: new THREE.Vector3(x, y, z), id });
}

makeLabel(1, 'Great Temple of Hera', 0, 0, 22);
for (const m of MONUMENTS) {
  const x = m.kind === 'path' ? (m.from[0] + m.to[0]) / 2 : m.x;
  const z = m.kind === 'path' ? (m.from[1] + m.to[1]) / 2 : m.z;
  makeLabel(m.id, m.short || m.name, x, z, (m.height || 0.5) + 1.5);
}

let labelsOn = true;
document.getElementById('labels-toggle').addEventListener('change', (e) => {
  labelsOn = e.target.checked;
  labelRoot.style.display = labelsOn ? '' : 'none';
});

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * Project, sort near-to-far, then place greedily and drop anything that would
 * collide with a label already placed. Without this the site map is unreadable:
 * 34 labels inside 280 m pile straight on top of each other.
 */
function updateLabels() {
  if (!labelsOn) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const candidates = [];
  for (const item of labelEls) {
    _v.copy(item.pos).project(camera);
    if (_v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1) {
      item.el.style.display = 'none';
      continue;
    }
    _c.copy(item.pos);
    candidates.push({
      item,
      sx: ((_v.x + 1) / 2) * w,
      sy: ((1 - _v.y) / 2) * h,
      dist: camera.position.distanceToSquared(_c),
    });
  }

  candidates.sort((a, b) => a.dist - b.dist);

  const placed = [];
  for (const c of candidates) {
    const el = c.item.el;
    const bw = el.offsetWidth || 90;
    const bh = el.offsetHeight || 18;
    const box = {
      l: c.sx - bw / 2,
      r: c.sx + bw / 2,
      t: c.sy - bh / 2,
      b: c.sy + bh / 2,
    };
    const hit = placed.some(
      (p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t
    );
    if (hit) {
      el.style.display = 'none';
      continue;
    }
    placed.push(box);
    el.style.display = '';
    el.style.transform = `translate(-50%,-50%) translate(${c.sx}px,${c.sy}px)`;
  }
}

const legendEl = document.getElementById('legend');
for (const p of Object.values(PROVENANCE)) {
  const el = document.createElement('div');
  el.className = 'lg';
  el.innerHTML = `<span class="dot" style="background:${p.color}"></span>
    <b>${p.label}</b><span>${p.note}</span>`;
  legendEl.appendChild(el);
}

document.getElementById('counts').innerHTML = `
  <div><span>Modelled columns</span><b>${plan.total}</b></div>
  <div><span>Attested total</span><b>${plan.attestedTotal}</b></div>
  <div><span>Stylobate</span><b>${STYLOBATE.length} × ${STYLOBATE.width} m</b></div>
  <div><span>Column height</span><b>${ORDERS.outer.height} m</b></div>
  <div><span>Flank bay</span><b>${plan.bayX.toFixed(2)} m</b></div>
  <div><span>Front bay</span><b>${plan.bayZ.toFixed(2)} m</b></div>`;

const delta = plan.total - PLAN.totalAttested;
const warn = document.getElementById('warn');
warn.textContent =
  delta === 0
    ? `Plan closes exactly on the attested 155.`
    : `Plan yields ${plan.total}, ${delta > 0 ? delta + ' over' : -delta + ' under'} the attested 155.`;
warn.className = delta === 0 ? 'ok' : 'bad';

document.querySelectorAll('[data-view]').forEach((b) => {
  b.addEventListener('click', () => setView(b.dataset.view));
});

document.getElementById('panel-toggle').addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('collapsed');
});

// ── Loop ────────────────────────────────────────────────────────────────────
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

setView('visitor');

renderer.setAnimationLoop(() => {
  resize();
  controls.update();
  renderer.render(scene, camera);
  updateLabels();
});
