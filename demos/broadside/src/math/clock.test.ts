import { describe, expect, it } from "vitest";
import { clockFace, clockQuestions, clockSteps } from "./clock";
import { spokenTime } from "./spokenTime";

describe("clock practice", () => {
  it.each(clockSteps)("keeps every question and alternative on the %i minute grid", step => {
    for (let seed = 0; seed < 32; seed++) {
      const round = clockQuestions(seed, step);
      expect(round).toEqual(clockQuestions(seed, step));
      expect(new Set(round.map(q => q.time)).size).toBe(10);
      expect(new Set(round.map(q => q.time % 60)).size).toBe(Math.min(10, 60 / step));
      for (const { time, choices } of round) {
        expect(choices).toContain(time);
        expect(new Set(choices.map(spokenTime)).size).toBe(4);
        expect(choices.every(choice => choice >= 0 && choice < 720 && choice % step === 0)).toBe(true);
      }
    }
  });
  it("uses everyday Norwegian around the half hour and across twelve", () => {
    expect(spokenTime(570)).toBe("halv ti");
    expect(spokenTime(280)).toBe("ti over halv fem");
    expect(spokenTime(285)).toBe("kvart på fem");
    expect(spokenTime(710)).toBe("ti på tolv");
    expect(spokenTime(25)).toBe("fem på halv ett");
    expect(spokenTime(269)).toBe("ett minutt på halv fem");
    expect(new Set(Array.from({length: 720}, (_, i) => spokenTime(i))).size).toBe(720);
  });
  it("advances both bone hands at minute precision", () => {
    const face = clockFace(691, "Clock");
    expect(face).toContain('class="clock-hour-hand" transform="rotate(345.5)"');
    expect(face).toContain('class="clock-minute-hand" transform="rotate(186)"');
  });
});
