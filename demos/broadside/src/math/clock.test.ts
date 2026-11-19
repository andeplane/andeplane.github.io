import { describe, expect, it } from "vitest";
import { clockFace, clockQuestions, clockTime } from "./clock";

describe("clock practice", () => {
  it("offers ten unique times in increasing difficulty and four unique choices per clock", () => {
    for (let seed = 0; seed < 32; seed++) {
      const round = clockQuestions(seed);
      expect(round).toEqual(clockQuestions(seed));
      expect(round).toHaveLength(10);
      expect(new Set(round.map(question => question.time)).size).toBe(10);
      expect(round.slice(0, 3).map(question => question.time % 60)).toEqual([0, 0, 0]);
      expect(round.slice(3, 6).map(question => question.time % 60).sort((a, b) => a - b)).toEqual([15, 30, 45]);
      expect(round.slice(6).every(question => question.time % 15 !== 0 && question.time % 5 === 0)).toBe(true);
      for (const { time, choices } of round) {
        expect(new Set(choices).size).toBe(4);
        expect(choices).toContain(time);
        expect(choices.every(choice => choice >= 0 && choice < 720)).toBe(true);
      }
    }
  });

  it("keeps the hour hand moving between numbers and displays twelve at the top of the dial", () => {
    expect(clockTime(0)).toBe("12:00");
    expect(clockTime(5)).toBe("12:05");
    expect(clockTime(690)).toBe("11:30");
    const face = clockFace(690, "Hands at eleven and six");
    expect(face).toContain('class="clock-hour-hand" y2="-46" transform="rotate(345)"');
    expect(face).toContain('class="clock-minute-hand" y2="-66" transform="rotate(180)"');
  });
});
