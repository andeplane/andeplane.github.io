import { isLanguagePreference, LANGUAGES, detectLanguage, type createI18n, type LanguagePreference } from "../math/i18n";
import "./languagePicker.css";

export function languagePickerMarkup(
  i18n: ReturnType<typeof createI18n>, preference: LanguagePreference, deviceLanguages: readonly string[], saveFailed: boolean,
  supported:readonly string[]=LANGUAGES.map(l=>l.id), allowAuto=true,
): string {
  const available=LANGUAGES.filter(l=>supported.includes(l.id));
  const automatic=available.find(l=>l.id===detectLanguage(deviceLanguages)) ?? available.find(l=>l.id==="en") ?? available[0]!;
  const options = [...(allowAuto?[{ id: "auto", name: i18n.t("automatic"), flag: automatic.flag }]:[]), ...available];
  return `<header><h2 id="language-picker-title">${i18n.t("language")}</h2><button data-dismiss aria-label="${i18n.t("close")}">×</button></header>
    <div class="language-options">${options.map(({ id, name, flag }) => `<button data-language="${id}" lang="${id === "auto" ? i18n.language : id}" aria-pressed="${preference === id}"><span aria-hidden="true">${flag}</span>${name}${preference === id ? " <b aria-hidden=\"true\">✓</b>" : ""}</button>`).join("")}</div>
    ${saveFailed ? `<p role="status" id="language-save-error">${i18n.t("languageSaveError")}</p>` : ""}`;
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
  dialog.classList.add("language-picker","captain-language");
  dialog.setAttribute("aria-labelledby","language-picker-title");
  const draw = (failed=false) => { dialog.innerHTML=options.markup(failed); };
  const focusChoice = () => dialog.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  const close = () => {dialog.close();options.trigger()?.focus({preventScroll:true});};
  dialog.addEventListener("click", event => {
    if (dismissLanguagePicker(dialog,event)) {close();return;}
    const choice=(event.target as Element).closest<HTMLElement>("[data-language]")?.dataset.language;
    if (!isLanguagePreference(choice)) return;
    if (options.select(choice)) close();
    else {draw(true);focusChoice();}
  });
  return {draw, open:()=>{draw();dialog.showModal();focusChoice();}};
}
