/**
 * The six exhibits. Each one is a set of vessels and pipes laid out in a 16 × 10 world
 * (x ∈ [−8, 8], y ∈ [0, 10]), a recipe for setting the inputs, the phases of the run, and
 * the exact answer the water is supposed to reach.
 */
import { volumeAt, type Profile, type ScaleSpec, type VesselSpec } from './vessel.ts';
import type { LinkSpec, Network, Spout } from './network.ts';
import type { Machine, Opening, PhaseDef } from './machine.ts';

export interface InputDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Live inputs act during a run (a tap you turn by hand). */
  live?: boolean;
  /** Rendered as a checkbox. */
  toggle?: boolean;
  unit?: string;
}

/** Extra solid geometry (collision + drawing) that depends on the inputs. */
export interface Knife {
  x: number;
  tip: number;
  base: number;
  chuteEnd: [number, number];
  jetLeft: number;
  jetRight: number;
}

export interface SceneDef {
  id: string;
  tab: string;
  title: string;
  /** Short explanation, HTML. */
  text: string;
  inputs: InputDef[];
  vessels: VesselSpec[];
  links: LinkSpec[];
  configure?(net: Network, inputs: Record<string, number>): void;
  prepare(inputs: Record<string, number>): Opening[];
  phases(inputs: Record<string, number>): PhaseDef[];
  result: { vessel: string; unit: number; label: string; digits: number };
  exact(inputs: Record<string, number>, m?: Machine): number;
  expression(inputs: Record<string, number>): string;
  track?(m: Machine, h: number): void;
  knife?(inputs: Record<string, number>): Knife;
  /** Level set points to mark on vessels: vessel id → reading. */
  setpoints?(inputs: Record<string, number>): Record<string, number>;
  /** Region reserved for a chart (integrator), world coords [x0, y0, x1, y1]. */
  chart?: [number, number, number, number];
  /** Where the gate clock sits (square root). */
  clock?: [number, number];
  /** An engraved plate on the wall: centre, title, formula lines. */
  plaque?: { x: number; y: number; title: string; lines: string[] };
}

// ---------------------------------------------------------------- builders

const SUMP: VesselSpec = {
  id: 'sump',
  label: '',
  x: 0,
  y0: 0.05,
  height: 0.55,
  profile: [15.7, 0, 0],
  infinite: true,
  restVolume: 15.7 * 0.33,
};

const rect = (w: number): Profile => [w, 0, 0];
const wedge = (s: number): Profile => [0, s, 0];

function vol(unit: number, max: number, step: number, labelEvery: number, side: 'left' | 'right' = 'left'): ScaleSpec {
  return { mode: 'volume', unit, max, step, labelEvery, side };
}
function lvl(unit: number, max: number, step: number, labelEvery: number, side: 'left' | 'right' = 'left'): ScaleSpec {
  return { mode: 'level', unit, max, step, labelEvery, side };
}

const down = (x: number, y: number, width: number): Spout => ({ x, y, dx: 0, dy: -1, width });

/** A supply tap from the header main straight down to a spout. */
function tap(id: string, to: string, x: number, spoutY: number, q: number, throttle = 0.5): LinkSpec {
  return {
    id,
    from: 'supply',
    targets: [{ to, frac: 1 }],
    law: { kind: 'rate', q, throttle },
    spout: down(x, spoutY, 0.13),
    path: [
      [x, HEADER_Y],
      [x, spoutY],
    ],
    valveAt: 0,
  };
}

/** A bottom outlet that runs down a little, across, and pours from a spout. */
function drain(
  id: string,
  from: string,
  to: string,
  outlet: [number, number],
  spoutX: number,
  runY: number,
  spoutY: number,
  area: number,
): LinkSpec {
  return {
    id,
    from,
    targets: [{ to, frac: 1 }],
    law: { kind: 'torricelli', area },
    spout: down(spoutX, spoutY, area),
    path: [outlet, [outlet[0], runY], [spoutX, runY], [spoutX, spoutY]],
    valveAt: 1,
  };
}

export const HEADER_Y = 9.62;

const fillAndHold = (fill: string, dump: string, vessel: string, V: number): Opening[] => [
  { link: fill, stop: { vessel, V, dir: 'up' } },
  { link: dump, stop: { vessel, V, dir: 'down' } },
];

const fmt = (x: number, d = 1) => {
  const s = x.toFixed(d);
  return s.replace(/\.0+$/, '');
};

// ---------------------------------------------------------------- 1. addition

const ADD_UNIT = 0.9;
const addScene: SceneDef = {
  id: 'add',
  tab: 'a + b',
  title: 'Addition',
  text: `<p>Each number is a <em>volume</em> of water, read on the scale etched into the glass. Set
    <b>a</b> and <b>b</b> and the taps fill the two upper tanks to exactly that much (a float valve shuts each tap).</p>
    <p>Press <b>Run</b> and both tanks drain into the lower one. Water is conserved, so the lower tank
    ends up holding a&nbsp;+&nbsp;b. Its scale is in the same units even though it is wider: it measures
    volume, not height.</p>`,
  inputs: [
    { key: 'a', label: 'a', min: 0, max: 5, step: 0.1, value: 3 },
    { key: 'b', label: 'b', min: 0, max: 5, step: 0.1, value: 4 },
  ],
  vessels: [
    SUMP,
    { id: 'A', label: 'a', x: -4.6, y0: 5.85, height: 3.25, profile: rect(1.5), scale: vol(ADD_UNIT, 5, 0.25, 4) },
    { id: 'B', label: 'b', x: 4.6, y0: 5.85, height: 3.25, profile: rect(1.5), scale: vol(ADD_UNIT, 5, 0.25, 4, 'right') },
    { id: 'C', label: 'a + b', labelPos: 'right', x: 0, y0: 0.95, height: 4.0, profile: rect(2.4), scale: vol(ADD_UNIT, 10, 0.5, 2) },
  ],
  links: [
    tap('fillA', 'A', -4.25, 9.35, 1.3),
    tap('fillB', 'B', 4.25, 9.35, 1.3),
    drain('aToC', 'A', 'C', [-4.6, 5.85], -0.42, 5.55, 5.3, 0.16),
    drain('bToC', 'B', 'C', [4.6, 5.85], 0.42, 5.55, 5.3, 0.16),
    drain('dumpA', 'A', 'sump', [-5.1, 5.85], -6.7, 5.7, 5.45, 0.14),
    drain('dumpB', 'B', 'sump', [5.1, 5.85], 6.7, 5.7, 5.45, 0.14),
    drain('dumpC', 'C', 'sump', [0.75, 0.95], 1.75, 0.8, 0.66, 0.2),
  ],
  prepare: (i) => [
    ...fillAndHold('fillA', 'dumpA', 'A', i.a * ADD_UNIT),
    ...fillAndHold('fillB', 'dumpB', 'B', i.b * ADD_UNIT),
    { link: 'dumpC' },
  ],
  phases: () => [
    {
      title: 'Pouring a and b together',
      text: 'Both outlets are open. Whatever leaves a or b lands in the lower tank.',
      open: [{ link: 'aToC' }, { link: 'bToC' }],
    },
  ],
  result: { vessel: 'C', unit: ADD_UNIT, label: 'a + b', digits: 3 },
  exact: (i) => i.a + i.b,
  expression: (i) => `${fmt(i.a)} + ${fmt(i.b)}`,
  plaque: { x: 0, y: 7.7, title: 'Addition', lines: ['V(a + b) = V(a) + V(b)', 'volume is conserved'] },
};

// ---------------------------------------------------------------- 2. constant scaling

const SC_UNIT = 0.6;
const SC_JET = { x: 0.3, y: 5.35, width: 1.0 };
const scaleScene: SceneDef = {
  id: 'scale',
  tab: 'k · x',
  title: 'Multiply by a constant',
  text: `<p>Tank <b>x</b> drains through a flat nozzle into a thin, wide sheet of water. A sharp
    <em>knife edge</em> stands in the sheet: everything left of it falls into the result tank, the rest
    runs down the chute to the sump.</p>
    <p>The sheet is uniform across its width, so a knife placed a fraction <b>k</b> of the way across
    sends exactly k of every drop to the left. Slide <b>k</b> and watch the blade move; the result tank
    collects k&nbsp;·&nbsp;x.</p>`,
  inputs: [
    { key: 'x', label: 'x', min: 0, max: 8, step: 0.1, value: 6 },
    { key: 'k', label: 'k', min: 0, max: 1, step: 0.01, value: 0.5 },
  ],
  vessels: [
    SUMP,
    { id: 'X', label: 'x', x: -3.8, y0: 5.85, height: 3.25, profile: rect(1.6), scale: vol(SC_UNIT, 8, 0.25, 4) },
    { id: 'Y', label: 'k · x', labelPos: 'left', x: -0.3, y0: 0.95, height: 2.8, profile: rect(2.4), scale: vol(SC_UNIT, 8, 0.25, 4) },
  ],
  links: [
    tap('fillX', 'X', -3.45, 9.35, 1.3),
    drain('dumpX', 'X', 'sump', [-4.3, 5.85], -6.4, 5.7, 5.45, 0.14),
    {
      id: 'split',
      from: 'X',
      targets: [
        { to: 'Y', frac: 0.5 },
        { to: 'sump', frac: 0.5 },
      ],
      law: { kind: 'torricelli', area: 0.17 },
      spout: { x: SC_JET.x, y: SC_JET.y, dx: 0, dy: -1, width: SC_JET.width },
      path: [
        [-3.8, 5.85],
        [-3.8, 5.6],
        [SC_JET.x, 5.6],
        [SC_JET.x, SC_JET.y],
      ],
      valveAt: 1,
      sheet: true,
    },
    drain('dumpY', 'Y', 'sump', [-1.05, 0.95], -2.1, 0.8, 0.66, 0.2),
  ],
  configure: (net, i) => {
    const t = net.link('split').spec.targets;
    t[0].frac = i.k;
    t[1].frac = 1 - i.k;
  },
  prepare: (i) => [...fillAndHold('fillX', 'dumpX', 'X', i.x * SC_UNIT), { link: 'dumpY' }],
  phases: () => [
    {
      title: 'Splitting the sheet',
      text: 'The knife edge divides the falling sheet in the ratio k : (1 − k).',
      open: [{ link: 'split' }],
    },
  ],
  result: { vessel: 'Y', unit: SC_UNIT, label: 'k · x', digits: 3 },
  exact: (i) => i.k * i.x,
  expression: (i) => `${fmt(i.k, 2)} × ${fmt(i.x)}`,
  plaque: { x: 4.6, y: 7.4, title: 'Knife-edge splitter', lines: ['q₁ = k·q,   q₂ = (1 − k)·q', 'a uniform sheet, cut at k'] },
  knife: (i) => {
    const jetLeft = SC_JET.x - SC_JET.width / 2;
    const jetRight = SC_JET.x + SC_JET.width / 2;
    const x = jetLeft + i.k * SC_JET.width;
    return { x, tip: 4.38, base: 4.1, chuteEnd: [2.7, 3.68], jetLeft, jetRight };
  },
};

// ---------------------------------------------------------------- 3. integration

const INT_UNIT = 1.35;
const integrateScene: SceneDef = {
  id: 'integrate',
  tab: '∫ u dt',
  title: 'Integration over time',
  text: `<p>A tank is an integrator: its volume is the running total of everything that has flowed in,
    V(t)&nbsp;=&nbsp;∫&nbsp;u&nbsp;dt. Press <b>Run</b> and turn the tap with the <b>u</b> slider while it runs;
    the trace on the left plots the flow rate and the level.</p>
    <p>Tick <b>leak</b> to open a capillary at the bottom. Laminar flow through a thin tube is proportional
    to the head, so the tank loses water at a rate k·V: a <em>leaky</em> integrator, and with the tap shut,
    an exponential decay.</p>`,
  inputs: [
    { key: 'u', label: 'u (flow)', min: 0, max: 1.2, step: 0.01, value: 0.6, live: true, unit: '/s' },
    { key: 'T', label: 'run for', min: 2, max: 12, step: 0.5, value: 8, unit: ' s' },
    { key: 'leak', label: 'leak', min: 0, max: 1, step: 1, value: 0, toggle: true },
  ],
  vessels: [
    SUMP,
    { id: 'I', label: '∫ u dt', x: 3.0, y0: 0.95, height: 5.0, profile: rect(3.0), scale: vol(INT_UNIT, 10, 0.5, 2) },
  ],
  links: [
    {
      ...tap('tapI', 'I', 2.3, 9.3, 0.6 * INT_UNIT, 0),
      law: { kind: 'rate', q: 0.6 * INT_UNIT },
    },
    {
      id: 'leakI',
      from: 'I',
      targets: [{ to: 'sump', frac: 1 }],
      law: { kind: 'linear', k: LEAK_K() },
      spout: down(5.25, 0.68, 0.08),
      path: [
        [4.25, 0.95],
        [4.25, 0.82],
        [5.25, 0.82],
        [5.25, 0.68],
      ],
      valveAt: 1,
    },
    drain('dumpI', 'I', 'sump', [1.75, 0.95], 0.8, 0.8, 0.66, 0.3),
  ],
  configure: (net, i) => {
    const law = net.link('tapI').spec.law;
    if (law.kind === 'rate') law.q = i.u * INT_UNIT;
  },
  prepare: () => [{ link: 'dumpI' }],
  phases: (i) => [
    {
      title: 'Integrating',
      text: 'The tap is open. Turn it with the u slider; the tank adds up every drop.',
      open: [{ link: 'tapI' }, ...(i.leak ? [{ link: 'leakI', aux: true }] : [])],
      duration: i.T,
    },
  ],
  track: (m, h) => {
    if (m.state !== 'running' || m.phase !== 0) return;
    if (!m.inputs.leak) {
      // The reference is the integral of the tap setting itself, u(t) dt.
      if (!m.timedClosed) m.aux += m.inputs.u * h;
      return;
    }
    // Leaky: the reference is the exact solution of dV/dt = q_in − kV for the water as it
    // lands (the fall from the tap is a real transport delay, so we integrate what arrives).
    const I = m.net.vessel('I').V / INT_UNIT;
    const leak = m.net.link('leakI');
    const arrived = I - m.aux2 + leak.dv / INT_UNIT;
    m.aux2 = I;
    const k = leak.open ? LEAK_K() : 0;
    if (k === 0) m.aux += arrived;
    else {
      const e = Math.exp(-k * h);
      m.aux = m.aux * e + (arrived / (k * h)) * (1 - e);
    }
  },
  result: { vessel: 'I', unit: INT_UNIT, label: '∫ u dt', digits: 3 },
  exact: (_i, m) => m?.aux ?? 0,
  expression: (i) => (i.leak ? `∫ (u − kV) dt over ${fmt(i.T)} s` : `∫ u dt over ${fmt(i.T)} s`),
  chart: [-7.2, 2.6, -0.6, 8.6],
};
function LEAK_K(): number {
  return 0.18;
}

// ---------------------------------------------------------------- 4. square root

const SQ_LEVEL = 0.2; // world height per unit of x
const SQ_AREA = 0.1; // orifice width
const SQ_GATE = 8; // seconds the orifice is open
/** Volume collected per unit of √x: a·√(2 g · SQ_LEVEL) · T. */
const SQRT_UNIT = SQ_AREA * Math.sqrt(2 * 6 * SQ_LEVEL) * SQ_GATE;
const sqrtScene: SceneDef = {
  id: 'sqrt',
  tab: '√x',
  title: 'Square root (Torricelli)',
  text: `<p>Water leaves a hole at depth h with the speed of a stone dropped from height h:
    v&nbsp;=&nbsp;√(2gh). So the <em>flow</em> through the orifice is proportional to √h. That is
    Torricelli's law (1643), and the jet's arc gets longer as √h too.</p>
    <p>Set the head <b>x</b>. A float valve keeps it constant while the orifice is open for exactly
    ${SQ_GATE} seconds; the collecting tank then holds a volume proportional to √x.</p>`,
  inputs: [{ key: 'x', label: 'x (head)', min: 1, max: 16, step: 0.1, value: 9 }],
  vessels: [
    SUMP,
    {
      id: 'H',
      label: 'x',
      caption: 'head',
      x: -3.6,
      y0: 5.0,
      height: 3.6,
      profile: rect(1.6),
      scale: lvl(SQ_LEVEL, 16, 0.5, 4),
    },
    {
      id: 'M',
      label: '√x',
      labelPos: 'right',
      x: -0.2,
      y0: 2.0,
      height: 1.8,
      profile: rect(4.4),
      scale: vol(SQRT_UNIT, 4, 0.25, 4),
    },
  ],
  links: [
    tap('fillH', 'H', -3.25, 9.35, 1.2, 0.4),
    { ...tap('makeup', 'H', -3.25, 9.35, 0), law: { kind: 'match', link: 'orifice' }, immediate: true, path: [] },
    drain('dumpH', 'H', 'sump', [-4.1, 5.0], -6.3, 4.85, 4.6, 0.16),
    {
      id: 'orifice',
      from: 'H',
      targets: [{ to: 'M', frac: 1 }],
      law: { kind: 'torricelli', area: SQ_AREA },
      spout: { x: -2.74, y: 5.02 + SQ_AREA / 2, dx: 1, dy: 0, width: SQ_AREA },
      path: [],
    },
    drain('dumpM', 'M', 'sump', [1.3, 2.0], 2.5, 1.85, 1.65, 0.25),
  ],
  prepare: (i) => [...fillAndHold('fillH', 'dumpH', 'H', i.x * SQ_LEVEL * 1.6), { link: 'dumpM' }],
  phases: () => [
    {
      title: 'Orifice open',
      text: `The orifice is open for exactly ${SQ_GATE} s while the float valve holds the head.`,
      open: [{ link: 'orifice' }, { link: 'makeup', aux: true }],
      duration: SQ_GATE,
    },
  ],
  result: { vessel: 'M', unit: SQRT_UNIT, label: '√x', digits: 3 },
  exact: (i) => Math.sqrt(i.x),
  expression: (i) => `√${fmt(i.x)}`,
  plaque: { x: 4.6, y: 8.3, title: 'Torricelli, 1643', lines: ['v = √(2gh)', 'q = a·√(2gh) ∝ √x'] },
  clock: [4.6, 5.6],
  setpoints: (i) => ({ H: i.x }),
};

// ---------------------------------------------------------------- 5. shaped vessel: squaring

const W_SLOPE = 0.9;
const W_LEVEL = 0.75;
/** V = slope·h²/2 with h = W_LEVEL·x, so one unit of x² is: */
const SQUARE_UNIT = (W_SLOPE * W_LEVEL * W_LEVEL) / 2;
const squareScene: SceneDef = {
  id: 'square',
  tab: 'x²',
  title: 'Shaped vessel: squaring',
  text: `<p>The height water reaches depends on the shape of the glass. In this V-shaped vessel the width
    grows in proportion to the height, so the volume held up to level h is a triangle:
    V&nbsp;=&nbsp;½·s·h². A <em>shaped vessel is a function generator</em>.</p>
    <p>Set <b>x</b>: the tap fills the wedge until the water reaches level x on its scale. Run, and the wedge
    empties into a straight-sided tank, which reads the volume: x². A horn with width ∝ h² would give x³,
    a logarithmic flare gives exp.</p>`,
  inputs: [{ key: 'x', label: 'x', min: 0, max: 4, step: 0.1, value: 3 }],
  vessels: [
    SUMP,
    {
      id: 'W',
      label: 'x',
      caption: 'level',
      x: -3.4,
      y0: 4.6,
      height: 3.3,
      profile: wedge(W_SLOPE),
      scale: lvl(W_LEVEL, 4, 0.25, 4),
    },
    { id: 'R', label: 'x²', labelPos: 'right', x: 3.0, y0: 0.95, height: 2.75, profile: rect(2.0), scale: vol(SQUARE_UNIT, 16, 1, 4) },
  ],
  links: [
    tap('fillW', 'W', -3.0, 9.35, 1.0, 0.4),
    drain('wToR', 'W', 'R', [-3.4, 4.6], 3.3, 4.15, 3.95, 0.12),
    drain('dumpW', 'W', 'sump', [-3.4, 4.6], -6.4, 4.32, 4.1, 0.12),
    drain('dumpR', 'R', 'sump', [3.7, 0.95], 4.7, 0.8, 0.66, 0.25),
  ],
  prepare: (i) => [
    ...fillAndHold('fillW', 'dumpW', 'W', volumeAt(wedge(W_SLOPE), i.x * W_LEVEL)),
    { link: 'dumpR' },
  ],
  phases: () => [
    {
      title: 'Emptying the wedge',
      text: 'All the water in the wedge, ½·s·h², pours into the straight tank.',
      open: [{ link: 'wToR' }],
    },
  ],
  result: { vessel: 'R', unit: SQUARE_UNIT, label: 'x²', digits: 3 },
  exact: (i) => i.x * i.x,
  expression: (i) => `${fmt(i.x)}²`,
  plaque: { x: 3.0, y: 7.2, title: 'Function generator', lines: ['w(h) = s · h', 'V(h) = ½ s h²  ∝  x²'] },
  setpoints: (i) => ({ W: i.x }),
};

// ---------------------------------------------------------------- 6. quarter-square multiplier

const M_SLOPE = 1.1;
const M_LEVEL = 0.42;
/** Volume in a multiplier wedge at level u: ½·s·(M_LEVEL·u)². R reads (V₁ − V₂) / (4·that). */
const MQ = (M_SLOPE * M_LEVEL * M_LEVEL) / 2;
const MUL_UNIT = 4 * MQ;
const wedgeVol = (u: number) => volumeAt(wedge(M_SLOPE), u * M_LEVEL);
const multiplyScene: SceneDef = {
  id: 'multiply',
  tab: 'x · y',
  title: 'Quarter-square multiplier',
  text: `<p>With a squaring vessel you can multiply, the way 1950s electronic analogue computers did:
    x·y&nbsp;=&nbsp;¼[(x+y)²&nbsp;−&nbsp;(x−y)²].</p>
    <p>The upper wedge is filled to level <b>x + y</b>, so it holds (x+y)². It empties into the middle tank,
    whose scale reads ¼ of that. Then the middle tank pours into the lower wedge until a float valve shuts
    it at level <b>|x − y|</b>, taking away (x−y)². What is left reads x·y.</p>
    <p>The two set points come from the inputs, the way the MONIAC's floats and cords linked one tank to another.</p>`,
  inputs: [
    { key: 'x', label: 'x', min: 0, max: 3, step: 0.1, value: 2 },
    { key: 'y', label: 'y', min: 0, max: 3, step: 0.1, value: 3 },
  ],
  vessels: [
    SUMP,
    {
      id: 'W1',
      label: 'x + y',
      caption: 'level',
      x: -4.4,
      y0: 6.6,
      height: 2.6,
      profile: wedge(M_SLOPE),
      scale: lvl(M_LEVEL, 6, 0.25, 4),
    },
    { id: 'R', label: 'x · y', labelPos: 'left', x: 0, y0: 3.9, height: 2.25, profile: rect(1.6), scale: vol(MUL_UNIT, 9, 0.5, 4) },
    {
      id: 'W2',
      label: '|x − y|',
      labelPos: 'right',
      caption: 'level',
      x: 4.4,
      y0: 0.8,
      height: 2.6,
      profile: wedge(M_SLOPE),
      scale: lvl(M_LEVEL, 6, 0.25, 4, 'right'),
    },
  ],
  links: [
    tap('fillW1', 'W1', -4.05, 9.42, 0.9, 0.35),
    drain('w1ToR', 'W1', 'R', [-4.4, 6.6], -0.45, 6.45, 6.3, 0.11),
    drain('dumpW1', 'W1', 'sump', [-4.4, 6.6], -6.8, 6.3, 6.1, 0.11),
    drain('rToW2', 'R', 'W2', [0.45, 3.9], 4.1, 3.75, 3.6, 0.13),
    drain('dumpW2', 'W2', 'sump', [4.4, 0.8], 5.3, 0.7, 0.62, 0.12),
  ],
  prepare: (i) => [
    ...fillAndHold('fillW1', 'dumpW1', 'W1', wedgeVol(i.x + i.y)),
    { link: 'rToW2' },
    { link: 'dumpW2' },
  ],
  phases: (i) => [
    {
      title: 'Squaring the sum',
      text: 'The upper wedge holds (x+y)²·s/2 and empties into the middle tank, which now reads ¼(x+y)².',
      open: [{ link: 'w1ToR' }],
    },
    {
      title: 'Subtracting the difference',
      text: 'The middle tank pours into the lower wedge until its float valve shuts at level |x − y|.',
      open: [{ link: 'rToW2', stop: { vessel: 'W2', V: wedgeVol(Math.abs(i.x - i.y)), dir: 'up' } }],
    },
  ],
  result: { vessel: 'R', unit: MUL_UNIT, label: 'x · y', digits: 3 },
  exact: (i) => i.x * i.y,
  expression: (i) => `${fmt(i.x)} × ${fmt(i.y)}`,
  plaque: { x: 4.4, y: 7.6, title: 'Quarter squares', lines: ['x·y = ¼ [(x+y)² − (x−y)²]'] },
  setpoints: (i) => ({ W1: i.x + i.y, W2: Math.abs(i.x - i.y) }),
};

export const SCENES: SceneDef[] = [addScene, scaleScene, integrateScene, sqrtScene, squareScene, multiplyScene];

export function sceneById(id: string): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}
