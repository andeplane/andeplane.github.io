/**
 * Pointer handling: orbit the camera, pick bricks, carve openings, drag the charge.
 *
 * Picking is a ray against each unit's reference box. Units are boxes on a lattice, so
 * that test is exact and there is nothing to accelerate — a few hundred slab tests per
 * click is not worth a BVH.
 *
 * ponytail: bricks are laid on the lattice and can be removed, pinned or cut away, but
 * not dragged to arbitrary positions. Off-lattice units would break the node-for-node
 * match that makes a joint a joint, and every well-defined thing free movement could
 * express here — a gap, an opening, a missing brick — removal already expresses. If free
 * placement is ever wanted, it means a real contact search, not a looser mesher.
 */

import type { Mesh } from '../model/mesh.ts';
import type { WallSpec } from '../model/types.ts';
import type { Charge } from '../physics/blast.ts';
import type { OrbitCamera, Vec3 } from '../render/camera.ts';

export type Tool = 'select' | 'carve' | 'pin' | 'opening';

export interface EditorHost {
  camera: OrbitCamera;
  mesh(): Mesh;
  spec(): WallSpec;
  charge(): Charge;
  /** Geometry changed: rebuild the mesh and the solver. */
  rebuild(): void;
  /** The charge moved: recompute the load, keep the mesh. */
  chargeMoved(): void;
  selectionChanged(units: number[]): void;
  status(text: string): void;
}

interface Drag {
  mode: 'orbit' | 'pan' | 'charge' | 'opening' | 'paint';
  x: number;
  y: number;
  moved: number;
  /** Wall-plane anchor for a rubber-banded opening. */
  anchor?: [number, number];
}

export class Editor {
  tool: Tool = 'select';
  selection = new Set<number>();
  /** Live rubber band in wall coordinates, for the overlay. */
  rubber: { x: number; y: number; w: number; h: number } | null = null;

  private drag: Drag | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: EditorHost,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
  }

  private ray(e: PointerEvent): { origin: Vec3; dir: Vec3 } {
    const r = this.canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - r.top) / r.height) * 2;
    return this.host.camera.ray(ndcX, ndcY, r.width / Math.max(r.height, 1));
  }

  private onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const base = { x: e.clientX, y: e.clientY, moved: 0 };

    if (e.button === 2 || e.shiftKey) {
      this.drag = { ...base, mode: 'pan' };
      return;
    }

    const { origin, dir } = this.ray(e);
    const charge = this.host.charge();
    if (hitSphere(origin, dir, [charge.x, charge.y, charge.z], this.chargeRadius()) !== null) {
      this.drag = { ...base, mode: 'charge' };
      this.host.status('Dragging the charge — it stays at its current height.');
      return;
    }

    if (this.tool === 'opening') {
      const p = this.wallPlanePoint(origin, dir);
      if (p) {
        this.drag = { ...base, mode: 'opening', anchor: p };
        this.rubber = { x: p[0], y: p[1], w: 0, h: 0 };
        return;
      }
    }

    if (this.tool === 'carve' || this.tool === 'pin') {
      this.drag = { ...base, mode: 'paint' };
      this.paint(e);
      return;
    }

    this.drag = { ...base, mode: 'orbit' };
  };

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);

    const r = this.canvas.getBoundingClientRect();
    switch (d.mode) {
      case 'orbit':
        this.host.camera.orbit(dx, dy);
        break;
      case 'pan':
        this.host.camera.pan(dx, dy, r.height);
        break;
      case 'charge': {
        // Slide the charge in the horizontal plane it already sits in, so a drag sets
        // standoff and lateral position and the height stays where the slider put it.
        const { origin, dir } = this.ray(e);
        const c = this.host.charge();
        if (Math.abs(dir[1]) < 1e-4) break;
        const t = (c.y - origin[1]) / dir[1];
        if (t <= 0) break;
        c.x = origin[0] + dir[0] * t;
        c.z = origin[2] + dir[2] * t;
        this.host.chargeMoved();
        break;
      }
      case 'opening': {
        const { origin, dir } = this.ray(e);
        const p = this.wallPlanePoint(origin, dir);
        if (p && d.anchor) {
          this.rubber = {
            x: Math.min(d.anchor[0], p[0]),
            y: Math.min(d.anchor[1], p[1]),
            w: Math.abs(p[0] - d.anchor[0]),
            h: Math.abs(p[1] - d.anchor[1]),
          };
        }
        break;
      }
      case 'paint':
        this.paint(e);
        break;
    }
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    this.canvas.releasePointerCapture?.(e.pointerId);

    if (d.mode === 'opening' && this.rubber) {
      const r = this.rubber;
      this.rubber = null;
      if (r.w > 0.05 && r.h > 0.05) {
        this.host.spec().openings.push(r);
        this.host.rebuild();
        this.host.status(`Cut a ${r.w.toFixed(2)} × ${r.h.toFixed(2)} m opening.`);
      }
      return;
    }

    if (d.mode === 'orbit' && d.moved < 5) {
      const unit = this.pick(e);
      if (unit < 0) {
        if (!e.shiftKey) this.clearSelection();
        return;
      }
      if (e.metaKey || e.ctrlKey) this.selection.delete(unit);
      else {
        if (!e.shiftKey) this.selection.clear();
        this.selection.add(unit);
      }
      this.host.selectionChanged([...this.selection]);
      const u = this.host.mesh().units[unit];
      this.host.status(
        `Brick ${u.key} — course ${u.course}${u.pinned ? ', pinned' : ''}. ` +
          `${this.selection.size} selected. Backspace removes, P pins.`,
      );
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.host.camera.zoom(e.deltaY);
  };

  private onKey = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'Escape') {
      this.clearSelection();
      return;
    }
    if (this.selection.size === 0) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this.removeSelected();
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'p') {
      this.pinSelected();
    }
  };

  removeSelected(): void {
    const spec = this.host.spec();
    const units = this.host.mesh().units;
    for (const u of this.selection) spec.removed.push(units[u].key);
    const n = this.selection.size;
    this.clearSelection();
    this.host.rebuild();
    this.host.status(`Removed ${n} brick${n === 1 ? '' : 's'}.`);
  }

  pinSelected(): void {
    const spec = this.host.spec();
    const units = this.host.mesh().units;
    const pinned = new Set(spec.pinned);
    for (const u of this.selection) {
      const key = units[u].key;
      if (pinned.has(key)) pinned.delete(key);
      else pinned.add(key);
    }
    spec.pinned = [...pinned];
    const n = this.selection.size;
    this.clearSelection();
    this.host.rebuild();
    this.host.status(`Toggled the pin on ${n} brick${n === 1 ? '' : 's'}.`);
  }

  clearSelection(): void {
    this.selection.clear();
    this.host.selectionChanged([]);
  }

  private paint(e: PointerEvent): void {
    const unit = this.pick(e);
    if (unit < 0) return;
    const spec = this.host.spec();
    const key = this.host.mesh().units[unit].key;
    if (this.tool === 'carve') {
      if (spec.removed.includes(key)) return;
      spec.removed.push(key);
    } else {
      if (spec.pinned.includes(key)) return;
      spec.pinned.push(key);
    }
    this.host.rebuild();
  }

  private chargeRadius(): number {
    return Math.max(0.12, Math.cbrt(Math.max(this.host.charge().mass, 0.01)) * 0.08);
  }

  /** Nearest unit along the ray, or −1. */
  private pick(e: PointerEvent): number {
    const { origin, dir } = this.ray(e);
    const mesh = this.host.mesh();
    const { dx, dy, dz } = mesh;
    let best = -1;
    let bestT = Infinity;
    for (let i = 0; i < mesh.units.length; i++) {
      const u = mesh.units[i];
      const t = hitBox(
        origin,
        dir,
        [u.ix0 * dx, u.iy0 * dy, u.iz0 * dz],
        [u.ix1 * dx, u.iy1 * dy, u.iz1 * dz],
      );
      if (t !== null && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best;
  }

  /** Where the ray meets the wall's outer face, in wall coordinates. */
  private wallPlanePoint(origin: Vec3, dir: Vec3): [number, number] | null {
    if (Math.abs(dir[2]) < 1e-6) return null;
    const t = (0 - origin[2]) / dir[2];
    if (t <= 0) return null;
    const lat = this.host.mesh().lattice;
    const x = origin[0] + dir[0] * t;
    const y = origin[1] + dir[1] * t;
    if (x < -0.5 || x > lat.length + 0.5 || y < -0.5 || y > lat.height + 0.5) return null;
    return [x, y];
  }
}

/** Slab test; returns the entry distance or null. */
function hitBox(o: Vec3, d: Vec3, lo: Vec3, hi: Vec3): number | null {
  let tMin = 0;
  let tMax = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < lo[a] || o[a] > hi[a]) return null;
      continue;
    }
    const inv = 1 / d[a];
    let t0 = (lo[a] - o[a]) * inv;
    let t1 = (hi[a] - o[a]) * inv;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMax < tMin) return null;
  }
  return tMin;
}

function hitSphere(o: Vec3, d: Vec3, c: Vec3, r: number): number | null {
  const ox = o[0] - c[0];
  const oy = o[1] - c[1];
  const oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
