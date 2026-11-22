import type { OperatorId, Pack } from "./academy";
import { catalogs } from "./messages";
import { createLocale } from "../i18n/locale";
import type { LanguagePreference } from "../i18n/languages";

export function createI18n(preference: LanguagePreference, deviceLanguages: readonly string[]) {
  const locale = createLocale(catalogs, preference, deviceLanguages);
  const { t, format, pluralCategory } = locale;
  const plural = (key: "answersLeft" | "hoard" | "aboard", count: number, values: Record<string, string | number> = {}) =>
    t(`${key}_${pluralCategory(count) === "one" ? "one" : "other"}`, { ...values, count: format(count) });
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
      return { name, label: t(labels[index]!), description: t(descriptions[index]!, { count: format(1000) }) };
    }
    const labels = [pack.operator === "divide" ? "shareTwos" : "twos", "fivesTens", "threesFours", "sixesNines", "allTables"] as const;
    return {
      name, label: t(labels[index]!),
      description: t(index === 4 ? pack.operator === "multiply" ? "multiplyAll" : "divideAll" :
        pack.operator === "multiply" ? "multiplyDescription" : "divideDescription", { tables: pack.tables!.join(", ") }),
    };
  }
  return {
    ...locale, plural, packText,
    operatorName: (id: OperatorId) => t(id),
    operatorVerb: (id: OperatorId) => t(`${id}Verb`),
    spokenOperator: (id: OperatorId) => t(`${id}Spoken`),
  };
}
