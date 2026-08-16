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
}

const EDGE_HIT_CELLS = 2.5;
const BODY_HIT_MARGIN_CELLS = 2;
const PROBE_HIT_CELLS = 1.6;

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

export class CanvasInteractions {
  private drag: Drag | null = null;
  private pointerDownAt: { x: number; y: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly handlers: InteractionHandlers) {
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', () => {
      this.drag = null;
      this.pointerDownAt = null;
    });
  }

  private eventToCell(e: PointerEvent): { cx: number; cy: number } {
    const rect = this.canvas.getBoundingClientRect();
    const t = this.handlers.getTransform();
    const px = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    return { cx: (px - t.offsetX) / t.scale, cy: (py - t.offsetY) / t.scale };
  }

  private onPointerDown(e: PointerEvent): void {
    const { cx, cy } = this.eventToCell(e);
    this.pointerDownAt = { x: e.clientX, y: e.clientY };
    const solver = this.handlers.getSolver();
    const { layout } = solver;

    for (const gap of layout.holeGaps) {
      const bandY =
        gap.wall === 'top'
          ? [layout.tubeY0 - layout.wallThicknessCells - 8, layout.tubeY0 - 1]
          : [layout.tubeY1 + 1, layout.tubeY1 + layout.wallThicknessCells + 8];
      if (cy < bandY[0] - 1 || cy > bandY[1] + 1) continue;
      if (cx < gap.x0 - BODY_HIT_MARGIN_CELLS || cx > gap.x1 + BODY_HIT_MARGIN_CELLS) continue;

      this.canvas.setPointerCapture(e.pointerId);
      if (Math.abs(cx - gap.x0) <= EDGE_HIT_CELLS) {
        this.drag = {
          kind: 'resize',
          holeIndex: gap.holeIndex,
          edge: 'x0',
          startCellX: cx,
          startDiameter: (gap.x1 - gap.x0 + 1) * layout.h,
          h: layout.h,
        };
      } else if (Math.abs(cx - gap.x1) <= EDGE_HIT_CELLS) {
        this.drag = {
          kind: 'resize',
          holeIndex: gap.holeIndex,
          edge: 'x1',
          startCellX: cx,
          startDiameter: (gap.x1 - gap.x0 + 1) * layout.h,
          h: layout.h,
        };
      } else {
        const centerCol = (gap.x0 + gap.x1) / 2;
        const position = (centerCol - layout.tubeX0) / (layout.tubeX1 - layout.tubeX0);
        this.drag = {
          kind: 'move',
          holeIndex: gap.holeIndex,
          startCellX: cx,
          startPosition: position,
          tubeLength: (layout.tubeX1 - layout.tubeX0) * layout.h,
          h: layout.h,
        };
      }
      return;
    }

    for (const probe of this.handlers.getProbes()) {
      const { x, y } = probeCell(probe, layout);
      if (Math.hypot(cx - x, cy - y) <= PROBE_HIT_CELLS) {
        this.handlers.onProbeRemove(probe.id);
        this.pointerDownAt = null;
        return;
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag) return;
    const { cx } = this.eventToCell(e);
    const d = this.drag;
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

  private onPointerUp(e: PointerEvent): void {
    if (this.drag) {
      this.drag = null;
      this.pointerDownAt = null;
      return;
    }
    const start = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return;

    const { cx, cy } = this.eventToCell(e);
    const solver = this.handlers.getSolver();
    const { layout, solid } = solver;
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (x < 0 || x >= layout.nx || y < 0 || y >= layout.ny) return;
    if (solid[y * layout.nx + x]) return;
    this.handlers.onProbeAdd(x / layout.nx, y / layout.ny);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
