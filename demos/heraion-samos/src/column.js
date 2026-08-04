/**
 * Column geometry for the four Samian orders.
 *
 * What the sources actually pin down, and what this file therefore commits to:
 *   - shafts UNFLUTED (unusual, and the single most visually distinctive fact
 *     about this building — the earlier Rhoikos temple WAS fluted)
 *   - bases with horizontal fluting on both spira and torus (the Samian base)
 *   - a carved, painted band at the top of each shaft
 *   - Ionic volute capitals outside, ovolo-moulded capitals inside
 *
 * Proportions are ours. See params.js.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASE_PROFILE, NECKING } from './params.js';

const RADIAL = 36;

/** Lathe a profile given as [radius, height] pairs. */
function lathe(points, segments = RADIAL) {
  const v = points.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  return new THREE.LatheGeometry(v, segments);
}

/**
 * Horizontal fluting: a scalloped radius as a function of height, which under
 * revolution reads as a stack of grooves running around the drum.
 */
function flutedDrum(radius, y0, height, flutes, depth) {
  const pts = [];
  const steps = flutes * 6;
  pts.push([0, y0], [radius, y0]);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const groove = Math.abs(Math.sin(t * Math.PI * flutes));
    pts.push([radius - depth * groove, y0 + t * height]);
  }
  pts.push([radius, y0 + height]);
  return pts;
}

/** Samian base: fluted spira below, fluted torus above. */
function baseProfile(d) {
  const spiraH = BASE_PROFILE.spiraHeight * d;
  const torusH = BASE_PROFILE.torusHeight * d;
  const spiraR = BASE_PROFILE.spiraRadius * d;
  const torusR = BASE_PROFILE.torusRadius * d;

  const pts = flutedDrum(spiraR, 0, spiraH, BASE_PROFILE.spiraFlutes, d * 0.022);

  // Torus: a convex arc, itself horizontally fluted.
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const arc = Math.sin(t * Math.PI); // 0 → 1 → 0
    const groove = Math.abs(Math.sin(t * Math.PI * 5)) * d * 0.016;
    pts.push([torusR * (0.9 + 0.24 * arc) - groove, spiraH + t * torusH]);
  }
  return { pts, top: spiraH + torusH };
}

/** Unfluted shaft with a slight entasis, tapering to `taper` × lower diameter. */
function shaftProfile(d, height, taper, y0) {
  const rLower = d / 2;
  const rUpper = (d * taper) / 2;
  const pts = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const linear = rLower + (rUpper - rLower) * t;
    const entasis = Math.sin(t * Math.PI) * d * 0.011; // subtle swelling
    pts.push([linear + entasis, y0 + t * height]);
  }
  return { pts, top: y0 + height, rUpper };
}

/** One Ionic volute, in the x–y plane, extruded along z. */
function voluteGeometry(d) {
  const turns = 1.85;
  const steps = 190;
  const rStart = d * 0.46;
  const rEnd = d * 0.075;
  const band = d * 0.062; // thinner band: the spiral has to read at 20 m up

  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * turns;
    const r = rStart * Math.pow(rEnd / rStart, t);
    outer.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    const ri = Math.max(r - band, rEnd * 0.35);
    inner.push(new THREE.Vector2(Math.cos(a) * ri, Math.sin(a) * ri));
  }

  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, outer[0].y);
  outer.forEach((p) => shape.lineTo(p.x, p.y));
  inner
    .slice()
    .reverse()
    .forEach((p) => shape.lineTo(p.x, p.y));
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d * 0.3,
    bevelEnabled: true,
    bevelThickness: d * 0.014,
    bevelSize: d * 0.012,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0, 0, -d * 0.15);
  return geo;
}

/** Ionic capital: echinus, paired volutes, abacus. */
function ionicCapital(d, rUpper, y0) {
  const parts = [];
  const echinusH = d * 0.3;

  parts.push(
    lathe([
      [rUpper, y0],
      [rUpper * 1.06, y0 + echinusH * 0.35],
      [rUpper * 1.24, y0 + echinusH * 0.8],
      [rUpper * 1.26, y0 + echinusH],
    ])
  );

  const voluteY = y0 + echinusH + d * 0.4;
  const spread = rUpper * 1.05;
  for (const sx of [-1, 1]) {
    const v = voluteGeometry(d);
    v.rotateZ(sx > 0 ? 0 : Math.PI);
    v.translate(sx * spread, voluteY, 0);
    parts.push(v);
  }

  // Bolster linking the two volutes.
  const bolster = new THREE.CylinderGeometry(d * 0.3, d * 0.3, spread * 2, 20);
  bolster.rotateZ(Math.PI / 2);
  bolster.translate(0, voluteY, 0);
  parts.push(bolster);

  const abacusY = voluteY + d * 0.46;
  const abacus = new THREE.BoxGeometry(spread * 2.5, d * 0.17, d * 1.0);
  abacus.translate(0, abacusY, 0);
  parts.push(abacus);

  return { parts, top: abacusY + d * 0.085 };
}

/** Interior capital: an ovolo moulding under a square abacus. */
function ovoloCapital(d, rUpper, y0) {
  const parts = [];
  const h = d * 0.46;
  const steps = 16;
  const pts = [[rUpper, y0]];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([rUpper * (1 + 0.42 * Math.sin((t * Math.PI) / 2)), y0 + t * h]);
  }
  parts.push(lathe(pts));

  const abacusY = y0 + h;
  const abacus = new THREE.BoxGeometry(rUpper * 2.9, d * 0.15, rUpper * 2.9);
  abacus.translate(0, abacusY + d * 0.075, 0);
  parts.push(abacus);

  return { parts, top: abacusY + d * 0.15 };
}

/**
 * Build one column of the given order, scaled so its total height matches
 * `order.height` exactly — the attested figure governs, and the mouldings
 * absorb the difference.
 *
 * Returns two geometries so the painted necking band can take its own material.
 */
export function buildColumn(order) {
  const d = order.lowerDiameter;

  const base = baseProfile(d);
  const neckH = NECKING.height * d;
  const shaftH = order.height * 0.74;
  const shaft = shaftProfile(d, shaftH, order.taper, base.top);

  const neckY = shaft.top;
  const cap =
    order.capital === 'ionic'
      ? ionicCapital(d, shaft.rUpper, neckY + neckH)
      : ovoloCapital(d, shaft.rUpper, neckY + neckH);

  const stone = mergeGeometries(
    [lathe(base.pts), lathe(shaft.pts), ...cap.parts].map((g) =>
      g.index ? g.toNonIndexed() : g
    )
  );

  // The carved, painted band at the head of the shaft.
  const neck = lathe([
    [shaft.rUpper * 1.02, neckY],
    [shaft.rUpper * 1.09, neckY + neckH * 0.2],
    [shaft.rUpper * 1.09, neckY + neckH * 0.8],
    [shaft.rUpper * 1.02, neckY + neckH],
  ]);

  // Normalise so the built height equals the attested height.
  const built = cap.top;
  const k = order.height / built;
  stone.scale(k, k, k);
  neck.scale(k, k, k);
  stone.computeVertexNormals();
  neck.computeVertexNormals();

  return { stone, neck, height: order.height };
}

/**
 * A truncated column: base plus a stump of shaft, no necking and no capital.
 *
 * This is the one on the south flank that is still standing — the only piece of
 * the building a visitor can actually see. It is re-erected to roughly a third
 * of its original height, so it must NOT be a vertically squashed copy of a
 * whole column: the base has to keep its true proportions and the shaft simply
 * stops.
 */
export function buildColumnStump(order, stumpHeight) {
  const d = order.lowerDiameter;
  const base = baseProfile(d);

  const fullShaft = order.height * 0.74;
  const remaining = Math.max(stumpHeight - base.top, d * 0.5);
  const fraction = Math.min(remaining / fullShaft, 1);

  // Taper only as far up the shaft as the stump actually reaches.
  const taperAtBreak = 1 + (order.taper - 1) * fraction;
  const shaft = shaftProfile(d, remaining, taperAtBreak, base.top);

  // A rough break at the top rather than a clean saw cut.
  const rBreak = (d * taperAtBreak) / 2;
  const pts = [...shaft.pts];
  const jag = 10;
  for (let i = 0; i <= jag; i++) {
    const t = i / jag;
    pts.push([rBreak * (1 - t), shaft.top + Math.sin(t * Math.PI * 3) * d * 0.035]);
  }

  const stone = mergeGeometries(
    [lathe(base.pts), lathe(pts)].map((g) => (g.index ? g.toNonIndexed() : g))
  );
  stone.computeVertexNormals();
  return stone;
}
