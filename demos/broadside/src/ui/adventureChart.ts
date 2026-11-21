import { menuText } from "./homeMenu";
import { pirateShipArt, type ShipArtStyle } from "./worldArt";
import "./adventureChart.css";

interface Shore {
  id:string|number; label:string; detail?:string; tally?:string; accessible:string;
  art:string; locked?:boolean; moored?:boolean;
}
export function chartShip(id:string, style?: ShipArtStyle):string {
  return `<span id="${id}" class="chart-ship chart-ship-marker" aria-hidden="true" inert>${pirateShipArt(id, style)}</span>`;
}
export function adventureChart(action:"operator"|"language"|"pack",places:readonly Shore[]):string {
  return `<div class="overworld-geography">${places.map((p,index)=>`<button class="overworld-place" data-shore="${index}" data-${action}="${menuText(String(p.id))}" ${p.locked?"disabled":""} aria-label="${menuText(p.accessible)}">
    ${p.art}${p.moored?chartShip("moored-overview", action === "operator" ? "explorer" : undefined):""}<span class="overworld-caption"><b>${menuText(p.label)}</b>${p.detail?`<small>${menuText(p.detail)}</small>`:""}${p.tally?`<span class="chart-tally">${menuText(p.tally)}</span>`:""}</span></button>`).join("")}</div>`;
}

/** Sail alongside the selected shore before entering it. The active map can be left at any time. */
export function sailToShore(event:MouseEvent, root:HTMLElement):boolean {
  const target=(event.target as Element).closest<HTMLButtonElement>(".overworld-place,.world-pack-stop,.expedition-node");
  if (!target || target.disabled || !event.isTrusted || typeof target.animate!=="function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const chart=target.closest<HTMLElement>(".overworld-geography,[data-map-viewport]");
  const ship=chart?.querySelector<HTMLElement>(".chart-ship");
  if (!chart || !ship) return false;
  if (chart.dataset.sailing) return true;
  const from=ship.getBoundingClientRect(), to=target.getBoundingClientRect();
  const scale=from.width/(ship.offsetWidth || from.width);
  if (!(scale>0)) return false;
  const dx=(to.left + to.width*.15 - from.left - from.width/2)/scale, dy=(to.top+to.height*.4-from.top-from.height/2)/scale;
  chart.dataset.sailing="true";
  const animation=ship.animate([{translate:"0 0"},{translate:`${dx}px ${dy}px`}],{duration:540,easing:"ease-in-out",fill:"forwards"});
  void animation.finished.then(()=>{delete chart.dataset.sailing;if(root.contains(target))target.click();animation.cancel();},()=>{delete chart.dataset.sailing;});
  return true;
}
