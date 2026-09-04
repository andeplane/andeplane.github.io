/**
 * The geometry schema — the one seam every producer writes to.
 *
 * The parametric bond generator emits a WallSpec, the editor mutates a WallSpec, and
 * anything else that ever wants to describe a wall (a saved file, a model asked to
 * invent one) writes the same shape. The mesher takes a WallSpec and nothing else.
 *
 * SI throughout: metres, kilograms, seconds, pascals. The UI shows millimetres.
 */

/**
 * TypeScript 5.7 made typed arrays generic over their backing buffer, and WebGPU only
 * accepts the non-shared kind. Naming it once beats annotating every field.
 */
export type F32 = Float32Array<ArrayBuffer>;
export type U32 = Uint32Array<ArrayBuffer>;
export type U8 = Uint8Array<ArrayBuffer>;

export interface BrickSpec {
  /** Stretcher length. Norwegian normalstein is 0.228 m. */
  length: number;
  /** Course height. 0.062 m. */
  height: number;
}

export type BondName = 'running' | 'stack' | 'third' | 'wild';

export type SupportName = 'base' | 'base-top' | 'three-sided' | 'four-sided' | 'free';

/** A single wall standing on its own, or four of them bonded into a room. */
export type PlanName = 'wall' | 'room';

export interface Opening {
  /** Left edge, metres from the wall's left end. */
  x: number;
  /** Bottom edge, metres above the base. */
  y: number;
  w: number;
  h: number;
}

export interface WallSpec {
  version: 1;
  brick: BrickSpec;
  /** Mortar joint ("fuge") thickness, metres. */
  joint: number;
  plan: PlanName;
  /** Target length along x; rounded up to a whole number of expanded units. */
  length: number;
  /** Room depth along z. Ignored for a single wall, whose depth is its thickness. */
  width: number;
  /** Target height; rounded to a whole number of courses. */
  height: number;
  /** 1 = half-brick wall (0.108 m), 2 = full-brick wall with a collar joint. */
  wythes: number;
  bond: BondName;
  /** Seed for the wild bond's per-course offsets. */
  seed: number;
  /**
   * Elements per full brick along its length and its height. The count through the
   * thickness is not free — see `latticeFor` for why it must be nx / 2.
   */
  divisions: { nx: number; ny: number };
  openings: Opening[];
  /** Bricks deleted in the editor, keyed "course:latticeX:latticeZ". */
  removed: string[];
  /** Bricks pinned in the editor, same key. */
  pinned: string[];
  supports: SupportName;
}

/**
 * Brick width, derived rather than stored.
 *
 * Masonry is modular: two brick widths plus a joint equal one brick length, which is
 * exactly why a header can sit across two stretchers and why a corner bonds at all.
 * 108 + 12 + 108 = 228. Storing the width separately would let the UI express walls
 * that cannot be built, and would break the corner bond in a room.
 */
export function brickThickness(spec: WallSpec): number {
  return (spec.brick.length + spec.joint) / 2 - spec.joint;
}

export function defaultWall(): WallSpec {
  return {
    version: 1,
    brick: { length: 0.228, height: 0.062 },
    joint: 0.012,
    plan: 'room',
    length: 3.6,
    width: 2.4,
    height: 2.664,
    wythes: 1,
    bond: 'running',
    seed: 1,
    divisions: { nx: 4, ny: 2 },
    openings: [],
    removed: [],
    pinned: [],
    supports: 'base',
  };
}
