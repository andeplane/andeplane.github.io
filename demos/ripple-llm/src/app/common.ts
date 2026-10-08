/** Shared state handed to both chapters. */
import type { TankView } from '../render/tankView.ts';
import type { BankMeta } from '../sim/bank.ts';
import type { CalibResult } from '../sim/calib.worker.ts';
import type { TankSpec } from '../sim/tank.ts';
import type { Weights } from '../model/llm.ts';

export interface ModelFile {
  about: string;
  trainLoss: number;
  valLoss: number;
  weights: Weights;
  testNames: string[];
}

export interface Ctx {
  view: TankView;
  bank: BankMeta;
  specs: TankSpec[];
  calib: (CalibResult | undefined)[];
  model: ModelFile;
  labels: HTMLElement;
  /** Called with a bank index whenever another tank finishes calibrating. */
  onCalibrated: (cb: (index: number) => void) => void;
}

export interface Chapter {
  enter(): void;
  leave(): void;
  frame(now: number): void;
  /** Timeline labels and the active stage, for the footer. */
  timeline(): { labels: { text: string; digital?: boolean }[]; stage: number };
}

export const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export function fmt(v: number, digits = 3): string {
  const s = v.toFixed(digits);
  return v < 0 || s.startsWith('-') ? s.replace('-', '−') : `+${s}`;
}

export const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
export const sub = (k: number) => String(k).split('').map((d) => SUB[Number(d)]).join('');

export function sci(v: number): string {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2) return v.toFixed(Math.max(0, 3 - e));
  const m = v / 10 ** e;
  return `${m.toFixed(1)}×10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
}

/** Make or reuse a label element in the 3D overlay. */
export function tagPool(root: HTMLElement) {
  const els: HTMLDivElement[] = [];
  let used = 0;
  return {
    begin() {
      used = 0;
    },
    put(x: number, y: number, text: string, cls: string) {
      let el = els[used];
      if (!el) {
        el = document.createElement('div');
        root.appendChild(el);
        els.push(el);
      }
      used++;
      el.className = `tag ${cls}`;
      if (el.textContent !== text) el.textContent = text;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.display = '';
    },
    end() {
      for (let k = used; k < els.length; k++) els[k].style.display = 'none';
    },
  };
}

/**
 * How many solver steps to take this frame for a target rate (steps per second).
 * With `strobe`, the count is kept at one more than a whole number of periods, so
 * each frame catches the waves 1/PERIOD of a cycle later: a stroboscope.
 */
export function stepsFor(rate: number, dt: number, period: number, strobe = false): number {
  const n = Math.max(1, Math.round(rate * Math.min(dt, 1)));
  if (!strobe) return Math.min(n, 4000);
  return Math.min(Math.max(1, Math.round((n - 1) / period)) * period + 1, 4001);
}
