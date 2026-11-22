import { planPearlDock } from "../game/landfallDock";
import type { GeneratedIsland } from "../game/landfall";
import { Rng } from "../sim/rng";

type Point = { x: number; z: number };
type Pose = Point & { yaw: number };
const extent = 52;
const samples = extent * 2 + 1;
const ink = "#433e2c";
const paper = "#f1dfad";
const sepia = "#826340";
const position = (n: number) => Number(n.toFixed(2));
const translate = ({ x, z }: Point) => `translate(${position(x)} ${position(-z)})`;

function sampleTerrain(island: GeneratedIsland): Float32Array {
  const levels = new Float32Array(samples * samples);
  for (let row = 0; row < samples; row++) {
    for (let col = 0; col < samples; col++) {
      levels[row * samples + col] = island.heightAt(col - extent, extent - row);
    }
  }
  return levels;
}

/** Join exact interpolated crossings on shared grid edges to get closed shorelines
 * and contour rings, including offshore stacks and hollows inside the island. */
function contour(levels: Float32Array, level: number, island: GeneratedIsland): string {
  const points = new Map<number, string>();
  const neighbours = new Map<number, number[]>();
  const join = (a: number, b: number) => {
    for (const [from, to] of [[a, b], [b, a]]) {
      const list = neighbours.get(from!);
      if (list) list.push(to!);
      else neighbours.set(from!, [to!]);
    }
  };

  for (let row = 0; row < samples - 1; row++) {
    for (let col = 0; col < samples - 1; col++) {
      const nw = row * samples + col;
      const ne = nw + 1, sw = nw + samples, se = sw + 1;
      const a = levels[nw]!, b = levels[ne]!, c = levels[se]!, d = levels[sw]!;
      const above = Number(a > level) + Number(b > level) + Number(c > level) + Number(d > level);
      if (above === 0 || above === 4) continue;
      const hits: number[] = [];
      const cross = (start: number, end: number, vertical: boolean) => {
        const startH = levels[start]!, endH = levels[end]!;
        if ((startH > level) === (endH > level)) return;
        // Even IDs are eastbound edges, odd IDs southbound edges.
        const id = start * 2 + Number(vertical);
        if (!points.has(id)) {
          const x0 = start % samples - extent, y0 = Math.floor(start / samples) - extent;
          let t = (level - startH) / (endH - startH);
          // The beach eases to a nearly flat surface at the waterline. Linear
          // interpolation alone would pull the ink to the dry grid vertices.
          if (level === 0) {
            let lower = 0, upper = 1;
            for (let step = 0; step < 5; step++) {
              t = (lower + upper) / 2;
              const above = island.heightAt(x0 + (vertical ? 0 : t), -(y0 + (vertical ? t : 0))) > 0;
              if (above === (startH > 0)) lower = t;
              else upper = t;
            }
            t = (lower + upper) / 2;
          }
          const x = x0 + (vertical ? 0 : t);
          const y = y0 + (vertical ? t : 0);
          points.set(id, `${position(x)} ${position(y)}`);
        }
        hits.push(id);
      };
      cross(nw, ne, false); cross(ne, se, true); cross(sw, se, false); cross(nw, sw, true);
      if (hits.length === 4) {
        // A bilinear saddle has two crossings. The asymptotic decider selects
        // whether the NW and SE lobes connect, even for negative contours.
        if ((a - level) * (c - level) < (b - level) * (d - level)) {
          join(hits[0]!, hits[3]!); join(hits[1]!, hits[2]!);
        } else {
          join(hits[0]!, hits[1]!); join(hits[2]!, hits[3]!);
        }
      } else if (hits.length === 2) {
        join(hits[0]!, hits[1]!);
      }
    }
  }

  const paths: string[] = [];
  for (const start of neighbours.keys()) {
    const coords = [points.get(start)!];
    let previous = -1, current = start;
    while (neighbours.has(current)) {
      const adjacent = neighbours.get(current)!;
      const next = adjacent.find(id => id !== previous);
      neighbours.delete(current);
      if (next === undefined || next === start) break;
      coords.push(points.get(next)!);
      previous = current;
      current = next;
    }
    if (coords.length > 2) paths.push("M" + coords.join("L") + "Z");
  }
  return paths.join("");
}

const landmarkNames = ["lighthouse", "watchtower", "stone arch", "crystal spires"];
const landmarkSymbols = [
  '<path d="m-2.3 0 .95-5.5h2.7L2.4 0Z"/><path fill="#b7734f" d="m-1.9-2.1 3.4-1.5.22 1.4L-2.08-.8Z"/><path d="M-1.55-5.5v-2.05h3.1v2.05ZM-2-7.5l2-1.5 2 1.5Z"/><path d="M-2.6-5.5h5.2m-5.5 5.45h6.1" fill="none"/>',
  '<path d="m-2.7 0 .7-4.6-.72-.8v-2.1h1.08v1.05h1.1v-1.05H.53v1.05h1.1v-1.05h1.1v2.1l-.72.8L2.7 0Z"/><path fill="#ae6e4b" d="M.4-6.7v-2.4l3.1.55-1.4.8-1.7-.3"/><path d="M-2.9 0h5.8m-4.1-.2V-2q1.15-1.3 2.3 0v1.8M-1.8-4.25l3.6-.12" fill="none"/>',
  '<path d="m-4.6 0 1-4.2 1.4-2 3.8-.5 2.2 1.6L4.6 0H2.35l-.8-3.45-1.8-.86-1.7 1.03L-2.3 0Z"/><path d="m-2.2-5.7.9 1.45m1.6-2.05-.1 1.8m2.7-.9-1.35 1.15m1.42 2.1 1.25-.21M-5 .2h2.6m4.48 0h3" fill="none"/>',
  '<path d="m-2.7-.1-1.4-3.4.45-2 1.83.8L-.7-.1Zm2.1 0-1.25-5.6L-.35-8 1.1-5.9.75-.2ZM.7 0l1.05-4.65 2.55-1.1.1 2L2.7 0Z"/><path d="m-.35-7.5.23 6.1m-3.27-3.35 1.25 3.25m5.85-3.25L2.1-1M-3.7.2h7.5" fill="none"/>',
];
const anchorSymbol = '<circle cy="-1.9" r=".65"/><path d="M0-1.25v4m-1.42-2.4h2.84m-4.15.35q.28 1.8 2.73 2.3 2.55-.5 2.73-2.3M-3.05 1l.36-1.1.97.65m3.4 0 .99-.65.32 1.1" fill="none"/>';
const buriedSymbol = '<path d="m-2.6-2.2 5.35 4.55m-.35-4.9L-2.5 2.6" fill="none" stroke="#fff2cb" stroke-width="1.8"/><path d="m-2.6-2.2 5.35 4.55m-.35-4.9L-2.5 2.6" fill="none" stroke="#9a362a" stroke-width="1.01"/>';
const foundSymbol = '<path d="m-3-1.1-.35-1.9L2-4l.6 1.8Z" fill="#d8b16d"/><path d="M-3-.5h6l-.25 3.2h-5.5Z" fill="#ac7546"/><path d="m.3-.3 1 1 2.1-2.25" fill="none" stroke="#f8f2d6" stroke-width="1.15"/><path d="m.3-.3 1 1 2.1-2.25" fill="none" stroke="#386247" stroke-width=".5"/>';

function chartDetail(island: GeneratedIsland, seed: number) {
  const rng = new Rng(seed ^ 0x4d415021);
  const stipple: string[] = [], ripples: string[] = [], hachures: string[] = [];
  // Dune stippling follows the actual dry beach; short wavelets stay at sea.
  for (let y = -39; y < 40; y += 2) {
    for (let x = -47; x < 48; x += 2.3) {
      const xx = x + rng.range(-.85, .85), yy = y + rng.range(-.75, .75);
      const height = island.heightAt(xx, -yy);
      if (height > .14 && height < 1.2 && rng.next() > .42) {
        stipple.push(`M${position(xx)} ${position(yy)}l.18-.06`);
      } else if (height > 2.9 && rng.next() > .55) {
        // Short adjoining strokes lie along the actual fall line, as on an
        // engraved relief chart. Shady, steep faces carry the denser marks.
        const dx = height - island.heightAt(xx + 1, -yy);
        const dy = height - island.heightAt(xx, -yy - 1);
        const slope = Math.hypot(dx, dy);
        if (slope > .44 && dx + dy > .1) {
          const alongX = dx / slope, alongY = dy / slope;
          for (let n = 0; n < 3; n++) {
            const length = Math.min(slope, 1.9) * rng.range(.7, 1.05);
            const sx = xx - n * alongY * .32, sy = yy + n * alongX * .32;
            hachures.push(`M${position(sx)} ${position(sy)}l${position(alongX*length)} ${position(alongY*length)}`);
          }
        }
      } else if (height < -3 && rng.next() > .972 &&
          !(xx > 34 && yy < -26) && !(xx < -27 && yy > 29)) {
        ripples.push(`M${position(xx)} ${position(yy)}q.65.35 1.25 0 .65.3 1.4-.05`);
      }
    }
  }
  return `<path d="${stipple.join("")}" stroke="#9f824d" stroke-width=".28" opacity=".65"/>
    <path d="${hachures.join("")}" fill="none" stroke="#827752" stroke-width=".17" opacity=".7"/>
    <path d="${ripples.join("")}" fill="none" stroke="#708e83" stroke-width=".22" opacity=".7"/>`;
}

function compassAndScale(): string {
  return `<g transform="translate(43 -31)" stroke="#585844" stroke-width=".27">
    <circle r="4.5" fill="none"/><path d="M0-7 1.1-1.15 6.7 0 1.15 1.1 0 6.6-1.1 1.15-6.7 0-1.15-1.1Z" fill="#ede4c8"/>
    <path d="M0-7v7l1.1-1.15ZM6.7 0H0l1.15 1.1ZM0 6.6V0l-1.1 1.15ZM-6.7 0H0l-1.15-1.1Z" fill="#516457"/>
    <text y="-8" text-anchor="middle" stroke="none" fill="#36483d" font-size="3.5" font-weight="bold">N</text></g>
    <g transform="translate(-46 36)" fill="#505849"><path d="M0-1v1.5h10V-1M5-.6V.5" fill="none" stroke="currentColor" stroke-width=".25"/>
    <text x="5" y="4.15" text-anchor="middle" font-size="2.7">10 m</text></g>`;
}

let chartId = 0;
function drawChart(island: GeneratedIsland, world: number, seed: number, dock: ReturnType<typeof planPearlDock>, bottom: number): string {
  const wash = `landfall-paper-${++chartId}`;
  const levels = sampleTerrain(island);
  const bands: string[] = [];
  const drawBand = (height: number, fill: string, stroke: string, weight: number) => {
    const d = contour(levels, height, island);
    if (d) bands.push(`<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${weight}"/>`);
  };
  // Two soundings seaward, a dark tideline, then a light mineral wash inland.
  drawBand(-3, "#d9dfc4", "#9fb2a2", .16);
  drawBand(-1.35, "#e1dfbe", "#8b9e8a", .16);
  drawBand(0, "#edd8a3", "#645a3c", .50);
  drawBand(1.48, "#dece97", "#ab9366", .20);
  const winter = island.site.settings.biome === "winter";
  const highColors = winter
    ? ["#d9d3b6","#e3ddc6","#ebe3d1","#f3ead7"]
    : ["#c9c899","#babe8f","#b5b28a","#d3bd91"];
  for (let height = 3, i = 0; height <= 31; height += 2, i++) {
    drawBand(height, highColors[Math.min(Math.floor(i / 2), highColors.length - 1)]!, "#968e69", .19);
  }
  const { site } = island;
  const roads = site.town.paths.map(({a,b,width}) => {
    const d = `M${position(a.x)} ${position(-a.z)}L${position(b.x)} ${position(-b.z)}`;
    return `<path d="${d}" stroke="#ac8f63" stroke-width="${position(width)}"/><path d="${d}" stroke="#ebd6a6" stroke-width="${position(width * .62)}"/>`;
  }).join("");
  const houses = site.town.houses.map(h => {
    const dx = position(h.depth * .42), dy = position(h.frontage * .43);
    return `<g transform="${translate(h)}" stroke="#705239" stroke-width=".27">
      <path fill="#b9875e" d="M-${dx} -${dy}H${dx}V${dy}H-${dx}Z"/>
      <path fill="#d9b27d" d="M0 -${dy}H${dx}V${dy}H0Z"/><path d="M0 -${dy}V${dy}" fill="none"/></g>`;
  }).join("");
  let grid = "";
  for (let i = -50; i <= 50; i += 10) grid += `M${i} -40V${bottom - 3} M-50 ${i}H50`;
  return `<defs><radialGradient id="${wash}" cx="48%" cy="44%" r="75%">
      <stop stop-color="#eee3bd" stop-opacity="0"/><stop offset="72%" stop-color="#c19c64" stop-opacity=".08"/>
      <stop offset="100%" stop-color="#a07942" stop-opacity=".26"/></radialGradient></defs>
    <rect x="-53" y="-44" width="106" height="${bottom + 44}" rx="1" fill="#e8dbaf"/>
    <rect x="-51.5" y="-42.5" width="103" height="${bottom + 41}" rx=".5" fill="#d1d8bd" stroke="#8d8969" stroke-width=".32"/>
    <path d="${grid}" fill="none" stroke="#899b88" stroke-width=".14" opacity=".45"/>
    ${bands.join("")}${chartDetail(island, seed)}
    <rect x="-51.5" y="-42.5" width="103" height="${bottom + 41}" rx=".5" fill="url(#${wash})"/>
    <g fill="none">${roads}</g>${houses}
    <g transform="${translate(site.landmark)}" fill="${paper}" stroke="${ink}" stroke-width=".45">
      <title>${landmarkNames[world]}</title>${landmarkSymbols[world]}</g>
    <g transform="${translate(site.grotto.entry)}" stroke="#524733" stroke-width=".35">
      <title>Tidal cave</title><path fill="#d1bb8b" d="m-2.8 1.4.9-2.7 1.6-.8 1.6.5 1.5 3Z"/>
      <path fill="#574a38" d="M-1.15 1.4q.1-2.65 1.18-2.65 1.04.25 1.3 2.65Z"/></g>
    <g stroke="#394c43" stroke-width=".65">
      <title>Black Pearl dock</title>
      <path d="M${position(dock.x)} ${position(-dock.shoreZ)}V${position(-dock.onDeck.z)}" stroke="#88694b" stroke-width="1.25"/>
      <g transform="${translate(dock.onDeck)}"><path d="M-4.4 0-2.4-1.1H2.7L4.1 0 2.7 1H-2.4Z" fill="#394c43"/></g>
    </g>
    <g data-mark="landing" transform="${translate(site.spawn)}" fill="#f6e8bf" stroke="#394c43" stroke-width=".55">
      <title>Landing</title>${anchorSymbol}</g>
    <g transform="${translate(site.dig)}" stroke="${sepia}" stroke-width=".42">
      <g data-mark="buried">${buriedSymbol}</g><g data-mark="found" display="none">${foundSymbol}</g></g>
    ${compassAndScale()}
    <g data-mark="player" display="none" stroke="#ffefca" stroke-width=".62">
      <circle r="2.2" fill="none" stroke-width=".95"/><circle r="2.2" fill="none" stroke="#176767" stroke-width=".50"/>
      <path d="M0-6.25 2.25-2.25 0-3.05-2.25-2.25Z" fill="#085456"/><path data-mark="at-landing" d="M0-2.55 1.85 1.9 0 1.05-1.85 1.9Z" fill="#085456"/></g>`;
}

export class LandfallTreasureMap {
  readonly el = document.createElement("div");
  private readonly player: SVGGElement;
  private readonly landing: SVGGElement;
  private readonly landingArrow: SVGPathElement;
  private readonly buried: SVGGElement;
  private readonly found: SVGGElement;
  private readonly svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private treasureFound = false;

  constructor(private readonly island: GeneratedIsland, world: number, seed: number) {
    this.el.className = "landfall-treasure-map";
    this.el.style.cssText = "display:grid;place-items:center;width:100%;min-width:0;min-height:0;max-height:100%";
    const dock = planPearlDock(island);
    const bottom = Math.max(44, Math.ceil(-dock.shipZ + 6));
    this.svg.setAttribute("viewBox", `-53 -44 106 ${bottom + 44}`);
    this.svg.setAttribute("role", "img");
    this.svg.setAttribute("aria-label", `Treasure chart of ${island.site.name}. North is up. From the landing, pass the ${landmarkNames[world]} to reach the marked treasure.`);
    this.svg.setAttribute("stroke-linecap", "round");
    this.svg.setAttribute("stroke-linejoin", "round");
    this.svg.style.cssText = "display:block;width:100%;height:auto;max-height:100%;font-family:Georgia,serif;color:#535541";
    this.svg.innerHTML = drawChart(island, world, seed, dock, bottom);
    this.player = this.svg.querySelector('[data-mark="player"]')!;
    this.landing = this.svg.querySelector('[data-mark="landing"]')!;
    this.landingArrow = this.svg.querySelector('[data-mark="at-landing"]')!;
    this.buried = this.svg.querySelector('[data-mark="buried"]')!;
    this.found = this.svg.querySelector('[data-mark="found"]')!;
    this.el.append(this.svg);
  }

  locate(player: Pose | null, found: boolean): void {
    if (found !== this.treasureFound) {
      this.treasureFound = found;
      this.buried.setAttribute("display", found ? "none" : "inline");
      this.found.setAttribute("display", found ? "inline" : "none");
    }
    const atLanding = !!player && Math.hypot(player.x - this.island.site.spawn.x, player.z - this.island.site.spawn.z) < 3;
    this.landing.setAttribute("display", atLanding ? "none" : "inline");
    this.landingArrow.setAttribute("display", atLanding ? "inline" : "none");
    if (player) {
      this.player.setAttribute("display", "inline");
      this.player.setAttribute("transform", `${translate(player)} rotate(${position(player.yaw * 180 / Math.PI)})`);
    } else this.player.setAttribute("display", "none");
  }
}
