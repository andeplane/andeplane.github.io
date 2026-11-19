// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { answerHaptic, installButtonHaptics } from "./buttonHaptics";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: vi.fn(() => true) } }));
vi.mock("@capacitor/haptics", () => ({ Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) }, NotificationType: { Success: "SUCCESS", Error: "ERROR" }, ImpactStyle: { Light: "LIGHT" } }));
let remove: (() => void) | undefined;
afterEach(() => { remove?.(); document.body.innerHTML = ""; vi.clearAllMocks(); vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true); });
function tap(target: Element, trusted = true) {
  const event = new MouseEvent("click", { bubbles: true, composed: true, button: 0 });
  Object.defineProperty(event, "isTrusted", { value: trusted });
  target.dispatchEvent(event);
}

describe("shared button haptics", () => {
  it("taps once for dynamic buttons, nested artwork and keyboard-style clicks, even when the action replaces the menu", () => {
    remove = installButtonHaptics(); expect(installButtonHaptics()).toBe(remove);
    document.body.innerHTML = '<button><span>Play</span></button>';
    document.querySelector('button')!.onclick = () => { document.body.innerHTML = '<button>Back</button>'; };
    tap(document.querySelector('span')!); tap(document.querySelector('button')!);
    expect(Haptics.impact).toHaveBeenCalledTimes(2);
    expect(Haptics.impact).toHaveBeenCalledWith({ style: "LIGHT" });
  });
  it("stays quiet for disabled controls, programmatic clicks, backgrounds and suppressed map drags", () => {
    remove = installButtonHaptics();
    document.body.innerHTML = '<button disabled>A</button><div aria-disabled="true"><button>C</button></div><button id="map">Island</button>';
    for (const button of document.querySelectorAll('button:not(#map)')) tap(button);
    tap(document.body); tap(document.querySelector('#map')!, false);
    document.querySelector('#map')!.addEventListener('click', event => event.stopImmediatePropagation(), true);
    tap(document.querySelector('#map')!);
    expect(Haptics.impact).not.toHaveBeenCalled();
  });
  it("still taps when the action disables its button and tolerates unavailable hardware", async () => {
    remove = installButtonHaptics(); document.body.innerHTML = '<button>Submit</button>';
    const button = document.querySelector('button')!; button.onclick = () => { button.disabled = true; };
    vi.mocked(Haptics.impact).mockRejectedValueOnce(new Error('Unavailable'));
    tap(button); await Promise.resolve(); expect(Haptics.impact).toHaveBeenCalledOnce();
  });
  it("uses a short browser vibration when available and removes listeners cleanly", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const vibrate = vi.fn(); Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    remove = installButtonHaptics(); document.body.innerHTML = '<button>Play</button>';
    tap(document.querySelector('button')!); expect(vibrate).toHaveBeenCalledWith(10);
    remove(); tap(document.querySelector('button')!); expect(vibrate).toHaveBeenCalledOnce();
    expect(Haptics.impact).not.toHaveBeenCalled();
  });
});

it("plays exactly the answer gesture for each submitted result", () => {
  remove = installButtonHaptics();
  document.body.innerHTML = '<button data-answer-haptic>Check</button>';
  const check = document.querySelector("button")!;
  for (const correct of [false, true]) {
    check.onclick = () => answerHaptic(correct);
    tap(check);
  }
  expect(Haptics.notification).toHaveBeenNthCalledWith(1, { type: "ERROR" });
  expect(Haptics.notification).toHaveBeenNthCalledWith(2, { type: "SUCCESS" });
  expect(Haptics.impact).not.toHaveBeenCalled();
});
