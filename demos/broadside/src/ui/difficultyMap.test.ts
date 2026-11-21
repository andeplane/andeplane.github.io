import { describe, it, expect } from "vitest";
import { difficultyMap } from "./difficultyMap";
describe("shared pack islands", () => {
  it("renders distinct shores and focuses the selected pack with escaped labels", () => {
    const html = difficultyMap({ name:"Fjords", accessibleName:"Reading map",instructions:"Choose a pack",
      firstArt:4, selected:2, centerLabel:"Current island", stops:[
        {id:1,label:"First",ariaLabel:"First pack"}, {id:2,label:"<Next>",ariaLabel:"Second pack"},
      ] });
    expect(html).toContain('data-focus-x="532" data-focus-y="300"');
    expect(html).toMatch(/data-map-center aria-label="Current island"><svg[^>]*>/);
    expect(html).not.toContain("</svg> Current island");
    expect(html).toContain("islands/fjord.webp");
    expect(html).toContain("islands/keep.webp");
    expect(html).toContain("&lt;Next&gt;");
    expect(html.match(/class="world-route-stop"/g)).toHaveLength(2);
  });
});
