/**
 * Assembles the temple from the plan and the column orders.
 *
 * Layer names are stable and used by the UI to toggle visibility:
 *   krepidoma, outerRing, innerRing, thirdRow, pronaos, rearHall, cella,
 *   cellaWalls, entablature, roof, insitu, human
 */

import * as THREE from 'three';
import {
  STYLOBATE,
  KREPIDOMA,
  ORDERS,
  ENTABLATURE,
  CELLA,
  ROOF,
  SITE,
  PLAN,
  FOUNDATION,
  HUMAN_HEIGHT,
} from './params.js';
import { buildPlan } from './plan.js';
import { buildColumn, buildColumnStump } from './column.js';

const MARBLE = () =>
  new THREE.MeshStandardMaterial({
    color: 0xe8e2d4,
    roughness: 0.72,
    metalness: 0.0,
  });

const POROS = () =>
  new THREE.MeshStandardMaterial({
    color: 0xcfc3a8,
    roughness: 0.9,
    metalness: 0.0,
  });

const TIMBER = () =>
  new THREE.MeshStandardMaterial({
    color: 0x8a6f52,
    roughness: 0.85,
    metalness: 0.0,
  });

const PAINT = () =>
  new THREE.MeshStandardMaterial({
    color: 0xb2452f,
    roughness: 0.65,
    metalness: 0.0,
  });

export function buildTemple() {
  const root = new THREE.Group();
  root.name = 'dipteros-ii';
  const layers = {};

  const layer = (name) => {
    const g = new THREE.Group();
    g.name = name;
    layers[name] = g;
    root.add(g);
    return g;
  };

  const plan = buildPlan();

  // ── Foundation ────────────────────────────────────────────────────────────
  // What actually survives. Modelled first because it is the registration
  // surface everything else sits on.
  const found = layer('foundation');
  {
    const o =
      FOUNDATION.overhang + (KREPIDOMA.steps - 1) * KREPIDOMA.tread;
    const h = FOUNDATION.depth + FOUNDATION.exposed;
    const geo = new THREE.BoxGeometry(
      STYLOBATE.length + 2 * o,
      h,
      STYLOBATE.width + 2 * o
    );
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xb3a88c, roughness: 0.97 })
    );
    mesh.position.y = FOUNDATION.exposed - h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    found.add(mesh);
  }

  // ── Krepidoma ─────────────────────────────────────────────────────────────
  const krep = layer('krepidoma');
  const stepMat = POROS();
  let topY = 0;
  for (let i = 0; i < KREPIDOMA.steps; i++) {
    const out = (KREPIDOMA.steps - 1 - i) * KREPIDOMA.tread;
    const geo = new THREE.BoxGeometry(
      STYLOBATE.length + 2 * out,
      KREPIDOMA.riser,
      STYLOBATE.width + 2 * out
    );
    const m = new THREE.Mesh(geo, stepMat);
    m.position.y = KREPIDOMA.riser * (i + 0.5);
    m.castShadow = true;
    m.receiveShadow = true;
    krep.add(m);
    topY = KREPIDOMA.riser * (i + 1);
  }
  const stylobateY = topY;

  // ── Columns, instanced per order ──────────────────────────────────────────
  const groupsByLayer = {};
  for (const c of plan.columns) {
    (groupsByLayer[c.group] ||= []).push(c);
  }

  const built = {};
  for (const [key, order] of Object.entries(ORDERS)) {
    built[key] = buildColumn(order);
  }

  const marble = MARBLE();
  const paint = PAINT();

  for (const [groupName, cols] of Object.entries(groupsByLayer)) {
    const g = layer(groupName);
    const byOrder = {};
    for (const c of cols) (byOrder[c.order] ||= []).push(c);

    for (const [orderKey, list] of Object.entries(byOrder)) {
      const { stone, neck } = built[orderKey];
      const stoneMesh = new THREE.InstancedMesh(stone, marble, list.length);
      const neckMesh = new THREE.InstancedMesh(neck, paint, list.length);
      stoneMesh.castShadow = true;
      stoneMesh.receiveShadow = true;

      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const one = new THREE.Vector3(1, 1, 1);
      const up = new THREE.Vector3(0, 1, 0);
      list.forEach((c, i) => {
        pos.set(c.x, stylobateY, c.z);
        q.setFromAxisAngle(up, c.angle || 0);
        m.compose(pos, q, one);
        stoneMesh.setMatrixAt(i, m);
        neckMesh.setMatrixAt(i, m);
      });
      stoneMesh.instanceMatrix.needsUpdate = true;
      neckMesh.instanceMatrix.needsUpdate = true;
      g.add(stoneMesh, neckMesh);
    }
  }

  // ── Cella walls ───────────────────────────────────────────────────────────
  const walls = layer('cellaWalls');
  {
    const innerLen = Math.abs(plan.innerX[plan.innerX.length - 1] - plan.innerX[0]);
    const cw = plan.spanZ * CELLA.widthFactor;
    const cl = innerLen * 0.66;
    const t = CELLA.wallThickness;
    const h = CELLA.wallHeight;
    const mat = POROS();

    const wall = (w, d, x, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, stylobateY + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      walls.add(mesh);
    };
    wall(cl, t, 0, -cw / 2);
    wall(cl, t, 0, cw / 2);
    wall(t, cw, -cl / 2, 0); // west
    // East wall left open: the pronaos front.
  }

  // ── Entablature over the outer peristasis ─────────────────────────────────
  const ent = layer('entablature');
  {
    const y = stylobateY + ORDERS.outer.height;
    const timber = TIMBER();
    const stoneMat = POROS();
    const ax = plan.outerX;
    const az = plan.outerZ;
    const lx = ax[ax.length - 1] - ax[0];
    const lz = az[az.length - 1] - az[0];
    const aH = ENTABLATURE.architraveHeight;
    const aD = ENTABLATURE.architraveDepth;

    const beam = (w, d, x, z, mat, yy, hh) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
      mesh.position.set(x, yy, z);
      mesh.castShadow = true;
      ent.add(mesh);
    };
    // Wooden architrave — attested.
    beam(lx + aD, aD, 0, az[0], timber, y + aH / 2, aH);
    beam(lx + aD, aD, 0, az[az.length - 1], timber, y + aH / 2, aH);
    beam(aD, lz - aD, ax[0], 0, timber, y + aH / 2, aH);
    beam(aD, lz - aD, ax[ax.length - 1], 0, timber, y + aH / 2, aH);

    // Cornice.
    const cH = ENTABLATURE.corniceHeight;
    const o = ENTABLATURE.corniceOverhang;
    const cy = y + aH + cH / 2;
    beam(lx + aD + 2 * o, aD + 2 * o, 0, az[0], stoneMat, cy, cH);
    beam(lx + aD + 2 * o, aD + 2 * o, 0, az[az.length - 1], stoneMat, cy, cH);
    beam(aD + 2 * o, lz - aD, ax[0], 0, stoneMat, cy, cH);
    beam(aD + 2 * o, lz - aD, ax[ax.length - 1], 0, stoneMat, cy, cH);
  }

  // ── Roof (off by default — the building was never completed) ──────────────
  const roof = layer('roof');
  {
    const y = stylobateY + ORDERS.outer.height + ENTABLATURE.architraveHeight + ENTABLATURE.corniceHeight;
    const ax = plan.outerX;
    const az = plan.outerZ;
    const lx = ax[ax.length - 1] - ax[0] + 2 * ENTABLATURE.corniceOverhang;
    const lz = az[az.length - 1] - az[0] + 2 * ENTABLATURE.corniceOverhang;
    const rise = (lz / 2) * ROOF.pitch;

    const shape = new THREE.Shape();
    shape.moveTo(-lz / 2, 0);
    shape.lineTo(lz / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: lx, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-lx / 2, y, 0);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xa5643f, roughness: 0.88 })
    );
    mesh.castShadow = true;
    roof.add(mesh);
    roof.visible = ROOF.show;
  }

  // ── The one column still standing, on the south flank ─────────────────────
  // Visible by default: it is the only part of this building that is real, and
  // in an AR context it is the anchor the overlay has to line up with.
  const insitu = layer('insitu');
  {
    const flank = plan.columns.filter((c) => c.group === 'outerRing');
    // +z is south (see monuments.js), so the south flank is the MAX-z row.
    const southZ = Math.max(...flank.map((c) => c.z));
    const south = flank
      .filter((c) => Math.abs(c.z - southZ) < 0.01)
      .sort((a, b) => a.x - b.x)[Math.floor(PLAN.outerAlong / 2)];

    const stump = buildColumnStump(ORDERS.outer, SITE.survivingColumnHeight);
    const mesh = new THREE.Mesh(
      stump,
      new THREE.MeshStandardMaterial({ color: 0xa89f88, roughness: 0.98 })
    );
    mesh.position.set(south.x, stylobateY, south.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    insitu.add(mesh);
  }

  // ── Human figure, for scale ───────────────────────────────────────────────
  const human = layer('human');
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f3a45, roughness: 0.9 });
    const body = new THREE.CapsuleGeometry(HUMAN_HEIGHT * 0.13, HUMAN_HEIGHT * 0.56, 4, 12);
    const mesh = new THREE.Mesh(body, mat);
    mesh.position.set(STYLOBATE.length / 2 + 5, HUMAN_HEIGHT / 2, 0);
    mesh.castShadow = true;
    human.add(mesh);
  }

  return { root, layers, plan, stylobateY };
}
