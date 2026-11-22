// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampMapCamera, edgeFollowOffset, mapPanFor, mountMapPan, zoomMapAt } from "./mapPan";

/** Drive animation frames by hand so glides are deterministic. */
function manualFrames() {
  let queue: FrameRequestCallback[] = [], now = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { queue.push(callback); return queue.length; });
  vi.stubGlobal("cancelAnimationFrame", () => { queue = []; });
  return {
    pending: () => queue.length,
    settle(frames = 120) { for (let i = 0; i < frames && queue.length; i++) { const run = queue; queue = []; now += 16; for (const callback of run) callback(now); } },
  };
}

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(width = 400, worldWidth = 960, focusX = 480, coverViewport = false) {
  document.body.innerHTML = '<div id="viewport" tabindex="0"><div id="world"><button id="level">1</button></div><button data-map-control data-map-center>Center</button></div>';
  const viewport = document.querySelector<HTMLElement>("#viewport")!, world = document.querySelector<HTMLElement>("#world")!;
  for (const [element, dimensions] of [[viewport, { clientWidth: width, clientHeight: 700 }], [world, { offsetWidth: worldWidth, offsetHeight: 4000 }]] as const) {
    for (const [key, value] of Object.entries(dimensions)) Object.defineProperty(element, key, { value, configurable: true });
  }
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width, height: 700, bottom: 700, right: width } as DOMRect);
  const controller = mountMapPan(viewport, world, { focus: { x: focusX, y: 300 }, coverViewport });
  const pointer = (type: string, x: number, y: number) => (type === "pointerdown" ? viewport : window).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", button: 0, clientX: x, clientY: y }));
  return { viewport, world, controller, pointer };
}

describe("shared touch map camera", () => {
  it("drags in both axes and suppresses level activation after a drag, while ordinary taps still work", () => {
    const { viewport, controller, pointer } = fixture(), onLevel = vi.fn();
    viewport.addEventListener("click", onLevel);
    const before = controller.getState();
    pointer("pointerdown", 150, 300); pointer("pointermove", 210, 340); pointer("pointerup", 210, 340);
    expect(controller.getState().x).toBe(before.x + 60);
    expect(controller.getState().y).toBe(before.y + 40);
    document.querySelector<HTMLButtonElement>("#level")!.click();
    expect(onLevel).not.toHaveBeenCalled();
    pointer("pointerdown", 150, 300); pointer("pointermove", 153, 302); pointer("pointerup", 153, 302);
    document.querySelector<HTMLButtonElement>("#level")!.click();
    expect(onLevel).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it("supports wheel, keyboard and recenter, then removes gesture listeners on destruction", () => {
    const frames = manualFrames();
    const { viewport, controller, pointer } = fixture(), initial = controller.getState();
    const wheel = new WheelEvent("wheel", { cancelable: true, deltaX: 30, deltaY: 100 });
    viewport.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(controller.getState()).toMatchObject({ x: initial.x - 30, y: initial.y - 100 });
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
    expect(controller.getState().x).toBe(initial.x - 105);
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", cancelable: true }));
    frames.settle();
    expect(controller.getState()).toEqual(initial);
    controller.destroy();
    pointer("pointerdown", 150, 300); pointer("pointermove", 250, 350); pointer("pointerup", 250, 350);
    expect(controller.getState()).toEqual(initial);
  });

  it("anchors pinch zoom to the same world point and bounds extreme pan/zoom", () => {
    const camera = { x: -280, y: -200, scale: 1 }, point = { x: 200, y: 300 };
    const next = zoomMapAt(camera, point, 1.4);
    expect((point.x - next.x) / next.scale).toBeCloseTo((point.x - camera.x) / camera.scale);
    expect((point.y - next.y) / next.scale).toBeCloseTo((point.y - camera.y) / camera.scale);
    expect(clampMapCamera({ x: 99999, y: -99999, scale: 12 }, { width: 400, height: 700 }, { width: 960, height: 4000 })).toEqual({ x: 0, y: -5490, scale: 1.5 });
  });

  it("keeps a landscape map covering both horizontal edges throughout a drag", () => {
    const { controller, pointer } = fixture(932, 1200, 350);
    expect(controller.getState().x).toBe(0);
    pointer("pointerdown", 200, 300); pointer("pointermove", 2000, 350); pointer("pointerup", 2000, 350);
    expect(controller.getState().x).toBe(0);
    pointer("pointerdown", 200, 300); pointer("pointermove", -2000, 350); pointer("pointerup", -2000, 350);
    expect(controller.getState().x).toBe(932 - 1200);
    controller.destroy();
  });

  it("centers the focused island at the scale needed to cover a wide viewport", () => {
    const { controller } = fixture(800, 400, 200, true);
    expect(controller.getState()).toEqual({ scale: 2, x: 0, y: 700 * .46 - 300 * 2 });
    controller.destroy();
  });

  it("keeps the first stop visible when the top of the chart is already pinned", () => {
    let resize = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    const { viewport, controller } = fixture(390, 1000, 500, true);
    controller.center({ x: 500, y: 88 });
    expect(controller.getState().y).toBe(0);
    Object.defineProperties(viewport, {
      clientWidth: { value: 740, configurable: true },
      clientHeight: { value: 260, configurable: true },
    });
    resize();
    expect(controller.getState().y).toBe(0);
    controller.destroy();
  });

  it("keeps finite artwork covering the viewport at both pan extremes and minimum zoom", () => {
    for (const viewport of [{width: 402, height: 700}, {width: 1400, height: 600}]) {
      for (const offset of [-99999, 99999]) {
        const world = {width: 1200, height: 1800};
        const camera = clampMapCamera({x: offset, y: offset, scale: .1}, viewport, world, true);
        expect(camera.x).toBeLessThanOrEqual(0);
        expect(camera.y).toBeLessThanOrEqual(0);
        expect(camera.x + world.width * camera.scale).toBeGreaterThanOrEqual(viewport.width);
        expect(camera.y + world.height * camera.scale).toBeGreaterThanOrEqual(viewport.height);
      }
    }
  });

  it("centers a map narrower than its viewport even after extreme horizontal panning", () => {
    for (const x of [-99999, 0, 99999]) {
      expect(clampMapCamera({ x, y: 190, scale: .65 }, { width: 932, height: 700 }, { width: 1200, height: 1800 })).toEqual({ x: 76, y: 190, scale: .65 });
      expect(clampMapCamera({ x, y: 190, scale: 1 }, { width: 1400, height: 700 }, { width: 1200, height: 1800 })).toEqual({ x: 100, y: 190, scale: 1 });
    }
  });

  it("never treats a tap on an island or level as a zoom control", () => {
    const { viewport, controller } = fixture();
    const before = controller.getState();
    expect(viewport.dataset.cameraZoom).toBe("1.00");
    expect(viewport.hasAttribute("data-map-zoom")).toBe(false);
    for (let i = 0; i < 3; i++) document.querySelector<HTMLButtonElement>("#level")!.click();
    expect(controller.getState()).toEqual(before);
    controller.destroy();
  });

  it("does not pan when a tapped island takes focus, even at the edge of the chart", () => {
    manualFrames();
    const { viewport, controller, pointer } = fixture();
    const level = document.querySelector<HTMLButtonElement>("#level")!;
    vi.spyOn(level, "getBoundingClientRect").mockReturnValue(new DOMRect(380, 680, 40, 40));
    const before = controller.getState();
    pointer("pointerdown", 390, 690);
    level.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    pointer("pointerup", 390, 690);
    expect(controller.getState()).toEqual(before);
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    controller.destroy();
  });

  it("glides keyboard focus just clear of the 10% edge band and leaves central islands alone", () => {
    const frames = manualFrames();
    const { controller } = fixture();
    const level = document.querySelector<HTMLButtonElement>("#level")!;
    const box = vi.spyOn(level, "getBoundingClientRect").mockReturnValue(new DOMRect(150, 300, 40, 40));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    const before = controller.getState();
    level.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(frames.pending()).toBe(0);
    expect(controller.getState()).toEqual(before);
    box.mockReturnValue(new DOMRect(150, 640, 40, 40));
    level.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(controller.getState()).toEqual(before);
    frames.settle(1);
    const midway = controller.getState().y;
    expect(midway).toBeLessThan(before.y);
    expect(midway).toBeGreaterThan(before.y - 50);
    frames.settle();
    expect(controller.getState()).toEqual({ ...before, y: before.y - 50 });
    controller.destroy();
  });

  it("follows a ship only once it reaches the edge band, without zooming", () => {
    const frames = manualFrames();
    const { viewport, controller } = fixture();
    expect(mapPanFor(viewport)).toBe(controller);
    const ship = document.createElement("span");
    viewport.append(ship);
    const before = controller.getState();
    vi.spyOn(ship, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 400, 20, 20));
    controller.follow(ship);
    frames.settle();
    expect(controller.getState()).toEqual(before);
    vi.spyOn(ship, "getBoundingClientRect").mockReturnValue(new DOMRect(370, 20, 20, 20));
    controller.follow(ship);
    frames.settle();
    expect(controller.getState()).toEqual({ scale: before.scale, x: before.x - 30, y: before.y + 50 });
    controller.destroy();
    expect(mapPanFor(viewport)).toBeUndefined();
  });

  it("measures the edge band per axis and centers anything too large for it", () => {
    const viewport = { width: 400, height: 700 };
    expect(edgeFollowOffset({ left: 100, right: 120, top: 300, bottom: 320 }, viewport)).toEqual({ x: 0, y: 0 });
    expect(edgeFollowOffset({ left: 10, right: 30, top: 640, bottom: 660 }, viewport)).toEqual({ x: 30, y: -30 });
    expect(edgeFollowOffset({ left: 0, right: 400, top: 0, bottom: 20 }, viewport)).toEqual({ x: 0, y: 70 });
  });

  it("snaps instead of gliding when the player prefers reduced motion", () => {
    manualFrames();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList);
    const { controller } = fixture();
    const before = controller.getState();
    controller.center({ x: 480, y: 900 }, { smooth: true });
    expect(controller.getState()).toEqual({ ...before, y: 700 * .46 - 900 });
    controller.destroy();
  });
});
