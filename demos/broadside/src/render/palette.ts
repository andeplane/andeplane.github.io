import { Color3 } from "@babylonjs/core/Maths/math.color.js";

/** Moonlit pirate seas: cool water, amber lanterns and readable silhouettes. */
export const PALETTE = {
  deepWater: Color3.FromHexString("#102d43"),
  shallowWater: Color3.FromHexString("#2b777c"),
  foam: Color3.FromHexString("#bbc9bf"),
  skyTop: Color3.FromHexString("#233e54"),
  horizon: Color3.FromHexString("#64868d"),
  sun: Color3.FromHexString("#cbd8cf"),
  fog: Color3.FromHexString("#233b4b"),
  ambient: Color3.FromHexString("#36445c"),
  sand: Color3.FromHexString("#bbab7f"),
  wetSand: Color3.FromHexString("#b9a06b"),
  grass: Color3.FromHexString("#4e8060"),
  grassDark: Color3.FromHexString("#2e594a"),
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
