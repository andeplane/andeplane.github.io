import { icon } from "./icons";
import "./menuChrome.css";
import "./pirateSkin.css";

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

interface ButtonTarget { id?: string; action?: string; }
const target = ({ id, action }: ButtonTarget) => `${id ? ` id="${escape(id)}"` : ""}${action ? ` data-action="${escape(action)}"` : ""}`;

/** Navigation control shared across the pirate games. */
export function backButton(options: ButtonTarget & { destination?: string; hidden?: boolean; label?: string; accessibleLabel?: string } = {}): string {
  return `<button type="button"${target(options)} class="pirate-menu-back menu-back" aria-label="${escape(options.accessibleLabel ?? `${options.label ?? "Back"}${options.destination ? ` to ${options.destination}` : ""}`)}"${options.hidden ? " hidden" : ""}><span class="pirate-back-arrow" aria-hidden="true">‹</span><span>${escape(options.label ?? "Back")}</span></button>`;
}

/** Keep map navigation outside the pan surface. The host supplies its destination and title. */
export function chartHeader(options: { back: string; heading?: string; actions?: string; className?: string }): string {
  const heading = options.heading ? `<div class="pirate-chart-title">${options.heading}</div>` : "";
  const actions = options.actions ? `<div class="pirate-chart-actions">${options.actions}</div>` : "";
  return `<header class="pirate-chart-header${options.className ? " " + escape(options.className) : ""}">${options.back}${heading}${actions}</header>`;
}

export function chartAction(options: ButtonTarget & { label: string; icon: Parameters<typeof icon>[0]; accessibleLabel?: string; controls?: string }): string {
  const accessible = options.accessibleLabel ? ` aria-label="${escape(options.accessibleLabel)}"` : "";
  const controls = options.controls ? ` aria-expanded="false" aria-controls="${escape(options.controls)}"` : "";
  return `<button type="button"${target(options)} class="pirate-chart-action"${accessible}${controls}>${icon(options.icon)}<span>${escape(options.label)}</span></button>`;
}

export function menuBrand(options: ButtonTarget & { title: string; subtitle: string; className?: string }): string {
  const tag = options.action || options.id ? "button" : "span";
  return `<${tag}${target(options)} class="pirate-menu-brand ${escape(options.className ?? "")}"${tag === "button" ? ` aria-label="${escape(options.title)} home"` : ""}>${icon("wheel")}<b>${escape(options.title)}<small>${escape(options.subtitle)}</small></b></${tag}>`;
}

export function menuHeader(options: { className: string; brand: string; actions: string; back?: string }): string {
  return `<header class="pirate-menu-header ${escape(options.className)}"><div class="pirate-menu-header-left${options.back ? " has-back" : ""}">${options.back ?? ""}${options.brand}</div><div class="pirate-menu-header-actions">${options.actions}</div></header>`;
}

interface MenuAction extends ButtonTarget { label: string; icon: Parameters<typeof icon>[0]; primary?: boolean; }
export function mainMenuActions(actions: readonly MenuAction[]): string {
  return `<nav class="main-actions pirate-menu-actions" aria-label="Main menu">${actions.map((action) => `<button${target(action)} class="wood-button pirate-menu-action${action.primary ? " primary prominent" : ""}">${escape(action.label)} ${icon(action.icon)}</button>`).join("")}</nav>`;
}

/** Readable label hierarchy shared by sailing worlds and arithmetic difficulties. */
export function mapLabel(options: { className: string; title: string; eyebrow?: string; subtitle?: string; detailHtml: string }): string {
  return `<span class="pirate-map-label ${escape(options.className)}">${options.eyebrow ? `<small class="pirate-map-eyebrow">${escape(options.eyebrow)}</small>` : ""}<b>${escape(options.title)}</b>${options.subtitle ? `<small>${escape(options.subtitle)}</small>` : ""}<span>${options.detailHtml}</span></span>`;
}
