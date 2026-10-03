/** One permanent bank per world, beside the walking paths and its special keepsake. */
export const GOLD_AREAS = [
  { world: 0, name: "First sails", x: -8, z: 6, radius: 3.8 },
  { world: 1, name: "Pirate waters", x: 8, z: 12, radius: 3.8 },
  { world: 2, name: "Whirlpool straits", x: -6, z: 43, radius: 3.5 },
  { world: 3, name: "The glowing deep", x: 28, z: 43, radius: 3.5 },
] as const;
export const COIN_RADIUS = 0.14;
export const COIN_THICKNESS = 0.055;
export const GOLD_POSE_VERSION = 1;
/** Binary layout: seven float32 values per coin: XYZ position, XYZW quaternion. */
export const COIN_POSE_STRIDE = 7;
