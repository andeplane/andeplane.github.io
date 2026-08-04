/**
 * Level description types.
 *
 * A level is a *graph*: cells are nodes, portals are edges. There is no world
 * space and no global coordinate system anywhere in this file — every number
 * below is local to the cell it appears in. All impossibility is data.
 */

export type Wall = 'N' | 'S' | 'E' | 'W'

export interface DoorSpec {
  id: string
  wall: Wall
  /** Offset along the wall from the cell centre: +X for N/S walls, +Z for E/W walls. */
  offset?: number
  width?: number
  height?: number
  /**
   * A `grille` is a portal you can see through but not walk through — barred,
   * and solid to collision. It lets a level show you a room you have no way to
   * reach, which turns out to be most of what makes a house feel wrong.
   */
  kind?: 'door' | 'grille'
  /** Height of the opening's lower edge. Defaults to 0 for doors, 0.95 for grilles. */
  sill?: number
}

/** Floor shape. A ramp carries the ceiling with it, making a sloped corridor. */
export interface FloorSpec {
  kind: 'flat' | 'ramp'
  /** Which axis the ramp climbs along. */
  axis?: 'x' | 'z'
  /** Height at the axis minimum / maximum. */
  low?: number
  high?: number
  /** Draw discrete steps on top of the ramp. */
  steps?: number
}

export type Prop =
  | { kind: 'column'; x: number; z: number; radius?: number; style?: 'fluted' | 'plain' }
  | { kind: 'lamp'; x: number; z: number; y?: number; color?: number; intensity?: number }
  | { kind: 'window'; wall: Wall; offset?: number; width?: number; height?: number; sill?: number; color?: number }
  | { kind: 'crate'; x: number; z: number; size?: number; height?: number }
  | { kind: 'pedestal'; x: number; z: number; item?: 'lantern' | 'key' | 'none'; label?: string }
  | { kind: 'rug'; x: number; z: number; w: number; d: number; color?: number }
  | { kind: 'painting'; wall: Wall; offset?: number; y?: number; w?: number; h?: number; color?: number }
  | { kind: 'bookshelf'; wall: Wall; offset?: number; width?: number }
  | { kind: 'banister'; wall: Wall }

export interface CellLight {
  /** Hemisphere fill. */
  ambient?: number
  skyColor?: number
  groundColor?: number
  /** Direction the key light comes *from*, plus colour/strength. */
  key?: { dir: [number, number, number]; color?: number; intensity?: number }
}

export interface CellSpec {
  id: string
  /** Interior dimensions: width (x), height (y), depth (z). Centred on XZ. */
  size: [number, number, number]
  style: StyleName
  doors?: DoorSpec[]
  props?: Prop[]
  floor?: FloorSpec
  light?: CellLight
  /** Shown on the debug HUD. */
  label?: string
}

/** "cellId.doorId" */
export type DoorRef = string

export interface PortalSpec {
  a: DoorRef
  b: DoorRef
}

export interface LoopAssertion {
  name: string
  /** Cell the loop starts and ends in. */
  cell: string
  /** Door ids to traverse, in order. */
  doors: string[]
  /**
   * Where the path is expected to end. Defaults to `cell` — a closed loop. Set
   * it explicitly to assert that a path a player would *assume* closes does
   * not, which is the interesting case in half of these levels.
   */
  expectEndCell?: string
  /** Expected holonomy: yaw in degrees and translation in metres. */
  expectYawDeg: number
  expectTranslation?: [number, number, number]
  tolerance?: number
}

export interface LevelSpec {
  id: string
  title: string
  tagline: string
  /** Shown on the menu card — what makes this level strange. */
  blurb: string
  hint: string
  cells: CellSpec[]
  portals: PortalSpec[]
  spawn: { cell: string; pos: [number, number]; yaw: number }
  assertions?: LoopAssertion[]
  /** Objective text shown at the start and in the HUD. */
  objective: string
  /**
   * Lanterns to record. Reaching the pedestal in each cell records it; the
   * level ends when all of them are.
   *
   * More than one is not padding. Getting somewhere once can be luck, and a
   * house like this hands out a lot of luck; getting *back* to a room you have
   * already been to is what requires having understood it. A second lantern is
   * the cheapest way to ask that question.
   */
  goals?: {
    cell: string
    /**
     * Which pedestal, when a cell holds more than one — matched against the
     * pedestal's `label`. The Orangery is a single cell with three lanterns in
     * it, so identifying a goal by its cell alone is not enough.
     */
    label?: string
    message: string
  }[]
  /** Shown on the completion overlay once every lantern is recorded. */
  outro?: string
}

export type StyleName =
  | 'hall'
  | 'green'
  | 'oxblood'
  | 'gallery'
  | 'stone'
  | 'cellar'
  | 'attic'
  | 'chapel'

export interface Style {
  wall: number
  floor: number
  ceiling: number
  trim: number
  accent: number
  /** Material family used for the floor. */
  floorMat: 'wood' | 'stone'
}

export const STYLES: Record<StyleName, Style> = {
  hall: { wall: 0xd6cbb6, floor: 0x7c5838, ceiling: 0xe6ddcc, trim: 0x8a6a45, accent: 0xa3936f, floorMat: 'wood' },
  green: { wall: 0x5d7a67, floor: 0x6d4c31, ceiling: 0xd2c9b5, trim: 0x87683f, accent: 0xa2916f, floorMat: 'wood' },
  oxblood: { wall: 0x8a5250, floor: 0x64462d, ceiling: 0xd9ccb7, trim: 0x8a6546, accent: 0xb09570, floorMat: 'wood' },
  gallery: { wall: 0xcfc4ad, floor: 0x8a7a63, ceiling: 0xefe7d6, trim: 0x9c8663, accent: 0xb09a72, floorMat: 'stone' },
  stone: { wall: 0xa8a296, floor: 0x847f75, ceiling: 0x99938a, trim: 0x746f66, accent: 0xa2977f, floorMat: 'stone' },
  cellar: { wall: 0x7b756a, floor: 0x5d574f, ceiling: 0x6a655c, trim: 0x544f49, accent: 0x8b7d5f, floorMat: 'stone' },
  attic: { wall: 0xc4b69b, floor: 0x82613f, ceiling: 0xb4a488, trim: 0x8a6845, accent: 0xac9673, floorMat: 'wood' },
  chapel: { wall: 0xc2bcaa, floor: 0x736d61, ceiling: 0xd4cebc, trim: 0x958c79, accent: 0xbdaa80, floorMat: 'stone' },
}
