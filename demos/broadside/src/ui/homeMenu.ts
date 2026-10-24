import { icon } from "./icons";
import "./homeMenu.css";

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
interface Destination { id?: string; action?: string; }
const target = ({ id, action }: Destination) => `${id ? ` id="${escape(id)}"` : ""}${action ? ` data-action="${escape(action)}"` : ""}`;
interface HomeAction extends Destination { label: string; detail?: string; }
interface TreasureDestination extends Destination { title: string; value: string; detail: string; icon: "ship" | "chest"; }
export interface HomeMenuOptions {
  title: readonly string[];
  eyebrow: string;
  description: string;
  illustration: string;
  primary: HomeAction;
  chooseLevels?: HomeAction;
  ship: TreasureDestination;
  cave: TreasureDestination;
  settings: Destination & { label?: string };
  rule: string;
}

/** One home hierarchy for both games: play first, then clearly labelled treasure destinations. */
export function homeMenu(options: HomeMenuOptions): string {
  const destination = (item: TreasureDestination) => `<button${target(item)} class="pirate-home-destination" data-home-destination="${item.icon}"><span class="pirate-home-destination-icon">${icon(item.icon)}</span><span class="pirate-home-destination-copy"><span class="pirate-home-destination-title">${escape(item.title)}</span><strong>${escape(item.value)}</strong><small>${escape(item.detail)}</small></span>${icon("arrow", "pirate-home-card-arrow")}</button>`;
  return `<div class="pirate-home">
    <div class="pirate-home-layout">
      <div class="pirate-home-intro"><p class="pirate-home-eyebrow">${escape(options.eyebrow)}</p><h1 class="pirate-home-title">${options.title.map(line => `<span>${escape(line)}</span>`).join("")}</h1><p class="pirate-home-description">${escape(options.description)}</p></div>
      <div class="pirate-home-art" aria-hidden="true"><span class="pirate-home-moon"></span><span class="pirate-home-horizon"></span><div class="pirate-home-ship">${options.illustration}</div></div>
      <div class="pirate-home-controls">
        <nav class="pirate-home-play" aria-label="Play"><button${target(options.primary)} class="pirate-home-primary"><span><strong>${escape(options.primary.label)}</strong>${options.primary.detail ? `<small>${escape(options.primary.detail)}</small>` : ""}</span>${icon("arrow")}</button>${options.chooseLevels ? `<button${target(options.chooseLevels)} class="pirate-home-choose">${icon("map")} ${escape(options.chooseLevels.label)}</button>` : ""}</nav>
        <nav class="pirate-home-treasure" aria-label="Your treasure">${destination(options.ship)}${destination(options.cave)}</nav>
        <div class="pirate-home-footer"><p>${escape(options.rule)}</p><button${target(options.settings)} class="pirate-home-settings">${escape(options.settings.label ?? "Settings")}</button></div>
      </div>
    </div>
  </div>`;
}
