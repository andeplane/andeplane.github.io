// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Controls } from "../input/controls";
import { readProgress } from "../game/progress";
import { awardVoyage, deliverChest } from "../game/rewards";
import { VoyageHud } from "./voyageHud";

const ship = vi.hoisted(() => ({ private: false }));
vi.mock("../privatePearl", () => ({ get PRIVATE_PEARL() { return ship.private; } }));

function setup(privateShip: boolean, cargo = false) {
  ship.private = privateShip;
  const progress = readProgress();
  if (cargo) awardVoyage(progress, 0, 3, 2);
  const handlers = {
    deck: vi.fn(), fish: vi.fn(), cancelFish: vi.fn(), start: vi.fn(), freeSail: vi.fn(), seaChart: vi.fn(), camera: vi.fn(),
    travel: vi.fn(), centreLook: vi.fn(), home: vi.fn(), harbour: vi.fn(), hold: vi.fn(),
    unload: vi.fn(), menu: vi.fn(), overview: vi.fn(), caveMove: vi.fn(),
    caveJump: vi.fn(), caveInspect: vi.fn(), select: vi.fn(), pause: vi.fn(),
    fire: vi.fn(), steer: vi.fn(), anchor: vi.fn(),
  };
  const hud = new VoyageHud(progress, new Controls(), handlers);
  const button = (id: string) => hud.root.querySelector<HTMLButtonElement>(id)!;
  return { hud, handlers, button, progress };
}

afterEach(() => { document.body.replaceChildren(); ship.private = false; });

it("shows a recoverable ship-load failure in the redesigned home", () => {
  const { hud } = setup(true);
  hud.showMenu("main");
  expect(() => hud.shipLoadFailed()).not.toThrow();
  const message = hud.root.querySelector('.pirate-home-description');
  expect(message?.textContent).toContain('The ship could not load');
  expect(message?.getAttribute('role')).toBe('status');
  expect(hud.root.dataset.screen).toBe('main');
});

it("keeps live actions out of the pause dialog's interaction layer", () => {
  const { hud, button } = setup(false);
  hud.paused(true);
  expect(button('.voyage-header').inert).toBe(true);
  expect(document.activeElement).toBe(button('#v-resume'));
  hud.paused(false);
  expect(button('.voyage-header').inert).toBe(false);
});

describe("ship chart details dialog", () => {
  it("dismisses on an outside tap without activating the chart and restores focus to the ship", () => {
    const { hud, handlers, button } = setup(false);
    hud.showMenu("worlds");
    button("#map-ship").click();
    expect(button("#ship-panel").getAttribute("role")).toBe("dialog");
    expect(button("#world-menu").inert).toBe(true);
    expect(document.activeElement).toBe(button("#ship-close"));
    button("#ship-place").click();
    expect(button("#ship-panel").hidden).toBe(false);
    button("#ship-panel-backdrop").click();
    expect(button("#ship-panel").hidden).toBe(true);
    expect(button("#ship-panel-backdrop").hidden).toBe(true);
    expect(button("#world-menu").inert).toBe(false);
    expect(document.activeElement).toBe(button("#map-ship"));
    expect(handlers.travel).not.toHaveBeenCalled();
    expect(hud.root.dataset.screen).toBe("worlds");
  });

  it("keeps Tab inside the dialog and lets Escape close details before global menu shortcuts", () => {
    const { hud, button } = setup(false);
    hud.showMenu("worlds"); button("#map-ship").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(button("#ship-cave"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(button("#ship-close"));
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    const escape = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    window.removeEventListener("keydown", shortcut);
    expect(escape.defaultPrevented).toBe(true);
    expect(shortcut).not.toHaveBeenCalled();
    expect(button("#ship-panel").hidden).toBe(true);
    expect(hud.root.dataset.screen).toBe("worlds");
  });
});

describe.each([false, true])("treasure navigation with private ship %s", (privateShip) => {
  it("labels home destinations and travels to the ship or cave without duplicate controls", () => {
    const { hud, handlers, button } = setup(privateShip);
    expect(button("#menu-play").textContent).toContain("Play");
    expect(button("#menu-settings").textContent).toBe("Settings");
    expect(button("#menu-cave").textContent).toContain("Your cave");
    button("#home-ship").click();
    expect(handlers.travel).toHaveBeenLastCalledWith("hold");
    handlers.travel.mockClear();
    expect(hud.root.querySelector("#main-menu #visit-ship")).toBeNull();
    expect(button("#ship-panel").hidden).toBe(true);
    button("#menu-cave").click();
    expect(handlers.travel).toHaveBeenLastCalledWith("cave");
    button("#menu-play").click();
    expect(hud.root.dataset.screen).toBe("worlds");
    expect(button("#map-cave").getAttribute("aria-label")).toBe("Visit treasure cave");
    button("#map-cave").click();
    expect(handlers.travel).toHaveBeenCalledTimes(2);
    button("#map-ship").click();
    expect(button("#ship-panel").hidden).toBe(false);
    expect(button("#map-ship").getAttribute("aria-expanded")).toBe("true");
    button("#menu-hold").click();
    expect(handlers.travel).toHaveBeenLastCalledWith("hold");
    button("#visit-ship").click();
    expect(handlers.travel).toHaveBeenLastCalledWith("ship");
    button("#ship-cave").click();
    expect(handlers.travel).toHaveBeenLastCalledWith("cave");
    button("#ship-close").click();
    expect(button("#map-ship").getAttribute("aria-expanded")).toBe("false");
    expect(handlers.home).not.toHaveBeenCalled();
    expect(handlers.harbour).not.toHaveBeenCalled();
  });

  it("separates cargo aboard from saved cave gold and refreshes home after delivery", () => {
    const { hud, button, progress } = setup(privateShip, true);
    expect(button("#home-ship").textContent).toContain("1 chest aboard");
    expect(button("#home-ship").textContent).toContain("1,000 gold to bring home");
    expect(button("#menu-cave").textContent).toContain("0 gold saved");
    deliverChest(progress, 0);
    hud.showMenu("main");
    expect(button("#home-ship").textContent).toContain("No chests aboard");
    expect(button("#menu-cave").textContent).toContain("1,000 gold saved");
  });

  it("offers unloading aboard and removes that action inside the cave", () => {
    const { hud, handlers, button } = setup(privateShip, true);
    hud.harbour();
    expect(button("#harbour-unload").hidden).toBe(false);
    expect(button("#harbour-unload").textContent?.trim()).toBe("Return to cave");
    button("#harbour-unload").click();
    expect(handlers.unload).toHaveBeenCalledOnce();
    expect(handlers.home).not.toHaveBeenCalled();
    hud.home();
    expect(button("#harbour-unload").hidden).toBe(true);
    expect(hud.root.dataset.walkPlace).toBe("cave");
  });

  it("does not offer unloading when no chests are aboard", () => {
    const { hud, button } = setup(privateShip);
    hud.harbour();
    expect(button("#harbour-unload").hidden).toBe(true);
  });
});

describe("regional island journeys", () => {
  it("keeps the ship details action outside level hit targets and makes the travelling boat decorative", () => {
    const { hud, button } = setup(false);
    hud.showMenu("worlds");
    expect(button("#map-ship").closest(".world-map")).toBeNull();
    button('[data-pack="0"]').click();
    const chart = button(".level-board"), marker = button("#level-ship-marker");
    expect(button("#level-ship").closest(".level-board")).toBeNull();
    expect(chart.querySelectorAll("button")).toHaveLength(10);
    expect(marker.tagName).toBe("SPAN");
    expect(marker.getAttribute("aria-hidden")).toBe("true");
    expect(marker.hasAttribute("inert")).toBe(true);
    marker.click();
    expect(button("#ship-panel").hidden).toBe(true);
    button("#level-ship").click();
    expect(button("#ship-panel").hidden).toBe(false);
  });
  it("keeps an open regional chart and its ship mounted when setting sail", () => {
    const { hud, button } = setup(false);
    hud.showMenu("worlds");
    button('[data-pack="0"]').click();
    const chart = button("#level-menu"), firstIsland = button('[data-level="0"]');
    const ship = button("#level-ship-marker");
    expect(chart.hidden).toBe(false);
    expect(ship.hidden).toBe(false);
    const show = vi.spyOn(hud, "showMenu");
    hud.beginTravel({ kind: "port" }, { kind: "course", index: 0 }, "Setting sail…");
    expect(show).not.toHaveBeenCalled();
    expect(button('[data-level="0"]')).toBe(firstIsland);
    expect(button("#level-ship-marker")).toBe(ship);
    expect(chart.hidden).toBe(false);
    expect(ship.hidden).toBe(false);
    expect(hud.root.dataset.screen).toBe("levels");
    expect(button("#chart-travel").hidden).toBe(false);
  });
  it("shows ten islands, preserves locks, stars and destinations", () => {
    const { hud, handlers, button } = setup(false, true);
    hud.showMenu("worlds");
    button('[data-pack="0"]').click();
    const stops = [...hud.root.querySelectorAll<HTMLButtonElement>("[data-level]")];
    expect(stops).toHaveLength(10);
    expect(stops.every(b => b.querySelector(".route-island img"))).toBe(true);
    expect(stops[0]!.querySelectorAll(".earned")).toHaveLength(3);
    expect(stops[1]!.disabled).toBe(false);
    expect(stops[2]!.disabled).toBe(true);
    stops[1]!.click(); expect(handlers.travel).toHaveBeenLastCalledWith(1);
    stops[2]!.click(); expect(handlers.travel).toHaveBeenCalledTimes(1);
    expect(button(".level-route polyline").getAttribute("points")?.split(" ")).toHaveLength(10);
    hud.location({ kind: "course", index: 1 });
    expect(button("#ship-place").textContent).toContain("island 2");
    expect(button("#level-ship-marker").hidden).toBe(false);
    hud.location({ kind: "sea", world: 3 });
    expect(button("#level-ship-marker").hidden).toBe(true);
    expect(button("#level-ship").hidden).toBe(false);
    hud.location({ kind: "cave" });
    expect(button("#ship-place").textContent).toBe("Anchored outside your cave");
  });
  it("keeps ship markers beside their island during the regional zoom", () => {
    const { hud, button } = setup(false);
    hud.showMenu("worlds"); button('[data-pack="0"]').click();
    const chart = button(".level-board");
    Object.defineProperty(chart, "clientWidth", { value: 400 });
    Object.defineProperty(chart, "clientHeight", { value: 500 });
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 320, height: 400 } as DOMRect);
    vi.spyOn(button('[data-level="0"]'), "getBoundingClientRect").mockReturnValue({ right: 106, top: 324, height: 35.2 } as DOMRect);
    hud.location({ kind: "course", index: 0 });
    expect(parseFloat(button("#level-ship-marker").style.left)).toBeCloseTo(140);
    expect(parseFloat(button("#level-ship-marker").style.top)).toBeCloseTo(408.6);
  });
  it("moves the marker on the active chart and closes ship details on leaving", () => {
    const { hud, button } = setup(false);
    hud.showMenu("worlds"); button("#map-ship").click();
    hud.beginTravel({ kind: "port" }, { kind: "course", index: 0 }, "Setting sail…");
    expect(hud.root.dataset.screen).toBe("levels");
    expect(button("#ship-panel").hidden).toBe(true);
    expect(button("#chart-travel").textContent).toBe("Setting sail…");
    expect(hud.root.classList.contains("chart-sailing")).toBe(true);
    hud.travelPose({ kind: "port" }, { kind: "course", index: 0 }, .5);
    hud.endTravel({ kind: "course", index: 0 });
    expect(button("#chart-travel").hidden).toBe(true);
    expect(hud.root.classList.contains("chart-sailing")).toBe(false);
    hud.beginTravel({ kind: "course", index: 0 }, { kind: "cave" }, "Sailing home…");
    expect(hud.root.dataset.screen).toBe("worlds");
    hud.endTravel({ kind: "cave" });
    hud.resizeChart(); hud.harbour(); button("#cave-back").click();
    expect(hud.root.dataset.screen).toBe("worlds");
  });
});

describe('sailing deck controls',()=>{
  it('keeps labelled camera controls usable through view changes and reopens the next voyage tip',()=>{
    const {hud,handlers,button}=setup(false);
    hud.play(1);hud.camera(false);
    expect(button('#v-camera').textContent).toBe('Captain');
    button('#v-camera').click();expect(handlers.camera).toHaveBeenCalledOnce();
    hud.camera(true);
    expect(button('#v-camera').textContent).toBe('Overhead');
    expect(button('#v-camera').getAttribute('aria-label')).toBe('Switch to overhead view');
    expect(button('#v-captain-help').hidden).toBe(false);
    button('#v-tip').classList.add('fade');
    hud.play(2);
    expect(button('#v-tip').classList.contains('fade')).toBe(false);
    expect(button('#v-tip').textContent).toContain('headland');
    expect(button('#v-home').textContent).toBe('Levels');
  });
  it('steers gently from the thumb-down location and releases only the steering finger',()=>{
    const { handlers, button } = setup(false);
    const wheel = button('#v-wheel');
    wheel.setPointerCapture = vi.fn();
    const pointer = (type: string, id: number, x: number, y: number) =>
      wheel.dispatchEvent(new PointerEvent(type, {pointerId:id,clientX:x,clientY:y,bubbles:true}));
    pointer('pointerdown', 1, 80, 140);
    expect(handlers.steer).toHaveBeenLastCalledWith(0);
    pointer('pointermove', 1, 92, 140);
    expect(handlers.steer.mock.lastCall![0]).toBeGreaterThan(0);
    expect(handlers.steer.mock.lastCall![0]).toBeLessThan(0.01);
    pointer('pointermove', 1, 80, 80);
    expect(handlers.steer).toHaveBeenLastCalledWith(0);
    pointer('pointermove', 1, 20, 140);
    expect(handlers.steer).toHaveBeenLastCalledWith(-0.75);
    pointer('pointerdown', 2, 200, 200);
    pointer('pointerup', 2, 200, 200);
    expect(handlers.steer).toHaveBeenLastCalledWith(-0.75);
    pointer('pointerup', 1, 20, 140);
    expect(handlers.steer).toHaveBeenLastCalledWith(null);
    expect(button('#v-stick').style.transform).toBe('');
  });
  it('offers walking while sailing and only allows returning at the real wheel',()=>{
    const {hud,handlers,button}=setup(false);
    hud.play(0);hud.deck(false,true,false,'idle',null,0);
    expect(button('#v-deck').hidden).toBe(false);button('#v-deck').click();expect(handlers.deck).toHaveBeenCalledOnce();
    hud.deck(true,false,false,'idle',null,0);
    expect(button('#v-deck').disabled).toBe(true);expect(button('#deck-helm').hidden).toBe(true);
    expect(button('#v-camera').disabled).toBe(true);expect(button('#deck-fish').disabled).toBe(true);
    hud.deck(true,true,true,'idle',null,2);button('#deck-helm').click();expect(handlers.deck).toHaveBeenCalledTimes(2);
    button('#deck-fish').click();expect(handlers.fish).toHaveBeenCalledOnce();
    hud.deck(true,true,true,'waiting',null,2);expect(button('#deck-fish').disabled).toBe(true);
    expect(button('#v-deck').disabled).toBe(true);expect(button('#fish-cancel').hidden).toBe(false);
    hud.deck(true,true,true,'bite',null,2);expect(button('#deck-fish').textContent).toBe('Reel in!');
    button('#fish-cancel').click();expect(handlers.cancelFish).toHaveBeenCalledOnce();
    hud.deck(true,true,true,'caught','chest',2);expect(button('#fish-status').textContent).toContain('1,000 gold safely aboard');
    hud.deck(true,true,true,'caught','fish',3);expect(button('#fish-status').textContent).toContain('silver fish');
    hud.showMenu();expect(button('#v-deck').hidden).toBe(true);
    hud.play(0);hud.deck(false,true,false,'idle',null,0);expect(button('#v-deck').hidden).toBe(false);
  });
  it('shows fishing cargo in the hold and offers the same cave unloading action',()=>{
    const {hud,button,progress}=setup(false);
    progress.fishing.chests.push({world:1,delivered:false});
    hud.hold();expect(button('#hold-count').textContent).toContain('1,000 gold');
    expect(button('#hold-unload').hidden).toBe(false);
    hud.harbour();expect(button('#harbour-unload').hidden).toBe(false);
  });
});
