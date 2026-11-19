import { Rng } from "../sim/rng";
import { QUESTIONS_PER_LEVEL } from "./academy";

export interface ClockQuestion {
  /** Minutes after twelve, in the range 0–719. */
  time: number;
  choices: readonly number[];
}

const minutesPerDial = 12 * 60;
export const clockHour = (time: number) => Math.floor(time / 60) || 12;
export const clockTime = (time: number) => `${clockHour(time)}:${String(time % 60).padStart(2, "0")}`;

function sample<T>(items: T[], count: number, rng: Rng): T[] {
  return Array.from({ length: count }, () => items.splice(rng.int(0, items.length - 1), 1)[0]!);
}

export function clockQuestions(seed: number): ClockQuestion[] {
  const rng = new Rng(seed);
  const stages = [
    { minutes: [0, 0, 0], count: 3 },
    { minutes: [15, 30, 45], count: 3 },
    { minutes: [5, 10, 20, 25, 35, 40, 50, 55], count: QUESTIONS_PER_LEVEL - 6 },
  ];
  return stages.flatMap(({ minutes, count }) => {
    const hours = Array.from({ length: 12 }, (_, i) => i);
    // Give each early minute position a turn before repeating it.
    return sample(minutes, count, rng).map(minute => {
      const hour = sample(hours, 1, rng)[0]!;
      const time = hour * 60 + minute;
      const earlier = (time + minutesPerDial - 60) % minutesPerDial;
      const later = (time + 60) % minutesPerDial;
      const other = minute === 0
        ? (time + 180) % minutesPerDial
        : hour * 60 + (minute + (minute % 15 === 0 ? 15 : 5)) % 60;
      return { time, choices: sample([time, earlier, later, other], 4, rng) };
    });
  });
}

export function clockFace(time: number, label: string): string {
  const ticks = Array.from({ length: 60 }, (_, i) =>
    `<line y1="-103" y2="-${i % 5 === 0 ? 94 : 99}" transform="rotate(${i * 6})" class="${i % 5 === 0 ? "clock-hour-tick" : "clock-minute-tick"}"/>`
  ).join("");
  const numbers = Array.from({ length: 12 }, (_, i) => {
    const angle = i * Math.PI / 6;
    return `<text x="${79 * Math.sin(angle)}" y="${-79 * Math.cos(angle)}">${i || 12}</text>`;
  }).join("");
  return `<svg class="clock-face" viewBox="-116 -116 232 232" role="img" aria-labelledby="clock-face-label">
    <title id="clock-face-label">${label}</title>
    <circle r="111" class="clock-rim"/><circle r="107" class="clock-dial"/>
    ${ticks}${numbers}
    <line class="clock-hour-hand" y2="-46" transform="rotate(${time / 2})"/>
    <line class="clock-minute-hand" y2="-66" transform="rotate(${time % 60 * 6})"/>
    <circle r="5" class="clock-pin"/>
  </svg>`;
}
