import { icon } from "./icons";
import "./menuChrome.css";

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

interface ButtonTarget { id?: string; action?: string; }
const target = ({ id, action }: ButtonTarget) => `${id ? ` id="${escape(id)}"` : ""}${action ? ` data-action="${escape(action)}"` : ""}`;

/** The same navigation control is used by both game entrypoints and every scene. */
export function backButton(options: ButtonTarget & { destination?: string; hidden?: boolean } = {}): string {
  return `<button${target(options)} class="pirate-menu-back menu-back" aria-label="Back${options.destination ? ` to ${escape(options.destination)}` : ""}"${options.hidden ? " hidden" : ""}><span class="pirate-back-arrow" aria-hidden="true">‹</span><span>Back</span></button>`;
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
