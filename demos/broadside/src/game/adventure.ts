import type { Vec2 } from "../sim/math";
import { SUNSET_COVE, type LevelDef } from "./levels";

export interface Treasure {
  id: number;
  chapter: number;
  name: string;
  prize: string;
  icon: string;
  pos: Vec2;
  island: number;
  found: boolean;
  progress: number;
}
export const CHAPTERS = [
  {
    name: "The lost treasure",
    place: "Palm Bay",
    color: "#5fe0ca",
    reward: "A speedy ship!",
    subtitle: "Find two glowing chests. Then shoo away the cheeky pirates.",
  },
  {
    name: "The lighthouse secret",
    place: "Coral Coast",
    color: "#6acbff",
    reward: "Stronger cannons!",
    subtitle: "Follow the golden compass. The lighthouse has a surprise.",
  },
  {
    name: "The golden crown",
    place: "Sunset Cove",
    color: "#ffbc6c",
    reward: "Captain of the cove!",
    subtitle: "Find the crown and challenge Captain Redwake!",
  },
] as const;

export const ADVENTURE_LEVEL: LevelDef = {
  ...SUNSET_COVE,
  intro: "A little captain. A big adventure.",
  player: { ship: "galleon", pos: { x: -30, z: -110 }, heading: -0.7 },
  wind: { direction: 0.65, strength: 0.6 },
  waves: [
    {
      title: "Cheeky pirates!",
      subtitle: "Your crew aims for you. Get close and press BOOM!",
      enemies: [
        {
          ship: "sloop",
          pos: { x: -55, z: 45 },
          heading: Math.PI,
          patrol: [{ x: -65, z: -65 }],
        },
        {
          ship: "sloop",
          pos: { x: 35, z: 35 },
          heading: Math.PI,
          patrol: [{ x: -30, z: -45 }],
        },
      ],
    },
    {
      title: "The treasure guardians",
      subtitle: "Two more pirates! Your new cannons are ready.",
      enemies: [
        {
          ship: "brigantine",
          pos: { x: 145, z: 125 },
          heading: Math.PI,
          patrol: [{ x: 15, z: 85 }],
        },
        {
          ship: "sloop",
          pos: { x: -60, z: 185 },
          heading: Math.PI,
          patrol: [{ x: 5, z: 90 }],
        },
      ],
    },
    {
      title: "Here comes Redwake!",
      subtitle: "The biggest pirate in the bay. You can do it, Captain!",
      enemies: [
        {
          ship: "warship",
          boss: true,
          pos: { x: 30, z: 245 },
          heading: Math.PI,
          patrol: [{ x: 15, z: 125 }],
        },
        {
          ship: "brigantine",
          pos: { x: -120, z: 195 },
          heading: Math.PI,
          patrol: [{ x: -55, z: 100 }],
        },
      ],
    },
  ],
};

// Landing points sit in navigable water, next to each island's beach.
export const createTreasures = (): Treasure[] =>
  [
    {
      name: "Parrot Cove",
      prize: "Pip the parrot",
      icon: "🦜",
      pos: { x: -151, z: -84 },
      island: 5,
    },
    {
      name: "Palm Bay",
      prize: "The pearl compass",
      icon: "🐚",
      pos: { x: -94, z: -7 },
      island: 2,
    },
    {
      name: "Lighthouse Beach",
      prize: "The star of the sea",
      icon: "⭐",
      pos: { x: 115, z: 32 },
      island: 1,
    },
    {
      name: "Tiny Turtle Island",
      prize: "A lucky little turtle",
      icon: "🐢",
      pos: { x: -37, z: 121 },
      island: 3,
    },
    {
      name: "Shipwreck Shoal",
      prize: "The ruby of Redwake",
      icon: "💎",
      pos: { x: 43, z: -61 },
      island: 6,
    },
    {
      name: "Captain’s Beach",
      prize: "The golden crown",
      icon: "👑",
      pos: { x: 27, z: -124 },
      island: 0,
    },
  ].map((t, id) => ({
    ...t,
    id,
    chapter: Math.floor(id / 2),
    found: false,
    progress: 0,
  }));
