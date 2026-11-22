import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { Scene } from "@babylonjs/core/scene.js";

export type VillageSurface = "plain" | "glass" | "lime" | "boards" | "stone" | "cobbles" | "tiles" | "slate" | "linen" | "snow";
export const surfaceMetres: Record<VillageSurface, number> = {
  plain: 1, glass: 1, lime: 2.35, boards: 1.85, stone: 2.15, cobbles: 2.2,
  tiles: 2.45, slate: 2.05, linen: .70, snow: 2.40,
};

// Resolve ordinary Vite asset URLs. Only the surfaces in the current settlement load.
const files = import.meta.glob<string>("./village-surfaces/*.webp", { eager: true, query: "?url", import: "default" });

export function villageMaterial(scene: Scene, surface: VillageSurface, night: boolean) {
  const m = new StandardMaterial(`village ${surface}`, scene);
  m.diffuseColor = Color3.White();
  m.specularColor.setAll(surface === "glass" ? .30 : .038);
  m.specularPower = surface === "glass" ? 48 : 20;
  if (surface === "glass" && night) m.emissiveColor = new Color3(.98,.52,.135);
  if (surface === "plain" || surface === "glass") return m;
  const texture = (suffix: string) => {
    const url = files[`./village-surfaces/${surface}${suffix}.webp`]!;
    const map = new Texture(url, scene);
    map.anisotropicFilteringLevel = 4;
    return map;
  };
  m.diffuseTexture = texture("");
  const bump = texture("-normal");
  bump.gammaSpace = false;
  bump.level = surface === "linen" ? .34 : surface === "slate" || surface === "cobbles" ? .82 : .64;
  m.bumpTexture = bump;
  return m;
}
