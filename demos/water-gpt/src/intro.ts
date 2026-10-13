/**
 * The intro shown on first visit (and from the "What am I looking at?" button): an LLM is
 * matrix products → a tank held at a fixed level pushes a steady flow, read as a rate → a
 * valve is a bundle of tubes, so it multiplies → a collector adds the rates → a grid is a matrix product →
 * check valves are the non-linearity → softmax and LayerNorm are small circuits → we simulate
 * the water, so the GPT really runs on it.
 */

import { valveSvg } from './ui/valve-icon.ts';
import { mountBundleDemo, mountColumnDemo, mountTubeDemo, type Demo } from './ui/fluid-demo.ts';

const SEEN_KEY = 'water-gpt-intro-seen';

const W = '#6fd3ff';
const G = '#e4c487';
const DIM = '#6f6c66';
const INK = '#e9e3d6';

/** Step 1: tokens go in, a stack of W·x boxes, the next token comes out. */
const SVG_MATMUL = `
<svg viewBox="0 0 425 170" role="img" aria-label="A GPT layer stack where every block is a matrix times a vector">
  <text x="4" y="80" fill="${INK}" font-family="var(--serif)" font-size="13" font-style="italic">"The cat</text>
  <text x="4" y="97" fill="${INK}" font-family="var(--serif)" font-size="13" font-style="italic">sat on the</text>
  <path d="M66 85h20" stroke="${DIM}" stroke-width="1.5" marker-end="url(#ia)"/>
  ${[0, 1, 2, 3]
    .map((i) => {
      const x = 92 + i * 64;
      return `<rect x="${x}" y="40" width="52" height="90" rx="6" fill="rgba(228,196,135,0.08)" stroke="${G}" stroke-opacity="0.6"/>
      <text x="${x + 26}" y="80" fill="${G}" font-family="var(--mono)" font-size="13" text-anchor="middle">W·x</text>
      <text x="${x + 26}" y="100" fill="${DIM}" font-family="var(--sans)" font-size="9.5" text-anchor="middle">${['QKV', 'attn', 'MLP', 'head'][i]}</text>
      ${i < 3 ? `<path d="M${x + 53} 85h10" stroke="${DIM}" stroke-width="1.5"/>` : ''}`;
    })
    .join('')}
  <path d="M348 85h18" stroke="${DIM}" stroke-width="1.5" marker-end="url(#ia)"/>
  <text x="392" y="91" fill="${W}" font-family="var(--serif)" font-size="17" text-anchor="middle" font-style="italic">mat"</text>
  <text x="210" y="158" fill="${DIM}" font-family="var(--sans)" font-size="10.5" text-anchor="middle">× many layers · almost all the arithmetic is matrix × vector</text>
  <defs><marker id="ia" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="${DIM}"/></marker></defs>
</svg>`;

/** Step 2: three tanks, two collector columns, a valve at every crossing. */
const SVG_CROSSBAR = (() => {
  const heads = [0.9, 0.45, 0.7];
  const open = [
    [0.9, 0.2],
    [0.4, 0.8],
    [0.15, 0.6],
  ];
  const rowY = (i: number) => 40 + i * 40;
  const colX = (j: number) => 200 + j * 90;
  let s = '';
  heads.forEach((h, i) => {
    const y = rowY(i);
    s += `<rect x="40" y="${y - 16}" width="34" height="32" rx="3" fill="none" stroke="${DIM}"/>
      <rect x="41" y="${y + 15 - 30 * h}" width="32" height="${30 * h}" fill="${W}" fill-opacity="0.55"/>
      <text x="30" y="${y + 4}" fill="${INK}" font-family="var(--mono)" font-size="11" text-anchor="end">x${i}</text>
      <path d="M74 ${y}H${colX(1) + 30}" stroke="${W}" stroke-opacity="0.45" stroke-width="5"/>`;
  });
  [0, 1].forEach((j) => {
    const x = colX(j);
    s += `<path d="M${x} ${rowY(0) - 14}V158" stroke="${W}" stroke-opacity="0.45" stroke-width="5"/>
      <rect x="${x - 18}" y="150" width="36" height="22" rx="3" fill="none" stroke="${DIM}"/>
      <text x="${x}" y="190" fill="${INK}" font-family="var(--mono)" font-size="11" text-anchor="middle">y${j}</text>`;
  });
  open.forEach((row, i) =>
    row.forEach((o, j) => {
      const cx = colX(j);
      const cy = rowY(i);
      s += `${valveSvg(cx, cy, 13, o)}
        <text x="${cx + 16}" y="${cy - 8}" fill="${G}" font-family="var(--mono)" font-size="9">w${i}${j}</text>`;
    }),
  );
  s += `<text x="360" y="60" fill="${DIM}" font-family="var(--sans)" font-size="10.5">tank height</text>
    <text x="360" y="74" fill="${W}" font-family="var(--sans)" font-size="10.5">= input x</text>
    <text x="360" y="100" fill="${DIM}" font-family="var(--sans)" font-size="10.5">valve opening</text>
    <text x="360" y="114" fill="${G}" font-family="var(--sans)" font-size="10.5">= weight w</text>
    <text x="360" y="140" fill="${DIM}" font-family="var(--sans)" font-size="10.5">water collected</text>
    <text x="360" y="154" fill="${W}" font-family="var(--sans)" font-size="10.5">= Σ w·x</text>`;
  return `<svg viewBox="0 0 450 200" role="img" aria-label="Tanks feed pipes; valves at each crossing set the weights; collectors sum the flows">${s}</svg>`;
})();

/** Step 3: many crossbars in a chain, simulated, producing text. */
const SVG_MACHINE = `
<svg viewBox="0 0 420 150" role="img" aria-label="Many simulated crossbars chained into a working GPT">
  ${Array.from({ length: 5 }, (_, k) => {
    const x = 20 + k * 78;
    let g = `<rect x="${x}" y="30" width="58" height="58" rx="5" fill="rgba(111,211,255,0.06)" stroke="${W}" stroke-opacity="0.5"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
      g += `<circle cx="${x + 11 + c * 12}" cy="${41 + r * 12}" r="3.2" fill="${G}" fill-opacity="${0.25 + 0.7 * (((r * 7 + c * 3 + k * 5) % 9) / 9)}"/>`;
    if (k < 4) g += `<path d="M${x + 59} 59h18" stroke="${W}" stroke-opacity="0.6" stroke-width="3"/>`;
    return g;
  }).join('')}
  <text x="210" y="112" fill="${INK}" font-family="var(--sans)" font-size="11.5" text-anchor="middle">simulated flow in every pipe → real model weights → real output</text>
  <text x="210" y="134" fill="${W}" font-family="var(--serif)" font-size="14" text-anchor="middle" font-style="italic">"Once upon a time, there was a little…"</text>
</svg>`;

/** One thin tube: twice the level, twice the flow. */
const SVG_TUBE = (() => {
  const panel = (x0: number, lvl: number) => {
    const top = 140 - 100 * lvl;
    return `<rect x="${x0}" y="40" width="56" height="100" rx="4" fill="none" stroke="${DIM}"/>
      <rect x="${x0 + 1}" y="${top}" width="54" height="${139 - top}" fill="${W}" fill-opacity="0.5"/>
      <text x="${x0 + 28}" y="${top - 6}" fill="${INK}" font-family="var(--mono)" font-size="12" text-anchor="middle">level ${lvl.toFixed(1)}</text>
      <path d="M${x0 + 56} 132H${x0 + 150}" stroke="${DIM}" stroke-width="5"/>
      <path d="M${x0 + 56} 132H${x0 + 150}" stroke="${W}" stroke-width="2.4"/>
      <path d="M${x0 + 150} 132q8 0 8 12V${150 + 30 * lvl}" stroke="${W}" stroke-width="${2 + 6 * lvl}" stroke-linecap="round" fill="none"/>
      <text x="${x0 + 100}" y="122" fill="${DIM}" font-family="var(--sans)" font-size="10" text-anchor="middle">thin tube</text>
      <text x="${x0 + 120}" y="${178 + 4 * lvl}" fill="${W}" font-family="var(--mono)" font-size="12" text-anchor="end">flow ${lvl.toFixed(1)}</text>`;
  };
  return `<svg viewBox="0 0 440 200" role="img" aria-label="A tank at level 0.4 pushes a flow of 0.4 through a thin tube; at level 0.8 the flow doubles to 0.8">
    ${panel(20, 0.4)}${panel(240, 0.8)}
    <text x="220" y="24" fill="${INK}" font-family="var(--sans)" font-size="11.5" text-anchor="middle">twice the level → twice the pressure → twice the flow</text>
  </svg>`;
})();

/** A valve is a bundle of identical tubes; the weight is the share that are open. */
const SVG_BUNDLE = (() => {
  const n = 8;
  const open = [1, 0, 1, 1, 0, 0, 1, 0];
  const y0 = 46;
  const dy = 15;
  let s = `<rect x="16" y="40" width="50" height="120" rx="4" fill="none" stroke="${DIM}"/>
    <rect x="17" y="${159 - 118 * 0.8}" width="48" height="${118 * 0.8}" fill="${W}" fill-opacity="0.5"/>
    <text x="41" y="${159 - 118 * 0.8 - 6}" fill="${INK}" font-family="var(--mono)" font-size="11" text-anchor="middle">x = 0.8</text>
    <path d="M66 ${y0 + (n - 1) * dy + 8}h14V${y0}" stroke="${W}" stroke-opacity="0.6" stroke-width="5" fill="none"/>
    <path d="M250 ${y0}V${y0 + (n - 1) * dy}" stroke="${W}" stroke-opacity="0.6" stroke-width="5"/>`;
  for (let k = 0; k < n; k++) {
    const y = y0 + k * dy;
    const on = open[k] === 1;
    s += `<path d="M80 ${y}H250" stroke="${DIM}" stroke-width="4"/>
      ${on ? `<path d="M80 ${y}H250" stroke="${W}" stroke-width="2"/>` : `<path d="M150 ${y}H250" stroke="${DIM}" stroke-opacity="0.3" stroke-width="2"/>`}
      <rect x="138" y="${y - 5}" width="12" height="10" rx="2" fill="${on ? G : '#2a2f38'}" stroke="${G}" stroke-opacity="0.8"/>`;
  }
  s += `<text x="144" y="${y0 - 14}" fill="${G}" font-family="var(--sans)" font-size="10.5" text-anchor="middle">8 identical tubes, each with a tap</text>
    <path d="M250 ${y0 + (n - 1) * dy}q0 18 14 18H276" stroke="${W}" stroke-width="5" fill="none"/>
    <text x="284" y="${y0 + (n - 1) * dy + 22}" fill="${W}" font-family="var(--mono)" font-size="12">flow 0.40</text>
    <text x="284" y="60" fill="${G}" font-family="var(--mono)" font-size="12">4 of 8 open</text>
    <text x="284" y="78" fill="${G}" font-family="var(--mono)" font-size="12">w = 0.5</text>
    <text x="284" y="104" fill="${INK}" font-family="var(--mono)" font-size="12">0.5 × 0.8 = 0.40</text>
    ${valveSvg(96, 184, 10, 0.5)}
    <text x="112" y="188" fill="${DIM}" font-family="var(--sans)" font-size="10.5">drawn as a wheel on this page · wedge = share of tubes open</text>`;
  return `<svg viewBox="0 0 440 200" role="img" aria-label="A tank at level 0.8 feeds eight identical tubes; four have their taps open, so the valve passes half the flow of a fully open one: 0.40">${s}</svg>`;
})();

/** One column: three valves pour into one collector, which adds them up. */
const SVG_COLUMN = (() => {
  const x = [0.8, 0.4, 0.6];
  const w = [0.5, 0.25, 1.0];
  const rowY = (i: number) => 36 + i * 44;
  const cx = 230;
  let s = '';
  x.forEach((v, i) => {
    const y = rowY(i);
    s += `<rect x="40" y="${y - 17}" width="36" height="34" rx="3" fill="none" stroke="${DIM}"/>
      <rect x="41" y="${y + 16 - 32 * v}" width="34" height="${32 * v}" fill="${W}" fill-opacity="0.5"/>
      <text x="32" y="${y + 4}" fill="${INK}" font-family="var(--mono)" font-size="11" text-anchor="end">${v.toFixed(1)}</text>
      <path d="M76 ${y}H${cx}" stroke="${W}" stroke-opacity="0.45" stroke-width="5"/>
      ${valveSvg(cx, y, 14, w[i])}
      <text x="${cx - 22}" y="${y - 10}" fill="${G}" font-family="var(--mono)" font-size="10" text-anchor="end">w ${w[i].toFixed(i === 1 ? 2 : 1)}</text>
      <text x="${cx + 22}" y="${y + 4}" fill="${W}" font-family="var(--mono)" font-size="11">→ ${(v * w[i]).toFixed(2)}</text>`;
  });
  s += `<path d="M${cx} ${rowY(0) - 14}V170" stroke="${W}" stroke-opacity="0.45" stroke-width="5"/>
    <rect x="${cx - 26}" y="166" width="52" height="24" rx="3" fill="${W}" fill-opacity="0.18" stroke="${W}" stroke-opacity="0.6"/>
    <text x="${cx}" y="183" fill="${W}" font-family="var(--mono)" font-size="13" text-anchor="middle" font-weight="600">1.10</text>
    <text x="300" y="70" fill="${INK}" font-family="var(--mono)" font-size="11.5">0.5×0.8  = 0.40</text>
    <text x="300" y="88" fill="${INK}" font-family="var(--mono)" font-size="11.5">0.25×0.4 = 0.10</text>
    <text x="300" y="106" fill="${INK}" font-family="var(--mono)" font-size="11.5">1.0×0.6  = 0.60</text>
    <path d="M300 114h120" stroke="${DIM}"/>
    <text x="300" y="132" fill="${W}" font-family="var(--mono)" font-size="11.5" font-weight="600">collector = 1.10</text>
    <text x="268" y="158" fill="${DIM}" font-family="var(--sans)" font-size="10.5">one column = one dot product</text>`;
  return `<svg viewBox="0 0 440 200" role="img" aria-label="Three tanks pour through three valves into one collector, which sums 0.40, 0.10 and 0.60 to 1.10">${s}</svg>`;
})();

/** ReLU and GELU: a check valve, and its flow-versus-pressure curve. */
const SVG_CHECK = (() => {
  const px = (v: number) => 285 + v * 55;
  const py = (v: number) => 120 - v * 38;
  let relu = '';
  let gelu = '';
  for (let k = 0; k <= 60; k++) {
    const v = -2 + (4 * k) / 60;
    const g = 0.5 * v * (1 + Math.tanh(0.7978845608 * (v + 0.044715 * v * v * v)));
    relu += `${k ? 'L' : 'M'}${px(v).toFixed(1)} ${py(Math.max(0, v)).toFixed(1)}`;
    gelu += `${k ? 'L' : 'M'}${px(v).toFixed(1)} ${py(g).toFixed(1)}`;
  }
  return `<svg viewBox="0 0 440 200" role="img" aria-label="A check valve passes water one way only; its flow against pressure is the ReLU curve, and a softened version is GELU">
  <path d="M20 70H170" stroke="${W}" stroke-opacity="0.5" stroke-width="10"/>
  <path d="M95 52V88" stroke="${DIM}" stroke-width="2"/>
  <path d="M95 54l22 30" stroke="${G}" stroke-width="4" stroke-linecap="round"/>
  <path d="M40 70h30" stroke="${W}" stroke-width="2" marker-end="url(#ck)"/><path d="M125 70h30" stroke="${W}" stroke-width="2" marker-end="url(#ck)"/>
  <text x="20" y="40" fill="${INK}" font-family="var(--sans)" font-size="11">pushed forwards: the flap opens</text>
  <path d="M20 150H170" stroke="${DIM}" stroke-opacity="0.4" stroke-width="10"/>
  <path d="M95 132V168" stroke="${DIM}" stroke-width="2"/>
  <path d="M95 134V166" stroke="${G}" stroke-width="4" stroke-linecap="round"/>
  <path d="M75 150h-30" stroke="${DIM}" stroke-width="2" marker-end="url(#ck2)"/>
  <text x="20" y="188" fill="${INK}" font-family="var(--sans)" font-size="11">pushed backwards: it seats, no flow</text>
  <path d="M${px(-2)} ${py(0)}H${px(2.1)}M${px(0)} ${py(-0.5)}V${py(2.2)}" stroke="${DIM}"/>
  <text x="${px(2.1)}" y="${py(0) + 14}" fill="${DIM}" font-family="var(--sans)" font-size="10" text-anchor="end">pressure</text>
  <text x="${px(0) + 5}" y="${py(2.2) + 2}" fill="${DIM}" font-family="var(--sans)" font-size="10">flow</text>
  <path d="${relu}" stroke="${W}" stroke-width="2.5" fill="none"/>
  <path d="${gelu}" stroke="${G}" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
  <text x="${px(1.05)}" y="${py(1.85)}" fill="${W}" font-family="var(--sans)" font-size="11">ReLU: check valve</text>
  <text x="${px(0.15)}" y="${py(-0.55)}" fill="${G}" font-family="var(--sans)" font-size="11">GELU: soft, spring-loaded</text>
  <defs><marker id="ck" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="${W}"/></marker>
  <marker id="ck2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="${DIM}"/></marker></defs>
</svg>`;
})();

/** Softmax: a fixed inflow splits between valves opened exponentially by the scores. */
const SVG_SOFTMAX = (() => {
  const scores = [2.0, 1.0, 0.1];
  const g = scores.map((v) => Math.exp(v - 2));
  const z = g.reduce((a, b) => a + b, 0);
  const shares = g.map((v) => v / z);
  let s = `<path d="M20 100H110" stroke="${W}" stroke-opacity="0.7" stroke-width="8"/>
    <text x="22" y="86" fill="${INK}" font-family="var(--sans)" font-size="11">fixed inflow = 1</text>
    <circle cx="116" cy="100" r="8" fill="${W}" fill-opacity="0.7"/>`;
  scores.forEach((v, i) => {
    const y = 40 + i * 60;
    s += `<path d="M116 100L170 ${y}H360" stroke="${W}" stroke-opacity="${0.25 + 0.65 * shares[i]}" stroke-width="${2 + 9 * shares[i]}" fill="none"/>
      ${valveSvg(240, y, 15, g[i])}
      <text x="240" y="${y - 21}" fill="${G}" font-family="var(--mono)" font-size="10" text-anchor="middle">score ${v.toFixed(1)} → opens ${g[i].toFixed(2)}</text>
      <text x="368" y="${y + 4}" fill="${W}" font-family="var(--mono)" font-size="13" font-weight="600">${shares[i].toFixed(2)}</text>`;
  });
  s += `<text x="368" y="190" fill="${DIM}" font-family="var(--sans)" font-size="10.5">add up to 1</text>`;
  return `<svg viewBox="0 0 440 200" role="img" aria-label="A fixed inflow splits between three valves opened exponentially by scores 2.0, 1.0 and 0.1, giving shares 0.66, 0.24 and 0.10">${s}</svg>`;
})();

const STEPS: { title: string; svg: string; body: string; demo?: (host: HTMLElement) => Demo }[] = [
  {
    title: 'A language model is matrix multiplication',
    svg: SVG_MATMUL,
    body: `<p>A GPT turns text into numbers and pushes them through a stack of layers. Almost all of the
      work in every layer is one operation: <b>multiply a vector by a matrix of learned weights</b>.
      GPT-2 does over a hundred million multiply–adds for every token it writes.</p>
      <p>So if you have a machine that multiplies matrices, you have most of a language model. Let's build one out of water.</p>`,
  },
  {
    title: 'The input: a tank held at a fixed level',
    svg: SVG_TUBE,
    demo: mountTubeDemo,
    body: `<p>Each input is a tank that a hose keeps topping up, with an <b>overflow slot</b> cut in its wall at
      height <i>x</i>. However much water flows out, the level, and so the pressure at the bottom, stays at
      exactly <i>x</i>. It is an endless supply at a fixed pressure: <b>the input is a pressure</b>, not an
      amount of water.</p>
      <p>The tank drains through a thin tube into an open drain. In a thin tube water moves slowly and
      smoothly, so the flow is proportional to the pressure (Hagen–Poiseuille's law): twice the level, twice
      the flow. The water never stops, but after a moment it is <b>steady</b>: the same number of litres every
      second. A <b>flowmeter</b> reads that steady flow rate, and <b>the rate is the output</b>.</p>
      <p class="try">Try it: drag a level. The needle swings, settles, and reads the new steady rate.</p>`,
  },
  {
    title: 'The weight: a valve made of identical tubes',
    svg: SVG_BUNDLE,
    demo: mountBundleDemo,
    body: `<p>A valve sets how many litres per second pass for a given pressure: its <b>conductance</b>. To make
      that exact, build the valve from identical thin tubes, each with a tap. Every open tube carries the
      same flow and flows side by side add, so with 4 of 8 tubes open the valve passes exactly half of what
      it passes fully open: <i>w</i> = 0.5. That share is the <b>weight</b>.</p>
      <p>So the steady flow out is <b><i>w × x</i></b>: one multiplication, and nobody calculated it. The tank
      never runs dry, so opening the valve doesn't change <i>how much</i> water there is; it changes
      <i>how fast</i> it flows. The realistic machines here use 63 tubes per valve, and no two real tubes are
      quite identical: that is the manufacturing error we simulate. On this page a valve is drawn as a
      wheel whose wedge shows the share of tubes open.</p>
      <p class="try">Try it: click the taps and watch the rate follow.</p>`,
  },
  {
    title: 'A collector adds the flow rates',
    svg: SVG_COLUMN,
    demo: mountColumnDemo,
    body: `<p>Now several tanks drain through their own valves into one shared <b>collector</b> pipe that runs
      to an open drain. Because it drains freely it stays at zero pressure and never pushes back, so each
      valve still feels its own tank's full pressure. Water can't appear or vanish, so the steady flow in the
      collector is exactly the <b>sum</b> of the flows into it: 0.40 + 0.10 + 0.60 = 1.10 litres per second.</p>
      <p>Multiply each input by its weight and add them up: that is a <b>dot product</b>, one row of a matrix
      times a vector. No step is done before another: the collector's flowmeter reads the answer as soon as
      the flows are steady.</p>
      <p class="try">Try it: change the levels; the collector always carries the sum.</p>`,
  },
  {
    title: 'A grid of collectors multiplies a whole matrix: an analogue computer',
    svg: SVG_CROSSBAR,
    body: `<p>Run every tank's pipe across many collectors, with a valve at each crossing. Each collector carries
      its own dot product, all at the same moment: that is a full <b>matrix × vector</b>. This grid is called
      a <b>crossbar</b>. A valve can't pass negative water, so each output gets a pair of collectors, + and −,
      and the answer is the difference.</p>
      <p>To feed the next stage, each collector's flow drives a <b>pressure regulator</b> (a mechanical valve,
      no electronics) that holds the next tank at a level in proportion to that flow. So levels go in, steady
      flows come out, and become levels again for the next crossbar.</p>
      <p>This is <b>analogue computing</b>: let a law of physics do the arithmetic. Analogue AI chips do exactly
      this with electricity: a fixed voltage instead of a fixed level, resistors instead of valves, and the
      steady current in a wire as the answer.</p>`,
  },
  {
    title: 'The bends: ReLU and GELU are valves too',
    svg: SVG_CHECK,
    body: `<p>Stack two crossbars and you just get another crossbar: matrix products alone can only draw
      straight lines. A network needs a <b>bend</b> between them.</p>
      <p>A <b>check valve</b> is exactly that bend. Push water forwards and it flows; push backwards and the
      flap seats and nothing moves. Flow against pressure is the ReLU curve. GPT-2's GELU is the same idea
      with a spring and a shaped port, so it opens gradually instead of snapping.</p>`,
  },
  {
    title: 'Softmax and LayerNorm: small circuits between crossbars',
    svg: SVG_SOFTMAX,
    body: `<p><b>Softmax</b> turns attention scores into shares that add up to 1. Check valves find the highest
      score, and each score opens a valve shaped so its opening grows exponentially. A fixed inflow splits
      between those valves, and because no water is lost, the shares always add up to exactly 1.</p>
      <p><b>LayerNorm</b> evens out the levels before each crossbar: an averaging tank finds the mean, sharp
      orifices (where pressure grows with flow squared) find the spread, and valves opened by that spread
      divide by it.</p>`,
  },
  {
    title: 'We simulate the water, so the GPT really runs on it',
    svg: SVG_MACHINE,
    body: `<p>This page is <b>not an animation</b>. It is a physics simulation of the pipe network in steady
      flow: the pressure at every junction and the steady flow rate in every pipe, from conservation of water
      and laminar pipe flow, including imperfect valves and pressure lost along the pipes. There is no clock
      and no amount of water, only steady rates. The valves are set from real, trained models.</p>
      <p>Chain these crossbars and circuits (a dozen for the calculator, thousands of blocks for GPT-2), and
      the <b>simulated water runs the whole GPT</b>: GPT-2 and TinyStories-33M writing English, plus a tiny
      model that adds numbers. Even picking the next word is water: the fullest output collector wins. The
      only thing that is not water is the keyboard.</p>`,
  },
];

export function setupIntro(): void {
  const dlg = document.createElement('dialog');
  dlg.id = 'intro';
  dlg.setAttribute('aria-labelledby', 'intro-title');
  dlg.innerHTML = `
    <button type="button" class="intro-close" aria-label="Close">×</button>
    <p class="kicker" id="intro-kicker"></p>
    <h2 id="intro-title"></h2>
    <div class="intro-fig" id="intro-fig"></div>
    <div class="intro-body" id="intro-body"></div>
    <div class="intro-dots" id="intro-dots">${STEPS.map((_, i) => `<button type="button" data-i="${i}" aria-label="Step ${i + 1}"></button>`).join('')}</div>
    <div class="intro-nav">
      <button type="button" id="intro-back">Back</button>
      <button type="button" id="intro-next" class="primary">Next</button>
    </div>
    <div class="intro-nav intro-end" id="intro-end" hidden>
      <button type="button" id="intro-ch1">See one crossbar</button>
      <button type="button" id="intro-ch2" class="primary">Run the water GPT</button>
    </div>`;
  document.body.append(dlg);

  const q = <T extends HTMLElement>(id: string) => dlg.querySelector<T>('#' + id)!;
  const dots = [...dlg.querySelectorAll<HTMLButtonElement>('.intro-dots button')];
  let step = 0;
  let demo: Demo | null = null;

  const show = (i: number) => {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[step];
    q('intro-kicker').textContent = `Step ${step + 1} of ${STEPS.length}`;
    q('intro-title').textContent = s.title;
    demo?.stop();
    demo = null;
    const fig = q('intro-fig');
    fig.innerHTML = '';
    fig.classList.toggle('live', !!s.demo);
    if (s.demo) {
      demo = s.demo(fig);
      const tag = document.createElement('p');
      tag.className = 'fd-live';
      tag.textContent = 'Live simulation: the water is computed as you watch';
      fig.prepend(tag);
    } else fig.innerHTML = s.svg;
    q('intro-body').innerHTML = s.body;
    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === step)));
    q<HTMLButtonElement>('intro-back').style.visibility = step === 0 ? 'hidden' : 'visible';
    const last = step === STEPS.length - 1;
    (q('intro-next').parentElement as HTMLElement).hidden = last;
    q('intro-end').hidden = !last;
  };

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable: show again next time */
    }
    demo?.stop();
    demo = null;
    dlg.close();
  };
  const goChapter = (ch: number) => {
    close();
    document.querySelector<HTMLButtonElement>(`#tabs button[data-ch="${ch}"]`)?.click();
  };

  q('intro-next').addEventListener('click', () => show(step + 1));
  q('intro-back').addEventListener('click', () => show(step - 1));
  q('intro-ch1').addEventListener('click', () => goChapter(1));
  q('intro-ch2').addEventListener('click', () => goChapter(2));
  dlg.querySelector('.intro-close')!.addEventListener('click', close);
  dots.forEach((d) => d.addEventListener('click', () => show(Number(d.dataset.i))));
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(); // backdrop
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(step + 1);
    if (e.key === 'ArrowLeft') show(step - 1);
  });

  const open = () => {
    show(0);
    dlg.showModal();
  };
  document.getElementById('intro-open')?.addEventListener('click', open);

  let seen = false;
  try {
    seen = localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams(location.search);
  if (params.has('intro') || !seen) open();
}
