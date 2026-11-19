import { LANGUAGES, detectLanguage, type createI18n, type LanguagePreference } from "../math/i18n";
import "./languagePicker.css";

export function languagePickerMarkup(
  i18n: ReturnType<typeof createI18n>, preference: LanguagePreference, deviceLanguages: readonly string[], saveFailed: boolean,
): string {
  const automatic = LANGUAGES.find(language => language.id === detectLanguage(deviceLanguages))!;
  const options = [{ id: "auto", name: i18n.t("automatic"), flag: automatic.flag }, ...LANGUAGES];
  return `<header><h2 id="language-picker-title">${i18n.t("language")}</h2><button data-dismiss aria-label="${i18n.t("close")}">×</button></header>
    <div class="language-options">${options.map(({ id, name, flag }) => `<button data-language="${id}" lang="${id === "auto" ? i18n.language : id}" aria-pressed="${preference === id}"><span aria-hidden="true">${flag}</span>${name}${preference === id ? " <b aria-hidden=\"true\">✓</b>" : ""}</button>`).join("")}</div>
    ${saveFailed ? `<p role="status" id="language-save-error">${i18n.t("languageSaveError")}</p>` : ""}`;
}

export function dismissLanguagePicker(picker: HTMLDialogElement, event: MouseEvent): boolean {
  const rect = picker.getBoundingClientRect();
  return !!(event.target as HTMLElement).closest("[data-dismiss]") ||
    (event.target === picker && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom));
}
