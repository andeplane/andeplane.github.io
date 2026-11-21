import { isLanguagePreference, LANGUAGES, detectLanguage, languageOption, type Language, type LanguagePreference } from "../i18n/languages";
import type { CommonLocale } from "../i18n/locale";
import { menuText } from "./homeMenu";
import "./languagePicker.css";

export function languagePickerMarkup(
  i18n: Pick<CommonLocale, "language" | "t">, preference: LanguagePreference, deviceLanguages: readonly string[], saveFailed: boolean,
  { supported, title = i18n.t("language"), allowAuto = true }: { supported?: readonly Language[]; title?: string; allowAuto?: boolean } = {},
): string {
  const available=LANGUAGES.filter(l=>!supported || supported.includes(l.id));
  const automatic=available.find(l=>l.id===detectLanguage(deviceLanguages, supported)) ?? available.find(l=>l.id==="en") ?? available[0]!;
  const options = [...(allowAuto?[{ id: "auto", name: i18n.t("automatic"), flag: automatic.flag }]:[]), ...available];
  return `<header lang="${i18n.language}"><h2 id="language-picker-title">${menuText(title)}</h2><button data-dismiss aria-label="${i18n.t("close")}">×</button></header>
    <div class="language-options">${options.map(({ id, name, flag }) => `<button data-language="${id}" lang="${id === "auto" ? i18n.language : id}" aria-pressed="${preference === id}"><span aria-hidden="true">${flag}</span><span class="language-name">${menuText(name)}</span>${preference === id ? " <b aria-hidden=\"true\">✓</b>" : ""}</button>`).join("")}</div>
    ${saveFailed ? `<p role="status" id="language-save-error">${menuText(i18n.t("languageSaveError"))}</p>` : ""}`;
}

export function languageSettingLabel(locale: CommonLocale, preference: LanguagePreference): string {
  const option = languageOption(preference === "auto" ? locale.language : preference);
  const label = preference === "auto" ? locale.t("automatic") : option.name;
  const language = preference === "auto" ? locale.language : option.id;
  return `<span lang="${language}"><span aria-hidden="true">${option.flag}</span> ${menuText(label)}</span>`;
}

export function dismissLanguagePicker(picker: HTMLDialogElement, event: MouseEvent): boolean {
  const rect = picker.getBoundingClientRect();
  return !!(event.target as HTMLElement).closest("[data-dismiss]") ||
    (event.target === picker && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom));
}

/** Owns dismissal, focus and save-error recovery for all three title scenes. */
export function bindLanguagePicker(dialog: HTMLDialogElement, options: {
  markup: (failed: boolean) => string;
  select: (choice: LanguagePreference) => boolean;
  trigger: () => HTMLElement | null;
}) {
  dialog.classList.add("language-picker");
  dialog.setAttribute("aria-labelledby","language-picker-title");
  const draw = (failed=false) => { dialog.innerHTML=options.markup(failed); };
  const focusChoice = () => dialog.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  const close = () => dialog.close();
  dialog.addEventListener("close", () => options.trigger()?.focus({preventScroll:true}));
  dialog.addEventListener("click", event => {
    if (dismissLanguagePicker(dialog,event)) {close();return;}
    const choice=(event.target as Element).closest<HTMLElement>("[data-language]")?.dataset.language;
    if (!isLanguagePreference(choice)) return;
    if (options.select(choice)) close();
    else {draw(true);focusChoice();}
  });
  return {draw, open:()=>{draw();dialog.showModal();focusChoice();}};
}
