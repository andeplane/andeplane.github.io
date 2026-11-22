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
export const LANGUAGE_KEY = "pirate.menu.language.v1";
export const deviceLanguages = () => navigator.languages?.length ? navigator.languages : [navigator.language];
export const isLanguage = (value: unknown): value is Language => LANGUAGES.some((language) => language.id === value);
export const isLanguagePreference = (value: unknown): value is LanguagePreference => value === "auto" || isLanguage(value);

/** Honor the first supported language in the device/browser's ordered preference list. */
export function detectLanguage<Supported extends Language = Language>(
  languages: readonly string[],
  supported?: readonly Supported[],
): Supported | "en" {
  for (const tag of languages) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    // Bokmål is the initial Norwegian translation, including devices configured for Nynorsk.
    const id = base === "no" || base === "nn" ? "nb" : base;
    if (isLanguage(id) && (!supported || supported.some(language => language === id))) return id as Supported;
  }
  return "en";
}
export function readLanguagePreference(storage?: Pick<Storage, "getItem">, legacyKey?: string): LanguagePreference {
  try {
    const current = storage?.getItem(LANGUAGE_KEY);
    if (isLanguagePreference(current)) return current;
    const legacy = legacyKey ? storage?.getItem(legacyKey) : null;
    return isLanguagePreference(legacy) ? legacy : "auto";
  } catch { return "auto"; }
}
export function saveLanguagePreference(preference: LanguagePreference, storage?: Pick<Storage, "setItem">): boolean {
  try {
    if (!storage) return false;
    storage.setItem(LANGUAGE_KEY, preference);
    return true;
  } catch { return false; }
}

export function languageOption(id: Language) {
  return LANGUAGES.find(option => option.id === id)!;
}

/** Updates open games on the same web origin and refreshes automatic device language. */
export function watchMenuLanguage(
  storage: Storage | undefined,
  legacyKey: string,
  update: (preference?: LanguagePreference) => void,
): void {
  window.addEventListener("languagechange", () => update());
  window.addEventListener("storage", event => {
    if (event.storageArea === storage && (event.key === LANGUAGE_KEY || event.key === null))
      update(readLanguagePreference(storage, legacyKey));
  });
}
