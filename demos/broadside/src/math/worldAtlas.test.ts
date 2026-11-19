// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { atlasRenderer, levelPoint } from "./worldAtlas";
import { createI18n } from "./i18n";

describe("the continuous world atlas", () => {
  it("restores identical islands after a distant crossing and keeps only nearby tiles", () => {
    const plane = document.createElement("div");
    const draw = atlasRenderer(plane, "subtract", {cleared: 1_000_000, stars: {}, runs: {}}, createI18n("en", []));
    const point = levelPoint("subtract", 1_000_001);
    function visit(x: number, y: number) {
      draw({x: -x, y: -y, scale: 1}, {x, y}, 390, 844);
      expect(plane.childElementCount).toBeLessThanOrEqual(25);
    }
    visit(point.x - 195, point.y - 400);
    const original = plane.innerHTML;
    expect(plane.querySelector("#expedition-current")?.getAttribute("data-level")).toBe("1000001");
    expect(plane.querySelector("[data-level='1000002']")?.hasAttribute("disabled")).toBe(true);
    visit(1_000_000, -2_000_000);
    expect(plane.querySelector("#expedition-current")).toBeNull();
    expect(plane.querySelector(".atlas-land img")?.getAttribute("src")).toContain("subtract-coast.webp");
    visit(point.x - 195, point.y - 400);
    expect(plane.innerHTML).toBe(original);
  });
});
