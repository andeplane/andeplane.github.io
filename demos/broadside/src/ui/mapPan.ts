import "./mapPan.css";

export interface MapPoint { x: number; y: number; }
export interface MapCamera extends MapPoint { scale: number; }
interface Size { width: number; height: number; }
export interface MapPanOptions {
  coverViewport?: boolean;
  unbounded?: boolean;
  focus?: MapPoint;
  state?: MapCamera;
  scale?: number;
  onChange?: (state: MapCamera, origin: MapPoint) => void;
  onGesture?: () => void;
  onCenter?: () => void;
}
export interface MapPanController {
  destroy(): void;
  /** Instant unless `smooth`; used for mounting, resizing and explicit recentering. */
  center(point: MapPoint, options?: { smooth?: boolean }): void;
  /** Pan only when the element reaches the outer 10% of the viewport, then glide. */
  follow(target: Element): void;
  getState(): MapCamera;
}

const MIN_ZOOM = .65, MAX_ZOOM = 1.5, DRAG_THRESHOLD = 8;
/** Every map in the family pans only when a followed point reaches this outer band. */
export const MAP_EDGE_BAND = .1;
const GLIDE_MS = 160;
const limit = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Cover the viewport horizontally, with vertical space to center the first island. */
export function clampMapCamera(camera: MapCamera, viewport: Size, world: Size, coverViewport = false): MapCamera {
  if (coverViewport && world.width && world.height) {
    const minimum = Math.max(MIN_ZOOM, viewport.width / world.width, viewport.height / world.height);
    const scale = limit(camera.scale, minimum, Math.max(minimum, MAX_ZOOM));
    return { scale, x: limit(camera.x, viewport.width - world.width * scale, 0), y: limit(camera.y, viewport.height - world.height * scale, 0) };
  }
  const scale = limit(camera.scale, MIN_ZOOM, MAX_ZOOM), margin = 190;
  const horizontalSpace = viewport.width - world.width * scale;
  return { scale,
    x: horizontalSpace < 0 ? limit(camera.x, horizontalSpace, 0) : horizontalSpace / 2,
    y: limit(camera.y, Math.min(margin, viewport.height - world.height * scale - margin), margin),
  };
}

/**
 * The smallest pan that brings a screen-space box inside the viewport minus its
 * edge band. A box already clear of the band needs no movement.
 */
export function edgeFollowOffset(box: { left: number; top: number; right: number; bottom: number }, viewport: Size, band = MAP_EDGE_BAND): MapPoint {
  const axis = (low: number, high: number, size: number) => {
    const margin = size * band;
    if (high - low > size - 2 * margin) return size / 2 - (low + high) / 2;
    if (low < margin) return margin - low;
    if (high > size - margin) return size - margin - high;
    return 0;
  };
  return { x: axis(box.left, box.right, viewport.width), y: axis(box.top, box.bottom, viewport.height) };
}

/** Pinching keeps the same world point underneath the midpoint of the fingers. */
export function zoomMapAt(camera: MapCamera, point: MapPoint, scale: number): MapCamera {
  scale = limit(scale, MIN_ZOOM, MAX_ZOOM);
  return { scale, x: point.x - (point.x - camera.x) * scale / camera.scale, y: point.y - (point.y - camera.y) * scale / camera.scale };
}

/** Shared map gestures for pack selection and the endless expedition. */
const controllers = new WeakMap<Element, MapPanController>();
/** The camera mounted on a viewport, so shared chart helpers can follow their ship. */
export const mapPanFor = (viewport: Element): MapPanController | undefined => controllers.get(viewport);

export function mountMapPan(viewport: HTMLElement, world: HTMLElement, options: MapPanOptions = {}): MapPanController {
  const abort = new AbortController(), signal = abort.signal;
  const pointers = new Map<number, MapPoint>();
  let camera: MapCamera = options.state ? { ...options.state } : { x: 0, y: 0, scale: options.scale ?? 1 };
  let start: { id: number; point: MapPoint; camera: MapCamera } | null = null;
  let pinch: { distance: number; midpoint: MapPoint; camera: MapCamera } | null = null;
  let moved = false, blockClick = false, pointerFocus = false;
  let goal: MapCamera | null = null, frame = 0, lastFrame = 0;
  const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const size = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });
  const worldSize = () => ({ width: world.offsetWidth, height: world.offsetHeight });
  const local = (point: MapPoint) => { const box = viewport.getBoundingClientRect(); return { x: point.x - box.left, y: point.y - box.top }; };
  const pair = () => {
    const [a, b] = [...pointers.values()] as [MapPoint, MapPoint];
    return { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), midpoint: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) };
  };
  const publish = () => {
    if (!options.unbounded) camera = clampMapCamera(camera, size(), worldSize(), options.coverViewport);
    // Keep CSS coordinates small even when returning to a very distant level.
    const origin = options.unbounded ? { x: Math.floor(-camera.x / camera.scale / 512) * 512, y: Math.floor(-camera.y / camera.scale / 512) * 512 } : { x: 0, y: 0 };
    world.style.transform = `translate3d(${camera.x + origin.x * camera.scale}px,${camera.y + origin.y * camera.scale}px,0) scale(${camera.scale})`;
    // Not data-map-*: those names mark controls, and the viewport must never look like a zoom button.
    viewport.dataset.cameraX = camera.x.toFixed(1); viewport.dataset.cameraY = camera.y.toFixed(1); viewport.dataset.cameraZoom = camera.scale.toFixed(2);
    options.onChange?.({ ...camera }, origin);
  };
  const bounded = (next: MapCamera) => options.unbounded ? next : clampMapCamera(next, size(), worldSize(), options.coverViewport);
  const stopGlide = () => { if (frame) cancelAnimationFrame(frame); frame = 0; goal = null; };
  const step = (time: number) => {
    if (!goal) { frame = 0; return; }
    const blend = 1 - Math.exp(-Math.max(0, time - (lastFrame || time - 16)) / GLIDE_MS);
    lastFrame = time;
    camera = { scale: camera.scale + (goal.scale - camera.scale) * blend, x: camera.x + (goal.x - camera.x) * blend, y: camera.y + (goal.y - camera.y) * blend };
    if (Math.abs(goal.x - camera.x) < .5 && Math.abs(goal.y - camera.y) < .5 && Math.abs(goal.scale - camera.scale) < .001) { camera = goal; goal = null; }
    publish();
    frame = goal ? requestAnimationFrame(step) : 0;
  };
  const glideTo = (next: MapCamera) => {
    next = bounded(next);
    if (reducedMotion() || typeof requestAnimationFrame !== "function") { stopGlide(); camera = next; publish(); return; }
    goal = next;
    if (!frame) { lastFrame = 0; frame = requestAnimationFrame(step); }
  };
  const centered = (point: MapPoint, scale: number): MapCamera => {
    const bounds = size();
    if (!options.unbounded) scale = clampMapCamera({ ...camera, scale }, bounds, worldSize(), options.coverViewport).scale;
    return { scale, x: bounds.width / 2 - point.x * scale, y: bounds.height * .46 - point.y * scale };
  };
  const center = (point: MapPoint, { smooth = false } = {}) => {
    const next = centered(point, (goal ?? camera).scale);
    if (smooth) { glideTo(next); return; }
    stopGlide(); camera = next; publish();
  };
  /** Move the camera only as far as needed to clear the edge band, and glide there. */
  const reveal = (box: { left: number; top: number; right: number; bottom: number }) => {
    const shift = edgeFollowOffset(box, size());
    if (!shift.x && !shift.y) return;
    const base = goal ?? camera;
    glideTo({ ...base, x: base.x + shift.x, y: base.y + shift.y });
  };
  const follow = (target: Element) => {
    // Measure against where the camera is heading so a gliding camera is not pushed twice.
    const box = target.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
    const dx = goal ? goal.x - camera.x : 0, dy = goal ? goal.y - camera.y : 0;
    reveal({ left: box.left - bounds.left + dx, right: box.right - bounds.left + dx, top: box.top - bounds.top + dy, bottom: box.bottom - bounds.top + dy });
  };
  const defaultFocus = options.focus ?? { x: worldSize().width / 2, y: worldSize().height / 2 };
  const recenter = () => {
    if (options.onCenter) { options.onCenter(); return; }
    glideTo(centered(defaultFocus, options.scale ?? 1));
  };
  const capture = (id: number) => { try { viewport.setPointerCapture(id); } catch { /* Keyboard and browsers without capture still work. */ } };
  const release = (id: number) => { try { if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id); } catch { /* A cancelled touch may already be released. */ } };

  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    pointerFocus = true; stopGlide();
    if (pointers.size === 0) { moved = false; blockClick = false; }
    if ((event.target as Element).closest("[data-map-control]")) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) start = { id: event.pointerId, point: pointers.get(event.pointerId)!, camera: { ...camera } };
    else if (pointers.size === 2) {
      pinch = { ...pair(), camera: { ...camera } }; moved = true;
      for (const id of pointers.keys()) capture(id);
    }
  }, { signal });
  window.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinch) {
      const next = pair();
      camera = zoomMapAt(pinch.camera, pinch.midpoint, pinch.camera.scale * next.distance / pinch.distance);
      camera.x += next.midpoint.x - pinch.midpoint.x; camera.y += next.midpoint.y - pinch.midpoint.y;
    } else if (start) {
      const dx = event.clientX - start.point.x, dy = event.clientY - start.point.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true; capture(event.pointerId);
      camera = { ...start.camera, x: start.camera.x + dx, y: start.camera.y + dy };
    }
    options.onGesture?.();
    event.preventDefault(); viewport.classList.add("is-panning"); publish();
  }, { signal, passive: false });
  const finish = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId); release(event.pointerId);
    if (moved) blockClick = true;
    pinch = null;
    const remaining = [...pointers.entries()][0];
    start = remaining ? { id: remaining[0], point: remaining[1], camera: { ...camera } } : null;
    if (!pointers.size) viewport.classList.remove("is-panning");
  };
  window.addEventListener("pointerup", finish, { signal });
  window.addEventListener("pointercancel", finish, { signal });
  viewport.addEventListener("click", event => {
    if (blockClick) { blockClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
  }, { signal, capture: true });
  viewport.addEventListener("click", event => {
    const control = (event.target as Element).closest<HTMLElement>("button[data-map-center], button[data-map-zoom]");
    if (!control) return;
    if (control.hasAttribute("data-map-center")) recenter();
    else {
      const bounds = size();
      const base = goal ?? camera;
      glideTo(zoomMapAt(base, { x: bounds.width / 2, y: bounds.height * .46 }, base.scale * (control.dataset.mapZoom === "in" ? 1.15 : 1 / 1.15)));
    }
  }, { signal });
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    options.onGesture?.(); stopGlide();
    if (event.ctrlKey || event.metaKey) camera = zoomMapAt(camera, local({ x: event.clientX, y: event.clientY }), camera.scale * Math.exp(-event.deltaY * .005));
    else { camera.x -= event.deltaX; camera.y -= event.deltaY; }
    publish();
  }, { signal, passive: false });
  viewport.addEventListener("keydown", event => {
    pointerFocus = false;
    const delta = event.shiftKey ? 150 : 75;
    if (event.key === "Home") { event.preventDefault(); recenter(); return; }
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      options.onGesture?.(); event.preventDefault(); const bounds = size(), base = goal ?? camera;
      glideTo(zoomMapAt(base, { x: bounds.width / 2, y: bounds.height * .46 }, base.scale * (event.key === "-" ? 1 / 1.15 : 1.15))); return;
    }
    const movement: Record<string, MapPoint> = { ArrowLeft: { x: delta, y: 0 }, ArrowRight: { x: -delta, y: 0 }, ArrowUp: { x: 0, y: delta }, ArrowDown: { x: 0, y: -delta } };
    const direction = movement[event.key];
    if (!direction) return;
    options.onGesture?.(); event.preventDefault(); stopGlide(); camera.x += direction.x; camera.y += direction.y; publish();
  }, { signal });
  // Tab and arrow navigation between buttons: keyboard focus elsewhere in the document resets the flag.
  window.addEventListener("keydown", () => { pointerFocus = false; }, { signal, capture: true });
  viewport.addEventListener("focusin", event => {
    viewport.scrollTop = viewport.scrollLeft = 0;
    // A tapped or clicked island is already where the player is looking. Only keyboard focus may pan.
    const button = (event.target as Element).closest<HTMLElement>("button");
    if (pointerFocus || !button || !world.contains(button) || pointers.size) return;
    follow(button);
  }, { signal });
  let previous = size();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
    const next = size();
    if (next.width === previous.width && next.height === previous.height) return;
    const point = { x: (previous.width / 2 - camera.x) / camera.scale, y: (previous.height * .46 - camera.y) / camera.scale };
    if (options.coverViewport) {
      // Keep a chart edge pinned when the old viewport could not center its first or last stop.
      const height = worldSize().height;
      const bottom = previous.height - height * camera.scale;
      if (bottom < 0 && camera.y === 0) point.y = 0;
      else if (bottom < 0 && camera.y === bottom) point.y = height;
    }
    previous = next; stopGlide(); center(point);
  }) : null;
  observer?.observe(viewport);
  if (options.state) publish(); else center(defaultFocus);
  const controller: MapPanController = {
    center, follow,
    getState: () => ({ ...camera }),
    destroy: () => { if (controllers.get(viewport) === controller) controllers.delete(viewport); stopGlide(); abort.abort(); observer?.disconnect(); for (const id of pointers.keys()) release(id); pointers.clear(); viewport.classList.remove("is-panning"); },
  };
  controllers.set(viewport, controller);
  return controller;
}
