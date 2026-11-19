// Coordinates belong to the chart. Images and labels retain their own aspect ratios.
import "./islandChart.css";

const shores = ["cove", "arch", "lighthouse", "lagoon", "fjord", "keep", "volcano", "keys", "ruins", "harbour", "whirlpool", "falls"] as const;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function islandArt(index: number): string {
  return chartArt("islands/" + shores[index % shores.length]);
}
export function shoreMarker(index: number, label: string, numberClass: "tile-number" | "shore-number"): string {
  return `<span class="route-island" aria-hidden="true">${islandArt(index)}</span><span class="${numberClass}">${esc(label)}</span>`;
}
function chartArt(asset: string): string {
  return `<img class="world-art chart-island-art" src="${import.meta.env.BASE_URL}assets/map/${asset}.webp" alt="" draggable="false" decoding="async">`;
}
export interface ChartWorld {
  id: string | number;
  art: number | string;
  title: string;
  subtitle?: string;
  detail?: string;
  ariaLabel: string;
  disabled?: boolean;
}
export function worldChoices(action: "pack" | "operator" | "language", worlds: readonly ChartWorld[]): string {
  return worlds.map((w,i) => `<button data-${action}="${esc(String(w.id))}" class="world-island world-${i}" ${w.disabled ? "disabled" : ""} aria-label="${esc(w.ariaLabel)}">${typeof w.art === "number" ? islandArt(w.art) : chartArt(w.art)}<span class="world-label"><b>${esc(w.title)}</b>${w.subtitle ? `<small>${esc(w.subtitle)}</small>` : ""}${w.detail ? `<span>${esc(w.detail)}</span>` : ""}</span></button>`).join("");
}
export function worldChart(title: string, choices: string, back?: string): string {
  const heading = `<h1>${esc(title)}</h1>`;
  return `<section class="family-world-chart">${back ? `<header class="chart-heading">${back}${heading}</header>` : heading}<nav aria-label="${esc(title)}">${choices}</nav></section>`;
}
