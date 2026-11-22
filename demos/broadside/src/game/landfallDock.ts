import type { GeneratedIsland } from "./landfall";
import { deckHalfWidth, deckHeight } from "../shared/pirate-world/input/harbourLayout";

const SHIP_SCALE = .52;
const BOARDING_Z = -3;
const HALF_PIER = 1.55;
const PIER_Y = .78;

export function planPearlDock({ site, heightAt }: GeneratedIsland) {
  // Begin with the player's established landing and look seaward for the
  // first shore crossing. The Pearl sits across the end of the pier.
  const x = site.spawn.x;
  let shoreZ = site.spawn.z;
  while (heightAt(x, shoreZ) > PIER_Y && shoreZ > -47) shoreZ -= .125;
  const landEnd = -1.15;
  const landY = heightAt(x, shoreZ - landEnd) - .035;
  const pierHeight = (t: number) => {
    const f = Math.max(0, Math.min(1, (t - landEnd) / 2.35));
    return landY + (PIER_Y - landY) * f;
  };
  let pierEnd = 7;
  const shipX = x + BOARDING_Z * SHIP_SCALE;
  const rampRun = 4.9;
  const shipOffset = rampRun + deckHalfWidth(BOARDING_Z) * SHIP_SCALE;
  // Make sure the hull and the whole boarding approach clear the shelf.
  for (; pierEnd < 35; pierEnd += .75) {
    const candidateZ = shoreZ - pierEnd - shipOffset;
    const clear = [-22, -14, -6, 2, 10, 18, 22].every(z =>
      [0, deckHalfWidth(z) * .94].every(u =>
        heightAt(shipX - z * SHIP_SCALE, candidateZ + u * SHIP_SCALE) < -.85,
      ),
    );
    if (clear) break;
  }
  const shipZ = shoreZ - pierEnd - shipOffset;
  const gangwayEnd = pierEnd + rampRun;
  const deckY = deckHeight(BOARDING_Z) * SHIP_SCALE;
  const gangwayHeight = (t: number) => {
    const f = Math.max(0, Math.min(1, (t - pierEnd) / rampRun));
    return PIER_Y + (deckY - PIER_Y) * f;
  };
  return {
    x, shoreZ, landEnd, pierEnd, gangwayEnd, pierHeight, gangwayHeight,
    halfPier: HALF_PIER, shipX, shipZ, scale: SHIP_SCALE,
    center: { x, z: shoreZ - pierEnd + 1.4 },
    onDeck: { x, z: shoreZ - gangwayEnd - 1.5 },
    heightAt(px: number, pz: number) {
      const t = shoreZ - pz;
      const u = px - x;
      if (Math.abs(u) < 1.12 && t >= pierEnd - .07 && t <= gangwayEnd + .48) return gangwayHeight(t);
      if (Math.abs(u) < HALF_PIER - .12 && t >= landEnd && t <= pierEnd + .03) return pierHeight(t);
      const shipLocalZ = (shipX - px) / SHIP_SCALE;
      const shipLocalX = (pz - shipZ) / SHIP_SCALE;
      if (Math.abs(shipLocalZ) < 23.3 && Math.abs(shipLocalX) < deckHalfWidth(shipLocalZ) - .52)
        return deckHeight(shipLocalZ) * SHIP_SCALE;
      return undefined;
    },
  };
}

export type PearlDock = ReturnType<typeof planPearlDock>;
