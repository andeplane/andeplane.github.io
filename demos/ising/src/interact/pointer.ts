/**
 * Pointer input on the lattice: wheel zoom about the cursor, drag to pan or paint
 * (mode-dependent), pinch zoom on touch, and a live brush-outline cursor. Painting
 * emits world-space capsule stamps so strokes stay circular on every lattice basis.
 */

import type { View } from '../render/view.ts';
import type { PaintStamp } from '../sim/simulation.ts';

export type PointerMode = 'paint' | 'pan';

export interface PointerOptions {
  mode(): PointerMode;
  brush(): { radius: number; value: 0 | 1 | 2 };
  onPaint(stamp: PaintStamp): void;
  /** Fired once per stroke so statistics can restart equilibration. */
  onStroke(): void;
}

export interface PointerControl {
  refreshCursor(): void;
}

export function attachPointer(canvas: HTMLCanvasElement, view: View, options: PointerOptions): PointerControl {
  const cursor = document.createElement('div');
  cursor.id = 'brushcursor';
  cursor.hidden = true;
  document.body.append(cursor);

  const active = new Map<number, { x: number; y: number }>();
  let painting = false;
  let panning = false;
  let lastWorld: [number, number] | null = null;
  let lastCss: [number, number] | null = null;
  let pinchDist = 0;
  let cssX = 0;
  let cssY = 0;

  function brushValue(event: PointerEvent): 0 | 1 | 2 {
    const v = options.brush().value;
    // Alt (or right button) paints the opposite polarity mid-stroke.
    const invert = event.altKey || (event.buttons & 2) !== 0;
    if (v === 2 || !invert) return v;
    return v === 1 ? 0 : 1;
  }

  function stamp(event: PointerEvent, from: [number, number] | null): void {
    const [wx, wy] = view.screenToWorld(cssX, cssY);
    options.onPaint({
      ax: from ? from[0] : wx,
      ay: from ? from[1] : wy,
      bx: wx,
      by: wy,
      radius: options.brush().radius,
      value: brushValue(event),
    });
    lastWorld = [wx, wy];
  }

  function updateCursor(): void {
    const paintMode = options.mode() === 'paint' && active.size < 2;
    cursor.hidden = !paintMode;
    if (cursor.hidden) return;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const d = (options.brush().radius * 2 * view.pxPerCell) / dpr;
    cursor.style.width = `${d}px`;
    cursor.style.height = `${d}px`;
    cursor.style.left = `${cssX}px`;
    cursor.style.top = `${cssY}px`;
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    cssX = event.clientX;
    cssY = event.clientY;
    if (active.size === 2) {
      // Second finger: switch to pinch, abandon any stroke.
      painting = false;
      panning = false;
      const [a, b] = [...active.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    if (options.mode() === 'paint' && event.button === 0) {
      painting = true;
      options.onStroke();
      stamp(event, null);
    } else {
      panning = true;
      lastCss = [event.clientX, event.clientY];
    }
    updateCursor();
  });

  canvas.addEventListener('pointermove', (event) => {
    cssX = event.clientX;
    cssY = event.clientY;
    const entry = active.get(event.pointerId);
    if (entry) {
      entry.x = event.clientX;
      entry.y = event.clientY;
    }
    if (active.size === 2) {
      const [a, b] = [...active.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) {
        view.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
      }
      pinchDist = d;
    } else if (painting) {
      stamp(event, lastWorld);
    } else if (panning && lastCss) {
      view.panBy(event.clientX - lastCss[0], event.clientY - lastCss[1]);
      lastCss = [event.clientX, event.clientY];
    }
    updateCursor();
  });

  const release = (event: PointerEvent) => {
    active.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (active.size < 2) pinchDist = 0;
    if (active.size === 0) {
      painting = false;
      panning = false;
      lastWorld = null;
      lastCss = null;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    if (active.size === 0) cursor.hidden = true;
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      view.zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
      updateCursor();
    },
    { passive: false },
  );

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return { refreshCursor: updateCursor };
}
