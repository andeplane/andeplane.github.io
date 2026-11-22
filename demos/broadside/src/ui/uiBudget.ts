/** The pirate UI budget: what a game is allowed to style on its own.
 *
 * The shared kit owns the look of menus, sheets and controls. Every other stylesheet and
 * every screen file has a frozen budget for the things that make a game look different
 * (colours, fonts, forced overrides, hand-built buttons and dialogs). A budget may only
 * shrink, and a new file starts at zero, so new UI has to come from the kit. */

/** Stylesheets and builders that are the kit. Only these may introduce a look. */
export const KIT = new Set([
  "ui/pirateSkin.css", "ui/pirateTheme.css", "ui/menuChrome.css", "ui/homeMenu.css",
  "ui/rewardLedger.css", "ui/caveHud.css", "ui/languagePicker.css", "ui/privacy.css",
  "ui/menuChrome.ts", "ui/homeMenu.ts", "ui/rewardLedger.ts", "ui/caveHud.ts",
  "ui/languagePicker.ts", "ui/privacy.ts",
]);

export type Budget = Record<string, number>;
export type Budgets = Record<string, Budget>;

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** What a stylesheet spends: colour literals, font declarations and forced overrides. */
export function cssSpend(css: string): Budget {
  const text = withoutComments(css);
  return {
    colours: count(text, /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/g),
    fonts: count(text, /(?:^|[;{\s])font(?:-family)?\s*:/g),
    important: count(text, /!important/g),
  };
}

/** What a screen file spends: controls and sheets built by hand instead of by the kit. */
export function markupSpend(source: string): Budget {
  return {
    buttons: count(source, /<button\b/g),
    dialogs: count(source, /<dialog\b/g),
  };
}

export const spend = (file: string, text: string): Budget =>
  file.endsWith(".css") ? cssSpend(text) : markupSpend(text);

/** Every way the current files spend more than their budget allows. */
export function overspend(current: Budgets, allowed: Budgets): string[] {
  return Object.entries(current).flatMap(([file, spent]) =>
    Object.entries(spent).flatMap(([kind, amount]) => {
      const limit = allowed[file]?.[kind] ?? 0;
      return amount > limit
        ? [`${file}: ${amount} ${kind}, budget ${limit}. Use the shared kit in src/ui (see pirateSkin.css) instead.`]
        : [];
    }));
}

/** The budget after a run: no limit ever grows and a new file gets none. Without an
 *  earlier budget, today's spend becomes the starting point. */
export function tighten(current: Budgets, allowed?: Budgets): Budgets {
  const next: Budgets = {};
  for (const [file, spent] of Object.entries(current)) {
    const kept = Object.fromEntries(Object.entries(spent)
      .map(([kind, amount]) => [kind, allowed ? Math.min(amount, allowed[file]?.[kind] ?? 0) : amount] as const)
      .filter(([, amount]) => amount > 0));
    if (Object.keys(kept).length) next[file] = kept;
  }
  return next;
}
