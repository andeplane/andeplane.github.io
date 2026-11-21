import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { IslandScenery, vec } from "./landfallScenery";

/** Scallops have a paired fan at the hinge, a convex fluted back and a
 * pale inside visible beneath the scalloped lip. Every rim is closed. */
export function scallopShell(s: IslandScenery, x: number, z: number, angle: number, radius: number) {
  const varnish = Color3.FromHexString("#d68479"),
    ivory = Color3.FromHexString("#f6d8bd");
  const axisX = Math.sin(angle),
    axisZ = Math.cos(angle);
  const lipColors = ["#e8ab94", "#f8d5b6", "#e4aa99", "#edb69f"];
  const ribs = 11,
    slices = ribs * 4,
    rings = 6;
  const point = (k: number, j: number, inside: boolean) => {
    const u = j / rings,
      t = k / slices,
      a = (t - 0.5) * 2.05;
    const crest = Math.pow(0.5 + 0.5 * Math.cos(t * Math.PI * 2 * ribs), 2);
    const radial = radius * (0.075 + u * (0.9 + 0.045 * crest));
    const across = Math.sin(a) * radial;
    const along = Math.cos(a) * radial - radius * 0.16;
    const px = x + along * axisX + across * axisZ,
      pz = z + along * axisZ - across * axisX;
    const back =
      radius * (0.2 * Math.sin(u * Math.PI * 0.87) * (1 - 0.35 * Math.abs(2 * t - 1)) + 0.048 * crest * u);
    // Keep the body above the sand on a slope and taper the lip to a fine edge.
    const floor = s.floor(px, pz);
    return vec(px, floor + radius * 0.07 + u * radius * 0.09 + (inside ? back * 0.59 - 0.018 : back), pz);
  };
  const outer = Array.from({ length: rings + 1 }, (_, j) =>
    Array.from({ length: slices + 1 }, (_, k) => point(k, j, false)),
  );
  const inner = Array.from({ length: rings + 1 }, (_, j) =>
    Array.from({ length: slices + 1 }, (_, k) => point(k, j, true)),
  );
  const patch = (a: (typeof outer)[number][number], b: typeof a, c: typeof a, d: typeof a, color: string) => {
    s.triangle(a, b, c, color);
    s.triangle(a, c, d, color);
  };
  const hues = Array.from({ length: slices }, (_, k) =>
    Array.from({ length: rings }, (_, j) =>
      Color3.Lerp(
        varnish,
        ivory,
        0.13 + 0.47 * (j / rings) + 0.3 * (0.5 + 0.5 * Math.cos(((k + 0.5) * Math.PI) / 2)),
      ).toHexString(),
    ),
  );
  for (let k = 0; k < slices; k++) {
    for (let j = 0; j < rings; j++) {
      const o = outer[j]!,
        n = outer[j + 1]!,
        i = inner[j]!,
        ni = inner[j + 1]!;
      patch(o[k]!, n[k]!, n[k + 1]!, o[k + 1]!, hues[k]![j]!);
      patch(i[k + 1]!, ni[k + 1]!, ni[k]!, i[k]!, "#f0cfb9");
    }
    patch(
      outer[rings]![k]!,
      inner[rings]![k]!,
      inner[rings]![k + 1]!,
      outer[rings]![k + 1]!,
      lipColors[k % 4]!,
    );
    patch(outer[0]![k + 1]!, inner[0]![k + 1]!, inner[0]![k]!, outer[0]![k]!, "#cc927f");
  }
  for (const k of [0, slices])
    for (let j = 0; j < rings; j++)
      patch(outer[j]![k]!, inner[j]![k]!, inner[j + 1]![k]!, outer[j + 1]![k]!, "#f1cbb2");
  const hinge = outer[0]![slices / 2]!;
  for (const side of [-1, 1]) {
    const p = vec(
      hinge.x + axisZ * side * radius * 0.23,
      hinge.y + 0.016,
      hinge.z - axisX * side * radius * 0.23,
    );
    const q = vec(p.x - axisX * radius * 0.13, p.y - 0.019, p.z - axisZ * radius * 0.13);
    s.triangle(hinge, p, q, "#e4ad96");
  }
}
