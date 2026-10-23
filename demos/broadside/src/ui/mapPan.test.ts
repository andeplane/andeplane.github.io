// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampMapCamera, mountMapPan, zoomMapAt } from "./mapPan";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

function fixture(width = 400, worldWidth = 960, focusX = 480) {
  document.body.innerHTML = '<div id="viewport" tabindex="0"><div id="world"><button id="level">1</button></div><button data-map-control data-map-center>Center</button></div>';
  const viewport = document.querySelector<HTMLElement>("#viewport")!, world = document.querySelector<HTMLElement>("#world")!;
  for (const [element, dimensions] of [[viewport, { clientWidth: width, clientHeight: 700 }], [world, { offsetWidth: worldWidth, offsetHeight: 4000 }]] as const) {
    for (const [key, value] of Object.entries(dimensions)) Object.defineProperty(element, key, { value, configurable: true });
  }
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width, height: 700, bottom: 700, right: width } as DOMRect);
  const controller = mountMapPan(viewport, world, { focus: { x: focusX, y: 300 } });
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
    const { viewport, controller, pointer } = fixture(), initial = controller.getState();
    const wheel = new WheelEvent("wheel", { cancelable: true, deltaX: 30, deltaY: 100 });
    viewport.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(controller.getState()).toMatchObject({ x: initial.x - 30, y: initial.y - 100 });
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
    expect(controller.getState().x).toBe(initial.x - 105);
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", cancelable: true }));
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

  it("centers a map narrower than its viewport even after extreme horizontal panning", () => {
    for (const x of [-99999, 0, 99999]) {
      expect(clampMapCamera({ x, y: 190, scale: .65 }, { width: 932, height: 700 }, { width: 1200, height: 1800 })).toEqual({ x: 76, y: 190, scale: .65 });
      expect(clampMapCamera({ x, y: 190, scale: 1 }, { width: 1400, height: 700 }, { width: 1200, height: 1800 })).toEqual({ x: 100, y: 190, scale: 1 });
    }
  });
});
