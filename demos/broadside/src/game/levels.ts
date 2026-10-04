import type { Vec2 } from "../sim/math";
import type { ShipClass } from "../sim/ships";
import type { Island } from "../sim/world";

export type PropKind = "lighthouse" | "palms" | "rocks" | "fort" | "wreck";
export type SeaLandmarkKind = "harbour" | "smugglers" | "stormkeep" | "ruins" | "moonstone";

export interface IslandDef extends Island {
  /** Decorative props the renderer places on this island. */
  props: PropKind[];
  /** Beaches, rocky islands, or small exposed hazards in open water. */
  kind: "sand" | "rock" | "sea-rock";
  /** Permanent open-sea settlement; scenery only, never a new generated world. */
  landmark?: SeaLandmarkKind;
}

export interface EnemyDef {
  ship: ShipClass;
  pos: Vec2;
  heading: number;
  patrol: Vec2[];
  boss?: boolean;
}

export interface WaveDef {
  title: string;
  subtitle: string;
  enemies: EnemyDef[];
}

export interface LevelDef {
  id: string;
  name: string;
  intro: string;
  seed: number;
  wind: { direction: number; strength: number };
  bounds: number;
  islands: IslandDef[];
  player: { ship: ShipClass; pos: Vec2; heading: number };
  waves: WaveDef[];
  /** Hull repaired between waves, as a fraction of max. */
  repairBetweenWaves: number;
}

/** Level 1. Defend the harbour at Sunset Cove from three waves of raiders. */
export const SUNSET_COVE: LevelDef = {
  id: "sunset-cove",
  name: "Sunset Cove",
  intro: "Raiders are coming for the harbour. Keep them off the cove!",
  seed: 1701,
  wind: { direction: Math.PI / 2 - 0.4, strength: 0.85 },
  bounds: 300,
  islands: [
    { pos: { x: 0, z: -175 }, radius: 42, kind: "sand", props: ["fort", "palms"] },
    { pos: { x: 95, z: 70 }, radius: 26, kind: "sand", props: ["lighthouse", "palms"] },
    { pos: { x: -120, z: 30 }, radius: 30, kind: "sand", props: ["palms", "rocks"] },
    { pos: { x: -40, z: 150 }, radius: 12, kind: "rock", props: ["rocks"] },
    { pos: { x: 170, z: -60 }, radius: 14, kind: "rock", props: ["rocks"] },
    { pos: { x: -190, z: -110 }, radius: 18, kind: "sand", props: ["palms"] },
    { pos: { x: 40, z: -40 }, radius: 7, kind: "rock", props: ["wreck"] },
  ],
  player: { ship: "galleon", pos: { x: 0, z: -110 }, heading: 0 },
  repairBetweenWaves: 0.5,
  waves: [
    {
      title: "Sails on the horizon!",
      subtitle: "Two scout sloops. Turn side-on and let them have it.",
      enemies: [
        { ship: "sloop", pos: { x: -80, z: 210 }, heading: Math.PI, patrol: [{ x: -60, z: 80 }, { x: 40, z: 120 }] },
        { ship: "sloop", pos: { x: 90, z: 230 }, heading: Math.PI, patrol: [{ x: 40, z: 120 }, { x: -60, z: 80 }] },
      ],
    },
    {
      title: "Raiders inbound!",
      subtitle: "A brigantine leads this pack. Watch both sides.",
      enemies: [
        { ship: "brigantine", pos: { x: 220, z: 120 }, heading: -Math.PI / 2, patrol: [{ x: 60, z: 0 }, { x: -40, z: 60 }] },
        { ship: "sloop", pos: { x: -230, z: 150 }, heading: Math.PI / 2, patrol: [{ x: -60, z: 80 }, { x: 20, z: -20 }] },
        { ship: "sloop", pos: { x: 230, z: -160 }, heading: -Math.PI / 2, patrol: [{ x: 80, z: -90 }, { x: 0, z: 20 }] },
      ],
    },
    {
      title: "The Redwake approaches!",
      subtitle: "Captain Gulliver's man-o'-war and her escort. Sink her and the cove is safe.",
      enemies: [
        { ship: "warship", boss: true, pos: { x: 0, z: 260 }, heading: Math.PI, patrol: [{ x: 0, z: 60 }, { x: 60, z: -40 }, { x: -70, z: -30 }] },
        { ship: "sloop", pos: { x: -120, z: 240 }, heading: Math.PI, patrol: [{ x: -50, z: 40 }] },
      ],
    },
  ],
};

export const LEVELS: readonly LevelDef[] = [SUNSET_COVE];
