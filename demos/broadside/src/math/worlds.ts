import type { OperatorId } from "./academy";

export interface MathWorld {
  id: OperatorId;
  name: string;
  description: string;
  /** Relative to BASE_URL; every operation has its own generated landscape. */
  image: string;
  accent: string;
  ocean: string;
  paper: string;
  ink: string;
  chapterNames: readonly string[];
}

const WORLDS: Record<OperatorId, MathWorld> = {
  add: {
    id: "add", name: "Emerald Archipelago", description: "Palm islands, bright lagoons and hidden coves.",
    image: "math/worlds/addition.webp", accent: "#b6e4ad", ocean: "#164d4e", paper: "#f3e2ac", ink: "#254a3c",
    chapterNames: ["Palm Bay", "Turtle Lagoon", "Coral Reach", "Emerald Harbour", "The Sunken Crown"],
  },
  subtract: {
    id: "subtract", name: "Frostwater Fjords", description: "Ice-blue inlets beneath snowy mountain peaks.",
    image: "math/worlds/subtraction.webp", accent: "#b9e7f6", ocean: "#233f59", paper: "#e4eef1", ink: "#2c485c",
    chapterNames: ["Snowcap Bay", "Glacier Sound", "Blue Ice Pass", "Northern Lights", "The Frozen Keep"],
  },
  multiply: {
    id: "multiply", name: "Ember Isles", description: "Volcanic shores, glowing craters and warm amber seas.",
    image: "math/worlds/multiplication.webp", accent: "#f3c28a", ocean: "#493642", paper: "#efd6b1", ink: "#654331",
    chapterNames: ["Cinder Cove", "Copper Coast", "Firefly Strait", "Ember Caldera", "The Golden Furnace"],
  },
  divide: {
    id: "divide", name: "Moonstone Ruins", description: "Ancient stone islands beneath a violet moonlit sky.",
    image: "math/worlds/division.webp", accent: "#d9c5fa", ocean: "#363856", paper: "#e8dff3", ink: "#4f4563",
    chapterNames: ["Moonlit Gate", "Starfall Steps", "Amethyst Reach", "The Silent Temple", "Moonstone Sanctuary"],
  },
};

export const worldFor = (operator: OperatorId): MathWorld => WORLDS[operator];
