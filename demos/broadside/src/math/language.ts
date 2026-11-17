import { createI18n, type LanguagePreference } from "./i18n";
let current = createI18n("auto", typeof navigator === "undefined" ? [] : navigator.languages);
export const currentI18n = () => current;
export const selectLanguage = (preference: LanguagePreference, deviceLanguages: readonly string[]) => current = createI18n(preference, deviceLanguages);
