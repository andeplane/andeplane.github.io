/**
 * The sanctuary, at foundation level.
 *
 * Everything except the Great Altar is drawn as a footprint. That is deliberate:
 * only the Great Temple has enough evidence in this archive to justify standing
 * geometry, and inventing elevations for thirty-three more buildings would bury
 * the one reconstruction that is actually argued for. The altar is the exception
 * because its enclosing wall height is attested (5–7 m).
 *
 * Positions come from the official ODAP site plan, read by eye. See
 * monuments.js for the derivation and its error bars.
 */

import * as THREE from 'three';
import { MONUMENTS } from './monuments.js';

// Lighter than the ground (0x6f6a4a) so footprints read at map scale.
const PALETTE = {
  slab: 0xc9bf9e,
  altar: 0xe0d7bd,
  stoa: 0xbdb391,
  circle: 0xc3b995,
  base: 0xb2a888,
  path: 0xcabf98,
};

function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
  );
}

/** A walled precinct, open on its west side. */
function buildAltar(m) {
  const g = new THREE.Group();
  const t = 1.2;
  const h = m.height;
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.altar, roughness: 0.9 });

  const wall = (w, d, dx, dz) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(dx, h / 2, dz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  // North, south and east; open west, toward the temple.
  wall(m.w, t, 0, -m.d / 2);
  wall(m.w, t, 0, m.d / 2);
  wall(t, m.d, m.w / 2, 0);

  // The ash altar within the court.
  const core = box(m.w * 0.45, 1.5, m.d * 0.42, 0x6f6558);
  core.position.y = 0.75;
  core.castShadow = true;
  g.add(core);
  return g;
}

function buildOne(m) {
  let obj;

  switch (m.kind) {
    case 'altar':
      obj = buildAltar(m);
      break;

    case 'circle': {
      obj = new THREE.Mesh(
        new THREE.CylinderGeometry(m.w / 2, m.w / 2, m.height, 28),
        new THREE.MeshStandardMaterial({ color: PALETTE.circle, roughness: 0.95 })
      );
      obj.position.y = m.height / 2;
      break;
    }

    case 'path': {
      const dx = m.to[0] - m.from[0];
      const dz = m.to[1] - m.from[1];
      const len = Math.hypot(dx, dz);
      obj = new THREE.Mesh(
        new THREE.PlaneGeometry(len, m.w),
        new THREE.MeshStandardMaterial({ color: PALETTE.path, roughness: 1 })
      );
      obj.rotation.x = -Math.PI / 2;
      // Rotate within the ground plane to run from → to.
      obj.rotation.z = -Math.atan2(dz, dx);
      obj.position.set(
        (m.from[0] + m.to[0]) / 2,
        0.07,
        (m.from[1] + m.to[1]) / 2
      );
      obj.receiveShadow = true;
      return obj;
    }

    default: {
      obj = box(m.w, m.height, m.d, PALETTE[m.kind] || PALETTE.slab);
      obj.position.y = m.height / 2;
    }
  }

  obj.castShadow = true;
  obj.receiveShadow = true;

  const g = new THREE.Group();
  g.add(obj);
  g.position.set(m.x, 0, m.z);
  if (m.rot) g.rotation.y = m.rot;
  return g;
}

export function buildSanctuary() {
  const root = new THREE.Group();
  root.name = 'sanctuary';

  /** id → { object, monument } so the UI can label and toggle individually. */
  const built = new Map();

  for (const m of MONUMENTS) {
    const obj = buildOne(m);
    obj.name = `monument-${m.id}`;
    root.add(obj);
    built.set(m.id, { object: obj, monument: m });
  }

  // Grouped toggles, so the panel stays readable at 34 entries.
  const GROUPS = {
    temples: { label: 'Temples & altar', ids: [2, 3, 4, 5, 6, 15, 21, 22, 23, 24, 25] },
    buildings: { label: 'Buildings & stoas', ids: [9, 10, 12, 13, 14, 18, 19, 20, 26, 34] },
    monuments: { label: 'Bases & monuments', ids: [7, 8, 11, 16, 17, 28, 29, 30, 31, 32, 33] },
    sacredWay: { label: 'Sacred Way', ids: [27] },
  };

  const layers = {};
  for (const [key, g] of Object.entries(GROUPS)) {
    const group = new THREE.Group();
    group.name = key;
    for (const id of g.ids) {
      const entry = built.get(id);
      if (entry) group.add(entry.object);
    }
    root.add(group);
    layers[key] = group;
  }

  return { root, layers, groups: GROUPS, built };
}
