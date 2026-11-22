import { icon } from "./icons";
import "./rewardLedger.css";

interface LedgerAction {
  id?: string;
  action?: string;
  label: string;
  icon?: string;
  primary?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

interface RewardLedger {
  title: string;
  titleId?: string;
  marks?: string;
  details?: string;
  actions: LedgerAction[];
}

const escape = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
);

export function ledgerStarMarks(count: number): string {
  return [1, 2, 3].map(i => `<span class="ledger-star${i <= count ? " earned" : ""}" aria-hidden="true">${icon("star")}</span>`).join("");
}

export function ledgerStars(count: number, label: string, id?: string): string {
  return `<div ${id ? `id="${id}"` : ""} class="ledger-stars" role="img" aria-label="${escape(label)}">${ledgerStarMarks(count)}</div>`;
}

export function rewardLedger({ title, titleId, marks, details, actions }: RewardLedger): string {
  return `<div class="reward-ledger">
    ${marks ?? ""}
    <h1 ${titleId ? `id="${titleId}"` : ""}>${title}</h1>
    ${details ?? ""}
    <div class="ledger-actions">
      ${actions.map(({ id, action, label, icon: symbol, primary, disabled, hidden }) =>
        `<button type="button" ${id ? `id="${id}"` : ""} ${action ? `data-action="${action}"` : ""}
          ${primary ? 'class="ledger-primary"' : ""} ${disabled ? "disabled" : ""} ${hidden ? "hidden" : ""}>
          ${symbol ? icon(symbol) : ""} ${escape(label)}</button>`).join("")}
    </div>
  </div>`;
}

interface HoldLedger {
  eyebrow: string;
  title: string;
  /** The cargo line, e.g. "3,000 gold aboard". */
  cargo: string;
  cargoId?: string;
  note?: string;
  actions: LedgerAction[];
}

/** The ship's hold: every game shows its cargo and the ways out on the same ledger page. */
export function holdLedger({ eyebrow, title, cargo, cargoId, note, actions }: HoldLedger): string {
  return rewardLedger({
    marks: `<p class="ledger-eyebrow">${escape(eyebrow)}</p>`,
    title: escape(title),
    details: `<p ${cargoId ? `id="${cargoId}"` : ""} class="ledger-cargo" role="status">${escape(cargo)}</p>${
      note ? `<p class="ledger-details">${escape(note)}</p>` : ""}`,
    actions,
  });
}

export function shipRecoveryLedger(title: string, message: string, failed: boolean, actions: LedgerAction[]): string {
  return rewardLedger({
    title: escape(title),
    details: `<p class="ledger-details ship-recovery-status" role="${failed ? "alert" : "status"}">${escape(message)}</p>`,
    actions,
  });
}
