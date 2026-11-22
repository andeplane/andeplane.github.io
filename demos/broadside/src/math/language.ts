import { createI18n } from "./i18n";
import type { LanguagePreference } from "../i18n/languages";
let current = createI18n("auto", typeof navigator === "undefined" ? [] : navigator.languages);
export const currentI18n = () => current;
export const selectLanguage = (preference: LanguagePreference, deviceLanguages: readonly string[]) => current = createI18n(preference, deviceLanguages);
