import { describe, expect, it } from "vitest";
import { displayRenderScale, antialiasSamples } from "./quality";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

const buffer = (width: number, height: number, dpr: number, max = 16384) => {
  const scale = displayRenderScale(width, height, dpr, max);
  return [Math.floor(width / scale), Math.floor(height / scale)];
};
describe("display resolution", () => {
  it("renders a 3x phone at its physical portrait and landscape resolution", () => {
    expect(buffer(390, 844, 3)).toEqual([1170, 2532]);
    expect(buffer(430, 932, 3)).toEqual([1290, 2796]);
    expect(buffer(932, 430, 3)).toEqual([2796, 1290]);
  });
  it("keeps Retina desktop and ordinary screens at native resolution", () => {
    expect(buffer(1280, 720, 2)).toEqual([2560, 1440]);
    expect(buffer(390, 844, 1)).toEqual([390, 844]);
    expect(buffer(1280, 720, NaN)).toEqual([1280, 720]);
  });
  it("bounds enormous buffers and honours the GPU's texture-size limit", () => {
    const [w,h] = buffer(3840,2160,3);
    expect(w! * h!).toBeLessThanOrEqual(8_000_000);
    expect(w! / h!).toBeCloseTo(3840/2160,2);
    expect(buffer(390,844,3,2048)[1]).toBe(2048);
  });
  it("uses four samples when supported and falls back for older GPUs", () => {
    const gpu = (maxMSAASamples: number) => ({getCaps:()=>({maxMSAASamples})}) as AbstractEngine;
    expect(antialiasSamples(gpu(8))).toBe(4);
    expect(antialiasSamples(gpu(2))).toBe(2);
    expect(antialiasSamples(gpu(0))).toBe(1);
  });
});
