import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPERATORS } from "./academy";
import { worldFor } from "./worlds";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  if (!found) throw new Error(`Missing CSS rule: ${selector}`);
  return found[1]!;
};
const ink = (selector: string) => {
  const found = rule(selector).match(/(?:^|;)\s*color:\s*(#[\da-f]{6})(?:;|\s|$)/i);
  if (!found) throw new Error(`Missing opaque text colour: ${selector}`);
  return found[1]!;
};
const luminance = (hex: string) => {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!;
};
const contrast = (a: string, b: string) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
describe("readable Captain Calculus text", () => {
  it("keeps all small question feedback and hint text above 4.5:1 on every parchment shade", () => {
    const background = rule(".math-card").match(/background:\s*([^;]+)/)![1]!;
    const parchment = background.match(/#[\da-f]{6}/gi)!;
    for (const selector of [".question-heading .eyebrow", ".hint-button", ".answer-feedback", ".answer-feedback.success", ".answer-feedback.retry", ".hint-panel p", ".hint-groups small", ".numberline span"]) {
      for (const paper of parchment) expect(contrast(ink(selector), paper), `${selector} on ${paper}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps every world's difficulty text readable on its own paper colour", () => {
    for (const { id } of OPERATORS) {
      const world = worldFor(id);
      expect(contrast(world.ink, world.paper), world.name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
