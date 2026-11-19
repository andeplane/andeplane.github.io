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

export const clockSteps = [60, 30, 15, 5, 1] as const;
export type ClockStep = typeof clockSteps[number];

export function clockQuestions(seed: number, step: ClockStep): ClockQuestion[] {
  const rng = new Rng(seed);
  const hours = sample(Array.from({ length: 12 }, (_, i) => i), QUESTIONS_PER_LEVEL, rng);
  // Give each new dial position a turn before repeating it.
  const positions = Array.from({ length: 60 / step }, (_, i) => i * step);
  let remaining: number[] = [];
  return hours.map(hour => {
    if (!remaining.length) remaining = positions.slice();
    const minute = sample(remaining, 1, rng)[0]!;
    const time = hour * 60 + minute;
    const offsets = step === 60 ? [-60, 60, 180] : [-step, step, 60];
    const alternatives = offsets.map(offset => (time + offset + minutesPerDial) % minutesPerDial);
    return { time, choices: sample([time, ...alternatives], 4, rng) };
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
    <circle r="115" class="clock-rim"/><circle r="111" class="clock-engraving"/><circle r="107" class="clock-dial"/>
    <path class="clock-rose" d="M0 -58 7 -9 51 0 7 8 0 57 -7 8 -51 0 -7 -9Z"/>
    ${ticks}${numbers}
    <path class="clock-hour-hand" transform="rotate(${time / 2})" d="M-4 4 Q-2 -22 -4 -37 C-12 -41 -7 -50 -2 -46 Q0 -43 2 -46 C8 -51 12 -41 4 -37 Q2 -22 4 4Z"/>
    <path class="clock-minute-hand" transform="rotate(${time % 60 * 6})" d="M-2 4 Q-1 -29 -3 -58 C-8 -62 -5 -69 -1 -66 Q0 -63 1 -66 C6 -69 9 -61 3 -58 Q1 -29 2 4Z"/>
    <circle r="5" class="clock-pin"/>
  </svg>`;
}
