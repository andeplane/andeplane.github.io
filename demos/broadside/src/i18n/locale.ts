import { detectLanguage, type Language, type LanguagePreference } from "./languages";
import { commonCatalogs } from "./messages";

export function createLocale<Key extends string>(
  catalogs: Record<Language, Record<Key, string>>,
  preference: LanguagePreference,
  deviceLanguages: readonly string[],
) {
  const language = preference === "auto" ? detectLanguage(deviceLanguages) : preference;
  const messages = catalogs[language];
  const number = new Intl.NumberFormat(language);
  const compact = new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 });
  const plurals = new Intl.PluralRules(language);
  return {
    language,
    t: (key: Key, values: Record<string, string | number> = {}): string =>
      messages[key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder)),
    format: (value: number) => number.format(value),
    compactGold: (value: number) => value < 10000 ? number.format(value) : compact.format(value),
    pluralCategory: (count: number) => plurals.select(count),
  };
}

export const commonLocale = (preference: LanguagePreference, deviceLanguages: readonly string[]) =>
  createLocale(commonCatalogs, preference, deviceLanguages);

export type CommonLocale = ReturnType<typeof commonLocale>;
