import { icon } from "./icons";
import "./caveHud.css";

const escape = (text: string): string => text.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

interface CaveBalance {
  amount: number;
  accessible: string;
  currency: string;
  locale: string;
}

function displayGold({ amount, locale }: CaveBalance): string {
  return new Intl.NumberFormat(locale, amount < 1000 ? {} : {
    notation: "compact", maximumFractionDigits: 1,
  }).format(amount);
}

export function caveHeader(back: string, title: string, balance: CaveBalance): string {
  return `<header class="pirate-cave-header">${back}
    <h1 class="pirate-cave-title">${escape(title)}</h1>
    <span class="pirate-cave-balance">
      <span class="pirate-cave-sr pirate-cave-balance-label">${escape(balance.accessible)}</span>
      <span class="pirate-cave-balance-display" aria-hidden="true">${icon("chest")} <span class="pirate-cave-balance-value">${escape(displayGold(balance))}</span> <small>${escape(balance.currency)}</small></span>
    </span>
  </header>`;
}

export function updateCaveBalance(header: Element, balance: CaveBalance): void {
  const label = header.querySelector(".pirate-cave-balance-label")!;
  if (label.textContent === balance.accessible) return;
  label.textContent = balance.accessible;
  header.querySelector(".pirate-cave-balance-value")!.textContent = displayGold(balance);
}

export function caveTally(message: string, id?: string): string {
  return `<p class="pirate-cave-tally" role="status"${id ? ` id="${escape(id)}"` : ""}>${escape(message)}</p>`;
}

export function caveNotice(message: string, retry?: string): string {
  return `<div class="pirate-cave-notice"><p role="${retry ? "alert" : "status"}">${escape(message)}</p>${retry ?? ""}</div>`;
}
