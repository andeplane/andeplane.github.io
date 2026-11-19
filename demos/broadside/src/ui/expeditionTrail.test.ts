import { worldFor } from "../math/worlds";
import { createI18n } from "../math/i18n";
import { describe, expect, it } from "vitest";
import { LEVELS_PER_REGION, MAX_TRAIL_NODES, expeditionTrail, extendTrailWindow, initialTrailWindow, regionForLevel } from "./expeditionTrail";

describe("endless island expedition", () => {
  it("discovers a new named shore at each 12-level boundary without changing arithmetic", () => {
    expect(regionForLevel(1, worldFor("add"))).toMatchObject({ first: 1, last: 12, name: "Palm Bay" });
    expect(regionForLevel(12, worldFor("add")).index).toBe(0);
    expect(regionForLevel(13, worldFor("add"))).toMatchObject({ first: 13, last: 24, name: "Turtle Lagoon" });
    expect(regionForLevel(25, worldFor("add"))).toMatchObject({ first: 25, last: 36, name: "Coral Reach" });
    expect(regionForLevel(97, worldFor("add")).name).not.toBe(regionForLevel(1, worldFor("add")).name);
  });

  it("keeps large-level maps bounded and aligned while exploring further and revisiting shores", () => {
    let window = initialTrailWindow(1_000_001);
    expect(window.first).toBeLessThanOrEqual(1_000_001);
    expect(window.last).toBeGreaterThan(1_000_001);
    for (let i = 0; i < 100; i++) {
      const before = window.last;
      window = extendTrailWindow(window, "further");
      expect(window.last).toBe(before + 24);
      expect(window.last - window.first + 1).toBeLessThanOrEqual(MAX_TRAIL_NODES);
      expect((window.first - 1) % LEVELS_PER_REGION).toBe(0);
    }
    for (let i = 0; i < 100; i++) {
      window = extendTrailWindow(window, "earlier");
      expect(window.first).toBeGreaterThanOrEqual(1);
      expect(window.last - window.first + 1).toBeLessThanOrEqual(MAX_TRAIL_NODES);
    }
    expect(extendTrailWindow(initialTrailWindow(1), "earlier").first).toBe(1);
  });

  it("uses an absolute atlas band for the current stop and its map focus", () => {
    const courses = [[50, 48], [50, 53]].map(([first, other]) =>
      Array.from({ length: LEVELS_PER_REGION }, (_, i) => i === 0 ? first! : other!));
    const html = expeditionTrail({
      world: worldFor("add"), text: createI18n("en", []).t, showStars: true,
      resumeLabel: n => String(n), progressLabel: n => String(n),
      packLabel: "Up to 10", operatorName: "Addition", practiceRule: "", courses,
      window: { first: 13, last: 36 }, track: { cleared: 13, stars: {}, runs: {} },
    });
    expect(html).toContain('data-region="1" data-atlas-band="1"');
    expect(html).toContain('data-region="2" data-atlas-band="0"');
    expect(html).toContain('data-focus-x="530"');
    expect(html).toContain('style="left:53%;top:196px"');
  });

  it("exposes completed, current and locked islands through the existing level actions", () => {
    const html = expeditionTrail({ world: worldFor("add"), text:createI18n("en",[]).t, showStars:true, resumeLabel:n=>`resume, ${n} of 10 solved`, progressLabel:n=>String(n), packLabel: "Up to 10", operatorName: "Addition", practiceRule: "Sums stay at 10 or below.", window: initialTrailWindow(13), track: { cleared: 12, stars: { "12": 3 }, runs: { "13": { solved: 2 } } } });
    expect(html).toContain('data-level="13"  aria-current="step"');
    expect(html).toContain('aria-label="Level 13, resume, 2 of 10 solved"');
    expect(html).toContain('aria-label="Level 12, 3 stars, replay"');
    expect(html).toContain('data-level="14" disabled');
    expect(html.match(/class="expedition-node"/g)).toHaveLength(36);
    expect(html).toContain("Sums stay at 10 or below.");
    expect(html).toContain("assets/map/islands/cove.webp");
    expect(html).toContain("data-map-viewport");
    expect(html).toContain("data-map-world");
    expect(regionForLevel(1, worldFor("subtract")).name).toBe("Snowcap Bay");
    expect(regionForLevel(1, worldFor("multiply")).name).toBe("Cinder Cove");
    expect(regionForLevel(1, worldFor("divide")).name).toBe("Moonlit Gate");
    expect(html).toContain('data-action="trail-further"');
  });
});
