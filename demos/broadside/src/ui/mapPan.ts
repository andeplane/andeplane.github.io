import "./mapPan.css";

export interface MapPoint { x: number; y: number; }
export interface MapCamera extends MapPoint { scale: number; }
interface Size { width: number; height: number; }
export interface MapPanOptions {
  focus?: MapPoint;
  state?: MapCamera;
  scale?: number;
  onChange?: (state: MapCamera) => void;
  onCenter?: () => void;
}
export interface MapPanController {
  destroy(): void;
  center(point: MapPoint): void;
  getState(): MapCamera;
}

const MIN_ZOOM = .65, MAX_ZOOM = 1.5, DRAG_THRESHOLD = 8;
const limit = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Cover the viewport horizontally, with vertical space to center the first island. */
export function clampMapCamera(camera: MapCamera, viewport: Size, world: Size): MapCamera {
  const scale = limit(camera.scale, MIN_ZOOM, MAX_ZOOM), margin = 190;
  const horizontalSpace = viewport.width - world.width * scale;
  return { scale,
    x: horizontalSpace < 0 ? limit(camera.x, horizontalSpace, 0) : horizontalSpace / 2,
    y: limit(camera.y, Math.min(margin, viewport.height - world.height * scale - margin), margin),
  };
}

/** Pinching keeps the same world point underneath the midpoint of the fingers. */
export function zoomMapAt(camera: MapCamera, point: MapPoint, scale: number): MapCamera {
  scale = limit(scale, MIN_ZOOM, MAX_ZOOM);
  return { scale, x: point.x - (point.x - camera.x) * scale / camera.scale, y: point.y - (point.y - camera.y) * scale / camera.scale };
}

/** Shared map gestures for pack selection and the endless expedition. */
export function mountMapPan(viewport: HTMLElement, world: HTMLElement, options: MapPanOptions = {}): MapPanController {
  const abort = new AbortController(), signal = abort.signal;
  const pointers = new Map<number, MapPoint>();
  let camera: MapCamera = options.state ? { ...options.state } : { x: 0, y: 0, scale: options.scale ?? 1 };
  let start: { id: number; point: MapPoint; camera: MapCamera } | null = null;
  let pinch: { distance: number; midpoint: MapPoint; camera: MapCamera } | null = null;
  let moved = false, blockClick = false;
  const size = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });
  const worldSize = () => ({ width: world.offsetWidth, height: world.offsetHeight });
  const local = (point: MapPoint) => { const box = viewport.getBoundingClientRect(); return { x: point.x - box.left, y: point.y - box.top }; };
  const pair = () => {
    const [a, b] = [...pointers.values()] as [MapPoint, MapPoint];
    return { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), midpoint: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) };
  };
  const publish = () => {
    camera = clampMapCamera(camera, size(), worldSize());
    world.style.transform = `translate3d(${camera.x}px,${camera.y}px,0) scale(${camera.scale})`;
    viewport.dataset.mapX = camera.x.toFixed(1); viewport.dataset.mapY = camera.y.toFixed(1); viewport.dataset.mapZoom = camera.scale.toFixed(2);
    options.onChange?.({ ...camera });
  };
  const center = (point: MapPoint) => {
    const bounds = size();
    camera.x = bounds.width / 2 - point.x * camera.scale;
    camera.y = bounds.height * .46 - point.y * camera.scale;
    publish();
  };
  const defaultFocus = options.focus ?? { x: worldSize().width / 2, y: worldSize().height / 2 };
  const recenter = () => options.onCenter ? options.onCenter() : center(defaultFocus);
  const capture = (id: number) => { try { viewport.setPointerCapture(id); } catch { /* Keyboard and browsers without capture still work. */ } };
  const release = (id: number) => { try { if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id); } catch { /* A cancelled touch may already be released. */ } };

  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
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
    const control = (event.target as Element).closest<HTMLElement>("[data-map-center], [data-map-zoom]");
    if (!control) return;
    if (control.hasAttribute("data-map-center")) recenter();
    else {
      const bounds = size();
      camera = zoomMapAt(camera, { x: bounds.width / 2, y: bounds.height * .46 }, camera.scale * (control.dataset.mapZoom === "in" ? 1.15 : 1 / 1.15)); publish();
    }
  }, { signal });
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) camera = zoomMapAt(camera, local({ x: event.clientX, y: event.clientY }), camera.scale * Math.exp(-event.deltaY * .005));
    else { camera.x -= event.deltaX; camera.y -= event.deltaY; }
    publish();
  }, { signal, passive: false });
  viewport.addEventListener("keydown", event => {
    const delta = event.shiftKey ? 150 : 75;
    if (event.key === "Home") { event.preventDefault(); recenter(); return; }
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault(); const bounds = size();
      camera = zoomMapAt(camera, { x: bounds.width / 2, y: bounds.height * .46 }, camera.scale * (event.key === "-" ? 1 / 1.15 : 1.15)); publish(); return;
    }
    const movement: Record<string, MapPoint> = { ArrowLeft: { x: delta, y: 0 }, ArrowRight: { x: -delta, y: 0 }, ArrowUp: { x: 0, y: delta }, ArrowDown: { x: 0, y: -delta } };
    const direction = movement[event.key];
    if (!direction) return;
    event.preventDefault(); camera.x += direction.x; camera.y += direction.y; publish();
  }, { signal });
  viewport.addEventListener("focusin", event => {
    const button = (event.target as Element).closest<HTMLElement>("button");
    if (!button || !world.contains(button) || pointers.size) return;
    viewport.scrollTop = viewport.scrollLeft = 0;
    const box = button.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
    if (box.left < bounds.left + 20 || box.right > bounds.right - 20 || box.top < bounds.top + 100 || box.bottom > bounds.bottom - 130) {
      const map = world.getBoundingClientRect();
      center({ x: (box.left + box.width / 2 - map.left) / camera.scale, y: (box.top + box.height / 2 - map.top) / camera.scale });
    }
  }, { signal });
  let previous = size();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
    const next = size();
    if (next.width === previous.width && next.height === previous.height) return;
    const point = { x: (previous.width / 2 - camera.x) / camera.scale, y: (previous.height * .46 - camera.y) / camera.scale };
    previous = next; center(point);
  }) : null;
  observer?.observe(viewport);
  if (options.state) publish(); else center(defaultFocus);
  return {
    center,
    getState: () => ({ ...camera }),
    destroy: () => { abort.abort(); observer?.disconnect(); for (const id of pointers.keys()) release(id); pointers.clear(); viewport.classList.remove("is-panning"); },
  };
}
