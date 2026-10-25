import { PIRATE_ASSETS, pirateAsset } from "../assets";
import { COIN_POSE_STRIDE } from "./goldAreas";

let loaded: Promise<Float32Array> | undefined;
export const CHEST_COIN_SCALE = 1;
/** One offline simulation of a full wooden chest, shared by every reveal. */
export function chestCoinPoses(): Promise<Float32Array> {
  return loaded ??= fetch(pirateAsset(PIRATE_ASSETS.chest)).then(async response => {
    if (!response.ok) throw new Error("Could not load the chest's coins");
    const poses = new Float32Array(await response.arrayBuffer());
    if (poses.length !== 1000 * COIN_POSE_STRIDE || !poses.every(Number.isFinite)) throw new Error("Invalid chest coin poses");
    return poses;
  }).catch(error => { loaded = undefined; throw error; });
}
