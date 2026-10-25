import { icon } from "./icons";
import "./difficultyMap.css";
export interface DifficultyStop {id:string|number;x:number;y:number;number:number;label:string;description:string;example:string;detail:string;ariaLabel?:string;}
export interface DifficultyMapOptions {
 world:{name:string;image:string;accent:string;ocean:string;paper:string;ink:string};
 eyebrow:string;instructions:string;stops:readonly DifficultyStop[];selected:string|number;
 footer:string;centerLabel:string;baseUrl:string;height?:number;route?:string;
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** One illustrated difficulty map and parchment-pin treatment for the pirate learning games. */
export function difficultyMap(options:DifficultyMapOptions):string {
 const {world,stops,baseUrl}=options,height=options.height??1800;
 const focus=stops.find(p=>p.id===options.selected)??stops[0]!;
 const route=options.route??stops.map((p,i)=>i===0?`M${p.x} ${p.y}`:`C${stops[i-1]!.x} ${(stops[i-1]!.y+p.y)/2} ${p.x} ${(stops[i-1]!.y+p.y)/2} ${p.x} ${p.y}`).join(" ");
 return `<section class="map-view operation-world" style="--world-accent:${world.accent};--world-ocean:${world.ocean};--world-paper:${world.paper};--world-ink:${world.ink}"><div class="world-map-heading"><span class="eyebrow">${escape(options.eyebrow)}</span><h1>${escape(world.name)}</h1><p>${escape(options.instructions)}</p></div><div class="world-map-viewport" data-map-viewport data-focus-x="${focus.x}" data-focus-y="${focus.y}" data-map-scale="1" tabindex="0" aria-label="${escape(world.name)} difficulty map. Drag in any direction or use arrow keys."><div class="world-map-plane" data-map-world style="height:${height}px"><img class="world-map-art" src="${baseUrl}${world.image}" alt="" draggable="false" /><div class="world-map-texture" aria-hidden="true"></div><svg class="world-pack-route" viewBox="0 0 1200 ${height}" aria-hidden="true"><path d="${route}" /></svg>${stops.map(p=>`<button class="world-pack-stop" data-pack="${escape(String(p.id))}" style="left:${p.x}px;top:${p.y}px" aria-label="${escape(p.ariaLabel??`${p.label}: ${p.description}`)}"><span class="world-pack-pin" aria-hidden="true">${p.number}</span><span class="world-pack-label"><b>${escape(p.label)}</b><small>${escape(p.description)}</small><span>${escape(p.example)}</span><em>${escape(p.detail)} ${icon("arrow")}</em></span></button>`).join("")}</div><div class="world-map-tools" data-map-control><span>${escape(options.footer)}</span><button type="button" data-map-center>${icon("compass")} ${escape(options.centerLabel)}</button></div></div></section>`;
}
