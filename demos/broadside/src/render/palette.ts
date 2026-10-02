import { Color3 } from "@babylonjs/core/Maths/math.color.js";

/** Sunset Cove art direction. Stylized, warm, high-contrast. */
export const PALETTE = {
  deepWater: Color3.FromHexString("#086985"),
  shallowWater: Color3.FromHexString("#39d9c7"),
  foam: Color3.FromHexString("#f4fbf7"),
  skyTop: Color3.FromHexString("#4c9cad"),
  horizon: Color3.FromHexString("#e6f3d1"),
  sun: Color3.FromHexString("#ffe0a8"),
  fog: Color3.FromHexString("#c5e8e2"),
  ambient: Color3.FromHexString("#5b6aa0"),
  sand: Color3.FromHexString("#ecd39a"),
  wetSand: Color3.FromHexString("#b9a06b"),
  grass: Color3.FromHexString("#81b957"),
  grassDark: Color3.FromHexString("#569f4e"),
  rock: Color3.FromHexString("#7d7268"),
  rockDark: Color3.FromHexString("#5a5049"),
  wood: Color3.FromHexString("#7a4a2a"),
  woodDark: Color3.FromHexString("#4b2c19"),
  sail: Color3.FromHexString("#f1e6cc"),
  pirateSail: Color3.FromHexString("#3b2f2f"),
  bossSail: Color3.FromHexString("#9e2a22"),
  brass: Color3.FromHexString("#d9a441"),
  danger: Color3.FromHexString("#ff4a3a"),
} as const;

/** Direction the sunlight travels: from a low sun far "north", toward the camera. */
export const SUN_DIRECTION = { x: -0.5, y: -0.8, z: -0.65 };
