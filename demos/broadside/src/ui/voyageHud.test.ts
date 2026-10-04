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
    start: vi.fn(), freeSail: vi.fn(), seaChart: vi.fn(), camera: vi.fn(),
    centreLook: vi.fn(), home: vi.fn(), harbour: vi.fn(), hold: vi.fn(),
    unload: vi.fn(), menu: vi.fn(), overview: vi.fn(), caveMove: vi.fn(),
    caveJump: vi.fn(), caveInspect: vi.fn(), select: vi.fn(), pause: vi.fn(),
    fire: vi.fn(), steer: vi.fn(), anchor: vi.fn(),
  };
  const hud = new VoyageHud(progress, new Controls(), handlers);
  const button = (id: string) => hud.root.querySelector<HTMLButtonElement>(id)!;
  return { hud, handlers, button };
}

afterEach(() => { document.body.replaceChildren(); ship.private = false; });

describe.each([false, true])("treasure navigation with private ship %s", (privateShip) => {
  it("keeps Play, Settings and Cave and a separate ship treasure destination", () => {
    const { hud, handlers, button } = setup(privateShip);
    expect([...hud.root.querySelectorAll(".main-actions button")].map(b => b.textContent?.trim()))
      .toEqual(["Play", "Settings", "Cave"]);
    button("#menu-cave").click();
    expect(handlers.home).toHaveBeenCalledOnce();
    expect(handlers.hold).not.toHaveBeenCalled();
    hud.showMenu("worlds");
    expect(button("#map-cave").getAttribute("aria-label")).toBe("Visit treasure cave");
    expect(button("#map-cave").textContent).toBe("Your cave");
    button("#map-cave").click();
    expect(handlers.home).toHaveBeenCalledTimes(2);
    hud.showMenu();
    expect(button("#menu-hold").hidden).toBe(false);
    expect(button("#menu-hold").textContent).toBe(privateShip ? "Treasure room" : "Treasure hold");
    button("#menu-hold").click();
    expect(handlers.hold).toHaveBeenCalledOnce();
    button("#visit-ship").click();
    expect(handlers.harbour).toHaveBeenCalledOnce();
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
