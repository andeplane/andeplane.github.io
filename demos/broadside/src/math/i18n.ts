import type { OperatorId, Pack } from "./academy";
import { catalogs, type MessageKey } from "./messages";

export const LANGUAGES = [
  { id: "en", flag: "🇬🇧", name: "English" },
  { id: "nb", flag: "🇳🇴", name: "Norsk (bokmål)" },
  { id: "sv", flag: "🇸🇪", name: "Svenska" },
  { id: "da", flag: "🇩🇰", name: "Dansk" },
  { id: "fi", flag: "🇫🇮", name: "Suomi" },
  { id: "de", flag: "🇩🇪", name: "Deutsch" },
  { id: "es", flag: "🇪🇸", name: "Español" },
  { id: "fr", flag: "🇫🇷", name: "Français" },
] as const;
export type Language = typeof LANGUAGES[number]["id"];
export type LanguagePreference = Language | "auto";
export const LANGUAGE_KEY = "broadside.math.language.v1";
export const isLanguage = (value: unknown): value is Language => LANGUAGES.some((language) => language.id === value);
export const isLanguagePreference = (value: unknown): value is LanguagePreference => value === "auto" || isLanguage(value);

/** Honor the first supported language in the device/browser's ordered preference list. */
export function detectLanguage(languages: readonly string[]): Language {
  for (const tag of languages) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    // Bokmål is the initial Norwegian translation, including devices configured for Nynorsk.
    if (base === "no" || base === "nn" || base === "nb") return "nb";
    if (isLanguage(base)) return base;
  }
  return "en";
}
export function readLanguagePreference(storage?: Pick<Storage, "getItem">, key = LANGUAGE_KEY): LanguagePreference {
  try {
    const value = storage?.getItem(key);
    return isLanguagePreference(value) ? value : "auto";
  } catch { return "auto"; }
}
export function saveLanguagePreference(preference: LanguagePreference, storage?: Pick<Storage, "setItem">, key = LANGUAGE_KEY): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, preference);
    return true;
  } catch { return false; }
}

export function createI18n(preference: LanguagePreference, deviceLanguages: readonly string[]) {
  const language = preference === "auto" ? detectLanguage(deviceLanguages) : preference;
  const number = new Intl.NumberFormat(language);
  const compact = new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 });
  const plurals = new Intl.PluralRules(language);
  const t = (key: MessageKey, values: Record<string, string | number> = {}): string =>
    catalogs[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
  const plural = (key: "answersLeft" | "hoard" | "aboard", count: number, values: Record<string, string | number> = {}): string =>
    t(`${key}_${plurals.select(count) === "one" ? "one" : "other"}`, { ...values, count: number.format(count) });
  function packText(pack: Pack): { name: string; label: string; description: string } {
    const index = pack.operator === "add" ? [10, 20, 30, 40, 50].indexOf(pack.limit!) :
      pack.operator === "subtract" ? ["subtract-takeaway", "subtract-ten", "subtract-twodigit", "subtract-borrow", "subtract-deep"].indexOf(pack.id) :
      Number(pack.id.split("-")[1]) - 1;
    const islandKeys = ["island1", "island2", "island3", "island4", "island5"] as const;
    const name = t(islandKeys[index] ?? "island1");
    if (pack.operator === "add") return {
      name, label: t("upTo", { count: pack.limit! }), description: t("addDescription", { count: pack.limit! }),
    };
    if (pack.operator === "subtract") {
      const labels = ["takeaway", "crossTen", "twoDigits", "borrowing", "threeDigits"] as const;
      const descriptions = ["subtract1", "subtract2", "subtract3", "subtract4", "subtract5"] as const;
      return { name, label: t(labels[index]!), description: t(descriptions[index]!, { count: number.format(1000) }) };
    }
    const labels = [pack.operator === "divide" ? "shareTwos" : "twos", "fivesTens", "threesFours", "sixesNines", "allTables"] as const;
    return {
      name, label: t(labels[index]!),
      description: t(index === 4 ? pack.operator === "multiply" ? "multiplyAll" : "divideAll" :
        pack.operator === "multiply" ? "multiplyDescription" : "divideDescription", { tables: pack.tables!.join(", ") }),
    };
  }
  return {
    language, t, plural, packText,
    format: (value: number) => number.format(value),
    compactGold: (value: number) => value < 10000 ? number.format(value) : compact.format(value),
    operatorName: (id: OperatorId) => t(id),
    operatorVerb: (id: OperatorId) => t(`${id}Verb`),
    spokenOperator: (id: OperatorId) => t(`${id}Spoken`),
  };
}
