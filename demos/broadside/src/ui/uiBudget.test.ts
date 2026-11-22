import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Budgets, KIT, cssSpend, markupSpend, overspend, spend, tighten } from "./uiBudget";

const src = fileURLToPath(new URL("..", import.meta.url));
const ledger = fileURLToPath(new URL("./uiBudget.json", import.meta.url));

function files(dir = ""): string[] {
  return readdirSync(`${src}${dir}`, { withFileTypes: true }).flatMap(entry => {
    const name = `${dir}${entry.name}`;
    if (entry.isDirectory()) return files(`${name}/`);
    return /\.css$|(?<!\.test)\.ts$/.test(name) ? [name] : [];
  });
}

function current(): Budgets {
  const found: Budgets = {};
  for (const file of files()) {
    if (KIT.has(file)) continue;
    const spent = spend(file, readFileSync(`${src}${file}`, "utf8"));
    if (Object.values(spent).some(amount => amount > 0)) found[file] = spent;
  }
  return found;
}

describe("the pirate UI budget", () => {
  it("counts the colours, fonts and forced overrides a stylesheet spends", () => {
    expect(cssSpend(`/* #fff is fine in a comment */
      .a { color: #fff1d2; background: rgb(1 2 3); font: 700 12px Georgia; }
      .b{font-family:serif;border-color:hsla(1,2%,3%,.5) !important}`))
      .toEqual({ colours: 3, fonts: 2, important: 1 });
    expect(cssSpend(".a { margin: 0; --font-size: 2px; }")).toEqual({ colours: 0, fonts: 0, important: 0 });
  });

  it("counts hand-built buttons and dialogs in a screen file", () => {
    expect(markupSpend('`<button id="a">A</button><dialog><button>B</button></dialog>`'))
      .toEqual({ buttons: 2, dialogs: 1 });
    expect(spend("math/main.ts", "backButton({})")).toEqual({ buttons: 0, dialogs: 0 });
    expect(spend("math/a.css", ".a{color:#000}")).toEqual({ colours: 1, fonts: 0, important: 0 });
  });

  it("flags anything above budget, and gives a new file no budget at all", () => {
    const allowed: Budgets = { "math/a.css": { colours: 2 } };
    expect(overspend({ "math/a.css": { colours: 2, fonts: 0 } }, allowed)).toEqual([]);
    expect(overspend({ "math/a.css": { colours: 3 }, "reading/new.css": { fonts: 1 } }, allowed)).toEqual([
      "math/a.css: 3 colours, budget 2. Use the shared kit in src/ui (see pirateSkin.css) instead.",
      "reading/new.css: 1 fonts, budget 0. Use the shared kit in src/ui (see pirateSkin.css) instead.",
    ]);
  });

  it("only ever tightens a budget", () => {
    expect(tighten(
      { "a.css": { colours: 1, fonts: 5 }, "gone.css": { colours: 0 }, "new.css": { colours: 4 } },
      { "a.css": { colours: 3, fonts: 2 } },
    )).toEqual({ "a.css": { colours: 1, fonts: 2 } });
    expect(tighten({ "a.css": { colours: 1, fonts: 0 } })).toEqual({ "a.css": { colours: 1 } });
  });

  it("no game styles its own UI beyond the frozen budget", () => {
    const spent = current();
    const allowed = existsSync(ledger) ? JSON.parse(readFileSync(ledger, "utf8")) as Budgets : undefined;
    // PIRATE_UI_BUDGET=tighten lowers the ledger after UI moves into the kit; it never raises a limit.
    if (process.env.PIRATE_UI_BUDGET === "tighten") {
      writeFileSync(ledger, `${JSON.stringify(tighten(spent, allowed), null, 1)}\n`);
      return;
    }
    expect(overspend(spent, allowed ?? {})).toEqual([]);
  });
});
