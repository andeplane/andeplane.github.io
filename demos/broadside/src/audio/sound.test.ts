import { afterEach, describe, expect, it, vi } from "vitest";
import { Sound } from "./sound";
afterEach(() => vi.unstubAllGlobals());
describe("silent game startup", () => {
  it("does not create an audio device on startup or automatic resume", async () => {
    const create = vi.fn();
    vi.stubGlobal("AudioContext", create);
    const s = new Sound();
    await s.unlock();
    s.pause(false);
    expect(s.muted).toBe(true);
    expect(s.state).toBe("locked");
    expect(create).not.toHaveBeenCalled();
  });
  it("forced mute survives sound button presses and explicit unlock calls", async () => {
    const create = vi.fn();
    vi.stubGlobal("AudioContext", create);
    const s = new Sound(true);
    expect(s.toggle()).toBe(true);
    expect(s.toggle()).toBe(true);
    await s.unlock();
    s.pause(false);
    expect(create).not.toHaveBeenCalled();
    expect(s.state).toBe("locked");
  });
  it("ordinary sound mode is available after the player explicitly enables it", async () => {
    const create = vi.fn(() => {
      throw new Error("No device in the test runner");
    });
    vi.stubGlobal("AudioContext", create);
    const s = new Sound();
    expect(s.toggle()).toBe(false);
    await s.unlock();
    expect(create).toHaveBeenCalledOnce();
  });
  it("plays game events without requesting a browser voice even when sound is enabled", () => {
    const speak = vi.fn(),
      utterance = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak });
    vi.stubGlobal("SpeechSynthesisUtterance", utterance);
    const s = new Sound();
    s.toggle();
    s.handle(
      [],
      [
        { type: "banner", title: "Sails ahead", subtitle: "Keep turning" },
        { type: "reward", chapter: 0 },
      ],
      1,
    );
    expect(speak).not.toHaveBeenCalled();
    expect(utterance).not.toHaveBeenCalled();
  });
});
