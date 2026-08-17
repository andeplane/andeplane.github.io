import type { Transform } from '../render/renderer';
import { probeCell } from '../sim/probes';
import type { Solver } from '../sim/solver';
import type { HoleParams, Probe } from '../sim/types';

export interface InteractionHandlers {
  getSolver(): Solver;
  getTransform(): Transform;
  getProbes(): Probe[];
  onHoleUpdate(holeIndex: number, patch: Partial<HoleParams>): void;
  onProbeAdd(fx: number, fy: number): void;
  onProbeRemove(id: number): void;
  /** Which meter the pointer is over, so the renderer can offer a visible "click to remove". */
  onProbeHover(id: number | null): void;
  /** Zoom about a point, in device pixels on the canvas. */
  onZoom(x: number, y: number, factor: number): void;
  /** Drag the view by a device-pixel delta. */
  onPan(dx: number, dy: number): void;
}

const EDGE_HIT_CELLS = 2.5;
const BODY_HIT_MARGIN_CELLS = 2;
const PROBE_HIT_CELLS = 1.6;
/** Minimum grab radius in device pixels — a few cells is a very small target on a big grid. */
const PROBE_HIT_PX = 22;
/** How far the pointer must travel before a press counts as a drag rather than a click. */
const DRAG_SLOP_PX = 6;
/** Wheel notches are coarse; trackpad pinch (ctrl+wheel) arrives in much finer steps. */
const WHEEL_ZOOM_RATE = 0.0022;
const PINCH_WHEEL_ZOOM_RATE = 0.012;

type Drag =
  | { kind: 'move'; holeIndex: number; startCellX: number; startPosition: number; tubeLength: number; h: number }
  | {
      kind: 'resize';
      holeIndex: number;
      edge: 'x0' | 'x1';
      startCellX: number;
      startDiameter: number;
      h: number;
    };

/** What a press is waiting to become. Resolved on release, or upgraded on move. */
type Press =
  | { kind: 'probe'; id: number }
  | { kind: 'hole'; drag: Drag }
  | { kind: 'air' }
  | { kind: 'panning' };

/**
 * One-finger gestures address the simulation (tap to place or remove a meter,
 * drag a hole, drag empty air to pan); two-finger gestures address the view
 * (pinch to zoom, move to pan). Nothing here decides what a press *is* until it
 * either moves past the slop or is released, so a pan never places a meter and
 * a tap never nudges a hole.
 */
export class CanvasInteractions {
  private press: Press | null = null;
  private pressMoved = false;
  private pointerDownAt: { x: number; y: number } | null = null;
  private lastPointerAt: { x: number; y: number } | null = null;
  private hoveredProbe: number | null = null;
  /** Live pointers on the canvas, for pinch detection. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number; midX: number; midY: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly handlers: InteractionHandlers) {
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerleave', () => this.setHovered(null));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.endPointer(e));
  }

  /** Canvas device-pixel coordinates for an event. */
  private eventToDevice(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  }

  private eventToCell(e: { clientX: number; clientY: number }): { cx: number; cy: number } {
    const { x, y } = this.eventToDevice(e);
    const t = this.handlers.getTransform();
    return { cx: (x - t.offsetX) / t.scale, cy: (y - t.offsetY) / t.scale };
  }

  /** The meter under the pointer, if any. */
  private probeAt(cx: number, cy: number): number | null {
    const layout = this.handlers.getSolver().layout;
    const radius = Math.max(PROBE_HIT_CELLS, PROBE_HIT_PX / this.handlers.getTransform().scale);
    for (const probe of this.handlers.getProbes()) {
      const { x, y } = probeCell(probe, layout);
      if (Math.hypot(cx - x, cy - y) <= radius) return probe.id;
    }
    return null;
  }

  private setHovered(id: number | null): void {
    if (this.hoveredProbe === id) return;
    this.hoveredProbe = id;
    this.canvas.style.cursor = id === null ? '' : 'pointer';
    this.handlers.onProbeHover(id);
  }

  /** The hole grab, if the point is on one. */
  private holeDragAt(cx: number, cy: number): Drag | null {
    const { layout } = this.handlers.getSolver();
    for (const gap of layout.holeGaps) {
      const bandY =
        gap.wall === 'top'
          ? [layout.tubeY0 - layout.wallThicknessCells - 8, layout.tubeY0 - 1]
          : [layout.tubeY1 + 1, layout.tubeY1 + layout.wallThicknessCells + 8];
      if (cy < bandY[0] - 1 || cy > bandY[1] + 1) continue;
      if (cx < gap.x0 - BODY_HIT_MARGIN_CELLS || cx > gap.x1 + BODY_HIT_MARGIN_CELLS) continue;

      // Keep the middle third grabbable for moving: on a hole only a few cells
      // wide, fixed-width edge zones would cover all of it and it could only
      // ever be resized.
      const edgeHit = Math.min(EDGE_HIT_CELLS, (gap.x1 - gap.x0 + 1) / 3);
      const diameter = (gap.x1 - gap.x0 + 1) * layout.h;
      if (Math.abs(cx - gap.x0) <= edgeHit) {
        return { kind: 'resize', holeIndex: gap.holeIndex, edge: 'x0', startCellX: cx, startDiameter: diameter, h: layout.h };
      }
      if (Math.abs(cx - gap.x1) <= edgeHit) {
        return { kind: 'resize', holeIndex: gap.holeIndex, edge: 'x1', startCellX: cx, startDiameter: diameter, h: layout.h };
      }
      const centerCol = (gap.x0 + gap.x1) / 2;
      return {
        kind: 'move',
        holeIndex: gap.holeIndex,
        startCellX: cx,
        startPosition: (centerCol - layout.tubeX0) / (layout.tubeX1 - layout.tubeX0),
        tubeLength: (layout.tubeX1 - layout.tubeX0) * layout.h,
        h: layout.h,
      };
    }
    return null;
  }

  private onPointerDown(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      // A second finger turns the gesture into a view gesture; whatever the
      // first one was about to do is abandoned rather than half-applied.
      this.press = null;
      this.pressMoved = false;
      this.pointerDownAt = null;
      this.startPinch();
      return;
    }

    this.pointerDownAt = { x: e.clientX, y: e.clientY };
    this.lastPointerAt = { x: e.clientX, y: e.clientY };
    this.pressMoved = false;
    const { cx, cy } = this.eventToCell(e);

    // Meters win over the geometry underneath them: one sitting in a hole gap
    // must still be tappable to remove.
    const hitProbe = this.probeAt(cx, cy);
    if (hitProbe !== null) {
      this.press = { kind: 'probe', id: hitProbe };
      return;
    }
    const drag = this.holeDragAt(cx, cy);
    if (drag) {
      this.canvas.setPointerCapture(e.pointerId);
      this.press = { kind: 'hole', drag };
      return;
    }
    this.press = { kind: 'air' };
  }

  private startPinch(): void {
    const [a, b] = [...this.pointers.values()];
    this.pinch = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }

    const { cx, cy } = this.eventToCell(e);
    if (!this.press) {
      this.setHovered(this.probeAt(cx, cy));
      return;
    }

    const start = this.pointerDownAt;
    if (!this.pressMoved) {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= DRAG_SLOP_PX) return;
      this.pressMoved = true;
      // A press on empty air that starts moving is a pan; on a meter it is also
      // a pan, since dragging a meter has no other meaning and losing it to a
      // stray drag would be worse.
      if (this.press.kind === 'air' || this.press.kind === 'probe') {
        this.press = { kind: 'panning' };
        this.canvas.setPointerCapture(e.pointerId);
        this.canvas.style.cursor = 'grabbing';
      }
    }

    if (this.press.kind === 'panning') {
      const last = this.lastPointerAt ?? { x: e.clientX, y: e.clientY };
      const rect = this.canvas.getBoundingClientRect();
      const kx = this.canvas.width / rect.width;
      const ky = this.canvas.height / rect.height;
      this.handlers.onPan((e.clientX - last.x) * kx, (e.clientY - last.y) * ky);
      this.lastPointerAt = { x: e.clientX, y: e.clientY };
      return;
    }

    if (this.press.kind !== 'hole') return;
    const d = this.press.drag;
    if (d.kind === 'move') {
      const dPosition = ((cx - d.startCellX) * d.h) / d.tubeLength;
      this.handlers.onHoleUpdate(d.holeIndex, {
        position: clamp(d.startPosition + dPosition, 0.03, 0.97),
      });
    } else {
      const sign = d.edge === 'x1' ? 1 : -1;
      const dDiameter = 2 * sign * (cx - d.startCellX) * d.h;
      this.handlers.onHoleUpdate(d.holeIndex, {
        diameter: Math.max(0.01, d.startDiameter + dDiameter),
      });
    }
  }

  /** Two fingers: the change in their separation zooms, their midpoint pans. */
  private updatePinch(): void {
    if (!this.pinch) {
      this.startPinch();
      return;
    }
    const [a, b] = [...this.pointers.values()];
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    const rect = this.canvas.getBoundingClientRect();
    const kx = this.canvas.width / rect.width;
    const ky = this.canvas.height / rect.height;
    this.handlers.onPan((midX - this.pinch.midX) * kx, (midY - this.pinch.midY) * ky);
    const anchor = this.eventToDevice({ clientX: midX, clientY: midY });
    this.handlers.onZoom(anchor.x, anchor.y, distance / this.pinch.distance);

    this.pinch = { distance, midX, midY };
  }

  private onPointerUp(e: PointerEvent): void {
    const press = this.press;
    const moved = this.pressMoved;
    const start = this.pointerDownAt;
    this.endPointer(e);
    if (!press || moved || !start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP_PX) return;

    // A tap. On a meter it removes it; anywhere else in the air it drops one —
    // including on a hole, whose grab band reaches into exactly the exterior
    // air you would want to measure.
    if (press.kind === 'probe') {
      this.handlers.onProbeRemove(press.id);
      this.setHovered(null);
      return;
    }
    const { cx, cy } = this.eventToCell(e);
    const { layout, solid } = this.handlers.getSolver();
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (x < 0 || x >= layout.nx || y < 0 || y >= layout.ny) return;
    if (solid[y * layout.nx + x]) return;
    this.handlers.onProbeAdd(x / layout.nx, y / layout.ny);
  }

  private endPointer(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.press?.kind === 'panning') this.canvas.style.cursor = '';
    this.press = null;
    this.pressMoved = false;
    this.pointerDownAt = null;
    this.lastPointerAt = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    // Browsers report a trackpad pinch as ctrl+wheel, in far finer steps than
    // a mouse wheel's notches.
    const rate = e.ctrlKey ? PINCH_WHEEL_ZOOM_RATE : WHEEL_ZOOM_RATE;
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    const { x, y } = this.eventToDevice(e);
    this.handlers.onZoom(x, y, Math.exp(-e.deltaY * lines * rate));
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
