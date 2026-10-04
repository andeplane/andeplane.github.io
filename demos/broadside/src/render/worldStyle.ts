/** Each sea has its own landscape, light and water, including during a squall. */
export interface WorldStyle {
  name: string;
  sand: string;
  wetSand: string;
  grass: string;
  grassDark: string;
  leaf: string;
  leafLight: string;
  trunk: string;
  rock: string;
  rockDark: string;
  deepWater: string;
  shallowWater: string;
  foam: string;
  horizon: string;
  fog: string;
  sun: string;
  sky: string;
  ground: string;
  ambient: string;
  sunStrength: number;
  skyStrength: number;
}

const STYLES: readonly WorldStyle[] = [
  {
    name: "Tropical daylight",
    sand: "#e4c994", wetSand: "#a3936d", grass: "#688b4c", grassDark: "#365c42",
    leaf: "#286c47", leafLight: "#76a75d", trunk: "#9b7851",
    rock: "#9b9781", rockDark: "#676d60",
    deepWater: "#145569", shallowWater: "#60b5a7", foam: "#d8eee2",
    horizon: "#709eaf", fog: "#6c94a2", sun: "#ffe3b0", sky: "#b6d2df",
    ground: "#4e6872", ambient: "#293b40", sunStrength: 1.5, skyStrength: .9,
  },
  {
    name: "Lantern-lit pirate coast",
    sand: "#b09f81", wetSand: "#665d51", grass: "#4a6655", grassDark: "#253e37",
    leaf: "#244c43", leafLight: "#5c8061", trunk: "#775943",
    rock: "#747c7a", rockDark: "#414a50",
    deepWater: "#102c40", shallowWater: "#34616a", foam: "#afcbd0",
    horizon: "#465b70", fog: "#293b50", sun: "#dca77a", sky: "#819bb6",
    ground: "#232e40", ambient: "#172230", sunStrength: .95, skyStrength: .72,
  },
  {
    name: "Cold storm straits",
    sand: "#9badaf", wetSand: "#52646c", grass: "#3d6261", grassDark: "#253e44",
    leaf: "#2a5555", leafLight: "#67938a", trunk: "#6b706a",
    rock: "#70838f", rockDark: "#334957",
    deepWater: "#0c263c", shallowWater: "#325969", foam: "#c4dce4",
    horizon: "#3e576a", fog: "#253b50", sun: "#a8c9e2", sky: "#8eaecb",
    ground: "#223249", ambient: "#162332", sunStrength: .72, skyStrength: .8,
  },
  {
    name: "Haunted moonlight",
    sand: "#9f9fb4", wetSand: "#53566f", grass: "#40605e", grassDark: "#243541",
    leaf: "#295754", leafLight: "#80aba1", trunk: "#686077",
    rock: "#77738c", rockDark: "#393a58",
    deepWater: "#151d3b", shallowWater: "#3d6371", foam: "#a8dcd9",
    horizon: "#494467", fog: "#252941", sun: "#b9b6ed", sky: "#8c99c4",
    ground: "#29223e", ambient: "#1b1b31", sunStrength: .8, skyStrength: .72,
  },
];

export function worldStyle(pack: number): WorldStyle {
  return STYLES[Math.max(0, Math.min(STYLES.length - 1, pack))]!;
}
