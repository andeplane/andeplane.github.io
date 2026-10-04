// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Controls } from "../input/controls";
import { readProgress } from "../game/progress";
import { awardVoyage } from "../game/rewards";
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

describe.each([false, true])("treasure navigation with private ship %s", (privateShip) => {
  it("keeps the ship under Play and travels to cave from either chart", () => {
    const { hud, handlers, button } = setup(privateShip);
    expect([...hud.root.querySelectorAll(".main-actions button")].map(b => b.textContent?.trim()))
      .toEqual(["Play", "Settings", "Cave"]);
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
    expect(button("#level-ship").hidden).toBe(false);
    hud.location({ kind: "sea", world: 3 });
    expect(button("#level-ship").hidden).toBe(true);
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
    expect(parseFloat(button("#level-ship").style.left)).toBeCloseTo(140);
    expect(parseFloat(button("#level-ship").style.top)).toBeCloseTo(408.6);
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
