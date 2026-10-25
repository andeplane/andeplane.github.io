/** Shared bundle paths, deliberately unchanged so offline/native caches stay compatible. */
export const PIRATE_ASSETS = {
  chest: "assets/hoard/chest.bin",
  coinSound: "assets/audio/coins-drop.mp3",
  rockColor: "textures/cave/rock-color.jpg",
  rockNormal: "textures/cave/rock-normal.jpg",
} as const;
export const pirateAsset = (path: string): string => `${import.meta.env.BASE_URL}${path}`;
