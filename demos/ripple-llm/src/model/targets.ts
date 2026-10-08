/** Chapter 1: the matrices the exhibit's single tanks are sculpted to compute. */

export interface Target {
  id: string;
  name: string;
  blurb: string;
  W: number[][];
  /** A few example inputs to start from. */
  examples: number[][];
}

const c30 = Math.cos(Math.PI / 6);
const s30 = Math.sin(Math.PI / 6);
const a = [0.6, -0.8, 0.5];

export const TARGETS: Target[] = [
  {
    id: 'rotate',
    name: 'Rotate 30°',
    blurb: 'Two wave-makers, two probes. The tank turns the vector (x₁, x₂) by 30° anticlockwise.',
    W: [
      [c30, -s30],
      [s30, c30],
    ],
    examples: [
      [1, 0],
      [0, 1],
      [0.7, -0.7],
    ],
  },
  {
    id: 'cross',
    name: 'Cross product',
    blurb: 'Three in, three out: the tank computes a × x for the fixed vector a = (0.6, −0.8, 0.5). Zeros on the diagonal mean a wave-maker must not be heard at its own probe.',
    W: [
      [0, -a[2], a[1]],
      [a[2], 0, -a[0]],
      [-a[1], a[0], 0],
    ],
    examples: [
      [1, 0, 0],
      [0, 0.5, 1],
      [0.6, -0.8, 0.5],
    ],
  },
  {
    id: 'hadamard',
    name: 'Hadamard 4×4',
    blurb: 'Four in, four out: the orthonormal Hadamard transform, the ±½ pattern behind Walsh codes and fast quantum-gate tricks.',
    W: [
      [0.5, 0.5, 0.5, 0.5],
      [0.5, -0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5, 0.5],
    ],
    examples: [
      [1, 0, 0, 0],
      [0.5, 0.5, -0.5, 1],
      [1, 1, 1, 1],
    ],
  },
];
