import { icon } from "./icons";
import "./homeMenu.css";

export const menuText = (value:string) => value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
interface MenuItem {
  action:string; label:string; id?:string; detail?:string; note?:string; accessible?:string;
}
interface MainMenu {
  title:string; theme:string; play:MenuItem; resume?:MenuItem; ship:MenuItem; cave:MenuItem;
  settings:MenuItem; language:MenuItem;
}

export function pirateMenuItem(i:MenuItem,role:string): string {
  const language=role==="language", play=role==="play";
  return `<button data-action="${menuText(i.action)}" ${i.id?`id="${menuText(i.id)}"`:""} class="menu-${role} ${play?"calculus-play lantern-play":role==="settings"?"lantern-settings home-settings":""}" ${language?'aria-haspopup="dialog"':""} ${i.accessible?`aria-label="${menuText(i.accessible)}"`:""} ${role==="ship"||role==="cave"?`data-home-destination="${role==="ship"?"ship":"chest"}"`:""}>
      ${play?`<span class="lantern-play-arrow" aria-hidden="true">${icon("play")}</span>`:""}<span class="lantern-action-title">${menuText(i.label)}</span>${i.detail!==undefined?`<strong>${menuText(i.detail)}</strong>`:""}${i.note!==undefined?`<small>${menuText(i.note)}</small>`:""}</button>`;
}

/** Each game supplies its labels and destinations. Navigation and flag placement are shared. */
export function pirateMenu(m:MainMenu):string {
  return `<nav class="pirate-actions ${m.theme}" aria-label="${menuText(m.title)}">${pirateMenuItem(m.play,"play")}${m.resume?pirateMenuItem(m.resume,"resume"):""}${pirateMenuItem(m.ship,"ship")}${pirateMenuItem(m.cave,"cave")}<div class="home-utilities">${pirateMenuItem(m.settings,"settings")}</div></nav>${pirateMenuItem(m.language,"language")}`;
}

export function settingsDesk(title:string, controls:string, back=""):string {
  return `<section class="captain-desk">${back}<div class="captain-paper"><h1>${menuText(title)}</h1>${controls}</div></section>`;
}
